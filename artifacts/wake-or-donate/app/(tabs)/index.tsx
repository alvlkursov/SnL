import React, { useState, useCallback } from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Platform, Alert, Switch, RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { useAlarms, Alarm } from "@/context/AlarmContext";
import { useAuth } from "@/context/AuthContext";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const CATEGORY_COLORS = {
  favorite: "#30D158",
  recommended: "#FF9F0A",
  hated: "#FF453A",
};
const CATEGORY_LABELS = {
  favorite: "Favorite",
  recommended: "Recommended",
  hated: "Hated",
};
const CONFIRM_ICONS: Record<string, string> = {
  button: "hand-pointing-right",
  math: "calculator-variant",
  shake: "cellphone-vibrate",
  qr: "qrcode-scan",
};

function AlarmCard({ alarm, onToggle, onPress, onDelete }: {
  alarm: Alarm;
  onToggle: (id: number, enabled: boolean) => void;
  onPress: (alarm: Alarm) => void;
  onDelete: (id: number) => void;
}) {
  const category = alarm.charityCategory;
  const accentColor = category ? CATEGORY_COLORS[category] : "#8888AA";

  return (
    <TouchableOpacity
      style={[styles.alarmCard, { borderLeftColor: accentColor, borderLeftWidth: 3 }]}
      onPress={() => onPress(alarm)}
      activeOpacity={0.85}
    >
      <View style={styles.alarmMain}>
        <View style={styles.alarmLeft}>
          <Text style={[styles.alarmTime, !alarm.isEnabled && styles.alarmTimeDisabled]}>
            {alarm.time}
          </Text>
          <Text style={styles.alarmLabel}>{alarm.label}</Text>
          <View style={styles.alarmMeta}>
            {/* Days */}
            <View style={styles.dayRow}>
              {DAYS.map((d, i) => (
                <View key={i} style={[styles.dayDot, alarm.days.includes(i) && styles.dayDotActive]}>
                  <Text style={[styles.dayText, alarm.days.includes(i) && styles.dayTextActive]}>{d[0]}</Text>
                </View>
              ))}
            </View>
          </View>
          <View style={styles.alarmBadgeRow}>
            {category && (
              <View style={[styles.badge, { backgroundColor: accentColor + "22" }]}>
                <View style={[styles.badgeDot, { backgroundColor: accentColor }]} />
                <Text style={[styles.badgeText, { color: accentColor }]}>
                  {CATEGORY_LABELS[category]}
                </Text>
              </View>
            )}
            <View style={styles.badge}>
              <MaterialCommunityIcons
                name={CONFIRM_ICONS[alarm.confirmationMethod] as any}
                size={11}
                color="#8888AA"
              />
              <Text style={styles.badgeText}>${alarm.donationAmount}</Text>
            </View>
          </View>
        </View>
        <View style={styles.alarmRight}>
          <Switch
            value={alarm.isEnabled}
            onValueChange={(val) => onToggle(alarm.id, val)}
            trackColor={{ false: "#2A2A40", true: "#FF5A3C" }}
            thumbColor="#fff"
          />
          <TouchableOpacity
            onPress={() => {
              Alert.alert("Delete Alarm", "Are you sure?", [
                { text: "Cancel", style: "cancel" },
                { text: "Delete", style: "destructive", onPress: () => onDelete(alarm.id) },
              ]);
            }}
            style={styles.deleteBtn}
          >
            <Feather name="trash-2" size={16} color="#8888AA" />
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function AlarmsScreen() {
  const { alarms, isLoading, fetchAlarms, updateAlarm, deleteAlarm } = useAlarms();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchAlarms();
    setRefreshing(false);
  }, [fetchAlarms]);

  const handleToggle = async (id: number, enabled: boolean) => {
    await updateAlarm(id, { isEnabled: enabled });
  };

  const handlePress = (alarm: Alarm) => {
    router.push({ pathname: "/alarm/[id]", params: { id: alarm.id } });
  };

  const handleDelete = async (id: number) => {
    await deleteAlarm(id);
  };

  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);
  const bottomPad = insets.bottom + (Platform.OS === "web" ? 34 : 84);

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Good morning{user?.name ? `, ${user.name.split(" ")[0]}` : ""}</Text>
          <Text style={styles.headerTitle}>Your Alarms</Text>
        </View>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => router.push("/alarm/create")}
        >
          <Feather name="plus" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={alarms}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <AlarmCard
            alarm={item}
            onToggle={handleToggle}
            onPress={handlePress}
            onDelete={handleDelete}
          />
        )}
        contentContainerStyle={[
          styles.list,
          { paddingBottom: bottomPad },
          alarms.length === 0 && styles.listEmpty,
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#FF5A3C"
          />
        }
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons name="alarm-off" size={56} color="#2A2A40" />
              <Text style={styles.emptyTitle}>No alarms yet</Text>
              <Text style={styles.emptySubtitle}>
                Tap + to create your first alarm{"\n"}and start your streak
              </Text>
              <TouchableOpacity
                style={styles.emptyBtn}
                onPress={() => router.push("/alarm/create")}
              >
                <Feather name="plus" size={16} color="#fff" />
                <Text style={styles.emptyBtnText}>Create Alarm</Text>
              </TouchableOpacity>
            </View>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0A0A0F" },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingBottom: 16,
  },
  greeting: { fontSize: 13, color: "#8888AA", fontFamily: "Inter_400Regular", marginBottom: 2 },
  headerTitle: { fontSize: 28, fontWeight: "700", color: "#F0F0FF", fontFamily: "Inter_700Bold" },
  addBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: "#FF5A3C", alignItems: "center", justifyContent: "center",
  },
  list: { paddingHorizontal: 16, paddingTop: 8, gap: 10 },
  listEmpty: { flex: 1, justifyContent: "center" },
  alarmCard: {
    backgroundColor: "#141420", borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: "#2A2A40",
  },
  alarmMain: { flexDirection: "row", alignItems: "flex-start" },
  alarmLeft: { flex: 1 },
  alarmRight: { alignItems: "flex-end", gap: 8 },
  alarmTime: { fontSize: 36, fontFamily: "Inter_700Bold", color: "#F0F0FF", letterSpacing: -1 },
  alarmTimeDisabled: { color: "#8888AA" },
  alarmLabel: { fontSize: 14, color: "#8888AA", fontFamily: "Inter_400Regular", marginBottom: 8 },
  alarmMeta: { marginBottom: 8 },
  dayRow: { flexDirection: "row", gap: 4 },
  dayDot: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: "#2A2A40", alignItems: "center", justifyContent: "center",
  },
  dayDotActive: { backgroundColor: "#FF5A3C22" },
  dayText: { fontSize: 9, color: "#8888AA", fontFamily: "Inter_600SemiBold" },
  dayTextActive: { color: "#FF5A3C" },
  alarmBadgeRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  badge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "#2A2A40", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4,
  },
  badgeDot: { width: 5, height: 5, borderRadius: 3 },
  badgeText: { fontSize: 11, color: "#8888AA", fontFamily: "Inter_500Medium" },
  deleteBtn: { padding: 4 },
  emptyState: { alignItems: "center", gap: 12, padding: 40 },
  emptyTitle: { fontSize: 20, fontFamily: "Inter_600SemiBold", color: "#F0F0FF" },
  emptySubtitle: { fontSize: 14, color: "#8888AA", fontFamily: "Inter_400Regular", textAlign: "center" },
  emptyBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#FF5A3C", borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12,
    marginTop: 8,
  },
  emptyBtnText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 15 },
});
