import React, { useState, useEffect } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Switch, Platform, Alert, ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useAlarms } from "@/context/AlarmContext";
import { useAuth, BASE_URL } from "@/context/AuthContext";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const CONFIRM_METHODS = [
  { key: "button", label: "Button", icon: "hand-pointing-right" },
  { key: "math", label: "Math", icon: "calculator-variant" },
  { key: "shake", label: "Shake", icon: "cellphone-vibrate" },
  { key: "qr", label: "QR", icon: "qrcode-scan" },
];

interface Charity {
  id: number;
  name: string;
  description: string;
  category: string;
  isHot: boolean;
}

export default function AlarmDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { alarms, updateAlarm, deleteAlarm } = useAlarms();
  const { token } = useAuth();
  const insets = useSafeAreaInsets();
  const alarm = alarms.find(a => a.id === parseInt(id ?? "0"));
  const [saving, setSaving] = useState(false);
  const [charities, setCharities] = useState<Charity[]>([]);

  const [label, setLabel] = useState(alarm?.label ?? "");
  const [hours, setHours] = useState(alarm?.time.split(":")[0] ?? "07");
  const [minutes, setMinutes] = useState(alarm?.time.split(":")[1] ?? "00");
  const [selectedDays, setSelectedDays] = useState<number[]>(alarm?.days ?? []);
  const [donationAmount, setDonationAmount] = useState(String(alarm?.donationAmount ?? 5));
  const [charityCategory, setCharityCategory] = useState<"favorite" | "recommended" | "hated">(alarm?.charityCategory ?? "recommended");
  const [selectedCharityId, setSelectedCharityId] = useState<number | null>(alarm?.charityId ?? null);
  const [confirmMethod, setConfirmMethod] = useState<"button" | "math" | "shake" | "qr">(alarm?.confirmationMethod ?? "button");
  const [snoozeEnabled, setSnoozeEnabled] = useState(alarm?.snoozeEnabled ?? true);
  const [snoozeDuration, setSnoozeDuration] = useState(String(alarm?.snoozeDurationMinutes ?? 5));

  useEffect(() => {
    if (token && charityCategory !== "favorite") {
      fetch(`${BASE_URL}/charities?category=${charityCategory}`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json())
        .then(setCharities)
        .catch(() => {});
    }
  }, [charityCategory, token]);

  if (!alarm) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Text style={{ color: "#F0F0FF" }}>Alarm not found</Text>
      </View>
    );
  }

  const toggleDay = (day: number) => {
    setSelectedDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateAlarm(alarm.id, {
        label,
        time: `${hours.padStart(2, "0")}:${minutes.padStart(2, "0")}`,
        days: selectedDays.sort(),
        donationAmount: parseFloat(donationAmount),
        charityId: selectedCharityId,
        charityCategory,
        confirmationMethod: confirmMethod,
        snoozeEnabled,
        snoozeDurationMinutes: parseInt(snoozeDuration) || 5,
      });
      router.back();
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleTest = () => {
    router.push({ pathname: "/alarm/active", params: { id: alarm.id } });
  };

  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);
  const bottomPad = insets.bottom + 100;

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn}>
          <Feather name="x" size={22} color="#F0F0FF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Alarm</Text>
        <TouchableOpacity onPress={handleSave} style={styles.saveBtn} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveBtnText}>Save</Text>}
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: bottomPad }}>
        {/* Test button */}
        <TouchableOpacity style={styles.testBtn} onPress={handleTest}>
          <MaterialCommunityIcons name="alarm" size={16} color="#FF5A3C" />
          <Text style={styles.testBtnText}>Test Alarm Screen</Text>
        </TouchableOpacity>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Label</Text>
          <TextInput
            style={styles.textInput}
            value={label}
            onChangeText={setLabel}
            placeholderTextColor="#8888AA"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Time</Text>
          <View style={styles.timePicker}>
            <TextInput
              style={styles.timeInput}
              value={hours}
              onChangeText={(v) => setHours(v.replace(/[^0-9]/g, "").slice(0, 2))}
              keyboardType="number-pad"
              maxLength={2}
            />
            <Text style={styles.timeSeparator}>:</Text>
            <TextInput
              style={styles.timeInput}
              value={minutes}
              onChangeText={(v) => setMinutes(v.replace(/[^0-9]/g, "").slice(0, 2))}
              keyboardType="number-pad"
              maxLength={2}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Repeat</Text>
          <View style={styles.daysRow}>
            {DAYS.map((d, i) => (
              <TouchableOpacity
                key={i}
                style={[styles.dayBtn, selectedDays.includes(i) && styles.dayBtnActive]}
                onPress={() => toggleDay(i)}
              >
                <Text style={[styles.dayBtnText, selectedDays.includes(i) && styles.dayBtnTextActive]}>{d[0]}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Donation Amount</Text>
          <View style={styles.amountRow}>
            {["1", "5", "10", "25"].map((amt) => (
              <TouchableOpacity
                key={amt}
                style={[styles.amountBtn, donationAmount === amt && styles.amountBtnActive]}
                onPress={() => setDonationAmount(amt)}
              >
                <Text style={[styles.amountBtnText, donationAmount === amt && styles.amountBtnTextActive]}>${amt}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Fund Category</Text>
          <View style={styles.categoryRow}>
            {(["favorite", "recommended", "hated"] as const).map((cat) => {
              const colors = { favorite: "#30D158", recommended: "#FF9F0A", hated: "#FF453A" };
              const labels = { favorite: "Favorite", recommended: "Recommended", hated: "Hated" };
              return (
                <TouchableOpacity
                  key={cat}
                  style={[styles.catBtn, charityCategory === cat && { borderColor: colors[cat], backgroundColor: colors[cat] + "22" }]}
                  onPress={() => setCharityCategory(cat)}
                >
                  <Text style={[styles.catBtnText, charityCategory === cat && { color: colors[cat] }]}>{labels[cat]}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {charities.length > 0 && (
            <View style={{ gap: 6, marginTop: 10 }}>
              {charities.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  style={[styles.charityItem, selectedCharityId === c.id && styles.charityItemActive]}
                  onPress={() => setSelectedCharityId(selectedCharityId === c.id ? null : c.id)}
                >
                  <Text style={styles.charityName}>{c.name}</Text>
                  {selectedCharityId === c.id && <Feather name="check" size={14} color="#FF5A3C" />}
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Confirmation Method</Text>
          <View style={styles.confirmRow}>
            {CONFIRM_METHODS.map((m) => (
              <TouchableOpacity
                key={m.key}
                style={[styles.confirmBtn, confirmMethod === m.key && styles.confirmBtnActive]}
                onPress={() => setConfirmMethod(m.key as any)}
              >
                <MaterialCommunityIcons name={m.icon as any} size={20} color={confirmMethod === m.key ? "#FF5A3C" : "#8888AA"} />
                <Text style={[styles.confirmBtnText, confirmMethod === m.key && { color: "#FF5A3C" }]}>{m.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.snoozeHeader}>
            <Text style={styles.sectionLabel}>Snooze</Text>
            <Switch
              value={snoozeEnabled}
              onValueChange={setSnoozeEnabled}
              trackColor={{ false: "#2A2A40", true: "#FF5A3C" }}
              thumbColor="#fff"
            />
          </View>
          {snoozeEnabled && (
            <View style={styles.amountRow}>
              {["5", "10", "15", "30"].map((d) => (
                <TouchableOpacity
                  key={d}
                  style={[styles.amountBtn, snoozeDuration === d && styles.amountBtnActive]}
                  onPress={() => setSnoozeDuration(d)}
                >
                  <Text style={[styles.amountBtnText, snoozeDuration === d && styles.amountBtnTextActive]}>{d}m</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0A0A0F" },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingBottom: 12,
  },
  closeBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold", color: "#F0F0FF" },
  saveBtn: {
    backgroundColor: "#FF5A3C", borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8,
    minWidth: 60, alignItems: "center",
  },
  saveBtnText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 14 },
  testBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    marginHorizontal: 16, marginBottom: 16, backgroundColor: "#FF5A3C11",
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: "#FF5A3C44",
  },
  testBtnText: { color: "#FF5A3C", fontFamily: "Inter_500Medium", fontSize: 14 },
  section: { paddingHorizontal: 16, marginBottom: 20 },
  sectionLabel: { fontSize: 13, color: "#8888AA", fontFamily: "Inter_600SemiBold", marginBottom: 10 },
  textInput: {
    backgroundColor: "#141420", borderRadius: 12, borderWidth: 1, borderColor: "#2A2A40",
    paddingHorizontal: 16, paddingVertical: 14, color: "#F0F0FF", fontFamily: "Inter_400Regular", fontSize: 15,
  },
  timePicker: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  timeInput: {
    width: 80, textAlign: "center",
    backgroundColor: "#141420", borderRadius: 14, borderWidth: 1, borderColor: "#2A2A40",
    paddingVertical: 14, color: "#F0F0FF", fontFamily: "Inter_700Bold", fontSize: 40,
  },
  timeSeparator: { fontSize: 40, fontFamily: "Inter_700Bold", color: "#F0F0FF" },
  daysRow: { flexDirection: "row", gap: 6 },
  dayBtn: {
    flex: 1, height: 40, borderRadius: 8,
    backgroundColor: "#141420", borderWidth: 1, borderColor: "#2A2A40",
    alignItems: "center", justifyContent: "center",
  },
  dayBtnActive: { backgroundColor: "#FF5A3C22", borderColor: "#FF5A3C" },
  dayBtnText: { fontSize: 10, color: "#8888AA", fontFamily: "Inter_600SemiBold" },
  dayBtnTextActive: { color: "#FF5A3C" },
  amountRow: { flexDirection: "row", gap: 8 },
  amountBtn: {
    flex: 1, height: 40, borderRadius: 10,
    backgroundColor: "#141420", borderWidth: 1, borderColor: "#2A2A40",
    alignItems: "center", justifyContent: "center",
  },
  amountBtnActive: { backgroundColor: "#FF5A3C22", borderColor: "#FF5A3C" },
  amountBtnText: { fontSize: 13, color: "#8888AA", fontFamily: "Inter_600SemiBold" },
  amountBtnTextActive: { color: "#FF5A3C" },
  categoryRow: { flexDirection: "row", gap: 8 },
  catBtn: {
    flex: 1, height: 38, borderRadius: 10,
    backgroundColor: "#141420", borderWidth: 1, borderColor: "#2A2A40",
    alignItems: "center", justifyContent: "center",
  },
  catBtnText: { fontSize: 12, color: "#8888AA", fontFamily: "Inter_600SemiBold" },
  charityItem: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: "#141420", borderRadius: 10, borderWidth: 1, borderColor: "#2A2A40",
    paddingHorizontal: 14, paddingVertical: 10,
  },
  charityItemActive: { borderColor: "#FF5A3C", backgroundColor: "#FF5A3C11" },
  charityName: { fontSize: 13, color: "#F0F0FF", fontFamily: "Inter_400Regular" },
  confirmRow: { flexDirection: "row", gap: 8 },
  confirmBtn: {
    flex: 1, backgroundColor: "#141420", borderRadius: 12,
    borderWidth: 1, borderColor: "#2A2A40", padding: 12, alignItems: "center", gap: 4,
  },
  confirmBtnActive: { borderColor: "#FF5A3C", backgroundColor: "#FF5A3C11" },
  confirmBtnText: { fontSize: 11, color: "#8888AA", fontFamily: "Inter_500Medium" },
  snoozeHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
});
