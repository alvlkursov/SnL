import React, { useState, useEffect } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Switch, Platform, Alert, ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { closeScreen } from "@/lib/navigation";
import { useAlarms } from "@/context/AlarmContext";
import { WakeCodeRow } from "@/components/WakeCodeRow";
import { FundPicker, type FundCategory } from "@/components/FundPicker";
import { handlePaymentRequired } from "@/lib/billing";
import { getWakeCode } from "@/lib/wakeCode";
import { useAuth } from "@/context/AuthContext";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const CONFIRM_METHODS = [
  { key: "button", label: "Button", icon: "hand-pointing-right", desc: "Just tap a button" },
  { key: "math", label: "Math", icon: "calculator-variant", desc: "Solve a math problem" },
  { key: "shake", label: "Shake", icon: "cellphone-vibrate", desc: "Shake your phone" },
  { key: "qr", label: "QR Code", icon: "qrcode-scan", desc: "Scan a QR code" },
];


export default function CreateAlarmScreen() {
  const { createAlarm } = useAlarms();
  const { token } = useAuth();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(false);

  // Form state
  const [label, setLabel] = useState("Wake Up");
  const [hours, setHours] = useState("07");
  const [minutes, setMinutes] = useState("00");
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [donationAmount, setDonationAmount] = useState("5");
  const [charityCategory, setCharityCategory] = useState<FundCategory>("hated");
  const [selectedCharityId, setSelectedCharityId] = useState<number | null>(null);
  const [confirmMethod, setConfirmMethod] = useState<"button" | "math" | "shake" | "qr">("button");
  // QR alarms need a code to scan: ask for one right away if none is saved yet
  const pickConfirmMethod = (method: typeof confirmMethod) => {
    setConfirmMethod(method);
    if (method === "qr" && Platform.OS !== "web") {
      getWakeCode().then(code => { if (!code) router.push("/wake-code"); });
    }
  };
  const [snoozeEnabled, setSnoozeEnabled] = useState(true);
  const [snoozeDuration, setSnoozeDuration] = useState("5");

  const toggleDay = (day: number) => {
    setSelectedDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  };

  const handleSave = async () => {
    if (selectedDays.length === 0) {
      Alert.alert("Error", "Please select at least one day");
      return;
    }
    const h = parseInt(hours);
    const m = parseInt(minutes);
    if (isNaN(h) || h < 0 || h > 23 || isNaN(m) || m < 0 || m > 59) {
      Alert.alert("Error", "Please enter a valid time");
      return;
    }
    const amount = parseFloat(donationAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert("Error", "Please enter a valid donation amount");
      return;
    }
    if (charityCategory === "hated" && !selectedCharityId) {
      Alert.alert("Pick a hated fund", "Choose the cause you'd hate to fund the most — that's what gets you out of bed.");
      return;
    }
    setLoading(true);
    try {
      await createAlarm({
        label,
        time: `${hours.padStart(2, "0")}:${minutes.padStart(2, "0")}`,
        days: selectedDays.sort(),
        isEnabled: true,
        donationAmount: amount,
        charityId: selectedCharityId,
        charityCategory,
        confirmationMethod: confirmMethod,
        snoozeEnabled,
        snoozeDurationMinutes: parseInt(snoozeDuration) || 5,
      });
      closeScreen();
    } catch (e: any) {
      if (handlePaymentRequired(e)) return;
      Alert.alert("Error", e.message ?? "Failed to create alarm");
    } finally {
      setLoading(false);
    }
  };

  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);
  const bottomPad = insets.bottom + (Platform.OS === "web" ? 34 : 0) + 100;

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={closeScreen} style={styles.closeBtn}>
          <Feather name="x" size={22} color="#F0F0FF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New Alarm</Text>
        <TouchableOpacity onPress={handleSave} style={styles.saveBtn} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveBtnText}>Save</Text>}
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: bottomPad }}>
        {/* Label */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Label</Text>
          <TextInput
            style={styles.textInput}
            value={label}
            onChangeText={setLabel}
            placeholder="Alarm label"
            placeholderTextColor="#8888AA"
          />
        </View>

        {/* Time picker */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Time</Text>
          <View style={styles.timePicker}>
            <TextInput
              style={styles.timeInput}
              value={hours}
              onChangeText={(v) => setHours(v.replace(/[^0-9]/g, "").slice(0, 2))}
              keyboardType="number-pad"
              maxLength={2}
              placeholder="07"
              placeholderTextColor="#8888AA"
            />
            <Text style={styles.timeSeparator}>:</Text>
            <TextInput
              style={styles.timeInput}
              value={minutes}
              onChangeText={(v) => setMinutes(v.replace(/[^0-9]/g, "").slice(0, 2))}
              keyboardType="number-pad"
              maxLength={2}
              placeholder="00"
              placeholderTextColor="#8888AA"
            />
          </View>
        </View>

        {/* Days */}
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

        {/* Donation */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Donation Amount (if you snooze)</Text>
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
          <View style={styles.inputContainer}>
            <Text style={styles.dollarSign}>$</Text>
            <TextInput
              style={styles.amountInput}
              value={donationAmount}
              onChangeText={setDonationAmount}
              keyboardType="decimal-pad"
              placeholder="Custom amount"
              placeholderTextColor="#8888AA"
            />
          </View>
        </View>

        {/* Where snoozes go */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Where snoozes go</Text>
          <FundPicker
            token={token}
            category={charityCategory}
            onCategory={setCharityCategory}
            charityId={selectedCharityId}
            onCharity={setSelectedCharityId}
          />
        </View>

        {/* Confirmation method */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Wake-up Confirmation</Text>
          <View style={styles.confirmGrid}>
            {CONFIRM_METHODS.map((m) => (
              <TouchableOpacity
                key={m.key}
                style={[styles.confirmBtn, confirmMethod === m.key && styles.confirmBtnActive]}
                onPress={() => pickConfirmMethod(m.key as any)}
              >
                <MaterialCommunityIcons
                  name={m.icon as any}
                  size={22}
                  color={confirmMethod === m.key ? "#FF5A3C" : "#8888AA"}
                />
                <Text style={[styles.confirmBtnTitle, confirmMethod === m.key && { color: "#FF5A3C" }]}>{m.label}</Text>
                <Text style={styles.confirmBtnDesc}>{m.desc}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {confirmMethod === "qr" && <WakeCodeRow />}
        </View>

        {/* Snooze */}
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
            <View style={styles.snoozeOptions}>
              <Text style={styles.snoozeLabel}>Duration (minutes)</Text>
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
              <Text style={styles.snoozeWarning}>
                Each snooze adds ${donationAmount} to this month's bill{charityCategory === "hated" ? " — for the fund you hate" : ", for your favorites"}
              </Text>
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
  section: { paddingHorizontal: 16, marginBottom: 24 },
  sectionLabel: { fontSize: 13, color: "#8888AA", fontFamily: "Inter_600SemiBold", marginBottom: 10 },
  textInput: {
    backgroundColor: "#141420", borderRadius: 12, borderWidth: 1, borderColor: "#2A2A40",
    paddingHorizontal: 16, paddingVertical: 14, color: "#F0F0FF", fontFamily: "Inter_400Regular", fontSize: 15,
  },
  timePicker: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
  },
  timeInput: {
    width: 90, textAlign: "center",
    backgroundColor: "#141420", borderRadius: 16, borderWidth: 1, borderColor: "#2A2A40",
    paddingVertical: 16, color: "#F0F0FF", fontFamily: "Inter_700Bold", fontSize: 44, letterSpacing: -1,
  },
  timeSeparator: { fontSize: 44, fontFamily: "Inter_700Bold", color: "#F0F0FF" },
  daysRow: { flexDirection: "row", gap: 8, justifyContent: "space-between" },
  dayBtn: {
    flex: 1, height: 42, borderRadius: 10,
    backgroundColor: "#141420", borderWidth: 1, borderColor: "#2A2A40",
    alignItems: "center", justifyContent: "center",
  },
  dayBtnActive: { backgroundColor: "#FF5A3C22", borderColor: "#FF5A3C" },
  dayBtnText: { fontSize: 11, color: "#8888AA", fontFamily: "Inter_600SemiBold" },
  dayBtnTextActive: { color: "#FF5A3C" },
  amountRow: { flexDirection: "row", gap: 8, marginBottom: 10 },
  amountBtn: {
    flex: 1, height: 42, borderRadius: 10,
    backgroundColor: "#141420", borderWidth: 1, borderColor: "#2A2A40",
    alignItems: "center", justifyContent: "center",
  },
  amountBtnActive: { backgroundColor: "#FF5A3C22", borderColor: "#FF5A3C" },
  amountBtnText: { fontSize: 14, color: "#8888AA", fontFamily: "Inter_600SemiBold" },
  amountBtnTextActive: { color: "#FF5A3C" },
  inputContainer: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "#141420", borderRadius: 12, borderWidth: 1, borderColor: "#2A2A40",
    paddingHorizontal: 14,
  },
  dollarSign: { fontSize: 18, color: "#8888AA", fontFamily: "Inter_600SemiBold", marginRight: 4 },
  amountInput: { flex: 1, height: 50, color: "#F0F0FF", fontFamily: "Inter_400Regular", fontSize: 16 },
  categoryGrid: { gap: 8 },
  categoryBtn: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: "#141420", borderRadius: 14, borderWidth: 1, borderColor: "#2A2A40",
    padding: 14,
  },
  categoryBtnActive: { backgroundColor: "#1C1C2E" },
  categoryBtnTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#F0F0FF", flex: 1 },
  categoryBtnDesc: { fontSize: 12, color: "#8888AA", fontFamily: "Inter_400Regular" },
  charityList: { marginTop: 12, gap: 6 },
  charityListLabel: { fontSize: 12, color: "#8888AA", fontFamily: "Inter_500Medium", marginBottom: 6 },
  charityItem: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: "#141420", borderRadius: 10, borderWidth: 1, borderColor: "#2A2A40",
    paddingHorizontal: 14, paddingVertical: 12,
  },
  charityItemActive: { borderColor: "#FF5A3C", backgroundColor: "#FF5A3C11" },
  charityItemLeft: { flexDirection: "row", alignItems: "center", gap: 6 },
  charityName: { fontSize: 14, color: "#F0F0FF", fontFamily: "Inter_400Regular" },
  confirmGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  confirmBtn: {
    width: "47%", backgroundColor: "#141420", borderRadius: 14,
    borderWidth: 1, borderColor: "#2A2A40", padding: 14, gap: 4,
  },
  confirmBtnActive: { borderColor: "#FF5A3C", backgroundColor: "#FF5A3C11" },
  confirmBtnTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#F0F0FF" },
  confirmBtnDesc: { fontSize: 11, color: "#8888AA", fontFamily: "Inter_400Regular" },
  snoozeHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  snoozeOptions: { gap: 10 },
  snoozeLabel: { fontSize: 13, color: "#8888AA", fontFamily: "Inter_500Medium", marginBottom: 4 },
  snoozeWarning: {
    fontSize: 12, color: "#FF9F0A", fontFamily: "Inter_400Regular",
    backgroundColor: "#FF9F0A11", borderRadius: 8, padding: 10,
  },
});
