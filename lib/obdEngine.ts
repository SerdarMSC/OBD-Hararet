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
  getConnectedDevice?: (address: string) => Promise<NativeDevice>;
};

type NativeDevice = {
  address: string;
  name?: string;
  write: (data: string) => Promise<boolean>;
  onDataReceived: (listener: (event: { data: string }) => void) => { remove: () => void };
  read: () => Promise<string | null>;
  available: () => Promise<number>;
  disconnect: () => Promise<boolean>;
  isConnected: () => Promise<boolean>;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
export const DEFAULT_CONNECT_TIMEOUT_MS = 16000;
export const MIN_RESPONSE_TIMEOUT_MS = 1000;
export const MAX_RESPONSE_TIMEOUT_MS = 15000;
export const MIN_CONNECT_TIMEOUT_MS = 5000;
export const MAX_CONNECT_TIMEOUT_MS = 30000;

class ObdEngineSingleton {
  private device: NativeDevice | null = null;
  private readingListeners = new Set<ReadingListener>();
  private statusListeners = new Set<StatusListener>();
  private status: EngineStatus = "disconnected";
  private responseTimeoutMs = DEFAULT_RESPONSE_TIMEOUT_MS;
  private connectTimeoutMs = DEFAULT_CONNECT_TIMEOUT_MS;
  private lastRawResponse = "";

  getLastRawResponse(): string {
    return this.lastRawResponse;
  }

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

  // ========== GÜNCELLENMİŞ connect METODU ==========
  /**
   * react-native-background-actions runs its task via Android's HeadlessJS
   * mechanism (AppRegistry.registerHeadlessTask), which can execute in a
   * genuinely separate JS instance from the main app. When that happens,
   * this singleton is a fresh object with `device: null` even though the
   * underlying native Bluetooth socket (owned by the native module, which
   * IS shared across JS instances at the Android process level) is still
   * actually connected. Calling connect() again in that state would either
   * hit "already attempting connection" or needlessly tear down and
   * re-establish a working connection.
   *
   * This reclaims the existing native connection via getConnectedDevice()
   * first (no new socket, no re-running the AT init sequence) and only
   * falls back to a full connect() if there truly is no live connection.
   */
  async reclaimOrConnect(address: string): Promise<void> {
    if (this.isConnected()) return;
    if (!nativeModule) {
      throw new Error(unavailableReason ?? "Bluetooth kullanılamıyor.");
    }

    if (nativeModule.getConnectedDevice) {
      try {
        const device = await nativeModule.getConnectedDevice(address);
        if (device) {
          this.device = device;
          this.setStatus("connected");
          return;
        }
      } catch {
        // Not actually connected at the native level either — fall
        // through to a normal fresh connect() below.
      }
    }

    await this.connect(address);
  }

  async connect(address: string): Promise<void> {
    if (!nativeModule) {
      throw new Error(unavailableReason ?? "Bluetooth kullanılamıyor.");
    }
    this.setStatus("connecting");
    try {
      const connectOptions = {
        DELIMITER: "",
        DEVICE_CHARSET: "ascii",
        SECURE_SOCKET: false,
      };

      let device: NativeDevice;
      const attemptStartedAt = Date.now();
      try {
        device = await this.withTimeout(
          nativeModule.connectToDevice(address, connectOptions),
          this.connectTimeoutMs,
          "Adaptöre bağlanılamadı (zaman aşımı).",
        );
      } catch (firstErr) {
        // withTimeout() only races a JS-level timer — it does NOT cancel
        // the underlying native connectToDevice() call. If the user has a
        // short connectTimeoutMs configured (Settings allows as low as 5s),
        // our JS timeout can fire well before Android's own internal RFCOMM
        // connect ceiling (commonly ~12-14s) gives up on its own. Firing a
        // second connectToDevice() while the first is still technically in
        // flight makes the native library reject it immediately with
        // "already attempting connection to device X". So before retrying,
        // always wait until at least ~16s have elapsed since the first
        // attempt started — independent of connectTimeoutMs — to guarantee
        // the first native call has genuinely settled by then.
        const NATIVE_SETTLE_FLOOR_MS = 16000;
        const elapsed = Date.now() - attemptStartedAt;
        const remaining = NATIVE_SETTLE_FLOOR_MS - elapsed;
        if (remaining > 0) {
          await sleep(remaining);
        }
        try {
          device = await this.withTimeout(
            nativeModule.connectToDevice(address, connectOptions),
            this.connectTimeoutMs,
            "Adaptöre bağlanılamadı (zaman aşımı, 2 denemede de).",
          );
        } catch (secondErr) {
          const msg2 = secondErr instanceof Error ? secondErr.message : String(secondErr);
          throw new Error(msg2);
        }
      }
      this.device = device;

      let postConnectState = "bilinmiyor";
      try {
        postConnectState = String(await device.isConnected());
      } catch (e) {
        postConnectState = `hata: ${e instanceof Error ? e.message : String(e)}`;
      }

      // Bağlantı sonrası cihazın hazır olması için 2 saniye bekle
      console.log("[OBD] Cihaz hazırlanıyor, bekleniyor...");
      await sleep(2000);

      // Init komutlarını sırayla gönder
      for (const command of ELM327_INIT_COMMANDS) {
        try {
          console.log(`[OBD] Komut gönderiliyor: ${command}`);
          await this.sendRaw(`${command}\r`);
          console.log(`[OBD] ${command} başarılı`);
          await sleep(400);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.warn(`[OBD] ${command} başarısız: ${msg}`);
          // ATSP0 kritik değilse diğer hataları görmezden gel, devam et
          // Sadece gerçekten kritik hatalarda fırlat
          if (command === "ATE0" || command === "ATSP0") {
            throw new Error(`Kritik komut başarısız: "${command}" - ${msg}`);
          }
        }
      }

      // Bağlantı testi yap
      try {
        console.log("[OBD] Bağlantı test ediliyor (0100)...");
        await this.sendRaw("0100\r");
        console.log("[OBD] Bağlantı testi başarılı");
      } catch (err) {
        console.warn("[OBD] Bağlantı testi başarısız ama devam ediliyor");
      }

      this.setStatus("connected");
    } catch (err) {
      if (this.device) {
        try {
          await this.device.disconnect();
        } catch {
          // best-effort cleanup
        }
        this.device = null;
      }
      this.setStatus("error");
      throw err;
    }
  }

  async disconnect(): Promise<void> {
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

  /**
   * Polls the device for incoming data instead of relying solely on the
   * onDataReceived event, which is known to be unreliable on some Android
   * versions / OEM Bluetooth stacks with react-native-bluetooth-classic.
   *
   * On timeout, the thrown error includes a compact trace of what
   * available()/read() actually returned on each poll, so the real
   * root cause is visible directly in the app's error UI instead of
   * guessing blind.
   */
  private async pollForResponse(timeoutMs: number): Promise<string> {
    const device = this.device;
    if (!device) {
      throw new Error("Bağlı cihaz yok.");
    }
    const deadline = Date.now() + timeoutMs;
    let buffer = "";
    const trace: string[] = [];
    let pollCount = 0;
    let anyNonZeroAvailable = false;

    while (Date.now() < deadline) {
      pollCount++;
      try {
        const available = await device.available();
        if (available && available > 0) {
          anyNonZeroAvailable = true;
          const chunk = await device.read();
          trace.push(`#${pollCount} avail=${available} read=${JSON.stringify(chunk)?.slice(0, 40)}`);
          if (chunk) {
            buffer += chunk;
            if (isResponseComplete(buffer)) {
              return buffer;
            }
          }
        }
      } catch (e) {
        trace.push(`#${pollCount} HATA:${e instanceof Error ? e.message : String(e)}`);
      }
      await sleep(120);
    }

    const traceSummary =
      trace.length > 0
        ? trace.slice(0, 6).join(" | ")
        : `hiç veri gelmedi (${pollCount} yoklama, hepsi avail=0)`;
    throw new Error(
      `Adaptörden yanıt alınamadı (zaman aşımı). buffer="${buffer.slice(0, 60)}" nonZeroAvail=${anyNonZeroAvailable} :: ${traceSummary}`,
    );
  }

  private async sendRaw(command: string): Promise<string> {
    if (!this.device) {
      throw new Error("Bağlı cihaz yok.");
    }
    try {
      const writeResult = await this.device.write(command);
      if (writeResult === false) {
        throw new Error("write() false döndürdü.");
      }
    } catch (e) {
      throw new Error(`write() hata verdi: ${e instanceof Error ? e.message : String(e)}`);
    }
    return this.pollForResponse(this.responseTimeoutMs);
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
    const response = await this.sendRaw(COOLANT_TEMP_PID + "\r");
    this.lastRawResponse = response.replace(/[\r\n>]/g, " ").trim();
    const temp = parseCoolantTempResponse(response);
    this.emitReading(temp);
    return temp;
  }
}

export const obdEngine = new ObdEngineSingleton();