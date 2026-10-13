import React, { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import { ModalHeader } from "@/components/ModalHeader";
import { closeScreen } from "@/lib/navigation";
import { billingApi, type BillingOverview, type Card } from "@/lib/billing";

const TEST_CARDS = [
  { number: "4242 4242 4242 4242", note: "works" },
  { number: "4000 0000 0000 0341", note: "saves, but the monthly charge fails" },
  { number: "4000 0000 0000 0002", note: "declined at the $1 check" },
];

/** Add or replace the card the monthly bill is charged to. */
export default function CardScreen() {
  const { token } = useAuth();
  const insets = useSafeAreaInsets();
  const [testMode, setTestMode] = useState<boolean | null>(null);
  const [current, setCurrent] = useState<Card | null>(null);
  const [number, setNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvc, setCvc] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!token) return; // still restoring the session
    billingApi<BillingOverview>(token, "")
      .then(d => { setTestMode(d.testMode); setCurrent(d.card); setError(""); })
      .catch(e => setError(e.message));
  }, [token]);

  const formatNumber = (v: string) => v.replace(/\D/g, "").slice(0, 19).replace(/(.{4})/g, "$1 ").trim();
  const formatExpiry = (v: string) => {
    const digits = v.replace(/\D/g, "").slice(0, 4);
    return digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
  };

  const save = async () => {
    setError("");
    const [mm, yy] = expiry.split("/");
    const expMonth = Number(mm);
    const expYear = 2000 + Number(yy);
    if (!(expMonth >= 1 && expMonth <= 12) || !yy || yy.length !== 2) { setError("Enter the expiry as MM/YY"); return; }
    setSaving(true);
    try {
      await billingApi(token, "/card", { body: { number, expMonth, expYear, cvc } });
      closeScreen();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 40, paddingHorizontal: 20 }}
        keyboardShouldPersistTaps="handled">
        <ModalHeader title={current ? "Change card" : "Add a card"} />
        <Text style={styles.body}>
          We check the card with a $1 authorization that is cancelled right away. After that it's charged once a month
          for that month's snoozes and misses, plus our 10% fee (at least $1). No snoozes, no charge.
        </Text>

        {testMode === null ? (
          error ? <Text style={styles.error}>{error}</Text> : <ActivityIndicator color="#FF5A3C" />
        ) : !testMode ? (
          <Text style={styles.body}>Card payments are being connected. Check back soon.</Text>
        ) : (
          <>
            <View style={styles.testBox}>
              <Text style={styles.testTitle}>Test mode — use a test card</Text>
              {TEST_CARDS.map(c => (
                <TouchableOpacity key={c.number} onPress={() => { setNumber(c.number); setExpiry("12/30"); setCvc("123"); }}>
                  <Text style={styles.testLine}><Text style={styles.testNumber}>{c.number}</Text>  {c.note}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.input}>
              <Feather name="credit-card" size={18} color="#8888AA" />
              <TextInput style={styles.field} placeholder="Card number" placeholderTextColor="#8888AA"
                value={number} onChangeText={v => setNumber(formatNumber(v))} keyboardType="number-pad" autoComplete="cc-number" />
            </View>
            <View style={styles.row}>
              <View style={[styles.input, { flex: 1 }]}>
                <TextInput style={styles.field} placeholder="MM/YY" placeholderTextColor="#8888AA"
                  value={expiry} onChangeText={v => setExpiry(formatExpiry(v))} keyboardType="number-pad" autoComplete="cc-exp" />
              </View>
              <View style={[styles.input, { flex: 1 }]}>
                <TextInput style={styles.field} placeholder="CVC" placeholderTextColor="#8888AA"
                  value={cvc} onChangeText={v => setCvc(v.replace(/\D/g, "").slice(0, 4))} keyboardType="number-pad"
                  secureTextEntry autoComplete="cc-csc" />
              </View>
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <TouchableOpacity style={[styles.button, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Check and save card</Text>}
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0A0A0F" },
  body: { color: "#8888AA", fontFamily: "Inter_400Regular", fontSize: 14, lineHeight: 20, marginBottom: 16 },
  error: { color: "#FF453A", fontFamily: "Inter_500Medium", fontSize: 14, marginBottom: 12 },
  testBox: { backgroundColor: "#64D2FF14", borderRadius: 12, padding: 12, gap: 6, marginBottom: 16 },
  testTitle: { color: "#64D2FF", fontFamily: "Inter_600SemiBold", fontSize: 13 },
  testLine: { color: "#AAAACC", fontFamily: "Inter_400Regular", fontSize: 13 },
  testNumber: { color: "#F0F0FF", fontFamily: "Inter_600SemiBold" },
  row: { flexDirection: "row", gap: 10 },
  input: {
    flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#141420",
    borderRadius: 12, borderWidth: 1, borderColor: "#2A2A40", paddingHorizontal: 14, marginBottom: 10,
  },
  field: { flex: 1, height: 52, color: "#F0F0FF", fontFamily: "Inter_500Medium", fontSize: 16 },
  button: { backgroundColor: "#FF5A3C", borderRadius: 12, height: 52, alignItems: "center", justifyContent: "center", marginTop: 6 },
  buttonText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 16 },
});
