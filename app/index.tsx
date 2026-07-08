import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AlertLogList } from "@/components/AlertLogList";
import { ConnectionCard } from "@/components/ConnectionCard";
import { DeviceListSheet } from "@/components/DeviceListSheet";
import { TemperatureGauge } from "@/components/TemperatureGauge";
import { useObd } from "@/context/ObdContext";
import { useColors } from "@/hooks/useColors";
import type { PairedDevice } from "@/lib/obdEngine";

export default function DashboardScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [pickerVisible, setPickerVisible] = useState(false);

  const {
    bluetoothAvailable,
    backgroundAvailable,
    unavailableReason,
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
    thresholdC,
    isMonitoring,
    startMonitoring,
    stopMonitoring,
    alertHistory,
    notificationsEnabled,
    requestNotificationPermission,
  } = useObd();

  const handleSelectDevice = useCallback(
    async (device: PairedDevice) => {
      setPickerVisible(false);
      try {
        await connect(device);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    },
    [connect],
  );

  const handleOpenPicker = useCallback(async () => {
    // Always request permissions before opening picker — on Android 12+ the system
    // dialog is idempotent (no-op if already granted), so it's safe to call every time.
    await requestBluetoothPermissions();
    await refreshPairedDevices();
    setPickerVisible(true);
  }, [requestBluetoothPermissions, refreshPairedDevices]);

  const handleToggleMonitoring = useCallback(async () => {
    if (!notificationsEnabled) {
      const granted = await requestNotificationPermission();
      if (!granted) {
        Alert.alert(
          "Bildirim izni gerekli",
          "Sıcaklık uyarılarını alabilmek için bildirim izni vermeniz gerekiyor.",
        );
        return;
      }
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      if (isMonitoring) {
        await stopMonitoring();
      } else {
        await startMonitoring();
      }
    } catch (err) {
      Alert.alert("Hata", err instanceof Error ? err.message : "İşlem başarısız oldu.");
    }
  }, [isMonitoring, notificationsEnabled, requestNotificationPermission, startMonitoring, stopMonitoring]);

  const lastUpdatedLabel = lastUpdated
    ? new Date(lastUpdated).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "—";

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <View>
            <Text style={[styles.title, { color: colors.foreground }]}>Motor İzleyici</Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>ELM327 · OBD-II</Text>
          </View>
          <Pressable
            onPress={() => router.push("/settings")}
            hitSlop={12}
            style={({ pressed }) => [styles.settingsButton, { backgroundColor: colors.card, opacity: pressed ? 0.7 : 1 }]}
            testID="settings-button"
          >
            <Feather name="settings" size={20} color={colors.foreground} />
          </Pressable>
        </View>

        {!bluetoothAvailable ? (
          <View style={[styles.banner, { backgroundColor: colors.secondary, borderRadius: colors.radius }]}>
            <Feather name="info" size={16} color={colors.warning} />
            <Text style={[styles.bannerText, { color: colors.secondaryForeground }]}>
              {unavailableReason ??
                "Bluetooth klasik bağlantısı bu ortamda kullanılamıyor. Özel derlenmiş (EAS build) bir uygulamada test edin."}
            </Text>
          </View>
        ) : !bluetoothPermissionGranted ? (
          <Pressable
            onPress={async () => {
              await requestBluetoothPermissions();
              await refreshPairedDevices();
            }}
            style={({ pressed }) => [
              styles.banner,
              styles.permissionBanner,
              { backgroundColor: colors.primary, borderRadius: colors.radius, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Feather name="bluetooth" size={16} color={colors.primaryForeground} />
            <Text style={[styles.bannerText, { color: colors.primaryForeground, fontWeight: "600" }]}>
              Bluetooth iznine izin verin — Eşleşmiş cihazları görmek için gerekli
            </Text>
          </Pressable>
        ) : null}

        <ConnectionCard
          status={connectionStatus}
          device={selectedDevice}
          error={connectionError}
          onPressDevice={handleOpenPicker}
          onDisconnect={disconnect}
        />

        <View style={styles.gaugeSection}>
          <TemperatureGauge temperatureC={temperatureC} thresholdC={thresholdC} />
          <Text style={[styles.lastUpdated, { color: colors.mutedForeground }]}>
            Son güncelleme: {lastUpdatedLabel}
          </Text>
          <Text style={[styles.thresholdLabel, { color: colors.mutedForeground }]}>
            Uyarı eşiği: {thresholdC}°C
          </Text>
        </View>

        <Pressable
          onPress={handleToggleMonitoring}
          disabled={connectionStatus !== "connected" && !isMonitoring}
          style={({ pressed }) => [
            styles.monitorButton,
            {
              backgroundColor: isMonitoring ? colors.destructive : colors.primary,
              borderRadius: colors.radius,
              opacity: pressed ? 0.85 : connectionStatus !== "connected" && !isMonitoring ? 0.4 : 1,
            },
          ]}
          testID="toggle-monitoring-button"
        >
          <Feather name={isMonitoring ? "square" : "play"} size={18} color={colors.primaryForeground} />
          <Text style={[styles.monitorButtonText, { color: colors.primaryForeground }]}>
            {isMonitoring ? "İzlemeyi durdur" : "Arka planda izlemeyi başlat"}
          </Text>
        </Pressable>

        {!backgroundAvailable ? (
          <Text style={[styles.hint, { color: colors.mutedForeground }]}>
            Arka plan servisi yalnızca özel derlenmiş (EAS build) uygulamada çalışır.
          </Text>
        ) : null}

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Uyarı geçmişi</Text>
          <AlertLogList entries={alertHistory} />
        </View>
      </ScrollView>

      <DeviceListSheet
        visible={pickerVisible}
        devices={pairedDevices}
        onClose={() => setPickerVisible(false)}
        onSelect={handleSelectDevice}
        onRefresh={refreshPairedDevices}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    gap: 20,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  title: {
    fontSize: 26,
    fontWeight: "700",
  },
  subtitle: {
    fontSize: 14,
    marginTop: 2,
  },
  settingsButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  banner: {
    flexDirection: "row",
    gap: 10,
    padding: 14,
    alignItems: "flex-start",
  },
  permissionBanner: {
    alignItems: "center",
  },
  bannerText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  gaugeSection: {
    alignItems: "center",
    gap: 4,
    paddingVertical: 12,
  },
  lastUpdated: {
    fontSize: 13,
    marginTop: 8,
  },
  thresholdLabel: {
    fontSize: 13,
  },
  monitorButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
  },
  monitorButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
  hint: {
    fontSize: 12,
    textAlign: "center",
    marginTop: -12,
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
});
