import React, { useState, useEffect, useRef } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, Animated, Vibration,
  Platform, Alert, ActivityIndicator,
} from "react-native";
import { useAudioPlayer, setAudioModeAsync } from "expo-audio";
import { Accelerometer } from "expo-sensors";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useAlarms } from "@/context/AlarmContext";
import { stopRinging, scheduleSnooze, nativeAlarmsAvailable } from "@/lib/alarmNotifications";
import { AlarmClock } from "@/modules/alarm-clock";
import { ringingAlarm } from "@/lib/ringingState";
import { closeScreen } from "@/lib/navigation";
import { CodeScanner } from "@/components/CodeScanner";
import { getWakeCode } from "@/lib/wakeCode";

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
  container: { alignItems: "center", gap: 12 },
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
// After tapping "Wake up" the user has this long to prove it, otherwise the alarm snoozes
const CHALLENGE_SECONDS = 30;
// Walking to the wake-up code takes longer than solving a sum
const QR_CHALLENGE_SECONDS = 180;
// A ring link older than the ring window is stale
const STALE_RING_MS = 15 * 60_000;
const IN_APP_RING_MS = 10 * 60_000;

function formatTime(date: Date) {
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export default function ActiveAlarmScreen() {
  const { id, test, at, sound } = useLocalSearchParams<{ id: string; test?: string; at?: string; sound?: string }>();
  const alarmId = parseInt(id ?? "0", 10);
  const ringAt = at ? Number(at) : undefined; // scheduled ring time, passed by the native alarm
  const { alarms, dismissAlarm, snoozeAlarm } = useAlarms();
  const alarm = alarms.find(a => a.id === alarmId);
  const insets = useSafeAreaInsets();
  const [time, setTime] = useState(new Date());
  // ringing: Snooze / Wake up choice. challenge: proving you're awake against the clock
  const [phase, setPhase] = useState<"ringing" | "challenge">("ringing");
  const [secondsLeft, setSecondsLeft] = useState(CHALLENGE_SECONDS);
  const [challengeKey, setChallengeKey] = useState(0);
  const [shakeCount, setShakeCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [snoozeBlocked, setSnoozeBlocked] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const player = useAudioPlayer(require("../../assets/sounds/alarm.wav"));
  // Opened from the lock screen on a cold start, the alarm list may still be loading:
  // wait briefly so the right confirmation method (math, shake…) is used
  const [waitedForAlarm, setWaitedForAlarm] = useState(false);
  const ready = !!alarm || waitedForAlarm;
  // A real ring is already sounding from the native alarm clock; a test ring, or one the app
  // took over while it was open (sound=app), rings from here
  const playInApp = !nativeAlarmsAvailable || test === "1" || sound === "app";

  const confirmMethod = alarm?.confirmationMethod ?? "button";
  const challengeSeconds = confirmMethod === "qr" ? QR_CHALLENGE_SECONDS : CHALLENGE_SECONDS;
  const [wakeCode, setWakeCode] = useState<string | null>(null);
  const [wrongCode, setWrongCode] = useState(false);
  useEffect(() => { getWakeCode().then(setWakeCode); }, []);
  const canSnooze = !!alarm?.snoozeEnabled && !snoozeBlocked;
  const alarmInfo = { id: alarmId, label: alarm?.label ?? "Alarm", donationAmount: alarm?.donationAmount ?? 0 };

  // A ring screen opened from an old link (Android replaying the launch intent after the app
  // was killed, or reopened from recents) must not ring again
  const isTest = test === "1";
  const staleLink = !isTest && !!ringAt && Date.now() - ringAt > STALE_RING_MS;

  // Ring: loud looping sound (even in silent mode) + vibration + pulsing clock
  useEffect(() => {
    if (staleLink) {
      closeScreen();
      return;
    }
    ringingAlarm.id = alarmId;
    const loadTimer = setTimeout(() => setWaitedForAlarm(true), 6000);
    if (playInApp) {
      setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: "doNotMix" })
        .catch(() => {})
        .finally(() => {
          player.loop = true;
          player.volume = 1;
          player.play();
        });
    }
    // Give up ringing after the same window as a native ring
    const ringTimeout = playInApp && !isTest
      ? setTimeout(() => {
          Vibration.cancel();
          try { player.pause(); } catch {}
        }, IN_APP_RING_MS)
      : undefined;
    const timer = setInterval(() => setTime(new Date()), 1000);
    // Native rings already vibrate through their notification channel
    if (playInApp) Vibration.vibrate([500, 500, 500, 500], true);
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.08, duration: 600, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => {
      clearTimeout(loadTimer);
      clearTimeout(ringTimeout);
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

  // The alarm was switched off (or deleted) since it fired: stop and leave
  useEffect(() => {
    if (isTest || !alarmId) return;
    const switchedOff = alarm ? !alarm.isEnabled : waitedForAlarm && alarms.length > 0;
    if (!switchedOff) return;
    silence();
    AlarmClock?.cancelRing(alarmId);
    closeScreen();
  }, [alarm?.isEnabled, waitedForAlarm, alarms.length]);

  const handleDismiss = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = alarmId ? await dismissAlarm(alarmId, ringAt) : null;
      silence();
      if (alarmId) await stopRinging(alarmId, { clearSnooze: true });
      router.replace({
        pathname: "/alarm/woke-up",
        params: { alarmName: alarmInfo.label, streak: String(result?.streak ?? 0), test: result?.test ? "true" : "false" },
      });
    } catch (e: any) {
      // Don't torture the user over a network error, but make clear it isn't confirmed yet
      silence();
      if (alarmId) AlarmClock?.cancelRing(alarmId);
      Alert.alert(
        "Not confirmed yet",
        `${e?.message ?? "Couldn't reach the server."}\n\nConnect to the internet and try again — otherwise this alarm counts as missed.`,
      );
      backToRinging();
    } finally {
      setBusy(false);
    }
  };

  const handleSnooze = async (auto = false) => {
    if (!alarmId || busy) return;
    setBusy(true);
    try {
      const result = await snoozeAlarm(alarmId, ringAt);
      silence();
      const nextRingAt = new Date(result.ringAt);
      await stopRinging(alarmId);
      // Always ring again; the server alone decides whether the snooze costs money
      await scheduleSnooze({ ...alarmInfo, donationAmount: result.donationAmount }, nextRingAt);
      router.replace({
        pathname: "/alarm/snooze-charge",
        params: {
          amount: String(result.donationAmount),
          fund: result.charityName,
          snoozeIndex: String(result.snoozeIndex),
          snoozeLimit: String(result.snoozeLimit),
          ringTime: formatTime(nextRingAt),
          test: result.test ? "true" : "false",
          auto: auto ? "true" : "false",
        },
      });
    } catch (e: any) {
      // Out of snoozes (or offline): the alarm keeps ringing until the user proves they're up
      setSnoozeBlocked(true);
      backToRinging();
      Alert.alert(auto ? "Time's up" : "Can't snooze", e?.message ?? "Please try again.");
    } finally {
      setBusy(false);
    }
  };

  // Timers call the latest handlers, not the ones captured when they were set up
  const handlers = useRef({ handleDismiss, handleSnooze });
  handlers.current = { handleDismiss, handleSnooze };

  const backToRinging = () => {
    setPhase("ringing");
    setShakeCount(0);
  };

  const startChallenge = () => {
    if (confirmMethod === "button") {
      handlers.current.handleDismiss();
      return;
    }
    setSecondsLeft(challengeSeconds);
    setShakeCount(0);
    setWrongCode(false);
    setChallengeKey(k => k + 1); // fresh math problem every attempt
    setPhase("challenge");
  };

  // Countdown (30 s, 3 min for QR): failing to prove you're awake snoozes (and donates)
  useEffect(() => {
    if (phase !== "challenge") return;
    const deadline = Date.now() + challengeSeconds * 1000;
    const timer = setInterval(() => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left === 0) {
        clearInterval(timer);
        if (canSnooze) handlers.current.handleSnooze(true);
        else backToRinging();
      }
    }, 250);
    return () => clearInterval(timer);
  }, [phase, challengeKey, canSnooze]);

  // Shake to dismiss: count distinct jolts above the threshold
  useEffect(() => {
    if (phase !== "challenge" || confirmMethod !== "shake" || Platform.OS === "web") return;
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
  }, [phase, confirmMethod]);

  useEffect(() => {
    if (shakeCount >= SHAKES_TO_DISMISS) handlers.current.handleDismiss();
  }, [shakeCount]);

  const timeStr = time.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  const amount = alarm?.donationAmount ?? 0;

  if (staleLink) return null;

  if (phase === "challenge") {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 20 }]}>
        <View style={styles.challengeHeader}>
          <Text style={styles.challengeTitle}>Prove you're awake</Text>
          <View style={[styles.countdownPill, secondsLeft <= 10 && styles.countdownPillUrgent]}>
            <Feather name="clock" size={14} color={secondsLeft <= 10 ? "#FF453A" : "#FF9F0A"} />
            <Text style={[styles.countdownText, secondsLeft <= 10 && { color: "#FF453A" }]}>{secondsLeft >= 60 ? `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}` : `${secondsLeft}s`}</Text>
          </View>
          <Text style={styles.challengeHint}>
            {canSnooze ? `Not done in time = automatic snooze and $${amount} donation` : "No snoozes left — the alarm keeps ringing"}
          </Text>
        </View>

        {busy && <ActivityIndicator size="large" color="#FF5A3C" />}
        {!busy && confirmMethod === "math" && <MathChallenge key={challengeKey} onSolve={() => handlers.current.handleDismiss()} />}
        {!busy && confirmMethod === "shake" && (
          <View style={styles.challengeBody}>
            <MaterialCommunityIcons name="cellphone-sound" size={64} color="#FF5A3C" />
            <Text style={styles.challengeBodyTitle}>Shake your phone</Text>
            <View style={styles.shakeProgress}>
              {[...Array(SHAKES_TO_DISMISS)].map((_, i) => (
                <View key={i} style={[styles.shakeDot, i < shakeCount && styles.shakeDotActive]} />
              ))}
            </View>
          </View>
        )}
        {!busy && confirmMethod === "qr" && (
          <View style={styles.challengeBody}>
            <Text style={styles.challengeBodyTitle}>Get up and scan your wake-up code</Text>
            <CodeScanner
              style={styles.qrScanner}
              onScan={data => {
                // No code saved yet: any code proves you got up
                if (!wakeCode || data === wakeCode) handlers.current.handleDismiss();
                else setWrongCode(true);
              }}
            />
            {wrongCode && <Text style={styles.qrWrongText}>That's not your wake-up code — try again</Text>}
          </View>
        )}

        <TouchableOpacity style={styles.backLink} onPress={backToRinging} disabled={busy}>
          <Text style={styles.backLinkText}>Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 24 }]}>
      {/* Clock */}
      <Animated.View style={[styles.clockContainer, { transform: [{ scale: pulseAnim }] }]}>
        <MaterialCommunityIcons name="alarm" size={40} color="#FF5A3C" style={{ marginBottom: 8 }} />
        <Text style={styles.clock}>{timeStr}</Text>
        <Text style={styles.alarmLabel}>{alarm?.label ?? "Wake Up!"}</Text>
      </Animated.View>

      <View style={styles.warningCard}>
        <MaterialCommunityIcons name="fire" size={18} color="#FF9F0A" />
        <Text style={styles.warningText}>
          Snooze = ${amount} donation · Miss = ${amount * 2}
        </Text>
      </View>

      {!ready ? (
        <ActivityIndicator size="large" color="#FF5A3C" />
      ) : (
        <View style={styles.actions}>
          {canSnooze && (
            <TouchableOpacity
              style={[styles.bigBtn, styles.snoozeBtn]}
              onPress={() => handlers.current.handleSnooze(false)}
              disabled={busy}
              activeOpacity={0.85}
            >
              <MaterialCommunityIcons name="alarm-snooze" size={30} color="#FF9F0A" />
              <Text style={[styles.bigBtnText, { color: "#FF9F0A" }]}>SNOOZE</Text>
              <Text style={styles.bigBtnSub}>{alarm?.snoozeDurationMinutes ?? 5} min · ${amount}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.bigBtn, styles.wakeBtn]}
            onPress={startChallenge}
            disabled={busy}
            activeOpacity={0.85}
          >
            {busy ? <ActivityIndicator color="#0A0A0F" /> : <Feather name="sun" size={30} color="#0A0A0F" />}
            <Text style={[styles.bigBtnText, { color: "#0A0A0F" }]}>WAKE UP</Text>
            <Text style={[styles.bigBtnSub, { color: "#0A0A0FAA" }]}>
              {confirmMethod === "button" ? "I'm up" : challengeSeconds >= 60 ? `${challengeSeconds / 60} min to prove it` : `${challengeSeconds}s to prove it`}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0A0A0F", alignItems: "center", justifyContent: "space-between", padding: 24 },
  clockContainer: { alignItems: "center", marginTop: 24 },
  clock: { fontSize: 72, fontFamily: "Inter_700Bold", color: "#F0F0FF", letterSpacing: -2 },
  alarmLabel: { fontSize: 18, fontFamily: "Inter_500Medium", color: "#8888AA" },
  warningCard: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#FF9F0A22", borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10,
    borderWidth: 1, borderColor: "#FF9F0A44",
  },
  warningText: { fontSize: 13, color: "#FF9F0A", fontFamily: "Inter_500Medium" },
  actions: { width: "100%", gap: 14 },
  bigBtn: {
    width: "100%", borderRadius: 28, paddingVertical: 26, alignItems: "center", justifyContent: "center", gap: 4,
  },
  snoozeBtn: { backgroundColor: "#FF9F0A1F", borderWidth: 2, borderColor: "#FF9F0A" },
  wakeBtn: { backgroundColor: "#30D158" },
  bigBtnText: { fontSize: 26, fontFamily: "Inter_700Bold", letterSpacing: 1 },
  bigBtnSub: { fontSize: 13, fontFamily: "Inter_500Medium", color: "#FF9F0AAA" },
  challengeHeader: { alignItems: "center", gap: 10, width: "100%" },
  challengeTitle: { fontSize: 24, fontFamily: "Inter_700Bold", color: "#F0F0FF" },
  countdownPill: {
    flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 999,
    paddingHorizontal: 16, paddingVertical: 8, backgroundColor: "#FF9F0A22", borderWidth: 1, borderColor: "#FF9F0A66",
  },
  countdownPillUrgent: { backgroundColor: "#FF453A22", borderColor: "#FF453A" },
  countdownText: { fontSize: 22, fontFamily: "Inter_700Bold", color: "#FF9F0A", fontVariant: ["tabular-nums"] },
  challengeHint: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#8888AA", textAlign: "center" },
  challengeBody: { alignItems: "center", gap: 16 },
  challengeBodyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold", color: "#F0F0FF", textAlign: "center" },
  shakeProgress: { flexDirection: "row", gap: 6 },
  shakeDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: "#2A2A40" },
  shakeDotActive: { backgroundColor: "#FF5A3C" },
  qrScanner: { maxHeight: 280 },
  qrWrongText: { fontSize: 14, color: "#FF453A", fontFamily: "Inter_500Medium", marginTop: 12, textAlign: "center" },
  backLink: { paddingVertical: 10, paddingHorizontal: 24 },
  backLinkText: { fontSize: 15, fontFamily: "Inter_500Medium", color: "#8888AA" },
});
