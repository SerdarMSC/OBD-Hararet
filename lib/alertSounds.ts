import * as Notifications from "expo-notifications";
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";

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
  { id: "siren", label: "BMW", filename: "alert_siren.wav" },
  { id: "chime", label: "Being", filename: "alert_chime.wav" },
  { id: "alarm", label: "Alarm", filename: "alert_alarm.wav" },
];

export const DEFAULT_ALERT_SOUND_ID = "default";

// require() targets for expo-audio playback — separate from the
// expo-notifications "sounds" config (which only bundles these as Android
// raw resources for one-shot notification tones). The "default" option has
// no real bundled file, so looping playback falls back to "siren" for it.
const LOOP_SOUND_ASSETS: Record<string, number> = {
  siren: require("../assets/sounds/alert_siren.wav"),
  chime: require("../assets/sounds/alert_chime.wav"),
  alarm: require("../assets/sounds/alert_alarm.wav"),
};

function channelIdFor(soundId: string): string {
  return `obd-alert-${soundId}`;
}

function optionFor(soundId: string): AlertSoundOption {
  return ALERT_SOUND_OPTIONS.find((option) => option.id === soundId) ?? ALERT_SOUND_OPTIONS[0];
}

let audioModeConfigured = false;

/**
 * Configures the audio session once so looping alerts keep playing even if
 * the phone's ringer is on silent/vibrate and while the app is backgrounded
 * (the background monitoring service keeps the JS runtime alive). Safe to
 * call multiple times.
 *
 * Note on volume: Android intentionally does not let apps override the
 * user's own volume sliders — there is no supported way to make a sound
 * play "louder than the system allows". Setting the player's own volume to
 * maximum (done in startLoopingAlert below) is the most we can control;
 * looping the sound repeatedly until acknowledged is what actually makes
 * it hard to miss, rather than a raw volume boost.
 */
async function ensureAudioModeConfigured(): Promise<void> {
  if (audioModeConfigured) return;
  try {
    await setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: "doNotMix",
    });
    audioModeConfigured = true;
  } catch {
    // Non-fatal — looping playback will still be attempted.
  }
}

let activeLoopPlayer: AudioPlayer | null = null;

/**
 * Starts looping the given alert sound at full player volume, repeating
 * indefinitely until stopLoopingAlert() is called (e.g. the user taps
 * "Onayla" on the in-app alert banner). Any previously looping sound is
 * stopped first.
 */
export async function startLoopingAlert(soundId: string): Promise<void> {
  await ensureAudioModeConfigured();
  stopLoopingAlert();

  const option = optionFor(soundId);
  const assetKey = option.filename ? soundId : "siren";
  const asset = LOOP_SOUND_ASSETS[assetKey] ?? LOOP_SOUND_ASSETS.siren;

  try {
    const player = createAudioPlayer(asset);
    player.loop = true;
    player.volume = 1.0;
    player.play();
    activeLoopPlayer = player;
  } catch {
    // If playback fails to start (e.g. audio focus denied), the one-shot
    // notification sound + in-app banner are still shown.
  }
}

/** Stops the currently looping alert sound, if any. */
export function stopLoopingAlert(): void {
  if (activeLoopPlayer) {
    try {
      activeLoopPlayer.pause();
      activeLoopPlayer.remove();
    } catch {
      // ignore — player may already be released
    }
    activeLoopPlayer = null;
  }
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

/** Fires an alert notification with a custom title/body using the given sound option. */
export async function sendCustomAlert(soundId: string, title: string, body: string): Promise<void> {
  const option = optionFor(soundId);
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      sound: option.filename ?? "default",
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 1,
      channelId: channelIdFor(option.id),
    },
  });
}

/** Fires the high-temperature alert notification using the given sound option. */
export async function sendTemperatureAlert(soundId: string, temp: number): Promise<void> {
  await sendCustomAlert(soundId, "Motor sıcaklığı yüksek!", `Motor sıcaklığı ${temp}°C'ye ulaştı. Aracı kontrol edin.`);
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
