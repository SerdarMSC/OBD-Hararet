import { Feather } from "@expo/vector-icons";
import React from "react";
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import type { PairedDevice } from "@/lib/obdEngine";

interface DeviceListSheetProps {
  visible: boolean;
  devices: PairedDevice[];
  onClose: () => void;
  onSelect: (device: PairedDevice) => void;
  onRefresh: () => void;
}

export function DeviceListSheet({ visible, devices, onClose, onSelect, onRefresh }: DeviceListSheetProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View
        style={[
          styles.sheet,
          { backgroundColor: colors.card, paddingBottom: insets.bottom + 24, borderTopLeftRadius: colors.radius, borderTopRightRadius: colors.radius },
        ]}
      >
        <View style={styles.handle} />
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.cardForeground }]}>Eşleşmiş cihazlar</Text>
          <Pressable onPress={onRefresh} hitSlop={12}>
            <Feather name="refresh-cw" size={18} color={colors.mutedForeground} />
          </Pressable>
        </View>
        <FlatList
          data={devices}
          keyExtractor={(item) => item.address}
          scrollEnabled={devices.length > 0}
          contentContainerStyle={devices.length === 0 ? styles.emptyContainer : undefined}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="bluetooth" size={28} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                Eşleşmiş cihaz bulunamadı. ELM327 adaptörünüzü telefonun Bluetooth ayarlarından eşleştirin.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => onSelect(item)}
              style={({ pressed }) => [
                styles.deviceRow,
                { backgroundColor: pressed ? colors.secondary : "transparent", borderColor: colors.border },
              ]}
            >
              <View style={styles.deviceIcon}>
                <Feather name="bluetooth" size={18} color={colors.primary} />
              </View>
              <View style={styles.deviceInfo}>
                <Text style={[styles.deviceName, { color: colors.cardForeground }]}>{item.name}</Text>
                <Text style={[styles.deviceAddress, { color: colors.mutedForeground }]}>{item.address}</Text>
              </View>
              <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
            </Pressable>
          )}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  sheet: {
    maxHeight: "70%",
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.2)",
    marginBottom: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
  },
  deviceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  deviceIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(232,84,44,0.15)",
  },
  deviceInfo: {
    flex: 1,
  },
  deviceName: {
    fontSize: 15,
    fontWeight: "600",
  },
  deviceAddress: {
    fontSize: 12,
    marginTop: 2,
  },
  emptyContainer: {
    flexGrow: 1,
  },
  empty: {
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  emptyText: {
    fontSize: 13,
    textAlign: "center",
    lineHeight: 19,
  },
});
