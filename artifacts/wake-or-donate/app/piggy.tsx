import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Modal, FlatList, TextInput,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { BASE_URL, useAuth } from "@/context/AuthContext";
import { ModalHeader } from "@/components/ModalHeader";
import { billingApi, formatCents, formatDate, type PiggySummary } from "@/lib/billing";

interface Charity { id: number; name: string; cause: string | null }

const ACTIVITY: Record<PiggySummary["activity"][number]["type"], { label: string; sign: string; color: string }> = {
  deposit: { label: "Added from your bill", sign: "+", color: "#BF5AF2" },
  donate: { label: "Donated to", sign: "−", color: "#30D158" },
  withdraw: { label: "Returned to your card", sign: "−", color: "#8888AA" },
  forfeit: { label: "Unclaimed — donated by us", sign: "−", color: "#FF9F0A" },
};

/** Money from "decide later" alarms: give it to a charity anytime, take it back after 90 days. */
export default function PiggyScreen() {
  const { token } = useAuth();
  const insets = useSafeAreaInsets();
  const [piggy, setPiggy] = useState<PiggySummary | null>(null);
  const [testMode, setTestMode] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);

  const load = useCallback(() => {
    if (!token) return;
    billingApi<PiggySummary>(token, "/piggy").then(p => { setPiggy(p); setError(""); }).catch(e => setError(e.message));
    billingApi<{ testMode: boolean }>(token, "").then(d => setTestMode(d.testMode)).catch(() => {});
  }, [token]);
  useFocusEffect(load);

  const run = async (action: () => Promise<unknown>, done?: string) => {
    setBusy(true);
    try {
      await action();
      if (done) Alert.alert("Done", done);
    } catch (e: any) {
      Alert.alert("Couldn't do that", e.message);
    } finally {
      setBusy(false);
      load();
    }
  };

  const withdraw = () => {
    if (!piggy) return;
    Alert.alert(
      "Take it back?",
      `${formatCents(piggy.withdrawableCents)} goes back to your card.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Take it back", onPress: () => run(() => billingApi(token, "/piggy/withdraw", { body: {} }), "The money is on its way back to your card.") },
      ],
    );
  };

  return (
    <ScrollView style={styles.container}
      contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 40, paddingHorizontal: 20 }}>
      <ModalHeader title="Piggy bank" />
      {!piggy ? (
        error ? <Text style={styles.error}>{error}</Text> : <ActivityIndicator color="#FF5A3C" />
      ) : (
        <>
          <View style={styles.hero}>
            <MaterialCommunityIcons name="piggy-bank-outline" size={40} color="#BF5AF2" />
            <Text style={styles.big}>{formatCents(piggy.balanceCents)}</Text>
            <Text style={styles.muted}>
              {piggy.pendingCents > 0 ? `+ ${formatCents(piggy.pendingCents)} on this month's bill` : "Ready to give"}
            </Text>
          </View>

          <Text style={styles.body}>
            Alarms set to "Piggy bank" collect money here instead of sending it straight to a charity. Give it to any
            charity whenever you like. You can take it back {piggy.lockDays} days after it's paid, for {piggy.claimDays} days;
            after that we donate it to a charity of our choice.
          </Text>

          <TouchableOpacity style={[styles.primary, (busy || piggy.balanceCents < 100) && styles.disabled]}
            disabled={busy || piggy.balanceCents < 100} onPress={() => setPicking(true)}>
            <Feather name="heart" size={18} color="#fff" />
            <Text style={styles.primaryText}>Donate to a charity</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.secondary, (busy || piggy.withdrawableCents <= 0) && styles.disabled]}
            disabled={busy || piggy.withdrawableCents <= 0} onPress={withdraw}>
            <Text style={styles.secondaryText}>
              {piggy.withdrawableCents > 0 ? `Take back ${formatCents(piggy.withdrawableCents)}` : "Nothing to take back yet"}
            </Text>
          </TouchableOpacity>
          {testMode && piggy.balanceCents > 0 && piggy.withdrawableCents === 0 && (
            <TouchableOpacity style={styles.testBtn} disabled={busy}
              onPress={() => run(() => billingApi(token, "/test/unlock-piggy", { body: {} }))}>
              <Text style={styles.testText}>Skip the 90 days (test)</Text>
            </TouchableOpacity>
          )}

          {piggy.deposits.length > 0 && (
            <>
              <Text style={styles.section}>In the bank</Text>
              <View style={styles.box}>
                {piggy.deposits.map((d, i) => (
                  <View key={i} style={[styles.row, i > 0 && styles.sep]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.name}>{formatCents(d.remainingCents)}</Text>
                      <Text style={styles.muted}>
                        {new Date(d.availableAt) > new Date()
                          ? `Can be taken back from ${formatDate(d.availableAt)}`
                          : `Take back by ${formatDate(d.expiresAt)}, then we donate it`}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            </>
          )}

          {piggy.activity.length > 0 && (
            <>
              <Text style={styles.section}>History</Text>
              <View style={styles.box}>
                {piggy.activity.map((a, i) => (
                  <View key={a.id} style={[styles.row, i > 0 && styles.sep]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.name}>{ACTIVITY[a.type].label}{a.charityName ? ` ${a.charityName}` : ""}</Text>
                      <Text style={styles.muted}>{formatDate(a.createdAt)}</Text>
                    </View>
                    <Text style={[styles.amount, { color: ACTIVITY[a.type].color }]}>{ACTIVITY[a.type].sign}{formatCents(a.amountCents)}</Text>
                  </View>
                ))}
              </View>
            </>
          )}
        </>
      )}

      {piggy && (
        <DonateSheet
          visible={picking}
          maxCents={piggy.balanceCents}
          onClose={() => setPicking(false)}
          onDonate={(charity, cents) => {
            setPicking(false);
            run(() => billingApi(token, "/piggy/donate", { body: { charityId: charity.id, amountCents: cents } }),
              `${formatCents(cents)} goes to ${charity.name} in our next monthly payout.`);
          }}
        />
      )}
    </ScrollView>
  );
}

function DonateSheet({ visible, maxCents, onClose, onDonate }: {
  visible: boolean; maxCents: number; onClose: () => void; onDonate: (charity: Charity, cents: number) => void;
}) {
  const insets = useSafeAreaInsets();
  const [charities, setCharities] = useState<Charity[]>([]);
  const [selected, setSelected] = useState<Charity | null>(null);
  const [amount, setAmount] = useState("");

  useEffect(() => {
    if (!visible) return;
    setSelected(null);
    setAmount((maxCents / 100).toFixed(2));
    fetch(`${BASE_URL}/charities?category=catalog`).then(r => r.json()).then(setCharities).catch(() => {});
  }, [visible, maxCents]);

  const cents = Math.round(parseFloat(amount || "0") * 100);
  const valid = !!selected && cents >= 100 && cents <= maxCents;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} transparent>
      <View style={sheet.backdrop}>
        <View style={[sheet.panel, { paddingBottom: insets.bottom + 16 }]}>
          <View style={sheet.header}>
            <Text style={sheet.title}>Donate from piggy bank</Text>
            <TouchableOpacity onPress={onClose} hitSlop={12}><Feather name="x" size={22} color="#8888AA" /></TouchableOpacity>
          </View>
          <View style={sheet.amountRow}>
            <Text style={sheet.dollar}>$</Text>
            <TextInput style={sheet.amount} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
            <Text style={sheet.max}>of {formatCents(maxCents)}</Text>
          </View>
          <FlatList
            data={charities}
            keyExtractor={c => String(c.id)}
            style={{ maxHeight: 360 }}
            renderItem={({ item }) => (
              <TouchableOpacity style={[sheet.item, selected?.id === item.id && sheet.itemActive]} onPress={() => setSelected(item)}>
                <View style={{ flex: 1 }}>
                  <Text style={sheet.itemName}>{item.name}</Text>
                  {item.cause ? <Text style={sheet.itemCause}>{item.cause}</Text> : null}
                </View>
                {selected?.id === item.id && <Feather name="check" size={18} color="#30D158" />}
              </TouchableOpacity>
            )}
          />
          <TouchableOpacity style={[styles.primary, !valid && styles.disabled, { marginTop: 12 }]} disabled={!valid}
            onPress={() => selected && onDonate(selected, cents)}>
            <Text style={styles.primaryText}>
              {selected ? `Donate ${formatCents(cents)} to ${selected.name}` : "Pick a charity"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0A0A0F" },
  error: { color: "#FF453A", fontFamily: "Inter_500Medium" },
  hero: { alignItems: "center", paddingVertical: 12, gap: 4 },
  big: { color: "#F0F0FF", fontFamily: "Inter_700Bold", fontSize: 40 },
  muted: { color: "#8888AA", fontFamily: "Inter_400Regular", fontSize: 13 },
  body: { color: "#AAAACC", fontFamily: "Inter_400Regular", fontSize: 14, lineHeight: 20, marginVertical: 16 },
  primary: { flexDirection: "row", gap: 8, backgroundColor: "#BF5AF2", borderRadius: 12, height: 52, alignItems: "center", justifyContent: "center", paddingHorizontal: 12 },
  primaryText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 16 },
  secondary: { borderWidth: 1, borderColor: "#2A2A40", borderRadius: 12, height: 48, alignItems: "center", justifyContent: "center", marginTop: 10 },
  secondaryText: { color: "#F0F0FF", fontFamily: "Inter_500Medium", fontSize: 15 },
  disabled: { opacity: 0.45 },
  testBtn: { alignItems: "center", paddingVertical: 10 },
  testText: { color: "#64D2FF", fontFamily: "Inter_500Medium", fontSize: 13 },
  section: { color: "#8888AA", fontFamily: "Inter_600SemiBold", fontSize: 13, textTransform: "uppercase", letterSpacing: 0.6, marginTop: 20, marginBottom: 8 },
  box: { backgroundColor: "#1C1C2E", borderRadius: 14, borderWidth: 1, borderColor: "#2A2A40", paddingHorizontal: 16, paddingVertical: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  sep: { borderTopWidth: 1, borderTopColor: "#2A2A40" },
  name: { color: "#F0F0FF", fontFamily: "Inter_500Medium", fontSize: 14 },
  amount: { fontFamily: "Inter_600SemiBold", fontSize: 15, fontVariant: ["tabular-nums"] },
});

const sheet = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "#000000AA", justifyContent: "flex-end" },
  panel: { backgroundColor: "#141420", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  title: { color: "#F0F0FF", fontFamily: "Inter_700Bold", fontSize: 18 },
  amountRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 12 },
  dollar: { color: "#F0F0FF", fontFamily: "Inter_700Bold", fontSize: 28 },
  amount: { color: "#F0F0FF", fontFamily: "Inter_700Bold", fontSize: 28, minWidth: 100, padding: 0 },
  max: { color: "#8888AA", fontFamily: "Inter_400Regular", fontSize: 14 },
  item: { flexDirection: "row", alignItems: "center", paddingVertical: 12, paddingHorizontal: 10, borderRadius: 10 },
  itemActive: { backgroundColor: "#30D15818" },
  itemName: { color: "#F0F0FF", fontFamily: "Inter_500Medium", fontSize: 15 },
  itemCause: { color: "#8888AA", fontFamily: "Inter_400Regular", fontSize: 12 },
});
