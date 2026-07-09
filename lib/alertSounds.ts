import * as Notifications from "expo-notifications";

export interface AlertSoundOption {
  id: string;
  label: string;
  /** Base filename (with extension) as bundled via the expo-notifications
   * config plugin's "sounds" array in app.json. `null` means "use the
   * system's default notification sound". */
  filename: string | null;
}

export const ALERT_SOUND_OPTIONS: AlertSoundOption[] = [
  { id: "default", label: "Varsayılan", filename: null },
  { id: "siren", label: "Siren", filename: "alert_siren.wav" },
  { id: "chime", label: "Çan", filename: "alert_chime.wav" },
  { id: "alarm", label: "Alarm", filename: "alert_alarm.wav" },
];

export const DEFAULT_ALERT_SOUND_ID = "default";

function channelIdFor(soundId: string): string {
  return `obd-alert-${soundId}`;
}

function optionFor(soundId: string): AlertSoundOption {
  return ALERT_SOUND_OPTIONS.find((option) => option.id === soundId) ?? ALERT_SOUND_OPTIONS[0];
}

/**
 * Creates (or re-confirms) one Android notification channel per available
 * alert sound. Each channel's sound is fixed at creation time — Android does
 * not allow changing a channel's sound afterwards — so we use a distinct
 * channel per sound option instead of trying to reuse a single channel.
 * Safe to call multiple times (e.g. on every app start).
 */
export async function ensureAlertSoundChannels(): Promise<void> {
  for (const option of ALERT_SOUND_OPTIONS) {
    try {
      await Notifications.setNotificationChannelAsync(channelIdFor(option.id), {
        name: `Sıcaklık uyarısı (${option.label})`,
        importance: Notifications.AndroidImportance.HIGH,
        sound: option.filename ?? "default",
        vibrationPattern: [0, 250, 250, 250],
      });
    } catch {
      // Notification channels are Android-only; ignore failures on other platforms.
    }
  }
}

/** Fires the high-temperature alert notification using the given sound option. */
export async function sendTemperatureAlert(soundId: string, temp: number): Promise<void> {
  const option = optionFor(soundId);
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "Motor sıcaklığı yüksek!",
      body: `Motor sıcaklığı ${temp}°C'ye ulaştı. Aracı kontrol edin.`,
      sound: option.filename ?? "default",
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 1,
      channelId: channelIdFor(option.id),
    },
  });
}

/** Fires an immediate preview notification so the user can hear a sound before picking it. */
export async function previewAlertSound(soundId: string): Promise<void> {
  const option = optionFor(soundId);
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "Uyarı sesi önizleme",
      body: `"${option.label}" sesi seçili.`,
      sound: option.filename ?? "default",
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 1,
      channelId: channelIdFor(option.id),
    },
  });
}
