import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, Animated, Vibration,
  Platform, Alert,
} from "react-native";
import { useAudioPlayer, setAudioModeAsync } from "expo-audio";
import { Accelerometer } from "expo-sensors";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useAlarms } from "@/context/AlarmContext";
import { stopRinging, scheduleSnooze } from "@/lib/alarmNotifications";
import { ringingAlarm } from "@/lib/ringingState";

function MathChallenge({ onSolve }: { onSolve: () => void }) {
  const [a] = useState(Math.floor(Math.random() * 20) + 5);
  const [b] = useState(Math.floor(Math.random() * 20) + 5);
  const [answer, setAnswer] = useState("");
  const correct = a + b;

  const tryAnswer = (digit: string) => {
    const next = answer + digit;
    setAnswer(next);
    if (parseInt(next) === correct && next.length >= String(correct).length) {
      onSolve();
    } else if (next.length > String(correct).length) {
      setAnswer("");
    }
  };

  return (
    <View style={mStyles.container}>
      <Text style={mStyles.question}>{a} + {b} = ?</Text>
      <Text style={mStyles.answer}>{answer || "—"}</Text>
      <View style={mStyles.keypad}>
        {[1,2,3,4,5,6,7,8,9,0].map((d) => (
          <TouchableOpacity key={d} style={mStyles.key} onPress={() => tryAnswer(String(d))}>
            <Text style={mStyles.keyText}>{d}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={mStyles.key} onPress={() => setAnswer("")}>
          <Feather name="delete" size={20} color="#F0F0FF" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const mStyles = StyleSheet.create({
  container: { alignItems: "center", gap: 16 },
  question: { fontSize: 40, fontFamily: "Inter_700Bold", color: "#F0F0FF" },
  answer: { fontSize: 32, fontFamily: "Inter_600SemiBold", color: "#FF5A3C", minHeight: 40 },
  keypad: { flexDirection: "row", flexWrap: "wrap", width: 240, gap: 8, justifyContent: "center" },
  key: {
    width: 70, height: 70, borderRadius: 35,
    backgroundColor: "#1C1C2E", alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "#2A2A40",
  },
  keyText: { fontSize: 22, fontFamily: "Inter_600SemiBold", color: "#F0F0FF" },
});

const SHAKES_TO_DISMISS = 10;
const SHAKE_THRESHOLD_G = 1.8;
const SHAKE_DEBOUNCE_MS = 250;

function formatTime(date: Date) {
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export default function ActiveAlarmScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const alarmId = parseInt(id ?? "0", 10);
  const { alarms, dismissAlarm, snoozeAlarm } = useAlarms();
  const alarm = alarms.find(a => a.id === alarmId);
  const insets = useSafeAreaInsets();
  const [time, setTime] = useState(new Date());
  const [shakeCount, setShakeCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const player = useAudioPlayer(require("../../assets/sounds/alarm.wav"));

  // Ring: loud looping sound (even in silent mode) + vibration + pulsing clock
  useEffect(() => {
    ringingAlarm.id = alarmId;
    setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: "doNotMix" })
      .catch(() => {})
      .finally(() => {
        player.loop = true;
        player.volume = 1;
        player.play();
      });
    const timer = setInterval(() => setTime(new Date()), 1000);
    Vibration.vibrate([500, 500, 500, 500], true);
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.08, duration: 600, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => {
      clearInterval(timer);
      Vibration.cancel();
      pulse.stop();
      if (ringingAlarm.id === alarmId) ringingAlarm.id = null;
    };
  }, []);

  const silence = () => {
    Vibration.cancel();
    try { player.pause(); } catch {}
  };

  const handleDismiss = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = alarm ? await dismissAlarm(alarm.id) : null;
      silence();
      if (alarm) await stopRinging(alarm.id);
      router.replace({
        pathname: "/alarm/woke-up",
        params: { alarmName: alarm?.label ?? "Alarm", streak: String(result?.streak ?? 0) },
      });
    } catch (e: any) {
      // Don't torture the user over a network error, but make clear it isn't confirmed yet
      silence();
      Alert.alert(
        "Not confirmed yet",
        `${e?.message ?? "Couldn't reach the server."}\n\nConnect to the internet and tap again — otherwise this alarm counts as missed.`,
      );
    } finally {
      setBusy(false);
    }
  }, [alarm, busy]);

  const handleSnooze = useCallback(async () => {
    if (!alarm || busy) return;
    setBusy(true);
    try {
      const result = await snoozeAlarm(alarm.id);
      silence();
      const ringAt = new Date(result.ringAt);
      await stopRinging(alarm.id);
      if (!result.test) await scheduleSnooze(alarm, ringAt);
      router.replace({
        pathname: "/alarm/snooze-charge",
        params: {
          amount: String(result.donationAmount),
          fund: result.charityName,
          snoozeIndex: String(result.snoozeIndex),
          snoozeLimit: String(result.snoozeLimit),
          ringTime: formatTime(ringAt),
          test: result.test ? "true" : "false",
        },
      });
    } catch (e: any) {
      Alert.alert("Can't snooze", e?.message ?? "Please try again.");
    } finally {
      setBusy(false);
    }
  }, [alarm, busy]);

  // Shake to dismiss: count distinct jolts above the threshold
  useEffect(() => {
    if (alarm?.confirmationMethod !== "shake" || Platform.OS === "web") return;
    let last = 0;
    Accelerometer.setUpdateInterval(100);
    const sub = Accelerometer.addListener(({ x, y, z }) => {
      const g = Math.sqrt(x * x + y * y + z * z);
      const now = Date.now();
      if (g > SHAKE_THRESHOLD_G && now - last > SHAKE_DEBOUNCE_MS) {
        last = now;
        setShakeCount(prev => Math.min(prev + 1, SHAKES_TO_DISMISS));
      }
    });
    return () => sub.remove();
  }, [alarm?.confirmationMethod]);

  useEffect(() => {
    if (shakeCount >= SHAKES_TO_DISMISS) handleDismiss();
  }, [shakeCount]);

  const timeStr = time.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });

  const confirmMethod = alarm?.confirmationMethod ?? "button";

  return (
    <View
      style={[styles.container, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]}
    >
      {/* Clock */}
      <Animated.View style={[styles.clockContainer, { transform: [{ scale: pulseAnim }] }]}>
        <MaterialCommunityIcons name="alarm" size={40} color="#FF5A3C" style={{ marginBottom: 8 }} />
        <Text style={styles.clock}>{timeStr}</Text>
        <Text style={styles.alarmLabel}>{alarm?.label ?? "Wake Up!"}</Text>
      </Animated.View>

      {/* Donation warning */}
      <View style={styles.warningCard}>
        <MaterialCommunityIcons name="fire" size={18} color="#FF9F0A" />
        <Text style={styles.warningText}>
          Snooze or miss = ${alarm?.donationAmount ?? 0} donation
        </Text>
      </View>

      {/* Confirmation method */}
      {confirmMethod === "button" && (
        <TouchableOpacity style={styles.bigDismissBtn} onPress={handleDismiss}>
          <Feather name="sun" size={32} color="#0A0A0F" />
          <Text style={styles.bigDismissBtnText}>I'm Awake!</Text>
        </TouchableOpacity>
      )}
      {confirmMethod === "math" && (
        <View style={styles.challengeContainer}>
          <Text style={styles.challengeTitle}>Solve to dismiss</Text>
          <MathChallenge onSolve={handleDismiss} />
        </View>
      )}
      {confirmMethod === "shake" && (
        <View style={styles.challengeContainer}>
          <Text style={styles.challengeTitle}>Shake to dismiss</Text>
          <MaterialCommunityIcons name="cellphone-sound" size={64} color="#FF5A3C" />
          <View style={styles.shakeProgress}>
            {[...Array(10)].map((_, i) => (
              <View key={i} style={[styles.shakeDot, i < shakeCount && styles.shakeDotActive]} />
            ))}
          </View>
          <Text style={styles.shakeHint}>Keep shaking your phone</Text>
        </View>
      )}
      {confirmMethod === "qr" && (
        <View style={styles.challengeContainer}>
          <Text style={styles.challengeTitle}>Get out of bed to scan QR</Text>
          <MaterialCommunityIcons name="qrcode-scan" size={64} color="#FF5A3C" />
          <Text style={styles.qrHint}>Place a QR code sticker away from your bed</Text>
          <TouchableOpacity style={styles.qrFallback} onPress={handleDismiss}>
            <Text style={styles.qrFallbackText}>Tap if QR is not set up</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Snooze */}
      {alarm?.snoozeEnabled && (
        <TouchableOpacity style={styles.snoozeBtn} onPress={handleSnooze} disabled={busy}>
          <MaterialCommunityIcons name="alarm-snooze" size={18} color="#FF9F0A" />
          <Text style={styles.snoozeBtnText}>
            Snooze {alarm.snoozeDurationMinutes}m (donate ${alarm.donationAmount})
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0A0A0F", alignItems: "center", justifyContent: "space-around", padding: 24 },
  clockContainer: { alignItems: "center" },
  clock: { fontSize: 72, fontFamily: "Inter_700Bold", color: "#F0F0FF", letterSpacing: -2 },
  alarmLabel: { fontSize: 18, fontFamily: "Inter_500Medium", color: "#8888AA" },
  warningCard: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#FF9F0A22", borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10,
    borderWidth: 1, borderColor: "#FF9F0A44",
  },
  warningText: { fontSize: 13, color: "#FF9F0A", fontFamily: "Inter_500Medium" },
  bigDismissBtn: {
    width: 180, height: 180, borderRadius: 90,
    backgroundColor: "#FF5A3C", alignItems: "center", justifyContent: "center", gap: 8,
  },
  bigDismissBtnText: { fontSize: 20, fontFamily: "Inter_700Bold", color: "#0A0A0F" },
  challengeContainer: { alignItems: "center", gap: 16 },
  challengeTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#8888AA" },
  shakeProgress: { flexDirection: "row", gap: 6 },
  shakeDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#2A2A40" },
  shakeDotActive: { backgroundColor: "#FF5A3C" },
  shakeHint: { fontSize: 14, color: "#8888AA", fontFamily: "Inter_400Regular" },
  qrHint: { fontSize: 13, color: "#8888AA", fontFamily: "Inter_400Regular", textAlign: "center" },
  qrFallback: { marginTop: 8 },
  qrFallbackText: { fontSize: 13, color: "#8888AA", fontFamily: "Inter_400Regular", textDecorationLine: "underline" },
  snoozeBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#FF9F0A22", borderRadius: 16, paddingHorizontal: 20, paddingVertical: 14,
    borderWidth: 1, borderColor: "#FF9F0A44",
  },
  snoozeBtnText: { fontSize: 14, fontFamily: "Inter_500Medium", color: "#FF9F0A" },
});
