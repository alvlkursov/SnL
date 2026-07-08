import React from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";

export default function SnoozeChargeScreen() {
  const insets = useSafeAreaInsets();
  const {
    amount = "5",
    fund = "Animal Shelter",
    snoozeIndex = "1",
    snoozeLimit = "3",
    ringTime = "7:10 AM",
  } = useLocalSearchParams<{
    amount?: string; fund?: string;
    snoozeIndex?: string; snoozeLimit?: string; ringTime?: string;
  }>();

  const current = parseInt(snoozeIndex, 10);
  const limit = parseInt(snoozeLimit, 10);
  const nearLimit = current >= limit - 1;

  return (
    <View style={[styles.container, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 32 }]}>
      {/* Icon */}
      <View style={styles.iconWrap}>
        <Feather name="moon" size={48} color="#FF9F0A" />
      </View>

      {/* Title */}
      <Text style={styles.title}>Snoozed</Text>
      <Text style={styles.subtitle}>Alarm will ring again at {ringTime}</Text>

      {/* Donation card */}
      <View style={styles.donationCard}>
        <Text style={styles.donationAmount}>₪{amount}</Text>
        <Text style={styles.donationArrow}>→</Text>
        <View>
          <Text style={styles.donationFund}>{fund}</Text>
          <Text style={styles.donationLabel}>charged for this snooze</Text>
        </View>
      </View>

      {/* Progress dots */}
      <View style={styles.progressWrap}>
        <Text style={styles.progressLabel}>Snooze {current} of {limit}</Text>
        <View style={styles.dots}>
          {Array.from({ length: limit }).map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                i < current ? styles.dotActive : styles.dotInactive,
              ]}
            />
          ))}
        </View>
      </View>

      {/* Warning if near limit */}
      {nearLimit && (
        <View style={styles.warningCard}>
          <Feather name="alert-triangle" size={15} color="#FF9F0A" style={{ marginTop: 1 }} />
          <Text style={styles.warningText}>
            One more snooze and your alarm will be marked as missed — a larger donation will be charged.
          </Text>
        </View>
      )}

      {/* Hint */}
      {!nearLimit && (
        <View style={styles.hintCard}>
          <Feather name="info" size={15} color="#8888AA" style={{ marginTop: 1 }} />
          <Text style={styles.hintText}>
            Each snooze charges a small donation. You have {limit - current} snooze{limit - current !== 1 ? "s" : ""} remaining.
          </Text>
        </View>
      )}

      {/* Action */}
      <TouchableOpacity
        style={styles.okBtn}
        onPress={() => router.back()}
        activeOpacity={0.8}
      >
        <Text style={styles.okBtnText}>Okay</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: "#0A0A0F",
    paddingHorizontal: 24, alignItems: "center",
  },
  iconWrap: {
    width: 104, height: 104, borderRadius: 52,
    backgroundColor: "#FF9F0A18", borderWidth: 1.5, borderColor: "#FF9F0A44",
    alignItems: "center", justifyContent: "center",
    marginBottom: 24, marginTop: 16,
  },
  title: {
    fontSize: 30, fontFamily: "Inter_700Bold", color: "#F0F0FF", marginBottom: 6,
  },
  subtitle: {
    fontSize: 15, fontFamily: "Inter_400Regular", color: "#8888AA", marginBottom: 32,
  },
  donationCard: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: "#221A08", borderRadius: 20, borderWidth: 1, borderColor: "#FF9F0A44",
    paddingHorizontal: 24, paddingVertical: 20, width: "100%", marginBottom: 28,
  },
  donationAmount: {
    fontSize: 34, fontFamily: "Inter_700Bold", color: "#FF9F0A",
  },
  donationArrow: {
    fontSize: 22, color: "#44445A", fontFamily: "Inter_400Regular",
  },
  donationFund: {
    fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#F0F0FF",
  },
  donationLabel: {
    fontSize: 12, fontFamily: "Inter_400Regular", color: "#8888AA", marginTop: 2,
  },
  progressWrap: { alignItems: "center", marginBottom: 24, width: "100%" },
  progressLabel: {
    fontSize: 13, fontFamily: "Inter_500Medium", color: "#8888AA", marginBottom: 10,
  },
  dots: { flexDirection: "row", gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  dotActive: { backgroundColor: "#FF9F0A" },
  dotInactive: { backgroundColor: "#2A2A40" },
  warningCard: {
    flexDirection: "row", gap: 10, alignItems: "flex-start",
    backgroundColor: "#221A08", borderRadius: 14, borderWidth: 1, borderColor: "#FF9F0A44",
    padding: 14, width: "100%", marginBottom: 20,
  },
  warningText: {
    flex: 1, fontSize: 13, fontFamily: "Inter_400Regular",
    color: "#FF9F0A", lineHeight: 20,
  },
  hintCard: {
    flexDirection: "row", gap: 10, alignItems: "flex-start",
    backgroundColor: "#141420", borderRadius: 14, borderWidth: 1, borderColor: "#2A2A40",
    padding: 14, width: "100%", marginBottom: 20,
  },
  hintText: {
    flex: 1, fontSize: 13, fontFamily: "Inter_400Regular",
    color: "#8888AA", lineHeight: 20,
  },
  okBtn: {
    backgroundColor: "#FF9F0A", borderRadius: 16,
    paddingVertical: 17, alignItems: "center",
    width: "100%", marginTop: "auto",
  },
  okBtnText: {
    fontSize: 16, fontFamily: "Inter_700Bold", color: "#0A0A0F",
  },
});
