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

let activeRefs: MonitorRefs | null = null;

const monitorTask = async () => {
  const service = BackgroundServiceModule!;
  while (service.isRunning()) {
    const refs = activeRefs;
    if (refs && obdEngine.isConnected()) {
      try {
        const temp = await obdEngine.queryCoolantTemp();
        // Threshold checking, alert cooldown, history logging, and firing
        // the notification are all handled centrally by ObdContext's
        // handleReading (refs.onReading) — this keeps behavior identical
        // whether a reading comes from this background loop or from the
        // foreground live-polling loop, instead of duplicating (and
        // potentially diverging) the alert logic in two places.
        refs.onReading(temp, temp === null ? obdEngine.getLastRawResponse() : undefined);
      } catch (err) {
        refs?.onReading(null, err instanceof Error ? err.message : "Okuma hatası");
      }
    }
    await service.sleep(refs?.pollIntervalMs.current ?? 3000);
  }
};

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
