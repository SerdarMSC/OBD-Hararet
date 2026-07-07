import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useCallback } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useObd } from "@/context/ObdContext";
import { useColors } from "@/hooks/useColors";

const THRESHOLD_STEP = 1;
const MIN_THRESHOLD = 70;
const MAX_THRESHOLD = 130;

const INTERVAL_OPTIONS = [
  { label: "3 sn", value: 3000 },
  { label: "10 sn", value: 10000 },
  { label: "15 sn", value: 15000 },
  { label: "30 sn", value: 30000 },
];

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const {
    thresholdC,
    setThresholdC,
    pollIntervalMs,
    setPollIntervalMs,
    notificationsEnabled,
    requestNotificationPermission,
    clearAlertHistory,
  } = useObd();

  const adjustThreshold = useCallback(
    (delta: number) => {
      const next = Math.min(MAX_THRESHOLD, Math.max(MIN_THRESHOLD, thresholdC + delta));
      Haptics.selectionAsync();
      setThresholdC(next);
    },
    [setThresholdC, thresholdC],
  );

  const handleEnableNotifications = useCallback(async () => {
    const granted = await requestNotificationPermission();
    if (!granted) {
      Alert.alert("İzin reddedildi", "Bildirim izni telefon ayarlarından etkinleştirilebilir.");
    }
  }, [requestNotificationPermission]);

  const handleClearHistory = useCallback(() => {
    Alert.alert("Geçmişi temizle", "Tüm uyarı kayıtları silinsin mi?", [
      { text: "Vazgeç", style: "cancel" },
      { text: "Sil", style: "destructive", onPress: clearAlertHistory },
    ]);
  }, [clearAlertHistory]);

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 40 }]}
    >
      <Text style={[styles.title, { color: colors.foreground }]}>Ayarlar</Text>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>Uyarı eşiği</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderRadius: colors.radius }]}>
          <View style={styles.thresholdRow}>
            <Pressable
              onPress={() => adjustThreshold(-THRESHOLD_STEP)}
              style={({ pressed }) => [styles.stepButton, { backgroundColor: colors.secondary, opacity: pressed ? 0.7 : 1 }]}
              testID="threshold-decrease"
            >
              <Feather name="minus" size={18} color={colors.foreground} />
            </Pressable>
            <Text style={[styles.thresholdValue, { color: colors.cardForeground }]}>{thresholdC}°C</Text>
            <Pressable
              onPress={() => adjustThreshold(THRESHOLD_STEP)}
              style={({ pressed }) => [styles.stepButton, { backgroundColor: colors.secondary, opacity: pressed ? 0.7 : 1 }]}
              testID="threshold-increase"
            >
              <Feather name="plus" size={18} color={colors.foreground} />
            </Pressable>
          </View>
          <Text style={[styles.helperText, { color: colors.mutedForeground }]}>
            Motor sıcaklığı bu değere ulaştığında bildirim gönderilir.
          </Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>Okuma sıklığı</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderRadius: colors.radius }]}>
          <View style={styles.intervalRow}>
            {INTERVAL_OPTIONS.map((option) => {
              const active = pollIntervalMs === option.value;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setPollIntervalMs(option.value);
                  }}
                  style={({ pressed }) => [
                    styles.intervalChip,
                    {
                      backgroundColor: active ? colors.primary : colors.secondary,
                      opacity: pressed ? 0.8 : 1,
                    },
                  ]}
                >
                  <Text style={{ color: active ? colors.primaryForeground : colors.secondaryForeground, fontWeight: "600" }}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>Bildirimler</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderRadius: colors.radius }]}>
          <View style={styles.notificationRow}>
            <View style={styles.notificationInfo}>
              <Text style={[styles.notificationTitle, { color: colors.cardForeground }]}>
                Sıcaklık uyarı bildirimleri
              </Text>
              <Text style={[styles.helperText, { color: colors.mutedForeground }]}>
                {notificationsEnabled ? "Etkin" : "Kapalı"}
              </Text>
            </View>
            {!notificationsEnabled ? (
              <Pressable
                onPress={handleEnableNotifications}
                style={({ pressed }) => [styles.enableButton, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
              >
                <Text style={{ color: colors.primaryForeground, fontWeight: "600" }}>Etkinleştir</Text>
              </Pressable>
            ) : (
              <Feather name="check-circle" size={20} color={colors.success} />
            )}
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Pressable
          onPress={handleClearHistory}
          style={({ pressed }) => [
            styles.dangerButton,
            { backgroundColor: colors.card, borderRadius: colors.radius, opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <Feather name="trash-2" size={16} color={colors.destructive} />
          <Text style={{ color: colors.destructive, fontWeight: "600" }}>Uyarı geçmişini temizle</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 20,
    gap: 24,
  },
  title: {
    fontSize: 26,
    fontWeight: "700",
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  card: {
    padding: 16,
    gap: 10,
  },
  thresholdRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 24,
  },
  stepButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  thresholdValue: {
    fontSize: 32,
    fontWeight: "700",
    minWidth: 100,
    textAlign: "center",
  },
  helperText: {
    fontSize: 12,
    textAlign: "center",
    lineHeight: 17,
  },
  intervalRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  intervalChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  notificationRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  notificationInfo: {
    flex: 1,
  },
  notificationTitle: {
    fontSize: 15,
    fontWeight: "600",
  },
  enableButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  dangerButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
  },
});
