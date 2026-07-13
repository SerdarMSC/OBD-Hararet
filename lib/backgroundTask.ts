import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

import { obdEngine } from "./obdEngine";

interface BackgroundServiceApi {
  start: (task: () => Promise<void>, options: Record<string, unknown>) => Promise<void>;
  stop: () => Promise<void>;
  isRunning: () => boolean;
  sleep: (ms: number) => Promise<void>;
}

let BackgroundServiceModule: BackgroundServiceApi | null = null;

try {
  if (Platform.OS === "android") {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    BackgroundServiceModule = require("react-native-background-actions").default;
  }
} catch {
  BackgroundServiceModule = null;
}

export function isBackgroundServiceAvailable(): boolean {
  return BackgroundServiceModule !== null;
}

export interface MonitorRefs {
  pollIntervalMs: { current: number };
  onReading: (temp: number | null, error?: string) => void;
}

const LAST_ERROR_STORAGE_KEY = "obd:lastBackgroundTaskError";

let activeRefs: MonitorRefs | null = null;

const monitorTask = async () => {
  const service = BackgroundServiceModule!;
  while (service.isRunning()) {
    const refs = activeRefs;
    // Everything in this iteration — including refs.onReading(), which now
    // also triggers alert notifications / the looping alarm sound / the
    // in-app acknowledge modal — is wrapped in try/catch. Previously only
    // the queryCoolantTemp() call was protected; an uncaught error from
    // ANYTHING downstream (e.g. starting the looping alert sound) would
    // propagate out of this async function entirely and silently kill the
    // while loop for good, freezing all future readings until the user
    // manually stopped and restarted monitoring.
    try {
      if (refs && obdEngine.isConnected()) {
        const temp = await obdEngine.queryCoolantTemp();
        refs.onReading(temp, temp === null ? obdEngine.getLastRawResponse() : undefined);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      try {
        refs?.onReading(null, message);
      } catch {
        // even the error-reporting call failed — nothing more we can do
        // for this iteration, but the loop itself must keep running.
      }
      AsyncStorage.setItem(
        LAST_ERROR_STORAGE_KEY,
        `${new Date().toISOString()}: ${message}`,
      ).catch(() => {});
    }
    await service.sleep(refs?.pollIntervalMs.current ?? 3000);
  }
};

/** Returns the last uncaught error from the background monitoring loop, if any — for diagnostics. */
export async function getLastBackgroundTaskError(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(LAST_ERROR_STORAGE_KEY);
  } catch {
    return null;
  }
}

export async function startBackgroundMonitoring(refs: MonitorRefs): Promise<void> {
  if (!BackgroundServiceModule) {
    throw new Error(
      "Arka plan servisi kullanılamıyor. Bu özellik yalnızca özel derlenmiş (EAS build) bir uygulamada çalışır.",
    );
  }
  activeRefs = refs;
  const options = {
    taskName: "OBD Sıcaklık İzleme",
    taskTitle: "Motor sıcaklığı izleniyor",
    taskDesc: "ELM327 bağlantısı arka planda aktif",
    taskIcon: { name: "ic_launcher", type: "mipmap" },
    color: "#e8542c",
    linkingURI: "mobile://",
    parameters: {},
    // Android 14+ (API 34+) requires the foreground service type to be
    // declared BOTH in the manifest (see plugins/withBackgroundServiceType.js)
    // AND passed here at runtime — otherwise startForeground() throws
    // InvalidForegroundServiceTypeException ("type none") and the app crashes.
    foregroundServiceType: ["connectedDevice"],
  };
  await BackgroundServiceModule.start(monitorTask, options);
}

export async function stopBackgroundMonitoring(): Promise<void> {
  activeRefs = null;
  if (!BackgroundServiceModule) return;
  await BackgroundServiceModule.stop();
}

export function isBackgroundMonitoringRunning(): boolean {
  return BackgroundServiceModule?.isRunning() ?? false;
}
