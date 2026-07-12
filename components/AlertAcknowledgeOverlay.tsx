import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { useObd } from "@/context/ObdContext";
import { useColors } from "@/hooks/useColors";

/**
 * Full-screen overlay shown whenever a temperature alert is active. The
 * alarm sound keeps looping (see lib/alertSounds.ts) until the user
 * explicitly acknowledges it here — a plain notification is easy to miss
 * or swipe away without noticing, this cannot be dismissed accidentally.
 */
export function AlertAcknowledgeOverlay() {
  const colors = useColors();
  const { activeAlertTemp, acknowledgeAlert } = useObd();

  const visible = activeAlertTemp !== null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={acknowledgeAlert}>
      <View style={[styles.backdrop, { backgroundColor: "rgba(0,0,0,0.75)" }]}>
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <Text style={[styles.title, { color: colors.destructive }]}>Motor sıcaklığı yüksek!</Text>
          <Text style={[styles.temp, { color: colors.cardForeground }]}>
            {activeAlertTemp !== null ? `${activeAlertTemp}°C` : ""}
          </Text>
          <Text style={[styles.body, { color: colors.mutedForeground }]}>
            Aracı kontrol edin. Onaylayana kadar uyarı sesi çalmaya devam eder.
          </Text>
          <Pressable
            onPress={acknowledgeAlert}
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: colors.destructive, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Text style={styles.buttonText}>Onayla</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    gap: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
  },
  temp: {
    fontSize: 40,
    fontWeight: "800",
    marginVertical: 4,
  },
  body: {
    fontSize: 14,
    textAlign: "center",
    marginBottom: 12,
  },
  button: {
    width: "100%",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
});
