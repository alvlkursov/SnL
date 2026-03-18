import React from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Platform, Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import { router } from "expo-router";

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const insets = useSafeAreaInsets();
  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);
  const bottomPad = insets.bottom + (Platform.OS === "web" ? 34 : 84);

  const handleLogout = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign Out", style: "destructive", onPress: async () => {
        await logout();
        router.replace("/auth");
      }},
    ]);
  };

  const successRate = user?.alarmsTriggered
    ? Math.round((user.alarmsDismissed / user.alarmsTriggered) * 100)
    : 0;

  return (
    <ScrollView
      style={[styles.container, { paddingTop: topPad }]}
      contentContainerStyle={{ paddingBottom: bottomPad }}
      showsVerticalScrollIndicator={false}
    >
      {/* Profile header */}
      <View style={styles.profileHeader}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {user?.name?.charAt(0).toUpperCase() ?? "?"}
          </Text>
        </View>
        <Text style={styles.userName}>{user?.name}</Text>
        <Text style={styles.userEmail}>{user?.email}</Text>
      </View>

      {/* Stats cards */}
      <View style={styles.statsGrid}>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: "#FF5A3C" }]}>
            ${(user?.totalDonated ?? 0).toFixed(0)}
          </Text>
          <Text style={styles.statLabel}>Donated</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: "#30D158" }]}>
            {successRate}%
          </Text>
          <Text style={styles.statLabel}>Success Rate</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: "#FF9F0A" }]}>
            {user?.alarmsTriggered ?? 0}
          </Text>
          <Text style={styles.statLabel}>Alarms</Text>
        </View>
      </View>

      {/* Info section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About</Text>
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Feather name="mail" size={16} color="#8888AA" />
            <Text style={styles.infoValue}>{user?.email}</Text>
          </View>
          <View style={styles.separator} />
          <View style={styles.infoRow}>
            <Feather name="calendar" size={16} color="#8888AA" />
            <Text style={styles.infoValue}>
              Joined {new Date(user?.createdAt ?? "").toLocaleDateString("en-US", { month: "long", year: "numeric" })}
            </Text>
          </View>
        </View>
      </View>

      {/* How fund categories work */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Fund Categories</Text>
        <View style={styles.categoryCard}>
          <View style={styles.categoryRow}>
            <View style={[styles.categoryDot, { backgroundColor: "#30D158" }]} />
            <View style={styles.categoryInfo}>
              <Text style={styles.categoryName}>Favorite</Text>
              <Text style={styles.categoryDesc}>Charities you personally support — pick from our partners</Text>
            </View>
          </View>
          <View style={styles.separator} />
          <View style={styles.categoryRow}>
            <View style={[styles.categoryDot, { backgroundColor: "#FF9F0A" }]} />
            <View style={styles.categoryInfo}>
              <Text style={styles.categoryName}>Recommended</Text>
              <Text style={styles.categoryDesc}>Hot charities — we boost donations from our side</Text>
            </View>
          </View>
          <View style={styles.separator} />
          <View style={styles.categoryRow}>
            <View style={[styles.categoryDot, { backgroundColor: "#FF453A" }]} />
            <View style={styles.categoryInfo}>
              <Text style={styles.categoryName}>Hated</Text>
              <Text style={styles.categoryDesc}>Organizations you dislike — maximum motivation to wake up!</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Sign out */}
      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
        <Feather name="log-out" size={18} color="#FF453A" />
        <Text style={styles.logoutText}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0A0A0F" },
  profileHeader: { alignItems: "center", paddingVertical: 32 },
  avatar: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: "#FF5A3C22", borderWidth: 2, borderColor: "#FF5A3C",
    alignItems: "center", justifyContent: "center", marginBottom: 12,
  },
  avatarText: { fontSize: 32, fontFamily: "Inter_700Bold", color: "#FF5A3C" },
  userName: { fontSize: 22, fontFamily: "Inter_700Bold", color: "#F0F0FF", marginBottom: 4 },
  userEmail: { fontSize: 14, color: "#8888AA", fontFamily: "Inter_400Regular" },
  statsGrid: { flexDirection: "row", gap: 10, marginHorizontal: 16, marginBottom: 24 },
  statCard: {
    flex: 1, backgroundColor: "#141420", borderRadius: 16, padding: 16,
    alignItems: "center", borderWidth: 1, borderColor: "#2A2A40",
  },
  statValue: { fontSize: 22, fontFamily: "Inter_700Bold", marginBottom: 4 },
  statLabel: { fontSize: 11, color: "#8888AA", fontFamily: "Inter_500Medium" },
  section: { marginHorizontal: 16, marginBottom: 20 },
  sectionTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#8888AA", marginBottom: 10 },
  infoCard: {
    backgroundColor: "#141420", borderRadius: 16, overflow: "hidden",
    borderWidth: 1, borderColor: "#2A2A40",
  },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16 },
  infoValue: { fontSize: 14, color: "#F0F0FF", fontFamily: "Inter_400Regular" },
  separator: { height: 1, backgroundColor: "#2A2A40" },
  categoryCard: {
    backgroundColor: "#141420", borderRadius: 16, overflow: "hidden",
    borderWidth: 1, borderColor: "#2A2A40",
  },
  categoryRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 16 },
  categoryDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  categoryInfo: { flex: 1 },
  categoryName: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#F0F0FF", marginBottom: 2 },
  categoryDesc: { fontSize: 12, color: "#8888AA", fontFamily: "Inter_400Regular" },
  logoutBtn: {
    flexDirection: "row", alignItems: "center", gap: 10,
    marginHorizontal: 16, marginTop: 8, marginBottom: 8,
    backgroundColor: "#2A1215", borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: "#FF453A44",
  },
  logoutText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#FF453A" },
});
