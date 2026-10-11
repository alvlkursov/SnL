import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import Constants from "expo-constants";
import { BASE_URL, deviceTimezone, useAuth } from "@/context/AuthContext";
import { AlarmClock } from "@/modules/alarm-clock";
import { scheduledRings, type ScheduledRing } from "@/lib/alarmNotifications";
import { closeScreen } from "@/lib/navigation";

interface ServerDiagnostics {
  timezone: string;
  serverNow: string;
  serverLocalTime: { localDate: string; hhmm: string };
  recentRings: { alarmId: number; label: string; scheduledAt: string; status: string; snoozesUsed: number }[];
}

const when = (d: Date) => d.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** Everything needed to understand an unexpected (or missing) ring, on one screenshot. */
export default function DiagnosticsScreen() {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const [rings, setRings] = useState<ScheduledRing[]>([]);
  const [server, setServer] = useState<ServerDiagnostics | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setRings(scheduledRings());
    if (!token) return;
    fetch(`${BASE_URL}/alarms/diagnostics`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`Server: ${r.status}`))))
      .then(setServer)
      .catch(e => setError(e.message));
  }, [token]);
  useFocusEffect(load);

  const phoneTz = deviceTimezone();
  const tzMismatch = server && server.timezone !== phoneTz;
  const engine = Platform.OS !== "android" ? "notifications" : AlarmClock ? "native alarm clock" : "MISSING";

  return (
    <ScrollView
      style={[styles.container, { paddingTop: insets.top + 16 }]}
      contentContainerStyle={{ paddingBottom: insets.bottom + 40, paddingHorizontal: 20 }}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Diagnostics</Text>
        <TouchableOpacity onPress={closeScreen} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Feather name="x" size={22} color="#8888AA" />
        </TouchableOpacity>
      </View>
      <Text style={styles.hint}>Take a screenshot of this screen if alarms behave unexpectedly.</Text>

      <Text style={styles.section}>App</Text>
      <View style={styles.card}>
        <Row label="Version" value={`${Constants.expoConfig?.version ?? "?"}`} />
        <Row label="Alarm engine" value={engine} bad={engine === "MISSING"} />
        <Row label="Phone time" value={when(new Date())} />
        <Row label="Phone timezone" value={phoneTz} />
        <Row label="Server timezone" value={server?.timezone ?? (error || "…")} bad={!!tzMismatch} />
        {server && <Row label="Server thinks it's" value={`${server.serverLocalTime.localDate} ${server.serverLocalTime.hhmm}`} />}
      </View>

      <Text style={styles.section}>Scheduled on this phone ({rings.length})</Text>
      <View style={styles.card}>
        {rings.length === 0 ? <Text style={styles.empty}>Nothing scheduled</Text> : rings.slice(0, 15).map(r => (
          <Row key={`${r.alarmId}-${r.at}`} label={r.title.replace(/^⏰\s*/, "")} value={when(new Date(r.at))} />
        ))}
      </View>

      <Text style={styles.section}>Recent rings (server)</Text>
      <View style={styles.card}>
        {!server?.recentRings.length ? <Text style={styles.empty}>No real rings recorded yet</Text> : server.recentRings.map(r => (
          <Row
            key={`${r.alarmId}-${r.scheduledAt}`}
            label={`${r.label} · ${when(new Date(r.scheduledAt))}`}
            value={`${r.status}${r.snoozesUsed ? ` · ${r.snoozesUsed} snooze` : ""}`}
            bad={r.status === "missed"}
          />
        ))}
      </View>
    </ScrollView>
  );
}

function Row({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel} numberOfLines={2}>{label}</Text>
      <Text style={[styles.rowValue, bad && { color: "#FF453A" }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0A0A0F" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: 26, fontFamily: "Inter_700Bold", color: "#F0F0FF" },
  hint: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#8888AA", marginTop: 6, marginBottom: 8 },
  section: {
    fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#8888AA", textTransform: "uppercase",
    letterSpacing: 0.8, marginTop: 18, marginBottom: 8,
  },
  card: { backgroundColor: "#141420", borderRadius: 16, borderWidth: 1, borderColor: "#2A2A40", padding: 12, gap: 10 },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  rowLabel: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", color: "#8888AA" },
  rowValue: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#F0F0FF", textAlign: "right" },
  empty: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#8888AA" },
});
