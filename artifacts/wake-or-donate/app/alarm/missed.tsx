import React, { useEffect, useMemo } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons, Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useAlarms, type Alarm } from "@/context/AlarmContext";

const CATEGORY_LABELS: Record<string, string> = { favorite: "Favorite", recommended: "Recommended", hated: "Hated" };

/** Human-readable next ring time across all enabled alarms, e.g. "Tomorrow, 7:00 AM". */
function nextAlarmText(alarms: Alarm[]): string {
  const now = new Date();
  let best: Date | null = null;
  for (const alarm of alarms) {
    if (!alarm.isEnabled) continue;
    const [hh, mm] = alarm.time.split(":").map(Number);
    for (let d = 0; d <= 7; d++) {
      const at = new Date(now);
      at.setDate(now.getDate() + d);
      at.setHours(hh, mm, 0, 0);
      if (at > now && alarm.days.includes(at.getDay())) {
        if (!best || at < best) best = at;
        break;
      }
    }
  }
  if (!best) return "None scheduled";
  const time = best.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const day = best.toDateString() === now.toDateString() ? "Today"
    : best.toDateString() === tomorrow.toDateString() ? "Tomorrow"
    : best.toLocaleDateString("en-US", { weekday: "long" });
  return `${day}, ${time}`;
}

export default function MissedAlarmScreen() {
  const insets = useSafeAreaInsets();
  const { alarms, acknowledgeMissed } = useAlarms();
  const { eventId = "", amount = "0", fund = "", label = "", category = "", donationId = "" } =
    useLocalSearchParams<{ eventId?: string; amount?: string; fund?: string; label?: string; category?: string; donationId?: string }>();
  const nextAlarm = useMemo(() => nextAlarmText(alarms), [alarms]);

  // Seen once is enough; don't show this miss again on the next app open
  useEffect(() => {
    if (eventId) acknowledgeMissed(parseInt(eventId, 10)).catch(() => {});
  }, [eventId]);

  return (
    <View style={[styles.container, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 32 }]}>
      {/* Icon */}
      <View style={styles.iconWrap}>
        <MaterialCommunityIcons name="alarm-off" size={56} color="#FF453A" />
      </View>

      {/* Title */}
      <Text style={styles.title}>Alarm Missed</Text>
      <Text style={styles.subtitle}>{label ? `${label} — you didn't make it this time` : "You didn't make it this time"}</Text>

      {/* Donation card */}
      <View style={styles.donationCard}>
        <Text style={styles.donationAmount}>${amount}</Text>
        <Text style={styles.donationArrow}>→</Text>
        <View>
          <Text style={styles.donationFund}>{fund}</Text>
          <Text style={styles.donationLabel}>donation sent</Text>
        </View>
      </View>

      {/* Explanation */}
      <View style={styles.explanationCard}>
        <Feather name="info" size={16} color="#8888AA" style={{ marginTop: 2 }} />
        <Text style={styles.explanationText}>
          This is the rule you set for yourself. Missing an alarm automatically donates to your chosen fund — that's the deal that keeps you motivated.
        </Text>
      </View>

      {/* Next alarm */}
      <View style={styles.nextRow}>
        <Feather name="clock" size={14} color="#8888AA" />
        <Text style={styles.nextText}>Next alarm: <Text style={styles.nextValue}>{nextAlarm}</Text></Text>
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => router.back()}
          activeOpacity={0.8}
        >
          <Text style={styles.primaryBtnText}>Got It</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.ghostBtn}
          onPress={() => router.push({
            pathname: "/alarm/receipt",
            params: { amount, fund, category: CATEGORY_LABELS[category] ?? "Recommended", reason: "Missed alarm", donationId },
          })}
          activeOpacity={0.7}
        >
          <Text style={styles.ghostBtnText}>View Details</Text>
        </TouchableOpacity>
      </View>
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
    backgroundColor: "#FF453A18", borderWidth: 1.5, borderColor: "#FF453A44",
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
    backgroundColor: "#2A1215", borderRadius: 20, borderWidth: 1, borderColor: "#FF453A44",
    paddingHorizontal: 24, paddingVertical: 20, width: "100%", marginBottom: 16,
  },
  donationAmount: {
    fontSize: 34, fontFamily: "Inter_700Bold", color: "#FF453A",
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
  explanationCard: {
    flexDirection: "row", gap: 12, alignItems: "flex-start",
    backgroundColor: "#141420", borderRadius: 16, borderWidth: 1, borderColor: "#2A2A40",
    padding: 16, width: "100%", marginBottom: 20,
  },
  explanationText: {
    flex: 1, fontSize: 13, fontFamily: "Inter_400Regular",
    color: "#8888AA", lineHeight: 20,
  },
  nextRow: {
    flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 40,
  },
  nextText: {
    fontSize: 13, fontFamily: "Inter_400Regular", color: "#8888AA",
  },
  nextValue: {
    fontFamily: "Inter_600SemiBold", color: "#F0F0FF",
  },
  actions: { width: "100%", gap: 10, marginTop: "auto" },
  primaryBtn: {
    backgroundColor: "#FF453A", borderRadius: 16,
    paddingVertical: 17, alignItems: "center",
  },
  primaryBtnText: {
    fontSize: 16, fontFamily: "Inter_700Bold", color: "#FFF",
  },
  ghostBtn: {
    borderRadius: 16, paddingVertical: 14, alignItems: "center",
  },
  ghostBtnText: {
    fontSize: 15, fontFamily: "Inter_500Medium", color: "#8888AA",
  },
});
