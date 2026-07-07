import { Feather } from "@expo/vector-icons";
import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";
import type { EngineStatus } from "@/lib/obdEngine";
import type { PairedDevice } from "@/lib/obdEngine";

interface ConnectionCardProps {
  status: EngineStatus;
  device: PairedDevice | null;
  error: string | null;
  onPressDevice: () => void;
  onDisconnect: () => void;
}

const STATUS_LABEL: Record<EngineStatus, string> = {
  disconnected: "Bağlı değil",
  connecting: "Bağlanıyor...",
  connected: "Bağlı",
  error: "Bağlantı hatası",
};

export function ConnectionCard({ status, device, error, onPressDevice, onDisconnect }: ConnectionCardProps) {
  const colors = useColors();
  const dotColor =
    status === "connected" ? colors.success : status === "error" ? colors.destructive : colors.mutedForeground;

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderRadius: colors.radius, borderColor: colors.border }]}>
      <View style={styles.row}>
        <View style={[styles.dot, { backgroundColor: dotColor }]} />
        <View style={styles.info}>
          <Text style={[styles.deviceName, { color: colors.cardForeground }]} numberOfLines={1}>
            {device ? device.name : "ELM327 seçilmedi"}
          </Text>
          <Text style={[styles.status, { color: colors.mutedForeground }]}>{STATUS_LABEL[status]}</Text>
        </View>
        {status === "connecting" ? (
          <ActivityIndicator color={colors.primary} />
        ) : status === "connected" ? (
          <Pressable
            onPress={onDisconnect}
            style={({ pressed }) => [
              styles.actionButton,
              { backgroundColor: colors.secondary, opacity: pressed ? 0.7 : 1 },
            ]}
            testID="disconnect-button"
          >
            <Feather name="bluetooth" size={18} color={colors.destructive} />
          </Pressable>
        ) : (
          <Pressable
            onPress={onPressDevice}
            style={({ pressed }) => [
              styles.actionButton,
              { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
            ]}
            testID="connect-button"
          >
            <Feather name="bluetooth" size={18} color={colors.primaryForeground} />
          </Pressable>
        )}
      </View>
      {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  info: {
    flex: 1,
  },
  deviceName: {
    fontSize: 16,
    fontWeight: "600",
  },
  status: {
    fontSize: 13,
    marginTop: 2,
  },
  actionButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  error: {
    fontSize: 13,
  },
});
