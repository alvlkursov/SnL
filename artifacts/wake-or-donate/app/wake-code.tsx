import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { CodeScanner } from "@/components/CodeScanner";
import { saveWakeCode } from "@/lib/wakeCode";
import { closeScreen } from "@/lib/navigation";

/** Pick the code that turns off QR alarms: a sticker or product somewhere away from the bed. */
export default function WakeCodeScreen() {
  const insets = useSafeAreaInsets();
  const [saved, setSaved] = useState(false);

  const onScan = async (data: string) => {
    if (saved) return;
    await saveWakeCode(data).catch(() => {});
    setSaved(true);
    setTimeout(closeScreen, 900);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Your wake-up code</Text>
        <TouchableOpacity onPress={closeScreen} hitSlop={12}>
          <Feather name="x" size={24} color="#8888AA" />
        </TouchableOpacity>
      </View>
      <Text style={styles.body}>
        Scan any QR code or barcode that stays far from your bed — a printed QR sticker, or the barcode on your
        toothpaste or coffee. To turn off a QR alarm you'll have to get up and scan the same code.
      </Text>

      {saved ? (
        <View style={styles.saved}>
          <Feather name="check-circle" size={56} color="#30D158" />
          <Text style={styles.savedText}>Code saved</Text>
        </View>
      ) : (
        <CodeScanner onScan={onScan} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0A0A0F", paddingHorizontal: 24 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  title: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 24 },
  body: { color: "#8888AA", fontFamily: "Inter_400Regular", fontSize: 14, lineHeight: 20, marginBottom: 24 },
  saved: { alignItems: "center", justifyContent: "center", paddingVertical: 80, gap: 12 },
  savedText: { color: "#30D158", fontFamily: "Inter_600SemiBold", fontSize: 18 },
});
