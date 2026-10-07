import React from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";

function ListRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <View style={styles.listRow}>
      <Text style={styles.listLabel}>{label}</Text>
      <Text style={[styles.listValue, valueColor ? { color: valueColor } : undefined]}>{value}</Text>
    </View>
  );
}

export default function DonationReceiptScreen() {
  const insets = useSafeAreaInsets();
  const {
    amount = "5",
    fund = "Animal Shelter",
    category = "Favorite",
    reason = "Missed alarm",
    voluntary = "false",
  } = useLocalSearchParams<{
    amount?: string; fund?: string; category?: string; reason?: string; voluntary?: string;
  }>();

  const isVoluntary = voluntary === "true";
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const timeStr = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const ref = "WD-" + Math.random().toString(36).slice(2, 8).toUpperCase();

  const categoryColor =
    category === "Favorite" ? "#30D158" :
    category === "Recommended" ? "#FF9F0A" :
    "#FF453A";

  const statusColor = "#30D158";

  return (
    <ScrollView
      style={[styles.container, { paddingTop: insets.top + 16 }]}
      contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Feather name="x" size={22} color="#8888AA" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Receipt</Text>
        <View style={{ width: 22 }} />
      </View>

      {/* Highlight card */}
      <View style={styles.highlightCard}>
        <View style={styles.receiptIconWrap}>
          <Feather name="check-circle" size={32} color="#30D158" />
        </View>
        <Text style={styles.highlightLabel}>
          {isVoluntary ? "Voluntary Donation" : "Donation Processed"}
        </Text>
        <Text style={styles.highlightAmount}>${amount}</Text>
        <Text style={styles.highlightFund}>to {fund}</Text>
        <View style={styles.statusBadge}>
          <View style={styles.statusDot} />
          <Text style={styles.statusBadgeText}>Completed</Text>
        </View>
      </View>

      {/* Details */}
      <View style={styles.detailsCard}>
        <Text style={styles.detailsTitle}>Details</Text>

        <ListRow label="Fund" value={fund} />
        <View style={styles.divider} />
        <View style={styles.listRow}>
          <Text style={styles.listLabel}>Category</Text>
          <View style={[styles.categoryBadge, { borderColor: categoryColor + "44", backgroundColor: categoryColor + "18" }]}>
            <Text style={[styles.categoryBadgeText, { color: categoryColor }]}>{category}</Text>
          </View>
        </View>
        <View style={styles.divider} />
        <ListRow label="Date" value={`${dateStr}, ${timeStr}`} />
        <View style={styles.divider} />
        <ListRow label="Reason" value={isVoluntary ? "Voluntary" : reason} />
        <View style={styles.divider} />
        <ListRow label="Status" value="Completed" valueColor={statusColor} />
        <View style={styles.divider} />
        <ListRow label="Reference" value={ref} />
      </View>

      {/* Note */}
      <View style={styles.noteCard}>
        <Feather name="info" size={14} color="#8888AA" />
        <Text style={styles.noteText}>
          {isVoluntary
            ? "Thank you for your generosity! This donation was made voluntarily."
            : "This donation was automatically processed according to your alarm settings."}
        </Text>
      </View>

      {/* Done */}
      <TouchableOpacity
        style={styles.doneBtn}
        onPress={() => router.back()}
        activeOpacity={0.8}
      >
        <Text style={styles.doneBtnText}>Done</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0A0A0F" },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 17, fontFamily: "Inter_600SemiBold", color: "#F0F0FF",
  },
  highlightCard: {
    marginHorizontal: 16, backgroundColor: "#141420",
    borderRadius: 24, borderWidth: 1, borderColor: "#30D15833",
    padding: 28, alignItems: "center", marginBottom: 16,
  },
  receiptIconWrap: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: "#30D15818", alignItems: "center", justifyContent: "center",
    marginBottom: 16,
  },
  highlightLabel: {
    fontSize: 14, fontFamily: "Inter_500Medium", color: "#8888AA", marginBottom: 8,
  },
  highlightAmount: {
    fontSize: 48, fontFamily: "Inter_700Bold", color: "#F0F0FF", marginBottom: 4,
  },
  highlightFund: {
    fontSize: 15, fontFamily: "Inter_400Regular", color: "#8888AA", marginBottom: 16,
  },
  statusBadge: {
    flexDirection: "row", gap: 6, alignItems: "center",
    backgroundColor: "#30D15818", borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 5,
    borderWidth: 1, borderColor: "#30D15844",
  },
  statusDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: "#30D158" },
  statusBadgeText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#30D158" },
  detailsCard: {
    marginHorizontal: 16, backgroundColor: "#141420",
    borderRadius: 20, borderWidth: 1, borderColor: "#2A2A40",
    padding: 4, marginBottom: 14,
  },
  detailsTitle: {
    fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#8888AA",
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10,
    textTransform: "uppercase", letterSpacing: 0.6,
  },
  listRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 13,
  },
  listLabel: {
    fontSize: 14, fontFamily: "Inter_400Regular", color: "#8888AA",
  },
  listValue: {
    fontSize: 14, fontFamily: "Inter_500Medium", color: "#F0F0FF",
    maxWidth: "60%", textAlign: "right",
  },
  divider: { height: 1, backgroundColor: "#2A2A40", marginHorizontal: 16 },
  categoryBadge: {
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1,
  },
  categoryBadgeText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  noteCard: {
    flexDirection: "row", gap: 10, alignItems: "flex-start",
    marginHorizontal: 16, backgroundColor: "#141420",
    borderRadius: 14, borderWidth: 1, borderColor: "#2A2A40",
    padding: 14, marginBottom: 24,
  },
  noteText: {
    flex: 1, fontSize: 12, fontFamily: "Inter_400Regular",
    color: "#8888AA", lineHeight: 18,
  },
  doneBtn: {
    marginHorizontal: 16, backgroundColor: "#FF5A3C",
    borderRadius: 16, paddingVertical: 17, alignItems: "center",
  },
  doneBtnText: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#FFF" },
});
