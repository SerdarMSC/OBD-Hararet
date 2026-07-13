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
  deviceAddress: { current: string | null };
  onReading: (temp: number | null, error?: string) => void;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const LAST_ERROR_STORAGE_KEY = "obd:lastBackgroundTaskError";
const TASK_STARTED_STORAGE_KEY = "obd:backgroundTaskStartedAt";
const TRACE_STORAGE_KEY = "obd:backgroundTaskTrace";

let activeRefs: MonitorRefs | null = null;

// react-native-background-actions' own isRunning() has been unreliable in
// practice — the while loop was seen to exit immediately (or never run at
// all) even right after start(), presumably because isRunning() doesn't
// flip to true synchronously with the task actually beginning. Rather than
// trust that, we track our own "should this loop keep going" flag,
// explicitly set true right before starting and false right before
// stopping — so the loop's continuation no longer depends on the
// library's internal timing.
let shouldKeepRunning = false;

function writeTrace(text: string) {
  AsyncStorage.setItem(TRACE_STORAGE_KEY, `${new Date().toISOString()} :: ${text}`).catch(() => {});
}

const monitorTask = async () => {
  // Written the instant this function is actually invoked by the native
  // module, before any loop condition is checked — if monitoring "does
  // nothing" again, checking this timestamp (surfaced in Settings) tells
  // us whether the task ever ran at all vs. ran but exited immediately.
  AsyncStorage.setItem(TASK_STARTED_STORAGE_KEY, new Date().toISOString()).catch(() => {});
  writeTrace(`monitorTask invoked. shouldKeepRunning(module-level)=${shouldKeepRunning}`);

  let iteration = 0;

  while (shouldKeepRunning) {
    iteration++;
    const refs = activeRefs;
    // Everything in this iteration — including refs.onReading(), which now
    // also triggers alert notifications / the looping alarm sound / the
    // in-app acknowledge modal — is wrapped in try/catch. Previously only
    // the queryCoolantTemp() call was protected; an uncaught error from
    // ANYTHING downstream (e.g. starting the looping alert sound) would
    // propagate out of this async function entirely and silently kill the
    // while loop for good, freezing all future readings until the user
    // manually stopped and restarted monitoring.
    //
    // The real bug that caused exactly this symptom: this loop used to
    // call `service.sleep(...)` OUTSIDE this try/catch — but
    // react-native-background-actions does not actually expose a sleep()
    // method at all (confirmed against its own type declarations). That
    // call threw "service.sleep is not a function" immediately after the
    // very first successful reading, and since it was unprotected, it
    // silently killed monitorTask's promise for good — matching the
    // observed pattern of "one successful reading, then nothing, ever
    // again, with no error logged."
    try {
      if (!refs) {
        writeTrace(`#${iteration} activeRefs is NULL — skipping this iteration entirely.`);
      } else {
        const addr = refs.deviceAddress.current;
        const connectedBefore = obdEngine.isConnected();
        writeTrace(`#${iteration} refs OK. deviceAddress=${addr ?? "null"} isConnected(before)=${connectedBefore}`);

        if (!connectedBefore && addr) {
          writeTrace(`#${iteration} attempting reclaimOrConnect(${addr})...`);
          await obdEngine.reclaimOrConnect(addr);
          writeTrace(`#${iteration} reclaimOrConnect finished. isConnected(after)=${obdEngine.isConnected()}`);
        }

        if (obdEngine.isConnected()) {
          const temp = await obdEngine.queryCoolantTemp();
          writeTrace(`#${iteration} query OK. temp=${temp}`);
          refs.onReading(temp, temp === null ? obdEngine.getLastRawResponse() : undefined);
        } else {
          writeTrace(`#${iteration} still not connected — no query sent this iteration.`);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      writeTrace(`#${iteration} EXCEPTION: ${message}`);
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

    try {
      await sleep(refs?.pollIntervalMs.current ?? 3000);
    } catch (err) {
      writeTrace(`#${iteration} sleep() itself threw: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  writeTrace(`while loop exited after ${iteration} iterations (shouldKeepRunning became false).`);
};

/** Returns the last uncaught error from the background monitoring loop, if any — for diagnostics. */
export async function getLastBackgroundTaskError(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(LAST_ERROR_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Returns when the background loop last actually started executing, if ever — for diagnostics. */
export async function getLastBackgroundTaskStartedAt(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(TASK_STARTED_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Returns the most recent step-by-step trace line from the background loop — for diagnostics. */
export async function getLastBackgroundTaskTrace(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(TRACE_STORAGE_KEY);
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
  shouldKeepRunning = true;
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
  shouldKeepRunning = false;
  activeRefs = null;
  if (!BackgroundServiceModule) return;
  await BackgroundServiceModule.stop();
}

export function isBackgroundMonitoringRunning(): boolean {
  return shouldKeepRunning;
}
