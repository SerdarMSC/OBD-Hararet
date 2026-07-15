import React from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { useObd } from "@/context/ObdContext";
import { useColors } from "@/hooks/useColors";

/**
 * Full-screen overlay shown whenever one or more alerts (coolant
 * temperature, battery voltage, oil temperature, EGT) are active. The
 * alarm sound keeps looping (see lib/alertSounds.ts) until the user
 * explicitly acknowledges it here — a plain notification is easy to miss
 * or swipe away without noticing, this cannot be dismissed accidentally.
 */
export function AlertAcknowledgeOverlay() {
  const colors = useColors();
  const { activeAlerts, acknowledgeAlert } = useObd();

  const visible = activeAlerts.length > 0;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={acknowledgeAlert}>
      <View style={[styles.backdrop, { backgroundColor: "rgba(0,0,0,0.75)" }]}>
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {activeAlerts.map((alert, index) => (
              <View key={alert.id} style={index > 0 ? styles.alertSpacer : undefined}>
                <Text style={[styles.title, { color: colors.destructive }]}>{alert.title}</Text>
                <Text style={[styles.body, { color: colors.cardForeground }]}>{alert.message}</Text>
              </View>
            ))}
          </ScrollView>
          <Text style={[styles.footnote, { color: colors.mutedForeground }]}>
            Onaylayana kadar uyarı sesi çalmaya devam eder.
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
    maxHeight: "80%",
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    gap: 8,
  },
  list: {
    width: "100%",
    flexGrow: 0,
  },
  listContent: {
    alignItems: "center",
  },
  alertSpacer: {
    marginTop: 16,
    alignItems: "center",
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
  },
  body: {
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
    marginTop: 4,
  },
  footnote: {
    fontSize: 13,
    textAlign: "center",
    marginTop: 12,
    marginBottom: 4,
  },
  button: {
    width: "100%",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 8,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
});
