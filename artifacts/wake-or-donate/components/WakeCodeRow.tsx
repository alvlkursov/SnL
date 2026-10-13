import React, { useCallback, useState } from "react";
import { Text, StyleSheet, TouchableOpacity } from "react-native";
import { Feather } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { getWakeCode } from "@/lib/wakeCode";

/** Under the QR method: whether a wake-up code is saved, with a link to scan one. */
export function WakeCodeRow() {
  const [hasCode, setHasCode] = useState<boolean | null>(null);

  useFocusEffect(useCallback(() => {
    getWakeCode().then(code => setHasCode(!!code));
  }, []));

  if (hasCode === null) return null;
  return (
    <TouchableOpacity style={styles.row} onPress={() => router.push("/wake-code")}>
      <Feather name={hasCode ? "check-circle" : "alert-circle"} size={16} color={hasCode ? "#30D158" : "#FF9F0A"} />
      <Text style={styles.text}>{hasCode ? "Wake-up code saved" : "No wake-up code yet"}</Text>
      <Text style={styles.link}>{hasCode ? "Change" : "Scan now"}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12,
    backgroundColor: "#1C1C2E", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
  },
  text: { flex: 1, color: "#CCCCDD", fontFamily: "Inter_500Medium", fontSize: 14 },
  link: { color: "#FF5A3C", fontFamily: "Inter_600SemiBold", fontSize: 14 },
});
