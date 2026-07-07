import { Feather } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";
import type { AlertLogEntry } from "@/context/ObdContext";

interface AlertLogListProps {
  entries: AlertLogEntry[];
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
}

export function AlertLogList({ entries }: AlertLogListProps) {
  const colors = useColors();

  if (entries.length === 0) {
    return (
      <View style={styles.empty}>
        <Feather name="check-circle" size={22} color={colors.mutedForeground} />
        <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Henüz uyarı yok.</Text>
      </View>
    );
  }

  return (
    <View style={styles.list}>
      {entries.map((entry) => (
        <View
          key={entry.id}
          style={[styles.row, { borderColor: colors.border, backgroundColor: colors.card, borderRadius: colors.radius }]}
        >
          <Feather name="alert-triangle" size={16} color={colors.destructive} />
          <Text style={[styles.rowText, { color: colors.cardForeground }]}>
            {Math.round(entry.temperatureC)}°C
          </Text>
          <Text style={[styles.rowTime, { color: colors.mutedForeground }]}>{formatTime(entry.timestamp)}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  rowText: {
    fontSize: 14,
    fontWeight: "600",
    flex: 1,
  },
  rowTime: {
    fontSize: 12,
  },
  empty: {
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 24,
  },
  emptyText: {
    fontSize: 13,
  },
});
