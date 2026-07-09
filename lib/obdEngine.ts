import { PermissionsAndroid, Platform } from "react-native";

import {
  COOLANT_TEMP_PID,
  ELM327_INIT_COMMANDS,
  isResponseComplete,
  parseCoolantTempResponse,
} from "./obdProtocol";

export interface PairedDevice {
  id: string;
  name: string;
  address: string;
}

type NativeBluetoothClassic = {
  isBluetoothEnabled: () => Promise<boolean>;
  getBondedDevices: () => Promise<Array<{ id?: string; address?: string; name?: string }>>;
  connectToDevice: (address: string, options?: Record<string, unknown>) => Promise<NativeDevice>;
  isDeviceConnected?: (address: string) => Promise<boolean>;
};

type NativeDevice = {
  address: string;
  name?: string;
  write: (data: string) => Promise<boolean>;
  onDataReceived: (listener: (event: { data: string }) => void) => { remove: () => void };
  disconnect: () => Promise<boolean>;
  isConnected: () => Promise<boolean>;
};

let nativeModule: NativeBluetoothClassic | null = null;
let unavailableReason: string | null = null;

if (Platform.OS !== "android") {
  unavailableReason =
    "Klasik Bluetooth (ELM327) bağlantısı yalnızca Android cihazlarda desteklenir.";
} else {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require("react-native-bluetooth-classic");
    nativeModule = (mod?.default ?? mod) as NativeBluetoothClassic;
    if (!nativeModule || typeof nativeModule.getBondedDevices !== "function") {
      nativeModule = null;
      unavailableReason =
        "Bluetooth modülü bulunamadı. Bu özellik yalnızca özel derlenmiş (EAS build) bir uygulamada çalışır.";
    }
  } catch (_err) {
    nativeModule = null;
    unavailableReason =
      "Bluetooth modülü bulunamadı. Bu özellik yalnızca özel derlenmiş (EAS build) bir uygulamada çalışır.";
  }
}

export function isBluetoothClassicAvailable(): boolean {
  return nativeModule !== null;
}

export function bluetoothUnavailableReason(): string | null {
  return unavailableReason;
}

type ReadingListener = (temp: number | null) => void;
type StatusListener = (status: EngineStatus) => void;

export type EngineStatus = "disconnected" | "connecting" | "connected" | "error";

export const DEFAULT_RESPONSE_TIMEOUT_MS = 4000;
export const DEFAULT_CONNECT_TIMEOUT_MS = 10000;
export const MIN_RESPONSE_TIMEOUT_MS = 1000;
export const MAX_RESPONSE_TIMEOUT_MS = 15000;
export const MIN_CONNECT_TIMEOUT_MS = 5000;
export const MAX_CONNECT_TIMEOUT_MS = 30000;

class ObdEngineSingleton {
  private device: NativeDevice | null = null;
  private dataListener: { remove: () => void } | null = null;
  private buffer = "";
  private pendingResolve: ((value: string) => void) | null = null;
  private readingListeners = new Set<ReadingListener>();
  private statusListeners = new Set<StatusListener>();
  private status: EngineStatus = "disconnected";
  private responseTimeoutMs = DEFAULT_RESPONSE_TIMEOUT_MS;
  private connectTimeoutMs = DEFAULT_CONNECT_TIMEOUT_MS;

  setResponseTimeoutMs(value: number) {
    this.responseTimeoutMs = value;
  }

  setConnectTimeoutMs(value: number) {
    this.connectTimeoutMs = value;
  }

  onReading(listener: ReadingListener) {
    this.readingListeners.add(listener);
    return () => this.readingListeners.delete(listener);
  }

  onStatus(listener: StatusListener) {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  getStatus() {
    return this.status;
  }

  private setStatus(status: EngineStatus) {
    this.status = status;
    this.statusListeners.forEach((listener) => listener(status));
  }

  private emitReading(temp: number | null) {
    this.readingListeners.forEach((listener) => listener(temp));
  }

  async requestBluetoothPermissions(): Promise<boolean> {
    if (Platform.OS !== "android") return false;
    try {
      // Android < 12 (API < 31) uses legacy permissions declared in manifest only.
      // Android 12+ (API 31+) requires runtime grants for BLUETOOTH_CONNECT / SCAN.
      const apiLevel = Platform.Version as number;
      if (apiLevel < 31) return true;

      const granted = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      ]);

      return (
        granted[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === PermissionsAndroid.RESULTS.GRANTED &&
        granted[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === PermissionsAndroid.RESULTS.GRANTED
      );
    } catch {
      return false;
    }
  }

  async getBondedDevices(): Promise<PairedDevice[]> {
    if (!nativeModule) return [];
    // Ensure permissions are granted before querying — on Android 12+ getBondedDevices
    // returns an empty list without BLUETOOTH_CONNECT runtime permission.
    await this.requestBluetoothPermissions();
    const devices = await nativeModule.getBondedDevices();
    return devices.map((d) => ({
      id: d.address ?? d.id ?? "",
      address: d.address ?? d.id ?? "",
      name: d.name ?? "Bilinmeyen cihaz",
    }));
  }

  async isBluetoothEnabled(): Promise<boolean> {
    if (!nativeModule) return false;
    try {
      return await nativeModule.isBluetoothEnabled();
    } catch {
      return false;
    }
  }

  async connect(address: string): Promise<void> {
    if (!nativeModule) {
      throw new Error(unavailableReason ?? "Bluetooth kullanılamıyor.");
    }
    this.setStatus("connecting");
    try {
      const device = await this.withTimeout(
        nativeModule.connectToDevice(address, { DELIMITER: "\n" }),
        this.connectTimeoutMs,
        "Adaptöre bağlanılamadı (zaman aşımı).",
      );
      this.device = device;
      this.buffer = "";
      this.dataListener = device.onDataReceived((event) => this.handleData(event.data));

      for (const command of ELM327_INIT_COMMANDS) {
        await this.sendRaw(command);
      }

      this.setStatus("connected");
    } catch (err) {
      this.setStatus("error");
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    this.dataListener?.remove();
    this.dataListener = null;
    try {
      await this.device?.disconnect();
    } catch {
      // ignore — device may already be gone
    }
    this.device = null;
    this.setStatus("disconnected");
  }

  isConnected(): boolean {
    return this.device !== null && this.status === "connected";
  }

  private handleData(chunk: string) {
    this.buffer += chunk;
    if (isResponseComplete(this.buffer) && this.pendingResolve) {
      const response = this.buffer;
      this.buffer = "";
      const resolve = this.pendingResolve;
      this.pendingResolve = null;
      resolve(response);
    }
  }

  private sendRaw(command: string): Promise<string> {
    if (!this.device) {
      return Promise.reject(new Error("Bağlı cihaz yok."));
    }
    return new Promise((resolve, reject) => {
      this.pendingResolve = resolve;
      this.buffer = "";
      this.device!.write(`${command}\r`).catch(reject);

      setTimeout(() => {
        if (this.pendingResolve === resolve) {
          this.pendingResolve = null;
          reject(new Error("Adaptörden yanıt alınamadı (zaman aşımı)."));
        }
      }, this.responseTimeoutMs);
    });
  }

  private withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      promise
        .then((value) => {
          clearTimeout(timer);
          resolve(value);
        })
        .catch((err) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }

  async queryCoolantTemp(): Promise<number | null> {
    if (!this.device) {
      throw new Error("Bağlı cihaz yok.");
    }
    const response = await this.sendRaw(COOLANT_TEMP_PID);
    const temp = parseCoolantTempResponse(response);
    this.emitReading(temp);
    return temp;
  }
}

export const obdEngine = new ObdEngineSingleton();
