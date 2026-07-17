import { Platform } from "react-native";

let nativeModule: { updateTemperature: (temp: number, isAlert: boolean) => void } | null = null;

if (Platform.OS === "android") {
  try {
    const { requireNativeModule } = require("expo-modules-core");
    nativeModule = requireNativeModule("ObdAutoBridge");
  } catch {
    nativeModule = null;
  }
}

export function updateTemperature(temp: number, isAlert: boolean): void {
  nativeModule?.updateTemperature(temp, isAlert);
}
