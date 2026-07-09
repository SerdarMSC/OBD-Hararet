import { Platform } from "react-native";

import { obdEngine } from "./obdEngine";
import { DEFAULT_ALERT_SOUND_ID, sendTemperatureAlert } from "./alertSounds";

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
  thresholdC: { current: number };
  pollIntervalMs: { current: number };
  alertSoundId: { current: string };
  onReading: (temp: number | null, error?: string) => void;
  onAlert: (temp: number) => void;
}

let activeRefs: MonitorRefs | null = null;
let lastAlertAt = 0;
const ALERT_COOLDOWN_MS = 60_000;

const monitorTask = async () => {
  const service = BackgroundServiceModule!;
  while (service.isRunning()) {
    const refs = activeRefs;
    if (refs && obdEngine.isConnected()) {
      try {
        const temp = await obdEngine.queryCoolantTemp();
        refs.onReading(temp);
        if (temp !== null && temp >= refs.thresholdC.current) {
          const now = Date.now();
          if (now - lastAlertAt > ALERT_COOLDOWN_MS) {
            lastAlertAt = now;
            refs.onAlert(temp);
            try {
              await sendTemperatureAlert(refs.alertSoundId.current ?? DEFAULT_ALERT_SOUND_ID, temp);
            } catch {
              // notification permissions may not be granted yet — reading is still logged in-app
            }
          }
        }
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
