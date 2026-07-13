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
  sendTemperatureAlert,
  startLoopingAlert,
  stopLoopingAlert,
} from "@/lib/alertSounds";

const ALERT_COOLDOWN_MS = 60_000;

export interface AlertLogEntry {
  id: string;
  temperatureC: number;
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

  activeAlertTemp: number | null;
  acknowledgeAlert: () => void;
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
  const [activeAlertTemp, setActiveAlertTemp] = useState<number | null>(null);

  const [thresholdC, setThresholdCState] = useState(DEFAULT_THRESHOLD_C);
  const [pollIntervalMs, setPollIntervalMsState] = useState(DEFAULT_POLL_INTERVAL_MS);
  const [responseTimeoutMs, setResponseTimeoutMsState] = useState(DEFAULT_RESPONSE_TIMEOUT_MS);
  const [connectTimeoutMs, setConnectTimeoutMsState] = useState(DEFAULT_CONNECT_TIMEOUT_MS);
  const [autoConnectLastDevice, setAutoConnectLastDeviceState] = useState(false);
  const [autoBackgroundOnConnect, setAutoBackgroundOnConnectState] = useState(false);
  const [alertSoundId, setAlertSoundIdState] = useState(DEFAULT_ALERT_SOUND_ID);

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

  const handleReading = useCallback(
    (temp: number | null, note?: string) => {
      if (temp !== null) {
        setTemperatureC(temp);
        setLastUpdated(Date.now());
        setLastReadingNote(null);

        if (temp >= thresholdRef.current) {
          const now = Date.now();
          if (now - lastAlertAtRef.current > ALERT_COOLDOWN_MS) {
            lastAlertAtRef.current = now;
            handleAlert(temp);
            setActiveAlertTemp(temp);
            startLoopingAlert(alertSoundIdRef.current ?? DEFAULT_ALERT_SOUND_ID).catch(() => {});
            sendTemperatureAlert(alertSoundIdRef.current ?? DEFAULT_ALERT_SOUND_ID, temp).catch(() => {
              // notification permissions may not be granted yet — reading is still logged in-app
            });
          }
        }
      } else if (note) {
        setLastReadingNote(note);
      }
    },
    [handleAlert],
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
      if (!cancelled) {
        timeoutId = setTimeout(poll, pollIntervalRef.current);
      }
    };

    poll();

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [connectionStatus, isMonitoring, handleReading]);

  const startMonitoring = useCallback(async () => {
    await startBackgroundMonitoring({
      pollIntervalMs: pollIntervalRef,
      deviceAddress: deviceAddressRef,
      onReading: handleReading,
    });
    setIsMonitoring(true);
  }, [handleReading]);

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

  const previewSelectedAlertSound = useCallback(async () => {
    await previewAlertSound(alertSoundIdRef.current);
  }, []);

  const acknowledgeAlert = useCallback(() => {
    stopLoopingAlert();
    setActiveAlertTemp(null);
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
      activeAlertTemp,
      acknowledgeAlert,
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
      activeAlertTemp,
      acknowledgeAlert,
    ],
  );

  return <ObdContext.Provider value={value}>{children}</ObdContext.Provider>;
}

export function useObd() {
  const ctx = useContext(ObdContext);
  if (!ctx) throw new Error("useObd must be used within an ObdProvider");
  return ctx;
}
