import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState } from "react-native";

import {
  bluetoothUnavailableReason,
  DEFAULT_CONNECT_TIMEOUT_MS,
  DEFAULT_RESPONSE_TIMEOUT_MS,
  isBluetoothClassicAvailable,
  obdEngine,
  type EngineStatus,
  type PairedDevice,
} from "@/lib/obdEngine";
import {
  isBackgroundServiceAvailable,
  startBackgroundMonitoring,
  stopBackgroundMonitoring,
} from "@/lib/backgroundTask";
import {
  DEFAULT_ALERT_SOUND_ID,
  ensureAlertSoundChannels,
  previewAlertSound,
  sendCustomAlert,
  sendTemperatureAlert,
  startLoopingAlert,
  stopLoopingAlert,
} from "@/lib/alertSounds";

import {
  addAcknowledgeFromCarListener,
  clearAutoMessage,
  postAutoMessage,
  updateSensor as updateAndroidAutoSensor,
  updateTemperature as updateAndroidAutoTemperature,
} from "obd-auto-bridge";

const ALERT_COOLDOWN_MS = 60_000;

const DEFAULT_VOLTAGE_THRESHOLD = 12;
export const MIN_VOLTAGE_THRESHOLD = 10;
export const MAX_VOLTAGE_THRESHOLD = 26;

const DEFAULT_OIL_TEMP_THRESHOLD = 110;
export const MIN_OIL_TEMP_THRESHOLD = 80;
export const MAX_OIL_TEMP_THRESHOLD = 180;

const DEFAULT_EGT_THRESHOLD = 750;
export const MIN_EGT_THRESHOLD = 500;
export const MAX_EGT_THRESHOLD = 1000;

export interface AlertLogEntry {
  id: string;
  temperatureC?: number;
  message?: string;
  timestamp: number;
}

interface ObdContextValue {
  bluetoothAvailable: boolean;
  backgroundAvailable: boolean;
  unavailableReason: string | null;

  bluetoothPermissionGranted: boolean;
  requestBluetoothPermissions: () => Promise<boolean>;

  pairedDevices: PairedDevice[];
  refreshPairedDevices: () => Promise<void>;

  selectedDevice: PairedDevice | null;
  connectionStatus: EngineStatus;
  connect: (device: PairedDevice) => Promise<void>;
  disconnect: () => Promise<void>;
  connectionError: string | null;

  temperatureC: number | null;
  lastUpdated: number | null;
  lastReadingNote: string | null;

  thresholdC: number;
  setThresholdC: (value: number) => void;
  pollIntervalMs: number;
  setPollIntervalMs: (value: number) => void;

  responseTimeoutMs: number;
  setResponseTimeoutMs: (value: number) => void;
  connectTimeoutMs: number;
  setConnectTimeoutMs: (value: number) => void;

  autoConnectLastDevice: boolean;
  setAutoConnectLastDevice: (value: boolean) => void;
  autoBackgroundOnConnect: boolean;
  setAutoBackgroundOnConnect: (value: boolean) => void;

  isMonitoring: boolean;
  startMonitoring: () => Promise<void>;
  stopMonitoring: () => Promise<void>;

  alertHistory: AlertLogEntry[];
  clearAlertHistory: () => void;

  notificationsEnabled: boolean;
  requestNotificationPermission: () => Promise<boolean>;

  alertSoundId: string;
  setAlertSoundId: (value: string) => void;
  previewSelectedAlertSound: () => Promise<void>;

  activeAlerts: { id: string; title: string; message: string }[];
  acknowledgeAlert: () => void;

  // Optional sensors — off by default, each independently toggleable.
  voltageEnabled: boolean;
  setVoltageEnabled: (value: boolean) => void;
  voltageThreshold: number;
  setVoltageThreshold: (value: number) => void;
  voltageValue: number | null;
  voltageNote: string | null;

  oilTempEnabled: boolean;
  setOilTempEnabled: (value: boolean) => void;
  oilTempThreshold: number;
  setOilTempThreshold: (value: number) => void;
  oilTempValue: number | null;
  oilTempNote: string | null;

  egtEnabled: boolean;
  setEgtEnabled: (value: boolean) => void;
  egtThreshold: number;
  setEgtThreshold: (value: number) => void;
  egtValue: number | null;
  egtNote: string | null;
}

const STORAGE_KEYS = {
  device: "obd:selectedDevice",
  threshold: "obd:thresholdC",
  interval: "obd:pollIntervalMs",
  alerts: "obd:alertHistory",
  responseTimeout: "obd:responseTimeoutMs",
  connectTimeout: "obd:connectTimeoutMs",
  autoConnect: "obd:autoConnectLastDevice",
  autoBackground: "obd:autoBackgroundOnConnect",
  alertSound: "obd:alertSoundId",
  voltageEnabled: "obd:voltageEnabled",
  voltageThreshold: "obd:voltageThreshold",
  oilTempEnabled: "obd:oilTempEnabled",
  oilTempThreshold: "obd:oilTempThreshold",
  egtEnabled: "obd:egtEnabled",
  egtThreshold: "obd:egtThreshold",
};

const DEFAULT_THRESHOLD_C = 105;
const DEFAULT_POLL_INTERVAL_MS = 3000;
const MAX_ALERT_HISTORY = 30;

const ObdContext = createContext<ObdContextValue | null>(null);

export function ObdProvider({ children }: { children: React.ReactNode }) {
  const [pairedDevices, setPairedDevices] = useState<PairedDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<PairedDevice | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<EngineStatus>("disconnected");
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const [temperatureC, setTemperatureC] = useState<number | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [lastReadingNote, setLastReadingNote] = useState<string | null>(null);
  const [activeAlertsMap, setActiveAlertsMap] = useState<Record<string, { title: string; message: string }>>({});

  const [thresholdC, setThresholdCState] = useState(DEFAULT_THRESHOLD_C);
  const [pollIntervalMs, setPollIntervalMsState] = useState(DEFAULT_POLL_INTERVAL_MS);
  const [responseTimeoutMs, setResponseTimeoutMsState] = useState(DEFAULT_RESPONSE_TIMEOUT_MS);
  const [connectTimeoutMs, setConnectTimeoutMsState] = useState(DEFAULT_CONNECT_TIMEOUT_MS);
  const [autoConnectLastDevice, setAutoConnectLastDeviceState] = useState(false);
  const [autoBackgroundOnConnect, setAutoBackgroundOnConnectState] = useState(false);
  const [alertSoundId, setAlertSoundIdState] = useState(DEFAULT_ALERT_SOUND_ID);

  const [voltageEnabled, setVoltageEnabledState] = useState(false);
  const [voltageThreshold, setVoltageThresholdState] = useState(DEFAULT_VOLTAGE_THRESHOLD);
  const [voltageValue, setVoltageValue] = useState<number | null>(null);
  const [voltageNote, setVoltageNote] = useState<string | null>(null);

  const [oilTempEnabled, setOilTempEnabledState] = useState(false);
  const [oilTempThreshold, setOilTempThresholdState] = useState(DEFAULT_OIL_TEMP_THRESHOLD);
  const [oilTempValue, setOilTempValue] = useState<number | null>(null);
  const [oilTempNote, setOilTempNote] = useState<string | null>(null);

  const [egtEnabled, setEgtEnabledState] = useState(false);
  const [egtThreshold, setEgtThresholdState] = useState(DEFAULT_EGT_THRESHOLD);
  const [egtValue, setEgtValue] = useState<number | null>(null);
  const [egtNote, setEgtNote] = useState<string | null>(null);

  const [isMonitoring, setIsMonitoring] = useState(false);
  const [alertHistory, setAlertHistory] = useState<AlertLogEntry[]>([]);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [bluetoothPermissionGranted, setBluetoothPermissionGranted] = useState(false);
  const [settingsHydrated, setSettingsHydrated] = useState(false);
  const autoConnectAttempted = useRef(false);

  const thresholdRef = useRef(thresholdC);
  const pollIntervalRef = useRef(pollIntervalMs);
  const alertSoundIdRef = useRef(alertSoundId);
  const lastAlertAtRef = useRef(0);
  const deviceAddressRef = useRef<string | null>(null);
  thresholdRef.current = thresholdC;
  pollIntervalRef.current = pollIntervalMs;
  alertSoundIdRef.current = alertSoundId;
  deviceAddressRef.current = selectedDevice?.address ?? null;

  const voltageEnabledRef = useRef(voltageEnabled);
  const voltageThresholdRef = useRef(voltageThreshold);
  const voltageLastAlertAtRef = useRef(0);
  voltageEnabledRef.current = voltageEnabled;
  voltageThresholdRef.current = voltageThreshold;

  const oilTempEnabledRef = useRef(oilTempEnabled);
  const oilTempThresholdRef = useRef(oilTempThreshold);
  const oilTempLastAlertAtRef = useRef(0);
  oilTempEnabledRef.current = oilTempEnabled;
  oilTempThresholdRef.current = oilTempThreshold;

  const egtEnabledRef = useRef(egtEnabled);
  const egtThresholdRef = useRef(egtThreshold);
  const egtLastAlertAtRef = useRef(0);
  egtEnabledRef.current = egtEnabled;
  egtThresholdRef.current = egtThreshold;

  // Hydrate persisted settings.
  useEffect(() => {
    (async () => {
      try {
        const [
          deviceRaw,
          thresholdRaw,
          intervalRaw,
          alertsRaw,
          notifStatus,
          responseTimeoutRaw,
          connectTimeoutRaw,
          autoConnectRaw,
          autoBackgroundRaw,
          alertSoundRaw,
          voltageEnabledRaw,
          voltageThresholdRaw,
          oilTempEnabledRaw,
          oilTempThresholdRaw,
          egtEnabledRaw,
          egtThresholdRaw,
        ] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEYS.device),
          AsyncStorage.getItem(STORAGE_KEYS.threshold),
          AsyncStorage.getItem(STORAGE_KEYS.interval),
          AsyncStorage.getItem(STORAGE_KEYS.alerts),
          Notifications.getPermissionsAsync(),
          AsyncStorage.getItem(STORAGE_KEYS.responseTimeout),
          AsyncStorage.getItem(STORAGE_KEYS.connectTimeout),
          AsyncStorage.getItem(STORAGE_KEYS.autoConnect),
          AsyncStorage.getItem(STORAGE_KEYS.autoBackground),
          AsyncStorage.getItem(STORAGE_KEYS.alertSound),
          AsyncStorage.getItem(STORAGE_KEYS.voltageEnabled),
          AsyncStorage.getItem(STORAGE_KEYS.voltageThreshold),
          AsyncStorage.getItem(STORAGE_KEYS.oilTempEnabled),
          AsyncStorage.getItem(STORAGE_KEYS.oilTempThreshold),
          AsyncStorage.getItem(STORAGE_KEYS.egtEnabled),
          AsyncStorage.getItem(STORAGE_KEYS.egtThreshold),
        ]);
        ensureAlertSoundChannels().catch(() => {});
        if (deviceRaw) setSelectedDevice(JSON.parse(deviceRaw));
        if (thresholdRaw) setThresholdCState(Number(thresholdRaw));
        if (intervalRaw) setPollIntervalMsState(Number(intervalRaw));
        if (alertsRaw) setAlertHistory(JSON.parse(alertsRaw));
        setNotificationsEnabled(notifStatus.granted);
        if (responseTimeoutRaw) {
          const value = Number(responseTimeoutRaw);
          setResponseTimeoutMsState(value);
          obdEngine.setResponseTimeoutMs(value);
        }
        if (connectTimeoutRaw) {
          const value = Number(connectTimeoutRaw);
          setConnectTimeoutMsState(value);
          obdEngine.setConnectTimeoutMs(value);
        }
        if (autoConnectRaw) setAutoConnectLastDeviceState(autoConnectRaw === "1");
        if (autoBackgroundRaw) setAutoBackgroundOnConnectState(autoBackgroundRaw === "1");
        if (alertSoundRaw) setAlertSoundIdState(alertSoundRaw);
        if (voltageEnabledRaw) setVoltageEnabledState(voltageEnabledRaw === "1");
        if (voltageThresholdRaw) setVoltageThresholdState(Number(voltageThresholdRaw));
        if (oilTempEnabledRaw) setOilTempEnabledState(oilTempEnabledRaw === "1");
        if (oilTempThresholdRaw) setOilTempThresholdState(Number(oilTempThresholdRaw));
        if (egtEnabledRaw) setEgtEnabledState(egtEnabledRaw === "1");
        if (egtThresholdRaw) setEgtThresholdState(Number(egtThresholdRaw));
      } catch {
        // ignore corrupt storage — defaults already applied
      } finally {
        setSettingsHydrated(true);
      }
    })();
  }, []);

  useEffect(() => {
    const unsubscribe = obdEngine.onStatus((status) => {
      setConnectionStatus(status);
      if (status !== "error") {
        setConnectionError(null);
      }
    });
    const unsubscribeReading = obdEngine.onReading((temp) => {
      if (temp !== null) {
        setTemperatureC(temp);
        setLastUpdated(Date.now());
      }
    });
    return () => {
      unsubscribe();
      unsubscribeReading();
    };
  }, []);

  const requestBluetoothPermissions = useCallback(async () => {
    const granted = await obdEngine.requestBluetoothPermissions();
    setBluetoothPermissionGranted(granted);
    return granted;
  }, []);

  const refreshPairedDevices = useCallback(async () => {
    const granted = await obdEngine.requestBluetoothPermissions();
    setBluetoothPermissionGranted(granted);
    if (!granted) return;
    const devices = await obdEngine.getBondedDevices();
    setPairedDevices(devices);
  }, []);

  useEffect(() => {
    refreshPairedDevices();
  }, [refreshPairedDevices]);

  const connect = useCallback(async (device: PairedDevice) => {
    setConnectionError(null);
    try {
      await obdEngine.connect(device.address);
      setSelectedDevice(device);
      await AsyncStorage.setItem(STORAGE_KEYS.device, JSON.stringify(device));
    } catch (err) {
      setConnectionError(err instanceof Error ? err.message : "Bağlantı hatası.");
      throw err;
    }
  }, []);

  // Auto-connect to the last used adapter on startup, once settings are
  // hydrated and Bluetooth permissions/devices are ready.
  useEffect(() => {
    if (!settingsHydrated || autoConnectAttempted.current) return;
    if (!autoConnectLastDevice || !selectedDevice) return;
    if (!isBluetoothClassicAvailable() || !bluetoothPermissionGranted) return;
    if (connectionStatus !== "disconnected") return;
    autoConnectAttempted.current = true;
    connect(selectedDevice).catch(() => {
      // connectionError is already set by connect(); nothing else to do here
    });
  }, [settingsHydrated, autoConnectLastDevice, selectedDevice, bluetoothPermissionGranted, connectionStatus, connect]);

  const disconnect = useCallback(async () => {
    await obdEngine.disconnect();
    setTemperatureC(null);
    setLastUpdated(null);
    setVoltageValue(null);
    setOilTempValue(null);
    setEgtValue(null);
  }, []);

  const persistAlerts = useCallback((entries: AlertLogEntry[]) => {
    AsyncStorage.setItem(STORAGE_KEYS.alerts, JSON.stringify(entries)).catch(() => {});
  }, []);

  const handleAlert = useCallback(
    (temp: number) => {
      setAlertHistory((prev) => {
        const next = [
          { id: `${Date.now()}`, temperatureC: temp, timestamp: Date.now() },
          ...prev,
        ].slice(0, MAX_ALERT_HISTORY);
        persistAlerts(next);
        return next;
      });
    },
    [persistAlerts],
  );

  const triggerAlert = useCallback((id: string, title: string, message: string, soundId: string) => {
    setActiveAlertsMap((prev) => ({ ...prev, [id]: { title, message } }));
    startLoopingAlert(soundId).catch(() => {});
    // Surface the alert as an Android Auto heads-up card (MessagingStyle).
    postAutoMessage(title, message);
  }, []);

  const clearAlert = useCallback((id: string) => {
    setActiveAlertsMap((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      if (Object.keys(next).length === 0) {
        // No other sensor is currently in an alert state — safe to stop
        // the shared looping sound and remove the car display card.
        stopLoopingAlert();
        clearAutoMessage();
      }
      return next;
    });
  }, []);

  const handleReading = useCallback(
    (temp: number | null, note?: string) => {
      if (temp !== null) {
        setTemperatureC(temp);
        setLastUpdated(Date.now());
        setLastReadingNote(null);

        const isAboveThreshold = temp >= thresholdRef.current;
        updateAndroidAutoTemperature(temp, isAboveThreshold);

        if (isAboveThreshold) {
          const now = Date.now();
          if (now - lastAlertAtRef.current > ALERT_COOLDOWN_MS) {
            lastAlertAtRef.current = now;
            handleAlert(temp);
            triggerAlert(
              "coolant",
              "Motor sıcaklığı yüksek!",
              `Motor sıcaklığı ${temp}°C'ye ulaştı. Aracı kontrol edin.`,
              alertSoundIdRef.current ?? DEFAULT_ALERT_SOUND_ID,
            );
            sendTemperatureAlert(alertSoundIdRef.current ?? DEFAULT_ALERT_SOUND_ID, temp).catch(() => {
              // notification permissions may not be granted yet — reading is still logged in-app
            });
          }
        } else {
          // Temperature is back under the threshold on its own — stop the
          // looping alarm and dismiss the acknowledge banner automatically,
          // even if the user never tapped "Onayla".
          clearAlert("coolant");
        }
      } else if (note) {
        setLastReadingNote(note);
      }
    },
    [handleAlert, triggerAlert, clearAlert],
  );

  const handleVoltageReading = useCallback(
    (value: number | null, note?: string) => {
      if (!voltageEnabledRef.current) return;
      if (value !== null) {
        setVoltageValue(value);
        setVoltageNote(null);
        const isLow = value <= voltageThresholdRef.current;
        updateAndroidAutoSensor("voltage", true, value, isLow);
        if (isLow) {
          const now = Date.now();
          if (now - voltageLastAlertAtRef.current > ALERT_COOLDOWN_MS) {
            voltageLastAlertAtRef.current = now;
            const message = `Akü voltajı ${value}V'a düştü.`;
            triggerAlert("voltage", "Akü voltajı düşük!", message, alertSoundIdRef.current ?? DEFAULT_ALERT_SOUND_ID);
            sendCustomAlert(alertSoundIdRef.current ?? DEFAULT_ALERT_SOUND_ID, "Akü voltajı düşük!", message).catch(
              () => {},
            );
          }
        } else {
          clearAlert("voltage");
        }
      } else if (note) {
        setVoltageNote(note);
      }
    },
    [triggerAlert, clearAlert],
  );

  // One-time (per app run) cross-check between the ECU-reported voltage
  // (PID 0142) and the ELM327 adapter's own directly-measured voltage
  // (AT RV). A persistent gap larger than 1V usually points to a wiring,
  // ground, or fuse problem rather than a real low-battery condition — but
  // this is informational, not an emergency: it's logged once to the
  // history and shown as a plain one-shot notification, without the
  // looping alarm sound or the blocking "Onayla" overlay used for genuine
  // threshold alerts.
  const voltageMismatchWarnedRef = useRef(false);

  const checkVoltageMismatch = useCallback(
    (pidVoltage: number, elmVoltage: number) => {
      if (voltageMismatchWarnedRef.current) return;
      if (Math.abs(pidVoltage - elmVoltage) <= 1) return;
      voltageMismatchWarnedRef.current = true;

      const message =
        "ELM ve ECU arasında 1 volttan fazla fark tespit edildi. Tesisatınızı kontrol ettirmenizde fayda var.";
      setAlertHistory((prev) => {
        const next = [{ id: `${Date.now()}`, message, timestamp: Date.now() }, ...prev].slice(0, MAX_ALERT_HISTORY);
        persistAlerts(next);
        return next;
      });
      sendCustomAlert(alertSoundIdRef.current ?? DEFAULT_ALERT_SOUND_ID, "Voltaj tutarsızlığı", message).catch(() => {});
    },
    [persistAlerts],
  );

  const handleOilTempReading = useCallback(
    (value: number | null, note?: string) => {
      if (!oilTempEnabledRef.current) return;
      if (value !== null) {
        setOilTempValue(value);
        setOilTempNote(null);
        const isHigh = value >= oilTempThresholdRef.current;
        updateAndroidAutoSensor("oilTemp", true, value, isHigh);
        if (isHigh) {
          const now = Date.now();
          if (now - oilTempLastAlertAtRef.current > ALERT_COOLDOWN_MS) {
            oilTempLastAlertAtRef.current = now;
            const message = `Motor yağ sıcaklığı ${value}°C'ye ulaştı.`;
            triggerAlert("oilTemp", "Yağ sıcaklığı yüksek!", message, alertSoundIdRef.current ?? DEFAULT_ALERT_SOUND_ID);
            sendCustomAlert(alertSoundIdRef.current ?? DEFAULT_ALERT_SOUND_ID, "Yağ sıcaklığı yüksek!", message).catch(
              () => {},
            );
          }
        } else {
          clearAlert("oilTemp");
        }
      } else if (note) {
        setOilTempNote(note);
      }
    },
    [triggerAlert, clearAlert],
  );

  const handleEgtReading = useCallback(
    (value: number | null, note?: string) => {
      if (!egtEnabledRef.current) return;
      if (value !== null) {
        setEgtValue(value);
        setEgtNote(null);
        const isHigh = value >= egtThresholdRef.current;
        updateAndroidAutoSensor("egt", true, value, isHigh);
        if (isHigh) {
          const now = Date.now();
          if (now - egtLastAlertAtRef.current > ALERT_COOLDOWN_MS) {
            egtLastAlertAtRef.current = now;
            const message = `Egzoz gazı sıcaklığı (EGT) ${value}°C'ye ulaştı.`;
            triggerAlert("egt", "EGT sıcaklığı yüksek!", message, alertSoundIdRef.current ?? DEFAULT_ALERT_SOUND_ID);
            sendCustomAlert(alertSoundIdRef.current ?? DEFAULT_ALERT_SOUND_ID, "EGT sıcaklığı yüksek!", message).catch(
              () => {},
            );
          }
        } else {
          clearAlert("egt");
        }
      } else if (note) {
        setEgtNote(note);
      }
    },
    [triggerAlert, clearAlert],
  );

  // Foreground live readings: as soon as the adapter is connected, read the
  // current temperature immediately (so the gauge never just sits empty),
  // then keep refreshing on the same cadence as background monitoring.
  // This pauses automatically once background monitoring takes over (to
  // avoid two overlapping queries on the same Bluetooth connection) and
  // resumes if background monitoring is stopped while still connected.
  useEffect(() => {
    if (connectionStatus !== "connected" || isMonitoring) return;

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      if (cancelled || !obdEngine.isConnected()) return;
      try {
        const temp = await obdEngine.queryCoolantTemp();
        if (!cancelled) handleReading(temp, temp === null ? obdEngine.getLastRawResponse() : undefined);
      } catch (err) {
        if (!cancelled) {
          handleReading(null, err instanceof Error ? err.message : "Okuma hatası");
        }
      }

      if (!cancelled && voltageEnabledRef.current) {
        try {
          const v = await obdEngine.queryBatteryVoltage();
          if (!cancelled) handleVoltageReading(v, v === null ? obdEngine.getLastRawVoltageResponse() : undefined);
          if (!cancelled && v !== null) {
            try {
              const elmV = await obdEngine.queryElmVoltage();
              if (!cancelled && elmV !== null) checkVoltageMismatch(v, elmV);
            } catch {
              // best-effort — mismatch check isn't critical
            }
          }
        } catch (err) {
          if (!cancelled) handleVoltageReading(null, err instanceof Error ? err.message : "Okuma hatası");
        }
      }
      if (!cancelled && oilTempEnabledRef.current) {
        try {
          const o = await obdEngine.queryOilTemp();
          if (!cancelled) handleOilTempReading(o, o === null ? obdEngine.getLastRawOilTempResponse() : undefined);
        } catch (err) {
          if (!cancelled) handleOilTempReading(null, err instanceof Error ? err.message : "Okuma hatası");
        }
      }
      if (!cancelled && egtEnabledRef.current) {
        try {
          const g = await obdEngine.queryEgt();
          if (!cancelled) handleEgtReading(g, g === null ? obdEngine.getLastRawEgtResponse() : undefined);
        } catch (err) {
          if (!cancelled) handleEgtReading(null, err instanceof Error ? err.message : "Okuma hatası");
        }
      }

      if (!cancelled) {
        timeoutId = setTimeout(poll, pollIntervalRef.current);
      }
    };

    poll();

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [
    connectionStatus,
    isMonitoring,
    handleReading,
    handleVoltageReading,
    handleOilTempReading,
    handleEgtReading,
    checkVoltageMismatch,
  ]);

  const startMonitoring = useCallback(async () => {
    await startBackgroundMonitoring({
      pollIntervalMs: pollIntervalRef,
      deviceAddress: deviceAddressRef,
      onReading: handleReading,
      voltage: { enabled: voltageEnabledRef, onReading: handleVoltageReading, onMismatchCheck: checkVoltageMismatch },
      oilTemp: { enabled: oilTempEnabledRef, onReading: handleOilTempReading },
      egt: { enabled: egtEnabledRef, onReading: handleEgtReading },
    });
    setIsMonitoring(true);
  }, [handleReading, handleVoltageReading, handleOilTempReading, handleEgtReading, checkVoltageMismatch]);

  const stopMonitoring = useCallback(async () => {
    await stopBackgroundMonitoring();
    setIsMonitoring(false);
  }, []);

  // Stop monitoring automatically if the device disconnects.
  useEffect(() => {
    if (connectionStatus === "disconnected" && isMonitoring) {
      stopMonitoring();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionStatus]);

  // Automatically switch to background monitoring once connected, if enabled.
  useEffect(() => {
    if (connectionStatus === "connected" && autoBackgroundOnConnect && !isMonitoring) {
      startMonitoring().catch(() => {
        // background service may be unavailable in this environment — ignore
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionStatus, autoBackgroundOnConnect]);

  const setThresholdC = useCallback((value: number) => {
    setThresholdCState(value);
    AsyncStorage.setItem(STORAGE_KEYS.threshold, String(value)).catch(() => {});
  }, []);

  const setPollIntervalMs = useCallback((value: number) => {
    setPollIntervalMsState(value);
    AsyncStorage.setItem(STORAGE_KEYS.interval, String(value)).catch(() => {});
  }, []);

  const setResponseTimeoutMs = useCallback((value: number) => {
    setResponseTimeoutMsState(value);
    obdEngine.setResponseTimeoutMs(value);
    AsyncStorage.setItem(STORAGE_KEYS.responseTimeout, String(value)).catch(() => {});
  }, []);

  const setConnectTimeoutMs = useCallback((value: number) => {
    setConnectTimeoutMsState(value);
    obdEngine.setConnectTimeoutMs(value);
    AsyncStorage.setItem(STORAGE_KEYS.connectTimeout, String(value)).catch(() => {});
  }, []);

  const setAutoConnectLastDevice = useCallback((value: boolean) => {
    setAutoConnectLastDeviceState(value);
    AsyncStorage.setItem(STORAGE_KEYS.autoConnect, value ? "1" : "0").catch(() => {});
  }, []);

  const setAutoBackgroundOnConnect = useCallback((value: boolean) => {
    setAutoBackgroundOnConnectState(value);
    AsyncStorage.setItem(STORAGE_KEYS.autoBackground, value ? "1" : "0").catch(() => {});
  }, []);

  const setAlertSoundId = useCallback((value: string) => {
    setAlertSoundIdState(value);
    AsyncStorage.setItem(STORAGE_KEYS.alertSound, value).catch(() => {});
  }, []);

  const activeAlertsMapRef = useRef(activeAlertsMap);
  activeAlertsMapRef.current = activeAlertsMap;

  const previewSelectedAlertSound = useCallback(async () => {
    // Sound preview and the Android Auto test card are independent — a
    // failure in one (e.g. notification permission not yet granted for the
    // sound preview) must not prevent the other. The AA card in particular
    // is often the thing actually being tested from Settings.
    try {
      await previewAlertSound(alertSoundIdRef.current);
    } catch {
      // ignore — the AA test below should still fire
    }
    postAutoMessage("Uyarı testi", "Bu bir test bildirimidir. Android Auto bağlantısı çalışıyor.");
    setTimeout(() => {
      if (Object.keys(activeAlertsMapRef.current).length === 0) {
        clearAutoMessage();
      }
    }, 8000);
  }, []);

  const acknowledgeAlert = useCallback(() => {
    stopLoopingAlert();
    clearAutoMessage();
    setActiveAlertsMap({});
  }, []);

  // Tapping "Tamam" on the Android Auto screen while an alert is showing
  // should have the exact same effect as tapping "Onayla" on the phone —
  // stop the looping alarm sound and dismiss the overlay, from wherever
  // the driver actually acted on it.
  useEffect(() => {
    const unsubscribe = addAcknowledgeFromCarListener(() => {
      acknowledgeAlert();
    });
    return () => {
      unsubscribe?.();
    };
  }, [acknowledgeAlert]);

  const setVoltageEnabled = useCallback((value: boolean) => {
    setVoltageEnabledState(value);
    AsyncStorage.setItem(STORAGE_KEYS.voltageEnabled, value ? "1" : "0").catch(() => {});
    if (!value) {
      setVoltageValue(null);
      setVoltageNote(null);
      clearAlert("voltage");
      updateAndroidAutoSensor("voltage", false, null, false);
    }
  }, [clearAlert]);

  const setVoltageThreshold = useCallback((value: number) => {
    setVoltageThresholdState(value);
    AsyncStorage.setItem(STORAGE_KEYS.voltageThreshold, String(value)).catch(() => {});
  }, []);

  const setOilTempEnabled = useCallback((value: boolean) => {
    setOilTempEnabledState(value);
    AsyncStorage.setItem(STORAGE_KEYS.oilTempEnabled, value ? "1" : "0").catch(() => {});
    if (!value) {
      setOilTempValue(null);
      setOilTempNote(null);
      clearAlert("oilTemp");
      updateAndroidAutoSensor("oilTemp", false, null, false);
    }
  }, [clearAlert]);

  const setOilTempThreshold = useCallback((value: number) => {
    setOilTempThresholdState(value);
    AsyncStorage.setItem(STORAGE_KEYS.oilTempThreshold, String(value)).catch(() => {});
  }, []);

  const setEgtEnabled = useCallback((value: boolean) => {
    setEgtEnabledState(value);
    AsyncStorage.setItem(STORAGE_KEYS.egtEnabled, value ? "1" : "0").catch(() => {});
    if (!value) {
      setEgtValue(null);
      setEgtNote(null);
      clearAlert("egt");
      updateAndroidAutoSensor("egt", false, null, false);
    }
  }, [clearAlert]);

  const setEgtThreshold = useCallback((value: number) => {
    setEgtThresholdState(value);
    AsyncStorage.setItem(STORAGE_KEYS.egtThreshold, String(value)).catch(() => {});
  }, []);

  const clearAlertHistory = useCallback(() => {
    setAlertHistory([]);
    persistAlerts([]);
  }, [persistAlerts]);

  const requestNotificationPermission = useCallback(async () => {
    const result = await Notifications.requestPermissionsAsync();
    setNotificationsEnabled(result.granted);
    return result.granted;
  }, []);

  // Pause polling cadence changes don't need an app-state listener since the
  // background task reads live refs each loop iteration.
  useEffect(() => {
    const sub = AppState.addEventListener("change", () => {});
    return () => sub.remove();
  }, []);

  const activeAlerts = useMemo(
    () => Object.entries(activeAlertsMap).map(([id, alert]) => ({ id, ...alert })),
    [activeAlertsMap],
  );

  const value = useMemo<ObdContextValue>(
    () => ({
      bluetoothAvailable: isBluetoothClassicAvailable(),
      backgroundAvailable: isBackgroundServiceAvailable(),
      unavailableReason: bluetoothUnavailableReason(),
      bluetoothPermissionGranted,
      requestBluetoothPermissions,
      pairedDevices,
      refreshPairedDevices,
      selectedDevice,
      connectionStatus,
      connect,
      disconnect,
      connectionError,
      temperatureC,
      lastUpdated,
      lastReadingNote,
      thresholdC,
      setThresholdC,
      pollIntervalMs,
      setPollIntervalMs,
      responseTimeoutMs,
      setResponseTimeoutMs,
      connectTimeoutMs,
      setConnectTimeoutMs,
      autoConnectLastDevice,
      setAutoConnectLastDevice,
      autoBackgroundOnConnect,
      setAutoBackgroundOnConnect,
      isMonitoring,
      startMonitoring,
      stopMonitoring,
      alertHistory,
      clearAlertHistory,
      notificationsEnabled,
      requestNotificationPermission,
      alertSoundId,
      setAlertSoundId,
      previewSelectedAlertSound,
      activeAlerts,
      acknowledgeAlert,
      voltageEnabled,
      setVoltageEnabled,
      voltageThreshold,
      setVoltageThreshold,
      voltageValue,
      voltageNote,
      oilTempEnabled,
      setOilTempEnabled,
      oilTempThreshold,
      setOilTempThreshold,
      oilTempValue,
      oilTempNote,
      egtEnabled,
      setEgtEnabled,
      egtThreshold,
      setEgtThreshold,
      egtValue,
      egtNote,
    }),
    [
      bluetoothPermissionGranted,
      requestBluetoothPermissions,
      pairedDevices,
      refreshPairedDevices,
      selectedDevice,
      connectionStatus,
      connect,
      disconnect,
      connectionError,
      temperatureC,
      lastUpdated,
      lastReadingNote,
      thresholdC,
      responseTimeoutMs,
      setResponseTimeoutMs,
      connectTimeoutMs,
      setConnectTimeoutMs,
      autoConnectLastDevice,
      setAutoConnectLastDevice,
      autoBackgroundOnConnect,
      setAutoBackgroundOnConnect,
      setThresholdC,
      pollIntervalMs,
      setPollIntervalMs,
      isMonitoring,
      startMonitoring,
      stopMonitoring,
      alertHistory,
      clearAlertHistory,
      notificationsEnabled,
      requestNotificationPermission,
      alertSoundId,
      setAlertSoundId,
      previewSelectedAlertSound,
      activeAlerts,
      acknowledgeAlert,
      voltageEnabled,
      setVoltageEnabled,
      voltageThreshold,
      setVoltageThreshold,
      voltageValue,
      voltageNote,
      oilTempEnabled,
      setOilTempEnabled,
      oilTempThreshold,
      setOilTempThreshold,
      oilTempValue,
      oilTempNote,
      egtEnabled,
      setEgtEnabled,
      egtThreshold,
      setEgtThreshold,
      egtValue,
      egtNote,
    ],
  );

  return <ObdContext.Provider value={value}>{children}</ObdContext.Provider>;
}

export function useObd() {
  const ctx = useContext(ObdContext);
  if (!ctx) throw new Error("useObd must be used within an ObdProvider");
  return ctx;
}
