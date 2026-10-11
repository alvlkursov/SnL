import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, AppState, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { closeScreen } from "@/lib/navigation";
import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AlarmClock, type AlarmClockSettings, type AlarmClockStatus } from "@/modules/alarm-clock";
import { ALARM_SETUP_SEEN_KEY } from "@/lib/alarmNotifications";


interface Step {
  title: string;
  description: string;
  ok: boolean | null; // null = Android can't tell us, the user has to check
  settings: AlarmClockSettings;
}

function steps(status: AlarmClockStatus): Step[] {
  const list: Step[] = [
    {
      title: "Notifications",
      description: "Alarms ring through a notification. Without this permission they are silent.",
      ok: status.notifications,
      settings: "notifications",
    },
    {
      title: "Alarms & reminders",
      description: "Lets the alarm ring at the exact minute, even when the phone is asleep.",
      ok: status.exactAlarms,
      settings: "exactAlarms",
    },
    {
      title: "Full-screen alarm",
      description: "Shows the alarm screen with Snooze / I'm awake over the lock screen.",
      ok: status.fullScreen,
      settings: "fullScreen",
    },
    {
      title: "No battery restrictions",
      description: "Find WakeOrDonate and choose \"No restrictions\" / \"Don't optimize\", so the system doesn't block alarms.",
      // Older builds of the native module don't report this
      ok: status.batteryUnrestricted ?? null,
      settings: "battery",
    },
  ];
  if (status.isXiaomi) {
    list.push(
      {
        title: "Xiaomi: Autostart",
        description: "Turn on Autostart for WakeOrDonate, otherwise alarms stop after the app is closed or the phone restarts.",
        ok: null,
        settings: "xiaomiAutostart",
      },
      {
        title: "Xiaomi: Lock screen & pop-ups",
        description: "Allow \"Show on Lock screen\" and \"Display pop-up windows while running in the background\".",
        ok: null,
        settings: "xiaomiPermissions",
      },
    );
  }
  return list;
}

export default function AlarmSetupScreen() {
  const insets = useSafeAreaInsets();
  const [status, setStatus] = useState<AlarmClockStatus | null>(null);

  const refresh = useCallback(() => {
    if (AlarmClock) setStatus(AlarmClock.getStatus());
  }, []);

  useEffect(() => {
    refresh();
    AsyncStorage.setItem(ALARM_SETUP_SEEN_KEY, "1").catch(() => {});
    // Re-check when the user comes back from a settings screen
    const sub = AppState.addEventListener("change", state => { if (state === "active") refresh(); });
    return () => sub.remove();
  }, [refresh]);

  const open = async (step: Step) => {
    if (step.settings === "notifications" && !step.ok) {
      const result = await Notifications.requestPermissionsAsync();
      if (result.granted) { refresh(); return; }
    }
    AlarmClock?.openSettings(step.settings);
  };

  const close = closeScreen;

  return (
    <ScrollView
      style={[styles.container, { paddingTop: insets.top + 16 }]}
      contentContainerStyle={{ paddingBottom: insets.bottom + 40, paddingHorizontal: 20 }}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Make alarms reliable</Text>
        <TouchableOpacity onPress={close} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Feather name="x" size={22} color="#8888AA" />
        </TouchableOpacity>
      </View>
      <Text style={styles.subtitle}>
        Phones try to save battery by silencing apps. Go through each step once so your alarm always rings and opens full screen.
      </Text>

      {Platform.OS === "android" && !AlarmClock && (
        <View style={[styles.card, { borderColor: "#FF453A" }]}>
          <Feather name="alert-triangle" size={20} color="#FF453A" />
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>Alarm engine missing</Text>
            <Text style={styles.cardText}>
              This build doesn't include the native alarm clock, so alarms fall back to plain notifications
              (no full screen, may be silenced). Install the latest build.
            </Text>
          </View>
        </View>
      )}

      {Platform.OS !== "android" || !status ? (
        <Text style={styles.subtitle}>Nothing to set up on this device.</Text>
      ) : (
        steps(status).map((step, i) => (
          <TouchableOpacity key={step.title} style={styles.card} onPress={() => open(step)} activeOpacity={0.8}>
            <View style={[styles.badge, step.ok === true && styles.badgeOk, step.ok === false && styles.badgeBad]}>
              {step.ok === true
                ? <Feather name="check" size={16} color="#0A0A0F" />
                : <Text style={styles.badgeText}>{i + 1}</Text>}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{step.title}</Text>
              <Text style={styles.cardText}>{step.description}</Text>
              <Text style={[styles.cardAction, step.ok === true && { color: "#30D158" }]}>
                {step.ok === true ? "Done" : step.ok === false ? "Turn on →" : "Open settings →"}
              </Text>
            </View>
          </TouchableOpacity>
        ))
      )}

      <TouchableOpacity style={styles.doneBtn} onPress={close} activeOpacity={0.8}>
        <Text style={styles.doneText}>Done</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0A0A0F" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  title: { fontSize: 26, fontFamily: "Inter_700Bold", color: "#F0F0FF" },
  subtitle: { fontSize: 14, fontFamily: "Inter_400Regular", color: "#8888AA", lineHeight: 20, marginBottom: 20 },
  card: {
    flexDirection: "row", gap: 14, backgroundColor: "#1C1C2E", borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: "#2A2A40", marginBottom: 12,
  },
  badge: { width: 28, height: 28, borderRadius: 14, backgroundColor: "#2A2A40", alignItems: "center", justifyContent: "center" },
  badgeOk: { backgroundColor: "#30D158" },
  badgeBad: { backgroundColor: "#FF453A" },
  badgeText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#F0F0FF" },
  cardTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#F0F0FF", marginBottom: 4 },
  cardText: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#8888AA", lineHeight: 18 },
  cardAction: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#FF5A3C", marginTop: 8 },
  doneBtn: { backgroundColor: "#FF5A3C", borderRadius: 16, paddingVertical: 16, alignItems: "center", marginTop: 12 },
  doneText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#fff" },
});
