import React, { useRef, useEffect } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, Animated, Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";

export default function WokeUpScreen() {
  const insets = useSafeAreaInsets();
  const { alarmName = "Morning Alarm", streak = "3" } =
    useLocalSearchParams<{ alarmName?: string; streak?: string }>();

  const scaleAnim = useRef(new Animated.Value(0.7)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, tension: 60, friction: 7 }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();
  }, []);

  const handleVoluntaryDonate = () => {
    Alert.alert(
      "Feeling generous?",
      "Choose an amount to donate voluntarily.",
      [
        { text: "$5", onPress: () => router.push("/alarm/receipt?voluntary=true&amount=5") },
        { text: "$10", onPress: () => router.push("/alarm/receipt?voluntary=true&amount=10") },
        { text: "$20", onPress: () => router.push("/alarm/receipt?voluntary=true&amount=20") },
        { text: "Cancel", style: "cancel" },
      ]
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 32 }]}>
      {/* Animated icon */}
      <Animated.View style={[styles.iconWrap, { transform: [{ scale: scaleAnim }], opacity: opacityAnim }]}>
        <Feather name="sun" size={56} color="#30D158" />
      </Animated.View>

      {/* Title */}
      <Animated.View style={{ opacity: opacityAnim, alignItems: "center" }}>
        <Text style={styles.title}>You woke up! 🎉</Text>
        <Text style={styles.subtitle}>{alarmName}</Text>
      </Animated.View>

      {/* No donation badge */}
      <View style={styles.badge}>
        <Feather name="check-circle" size={16} color="#30D158" />
        <Text style={styles.badgeText}>No donation charged</Text>
      </View>

      {/* Streak */}
      {parseInt(streak, 10) > 1 && (
        <View style={styles.streakCard}>
          <Text style={styles.streakEmoji}>🔥</Text>
          <View>
            <Text style={styles.streakTitle}>{streak}-day streak</Text>
            <Text style={styles.streakSub}>Keep it up — you're on a roll!</Text>
          </View>
        </View>
      )}

      {/* Feeling generous card */}
      <View style={styles.generousCard}>
        <View style={styles.generousHeader}>
          <Feather name="heart" size={15} color="#FF5A3C" />
          <Text style={styles.generousTitle}>Feeling generous?</Text>
        </View>
        <Text style={styles.generousDesc}>
          You don't have to, but you can make a voluntary donation to a charity you love.
        </Text>
        <TouchableOpacity
          style={styles.donateSecondaryBtn}
          onPress={handleVoluntaryDonate}
          activeOpacity={0.75}
        >
          <Text style={styles.donateSecondaryText}>Donate anyway</Text>
        </TouchableOpacity>
      </View>

      {/* Done */}
      <TouchableOpacity
        style={styles.doneBtn}
        onPress={() => router.back()}
        activeOpacity={0.8}
      >
        <Text style={styles.doneBtnText}>Close</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: "#0A0A0F",
    paddingHorizontal: 24, alignItems: "center",
  },
  iconWrap: {
    width: 112, height: 112, borderRadius: 56,
    backgroundColor: "#30D15818", borderWidth: 1.5, borderColor: "#30D15844",
    alignItems: "center", justifyContent: "center",
    marginBottom: 24, marginTop: 16,
  },
  title: {
    fontSize: 30, fontFamily: "Inter_700Bold", color: "#F0F0FF", marginBottom: 4,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 15, fontFamily: "Inter_400Regular", color: "#8888AA", marginBottom: 24,
  },
  badge: {
    flexDirection: "row", gap: 8, alignItems: "center",
    backgroundColor: "#30D15818", borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 8,
    borderWidth: 1, borderColor: "#30D15844",
    marginBottom: 24,
  },
  badgeText: {
    fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#30D158",
  },
  streakCard: {
    flexDirection: "row", gap: 14, alignItems: "center",
    backgroundColor: "#141420", borderRadius: 16, borderWidth: 1, borderColor: "#2A2A40",
    padding: 16, width: "100%", marginBottom: 16,
  },
  streakEmoji: { fontSize: 28 },
  streakTitle: {
    fontSize: 15, fontFamily: "Inter_700Bold", color: "#F0F0FF", marginBottom: 2,
  },
  streakSub: {
    fontSize: 12, fontFamily: "Inter_400Regular", color: "#8888AA",
  },
  generousCard: {
    backgroundColor: "#141420", borderRadius: 20, borderWidth: 1, borderColor: "#2A2A40",
    padding: 20, width: "100%", marginBottom: 20,
  },
  generousHeader: {
    flexDirection: "row", gap: 8, alignItems: "center", marginBottom: 8,
  },
  generousTitle: {
    fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#F0F0FF",
  },
  generousDesc: {
    fontSize: 13, fontFamily: "Inter_400Regular", color: "#8888AA",
    lineHeight: 20, marginBottom: 14,
  },
  donateSecondaryBtn: {
    borderRadius: 12, borderWidth: 1, borderColor: "#FF5A3C44",
    backgroundColor: "#FF5A3C14", paddingVertical: 11, alignItems: "center",
  },
  donateSecondaryText: {
    fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#FF5A3C",
  },
  doneBtn: {
    backgroundColor: "#30D158", borderRadius: 16,
    paddingVertical: 17, alignItems: "center",
    width: "100%", marginTop: "auto",
  },
  doneBtnText: {
    fontSize: 16, fontFamily: "Inter_700Bold", color: "#0A0A0F",
  },
});
