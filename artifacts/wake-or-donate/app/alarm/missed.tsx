import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons, Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { closeScreen } from "@/lib/navigation";
import { useAlarms, type Alarm, type MissedEvent } from "@/context/AlarmContext";

const CATEGORY_LABELS: Record<string, string> = { favorite: "Favorite", recommended: "Recommended", hated: "Hated", piggy: "Piggy bank" };

/** The next time any enabled alarm rings. */
function nextRing(alarms: Alarm[], now: Date): { at: Date; alarm: Alarm } | null {
  let best: { at: Date; alarm: Alarm } | null = null;
  for (const alarm of alarms) {
    if (!alarm.isEnabled) continue;
    const [hh, mm] = alarm.time.split(":").map(Number);
    for (let d = 0; d <= 7; d++) {
      const at = new Date(now);
      at.setDate(now.getDate() + d);
      at.setHours(hh, mm, 0, 0);
      if (at > now && alarm.days.includes(at.getDay())) {
        if (!best || at < best.at) best = { at, alarm };
        break;
      }
    }
  }
  return best;
}

function dayLabel(at: Date, now: Date): string {
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  if (at.toDateString() === now.toDateString()) return "Today";
  if (at.toDateString() === tomorrow.toDateString()) return "Tomorrow";
  return at.toLocaleDateString("en-US", { weekday: "long" });
}

const formatTime = (d: Date) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

function countdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export default function MissedAlarmScreen() {
  const insets = useSafeAreaInsets();
  const { alarms, fetchMissedEvents, acknowledgeMissed } = useAlarms();
  const params = useLocalSearchParams<{
    eventId?: string; amount?: string; fund?: string; label?: string; category?: string; donationId?: string;
  }>();

  // Start from the miss passed in, then load every unseen miss (several alarms may have been slept through)
  const [missed, setMissed] = useState<MissedEvent[]>(() => params.eventId ? [{
    id: Number(params.eventId),
    alarmId: 0,
    label: params.label ?? "",
    scheduledAt: "",
    amount: Number(params.amount ?? 0),
    charityName: params.fund ?? "",
    charityCategory: (params.category || null) as MissedEvent["charityCategory"],
    donationId: params.donationId ? Number(params.donationId) : null,
  }] : []);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    fetchMissedEvents().then(list => {
      if (list.length) setMissed(list);
      // Seen once is enough: don't show these again on the next app open
      const ids = new Set([...list.map(m => m.id), ...(params.eventId ? [Number(params.eventId)] : [])]);
      ids.forEach(id => acknowledgeMissed(id).catch(() => {}));
    }).catch(() => {});
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const next = useMemo(() => nextRing(alarms, now), [alarms, now]);
  const total = missed.reduce((sum, m) => sum + (m.amount ?? 0), 0);
  const single = missed.length === 1 ? missed[0] : null;

  const close = closeScreen;

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={close} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityLabel="Close">
          <Feather name="x" size={24} color="#8888AA" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.iconWrap}>
          <MaterialCommunityIcons name="sleep" size={52} color="#FF453A" />
        </View>

        <Text style={styles.title}>You overslept</Text>
        <Text style={styles.subtitle}>
          {single
            ? `${single.label || "Your alarm"}${single.scheduledAt ? ` rang at ${formatTime(new Date(single.scheduledAt))}` : ""} and wasn't dismissed in time.`
            : `You missed ${missed.length} alarms.`}
        </Text>

        {/* What it cost */}
        <View style={styles.donationCard}>
          <Text style={styles.donationAmount}>${total.toFixed(total % 1 ? 2 : 0)}</Text>
          <Text style={styles.donationArrow}>→</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.donationFund} numberOfLines={2}>
              {single ? single.charityName : missed.map(m => m.charityName).filter(Boolean).join(", ")}
            </Text>
            <Text style={styles.donationLabel}>donated for the missed alarm{missed.length > 1 ? "s" : ""}</Text>
          </View>
        </View>

        {missed.length > 1 && (
          <View style={styles.list}>
            {missed.map(m => (
              <View key={m.id} style={styles.listRow}>
                <Text style={styles.listLabel}>
                  {m.label}{m.scheduledAt ? ` · ${formatTime(new Date(m.scheduledAt))}` : ""}
                </Text>
                <Text style={styles.listAmount}>${m.amount ?? 0}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Countdown to the next chance */}
        <View style={styles.nextCard}>
          <Text style={styles.nextCaption}>NEXT ALARM</Text>
          {next ? (
            <>
              <Text style={styles.countdown}>{countdown(next.at.getTime() - now.getTime())}</Text>
              <Text style={styles.nextWhen}>
                {next.alarm.label} · {dayLabel(next.at, now)}, {formatTime(next.at)}
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.nextWhen}>No alarms scheduled</Text>
              <TouchableOpacity onPress={() => router.replace("/alarm/create")}>
                <Text style={styles.link}>Set an alarm →</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        <View style={styles.explanationCard}>
          <Feather name="info" size={16} color="#8888AA" style={{ marginTop: 2 }} />
          <Text style={styles.explanationText}>
            A missed alarm adds double the alarm's amount to this month's bill. That's the deal you made with yourself — get it next time.
          </Text>
        </View>
      </ScrollView>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.primaryBtn} onPress={close} activeOpacity={0.8}>
          <Text style={styles.primaryBtnText}>Got it</Text>
        </TouchableOpacity>
        {single?.donationId ? (
          <TouchableOpacity
            style={styles.ghostBtn}
            onPress={() => router.push({
              pathname: "/alarm/receipt",
              params: {
                amount: String(single.amount ?? 0),
                fund: single.charityName ?? "",
                category: CATEGORY_LABELS[single.charityCategory ?? ""] ?? "Recommended",
                reason: "Missed alarm",
                donationId: String(single.donationId),
              },
            })}
            activeOpacity={0.7}
          >
            <Text style={styles.ghostBtnText}>View receipt</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0A0A0F", paddingHorizontal: 24 },
  topBar: { flexDirection: "row", justifyContent: "flex-end", paddingVertical: 4 },
  content: { alignItems: "center", paddingBottom: 16 },
  iconWrap: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: "#FF453A18", borderWidth: 1.5, borderColor: "#FF453A44",
    alignItems: "center", justifyContent: "center",
    marginBottom: 20, marginTop: 4,
  },
  title: { fontSize: 30, fontFamily: "Inter_700Bold", color: "#F0F0FF", marginBottom: 6 },
  subtitle: {
    fontSize: 15, fontFamily: "Inter_400Regular", color: "#8888AA", marginBottom: 24,
    textAlign: "center", lineHeight: 21,
  },
  donationCard: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: "#2A1215", borderRadius: 20, borderWidth: 1, borderColor: "#FF453A44",
    paddingHorizontal: 20, paddingVertical: 18, width: "100%", marginBottom: 12,
  },
  donationAmount: { fontSize: 32, fontFamily: "Inter_700Bold", color: "#FF453A" },
  donationArrow: { fontSize: 22, color: "#44445A", fontFamily: "Inter_400Regular" },
  donationFund: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#F0F0FF" },
  donationLabel: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#8888AA", marginTop: 2 },
  list: { width: "100%", backgroundColor: "#141420", borderRadius: 16, padding: 12, gap: 8, marginBottom: 12 },
  listRow: { flexDirection: "row", justifyContent: "space-between" },
  listLabel: { fontSize: 14, fontFamily: "Inter_400Regular", color: "#F0F0FF" },
  listAmount: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#FF453A" },
  nextCard: {
    width: "100%", alignItems: "center", backgroundColor: "#141420", borderRadius: 20,
    borderWidth: 1, borderColor: "#2A2A40", paddingVertical: 20, marginBottom: 12,
  },
  nextCaption: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#8888AA", letterSpacing: 1 },
  countdown: {
    fontSize: 44, fontFamily: "Inter_700Bold", color: "#F0F0FF", marginTop: 4,
    fontVariant: ["tabular-nums"],
  },
  nextWhen: { fontSize: 14, fontFamily: "Inter_500Medium", color: "#8888AA", marginTop: 4 },
  link: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#FF5A3C", marginTop: 8 },
  explanationCard: {
    flexDirection: "row", gap: 12, alignItems: "flex-start",
    backgroundColor: "#141420", borderRadius: 16, borderWidth: 1, borderColor: "#2A2A40",
    padding: 16, width: "100%",
  },
  explanationText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", color: "#8888AA", lineHeight: 20 },
  actions: { width: "100%", gap: 6, paddingTop: 8 },
  primaryBtn: { backgroundColor: "#FF453A", borderRadius: 16, paddingVertical: 17, alignItems: "center" },
  primaryBtnText: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#FFF" },
  ghostBtn: { borderRadius: 16, paddingVertical: 12, alignItems: "center" },
  ghostBtnText: { fontSize: 15, fontFamily: "Inter_500Medium", color: "#8888AA" },
});
