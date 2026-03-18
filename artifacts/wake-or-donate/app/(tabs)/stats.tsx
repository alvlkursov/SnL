import React, { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Platform,
  TouchableOpacity, ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { useAuth, BASE_URL } from "@/context/AuthContext";

interface Stats {
  totalDonated: number;
  totalDonations: number;
  alarmsTriggered: number;
  alarmsDismissed: number;
  snoozeCount: number;
  successRate: number;
}

interface Donation {
  id: number;
  charityName: string;
  amount: number;
  reason: string;
  status: string;
  createdAt: string;
}

export default function StatsScreen() {
  const { token } = useAuth();
  const insets = useSafeAreaInsets();
  const [stats, setStats] = useState<Stats | null>(null);
  const [donations, setDonations] = useState<Donation[]>([]);
  const [loading, setLoading] = useState(true);
  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);
  const bottomPad = insets.bottom + (Platform.OS === "web" ? 34 : 84);

  useEffect(() => {
    fetchData();
  }, [token]);

  const fetchData = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [statsRes, donationsRes] = await Promise.all([
        fetch(`${BASE_URL}/donations/stats`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${BASE_URL}/donations`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (statsRes.ok) setStats(await statsRes.json());
      if (donationsRes.ok) setDonations(await donationsRes.json());
    } catch {} finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: topPad }, styles.centered]}>
        <ActivityIndicator color="#FF5A3C" size="large" />
      </View>
    );
  }

  const successRate = stats?.successRate ?? 0;
  const ringColor = successRate >= 80 ? "#30D158" : successRate >= 50 ? "#FF9F0A" : "#FF453A";

  return (
    <ScrollView
      style={[styles.container, { paddingTop: topPad }]}
      contentContainerStyle={{ paddingBottom: bottomPad }}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.headerTitle}>Statistics</Text>

      {/* Success rate ring */}
      <View style={styles.ringCard}>
        <View style={[styles.ring, { borderColor: ringColor }]}>
          <Text style={[styles.ringPercent, { color: ringColor }]}>{successRate}%</Text>
          <Text style={styles.ringLabel}>success rate</Text>
        </View>
        <View style={styles.ringStats}>
          <View style={styles.ringStat}>
            <MaterialCommunityIcons name="alarm-check" size={20} color="#30D158" />
            <Text style={styles.ringStatNum}>{stats?.alarmsDismissed ?? 0}</Text>
            <Text style={styles.ringStatLabel}>Dismissed</Text>
          </View>
          <View style={styles.ringStat}>
            <MaterialCommunityIcons name="alarm-snooze" size={20} color="#FF9F0A" />
            <Text style={styles.ringStatNum}>{stats?.snoozeCount ?? 0}</Text>
            <Text style={styles.ringStatLabel}>Snoozed</Text>
          </View>
          <View style={styles.ringStat}>
            <MaterialCommunityIcons name="alarm" size={20} color="#8888AA" />
            <Text style={styles.ringStatNum}>{stats?.alarmsTriggered ?? 0}</Text>
            <Text style={styles.ringStatLabel}>Total</Text>
          </View>
        </View>
      </View>

      {/* Donation total */}
      <View style={styles.donationCard}>
        <View style={styles.donationCardLeft}>
          <Feather name="heart" size={20} color="#FF5A3C" />
          <Text style={styles.donationLabel}>Total Donated</Text>
        </View>
        <Text style={styles.donationAmount}>${(stats?.totalDonated ?? 0).toFixed(2)}</Text>
      </View>

      {/* Recent donations */}
      <Text style={styles.sectionTitle}>Donation History</Text>
      {donations.length === 0 ? (
        <View style={styles.emptyDonations}>
          <Feather name="inbox" size={32} color="#2A2A40" />
          <Text style={styles.emptyText}>No donations yet</Text>
          <Text style={styles.emptySubtext}>Keep snoozing and donate to charity!</Text>
        </View>
      ) : (
        donations.slice(0, 20).map((d) => (
          <View key={d.id} style={styles.donationItem}>
            <View style={[styles.donationIcon, { backgroundColor: d.reason === "snooze" ? "#FF9F0A22" : "#FF453A22" }]}>
              <MaterialCommunityIcons
                name={d.reason === "snooze" ? "alarm-snooze" : "alarm-off"}
                size={18}
                color={d.reason === "snooze" ? "#FF9F0A" : "#FF453A"}
              />
            </View>
            <View style={styles.donationInfo}>
              <Text style={styles.donationCharity}>{d.charityName}</Text>
              <Text style={styles.donationMeta}>
                {d.reason === "snooze" ? "Snoozed" : "Missed"} · {formatDate(d.createdAt)}
              </Text>
            </View>
            <Text style={styles.donationAmt}>${d.amount.toFixed(2)}</Text>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0A0A0F" },
  centered: { alignItems: "center", justifyContent: "center" },
  headerTitle: {
    fontSize: 28, fontWeight: "700", color: "#F0F0FF", fontFamily: "Inter_700Bold",
    paddingHorizontal: 20, marginBottom: 20,
  },
  ringCard: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "#141420", borderRadius: 20, margin: 16, padding: 24,
    borderWidth: 1, borderColor: "#2A2A40", gap: 24,
  },
  ring: {
    width: 100, height: 100, borderRadius: 50,
    borderWidth: 6, alignItems: "center", justifyContent: "center",
  },
  ringPercent: { fontSize: 22, fontFamily: "Inter_700Bold" },
  ringLabel: { fontSize: 10, color: "#8888AA", fontFamily: "Inter_500Medium" },
  ringStats: { flex: 1, gap: 12 },
  ringStat: { flexDirection: "row", alignItems: "center", gap: 8 },
  ringStatNum: { fontSize: 18, fontFamily: "Inter_700Bold", color: "#F0F0FF" },
  ringStatLabel: { fontSize: 12, color: "#8888AA", fontFamily: "Inter_400Regular" },
  donationCard: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: "#1C1C2E", borderRadius: 16, marginHorizontal: 16, marginBottom: 24,
    padding: 18, borderWidth: 1, borderColor: "#FF5A3C44",
  },
  donationCardLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  donationLabel: { fontSize: 15, color: "#F0F0FF", fontFamily: "Inter_500Medium" },
  donationAmount: { fontSize: 22, fontFamily: "Inter_700Bold", color: "#FF5A3C" },
  sectionTitle: {
    fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#F0F0FF",
    paddingHorizontal: 20, marginBottom: 12,
  },
  emptyDonations: { alignItems: "center", gap: 8, padding: 40 },
  emptyText: { fontSize: 16, fontFamily: "Inter_500Medium", color: "#8888AA" },
  emptySubtext: { fontSize: 13, color: "#2A2A40", fontFamily: "Inter_400Regular" },
  donationItem: {
    flexDirection: "row", alignItems: "center",
    marginHorizontal: 16, marginBottom: 8, backgroundColor: "#141420",
    borderRadius: 12, padding: 14, gap: 12,
    borderWidth: 1, borderColor: "#2A2A40",
  },
  donationIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  donationInfo: { flex: 1 },
  donationCharity: { fontSize: 14, fontFamily: "Inter_500Medium", color: "#F0F0FF" },
  donationMeta: { fontSize: 12, color: "#8888AA", fontFamily: "Inter_400Regular", marginTop: 2 },
  donationAmt: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#FF5A3C" },
});
