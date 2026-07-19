import { Platform } from "react-native";

const NO_VALUE = -9999.0;

interface NativeObdAutoBridge {
  updateSensor: (key: string, enabled: boolean, value: number, isAlert: boolean) => void;
  postAutoMessage: (title: string, body: string) => void;
  clearAutoMessage: () => void;
  addListener: (eventName: string, listener: (...args: any[]) => void) => { remove: () => void };
}

let nativeModule: NativeObdAutoBridge | null = null;

if (Platform.OS === "android") {
  try {
    const { requireNativeModule } = require("expo-modules-core");
    nativeModule = requireNativeModule("ObdAutoBridge");
  } catch {
    nativeModule = null;
  }
}

/**
 * Pushes one sensor's current value to the Android Auto screen.
 * key must be one of: "coolant" | "voltage" | "oilTemp" | "egt".
 * Pass value=null when the sensor has no current reading (e.g. disabled,
 * or "NO DATA" from the vehicle) — the car screen will simply omit that row.
 */
export function updateSensor(key: string, enabled: boolean, value: number | null, isAlert: boolean): void {
  nativeModule?.updateSensor(key, enabled, value ?? NO_VALUE, isAlert);
}

/** Convenience wrapper for the always-on coolant sensor. */
export function updateTemperature(temp: number, isAlert: boolean): void {
  updateSensor("coolant", true, temp, isAlert);
}

/**
 * Posts a MessagingStyle notification that Android Auto will surface as a
 * heads-up card on the car display (the same mechanism messaging apps like
 * WhatsApp use). No-op on iOS or non-EAS builds.
 */
export function postAutoMessage(title: string, body: string): void {
  nativeModule?.postAutoMessage(title, body);
}

/** Removes the Android Auto message card (e.g. once the alert clears). */
export function clearAutoMessage(): void {
  nativeModule?.clearAutoMessage();
}

/**
 * Subscribes to the "Tamam" button being pressed on the Android Auto
 * screen while an alert is showing. Returns an unsubscribe function, or
 * null if the native module isn't available (iOS, or a non-EAS build).
 */
export function addAcknowledgeFromCarListener(callback: () => void): (() => void) | null {
  if (!nativeModule) return null;
  const subscription = nativeModule.addListener("onAcknowledgeFromCar", callback);
  return () => subscription.remove();
}
