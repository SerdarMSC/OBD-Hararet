import { Feather } from "@expo/vector-icons";
import Constants from "expo-constants";
import * as Haptics from "expo-haptics";
import React, { useCallback } from "react";
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useObd } from "@/context/ObdContext";
import { useColors } from "@/hooks/useColors";
import { ALERT_SOUND_OPTIONS } from "@/lib/alertSounds";

const THRESHOLD_STEP = 1;
const MIN_THRESHOLD = 70;
const MAX_THRESHOLD = 130;

const APP_NAME = Constants.expoConfig?.name ?? "OBD Sıcaklık İzleyici";
const APP_VERSION = Constants.expoConfig?.version ?? "—";
const APP_BUILD_NUMBER = Constants.expoConfig?.android?.versionCode ?? "—";
const GITHUB_URL = "https://github.com/SerdarMSC/";
const CONTACT_EMAIL = "serdarmsc@gmail.com";

const INTERVAL_OPTIONS = [
  { label: "2 sn", value: 2000 },
  { label: "5 sn", value: 5000 },
  { label: "15 sn", value: 15000 },
  { label: "30 sn", value: 30000 },
];

const RESPONSE_TIMEOUT_OPTIONS = [
  { label: "2 sn", value: 2000 },
  { label: "4 sn", value: 4000 },
  { label: "6 sn", value: 6000 },
  { label: "10 sn", value: 10000 },
];

const CONNECT_TIMEOUT_OPTIONS = [
  { label: "5 sn", value: 5000 },
  { label: "10 sn", value: 10000 },
  { label: "15 sn", value: 15000 },
  { label: "20 sn", value: 20000 },
];

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const {
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
    selectedDevice,
    notificationsEnabled,
    requestNotificationPermission,
    clearAlertHistory,
    alertSoundId,
    setAlertSoundId,
    previewSelectedAlertSound,
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

  const handlePreviewSound = useCallback(async () => {
    try {
      await previewSelectedAlertSound();
    } catch {
      Alert.alert("Önizleme başarısız", "Bildirim izni verilmemiş olabilir.");
    }
  }, [previewSelectedAlertSound]);

  const handleOpenGithub = useCallback(() => {
    Linking.openURL(GITHUB_URL).catch(() => {});
  }, []);

  const handleOpenEmail = useCallback(() => {
    Linking.openURL(`mailto:${CONTACT_EMAIL}`).catch(() => {});
  }, []);

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
        <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>Adaptör zaman aşımı</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderRadius: colors.radius }]}>
          <Text style={[styles.notificationTitle, { color: colors.cardForeground }]}>Yanıt bekleme süresi</Text>
          <View style={styles.intervalRow}>
            {RESPONSE_TIMEOUT_OPTIONS.map((option) => {
              const active = responseTimeoutMs === option.value;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setResponseTimeoutMs(option.value);
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
          <Text style={[styles.helperText, { color: colors.mutedForeground }]}>
            Adaptör bir komuta bu süre içinde yanıt vermezse "zaman aşımı" hatası verilir. Sinyal zayıfsa veya adaptör
            yavaşsa bu süreyi artırın.
          </Text>

          <View style={styles.divider} />

          <Text style={[styles.notificationTitle, { color: colors.cardForeground }]}>Bağlantı bekleme süresi</Text>
          <View style={styles.intervalRow}>
            {CONNECT_TIMEOUT_OPTIONS.map((option) => {
              const active = connectTimeoutMs === option.value;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setConnectTimeoutMs(option.value);
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
          <Text style={[styles.helperText, { color: colors.mutedForeground }]}>
            Adaptöre bağlanma denemesi bu süre içinde tamamlanmazsa iptal edilir.
          </Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>Otomasyon</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderRadius: colors.radius }]}>
          <View style={styles.notificationRow}>
            <View style={styles.notificationInfo}>
              <Text style={[styles.notificationTitle, { color: colors.cardForeground }]}>
                Açılışta otomatik bağlan
              </Text>
              <Text style={[styles.helperText, { color: colors.mutedForeground }]}>
                {selectedDevice
                  ? `Uygulama açıldığında "${selectedDevice.name}" adaptörüne otomatik bağlanılır.`
                  : "Önce bir adaptöre bağlanmalısınız."}
              </Text>
            </View>
            <Switch
              value={autoConnectLastDevice}
              onValueChange={(value) => {
                Haptics.selectionAsync();
                setAutoConnectLastDevice(value);
              }}
              disabled={!selectedDevice}
              trackColor={{ true: colors.primary, false: colors.secondary }}
            />
          </View>

          <View style={styles.divider} />

          <View style={styles.notificationRow}>
            <View style={styles.notificationInfo}>
              <Text style={[styles.notificationTitle, { color: colors.cardForeground }]}>
                Bağlanınca arka plana geç
              </Text>
              <Text style={[styles.helperText, { color: colors.mutedForeground }]}>
                Adaptöre bağlantı kurulduğunda izleme otomatik olarak arka planda başlar.
              </Text>
            </View>
            <Switch
              value={autoBackgroundOnConnect}
              onValueChange={(value) => {
                Haptics.selectionAsync();
                setAutoBackgroundOnConnect(value);
              }}
              trackColor={{ true: colors.primary, false: colors.secondary }}
            />
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

          <View style={styles.divider} />

          <Text style={[styles.notificationTitle, { color: colors.cardForeground }]}>Uyarı sesi</Text>
          <View style={styles.intervalRow}>
            {ALERT_SOUND_OPTIONS.map((option) => {
              const active = alertSoundId === option.id;
              return (
                <Pressable
                  key={option.id}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setAlertSoundId(option.id);
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
          <Pressable
            onPress={handlePreviewSound}
            style={({ pressed }) => [
              styles.previewButton,
              { backgroundColor: colors.secondary, opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <Feather name="volume-2" size={16} color={colors.secondaryForeground} />
            <Text style={{ color: colors.secondaryForeground, fontWeight: "600" }}>Sesi dene</Text>
          </Pressable>
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

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>Hakkında</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderRadius: colors.radius }]}>
          <View style={styles.aboutHeader}>
            <Text style={[styles.aboutAppName, { color: colors.cardForeground }]}>{APP_NAME}</Text>
            <Text style={[styles.aboutMeta, { color: colors.mutedForeground }]}>
              Sürüm {APP_VERSION} · Build {APP_BUILD_NUMBER}
            </Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.aboutRow}>
            <Text style={[styles.aboutLabel, { color: colors.mutedForeground }]}>Geliştirici</Text>
            <Text style={[styles.aboutValue, { color: colors.cardForeground }]}>Coder SerdarMSC</Text>
          </View>

          <Pressable onPress={handleOpenGithub} style={({ pressed }) => [styles.aboutLinkRow, { opacity: pressed ? 0.6 : 1 }]}>
            <Feather name="github" size={16} color={colors.mutedForeground} />
            <Text style={[styles.aboutLinkText, { color: colors.primary }]}>github.com/SerdarMSC</Text>
          </Pressable>

          <Pressable onPress={handleOpenEmail} style={({ pressed }) => [styles.aboutLinkRow, { opacity: pressed ? 0.6 : 1 }]}>
            <Feather name="mail" size={16} color={colors.mutedForeground} />
            <Text style={[styles.aboutLinkText, { color: colors.primary }]}>{CONTACT_EMAIL}</Text>
          </Pressable>

          <View style={styles.divider} />

          <Text style={[styles.aboutLicense, { color: colors.mutedForeground }]}>
            MIT License altında yayımlanmıştır. Kaynak kodu ve katkılar için GitHub deposunu ziyaret edebilirsiniz.
          </Text>
        </View>
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
    paddingRight: 12,
  },
  divider: {
    height: 1,
    backgroundColor: "rgba(128,128,128,0.15)",
    marginVertical: 4,
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
  previewButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 10,
    borderRadius: 12,
    marginTop: 4,
  },
  dangerButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
  },
  aboutHeader: {
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
  },
  aboutAppName: {
    fontSize: 18,
    fontWeight: "700",
  },
  aboutMeta: {
    fontSize: 13,
  },
  aboutRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  aboutLabel: {
    fontSize: 14,
  },
  aboutValue: {
    fontSize: 14,
    fontWeight: "600",
  },
  aboutLinkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 2,
  },
  aboutLinkText: {
    fontSize: 14,
    fontWeight: "600",
  },
  aboutLicense: {
    fontSize: 12,
    lineHeight: 17,
    textAlign: "center",
  },
});
