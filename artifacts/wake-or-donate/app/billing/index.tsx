import React, { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Linking from "expo-linking";
import { router, useFocusEffect } from "expo-router";
import { useAuth, publicPageUrl } from "@/context/AuthContext";
import { ModalHeader } from "@/components/ModalHeader";
import { billingApi, formatCents, formatDate, formatPeriod, type BillingOverview } from "@/lib/billing";

const STATUS: Record<string, { label: string; color: string }> = {
  paid: { label: "Paid", color: "#30D158" },
  failed: { label: "Unpaid", color: "#FF453A" },
  pending: { label: "Charging…", color: "#FF9F0A" },
  processing: { label: "Charging…", color: "#FF9F0A" },
};

/** Card, what's on this month's bill, and past bills with receipts. */
export default function BillingScreen() {
  const { token } = useAuth();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<BillingOverview | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!token) return;
    billingApi<BillingOverview>(token, "")
      .then(d => { setData(d); setError(""); })
      .catch(e => setError(e.message));
  }, [token]);
  useFocusEffect(load);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
    } catch (e: any) {
      Alert.alert("Couldn't do that", e.message);
    } finally {
      setBusy(false);
      load();
    }
  };

  const failed = data?.invoices.find(i => i.status === "failed");
  const current = data?.current;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 40, paddingHorizontal: 20 }}
      refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor="#FF5A3C" />}
    >
      <ModalHeader title="Billing" />

      {!data ? (
        error ? <Text style={styles.error}>{error}</Text> : <ActivityIndicator color="#FF5A3C" style={{ marginTop: 40 }} />
      ) : (
        <>
          {data.testMode && (
            <View style={styles.testBanner}>
              <Feather name="info" size={14} color="#64D2FF" />
              <Text style={styles.testText}>Test mode — no real money is charged.</Text>
            </View>
          )}

          {failed && (
            <View style={styles.alert}>
              <Text style={styles.alertTitle}>{formatPeriod(failed.period)} bill is unpaid</Text>
              <Text style={styles.alertText}>
                {formatCents(failed.totalCents)} · {failed.lastError ?? "The charge failed"}.
                {failed.nextAttemptAt ? ` We'll try again on ${formatDate(failed.nextAttemptAt)}.` : ""} Until it's paid, you can't set new stakes.
              </Text>
              <TouchableOpacity style={styles.alertBtn} disabled={busy}
                onPress={() => run(() => billingApi(token, `/invoices/${failed.id}/retry`, { body: {} }))}>
                <Text style={styles.alertBtnText}>Pay now</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Card */}
          <TouchableOpacity style={styles.card} onPress={() => router.push("/billing/card")}>
            <Feather name="credit-card" size={20} color={data.card ? "#F0F0FF" : "#8888AA"} />
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{data.card ? `${data.card.brand} •••• ${data.card.last4}` : "No card yet"}</Text>
              <Text style={styles.muted}>
                {data.card
                  ? `Expires ${String(data.card.expMonth).padStart(2, "0")}/${String(data.card.expYear).slice(-2)}`
                  : "Needed to put money on your alarms"}
              </Text>
            </View>
            <Text style={styles.link}>{data.card ? "Change" : "Add card"}</Text>
          </TouchableOpacity>

          {/* This month */}
          <Text style={styles.section}>This month so far</Text>
          <View style={styles.box}>
            <Text style={styles.big}>{formatCents(current!.totalCents)}</Text>
            <Text style={styles.muted}>
              {current!.count === 0
                ? "Nothing owed — keep waking up on time 😉"
                : `Charged to your card on ${formatDate(current!.nextBillingDate)}`}
            </Text>
            {current!.byCharity.length > 0 && (
              <View style={styles.lines}>
                {current!.byCharity.map(l => (
                  <View key={l.name} style={styles.line}>
                    <Text style={styles.lineName}>{l.name}</Text>
                    <Text style={styles.lineValue}>{formatCents(l.cents)}</Text>
                  </View>
                ))}
                <View style={[styles.line, styles.lineFee]}>
                  <Text style={styles.muted}>Our fee ({data.fee.percent}%, min {formatCents(data.fee.minCents)})</Text>
                  <Text style={styles.muted}>{formatCents(current!.feeCents)}</Text>
                </View>
              </View>
            )}
            {data.testMode && current!.count > 0 && (
              <TouchableOpacity style={styles.testBtn} disabled={busy}
                onPress={() => run(() => billingApi(token, "/test/bill-now", { body: {} }))}>
                {busy ? <ActivityIndicator color="#64D2FF" /> : <Text style={styles.testBtnText}>Bill me now (test)</Text>}
              </TouchableOpacity>
            )}
          </View>

          {/* Piggy bank */}
          <TouchableOpacity style={styles.card} onPress={() => router.push("/piggy")}>
            <MaterialCommunityIcons name="piggy-bank-outline" size={22} color="#BF5AF2" />
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Piggy bank</Text>
              <Text style={styles.muted}>Money from alarms set to "decide later"</Text>
            </View>
            <Feather name="chevron-right" size={18} color="#8888AA" />
          </TouchableOpacity>

          {/* Past bills */}
          <Text style={styles.section}>Past bills</Text>
          <View style={styles.box}>
            {data.invoices.length === 0 ? (
              <Text style={styles.muted}>No bills yet. Your first one comes on the 1st of next month.</Text>
            ) : data.invoices.map((inv, i) => (
              <TouchableOpacity key={inv.id} style={[styles.invoice, i > 0 && styles.invoiceBorder]}
                onPress={() => router.push({ pathname: "/billing/[id]", params: { id: inv.id } })}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.lineName}>{formatPeriod(inv.period)}</Text>
                  <Text style={styles.muted}>{inv.paidAt ? `Paid ${formatDate(inv.paidAt)}` : formatDate(inv.createdAt)}</Text>
                </View>
                <Text style={styles.lineValue}>{formatCents(inv.totalCents)}</Text>
                <View style={[styles.pill, { backgroundColor: (STATUS[inv.status]?.color ?? "#8888AA") + "22" }]}>
                  <Text style={[styles.pillText, { color: STATUS[inv.status]?.color ?? "#8888AA" }]}>{STATUS[inv.status]?.label ?? inv.status}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity style={styles.footerLink} onPress={() => Linking.openURL(publicPageUrl("/transparency"))}>
            <Feather name="external-link" size={14} color="#8888AA" />
            <Text style={styles.muted}>Where the money went — every payout with the charity's receipt</Text>
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0A0A0F" },
  error: { color: "#FF453A", fontFamily: "Inter_500Medium", marginTop: 24 },
  muted: { color: "#8888AA", fontFamily: "Inter_400Regular", fontSize: 13 },
  link: { color: "#FF5A3C", fontFamily: "Inter_600SemiBold", fontSize: 14 },
  testBanner: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#64D2FF14", borderRadius: 10, padding: 10, marginBottom: 12 },
  testText: { color: "#64D2FF", fontFamily: "Inter_500Medium", fontSize: 13 },
  alert: { backgroundColor: "#FF453A18", borderColor: "#FF453A66", borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 12, gap: 6 },
  alertTitle: { color: "#FF453A", fontFamily: "Inter_700Bold", fontSize: 15 },
  alertText: { color: "#F0F0FF", fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 19 },
  alertBtn: { alignSelf: "flex-start", backgroundColor: "#FF453A", borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8, marginTop: 4 },
  alertBtnText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 14 },
  card: {
    flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#1C1C2E",
    borderRadius: 14, borderWidth: 1, borderColor: "#2A2A40", padding: 14, marginBottom: 12,
  },
  cardTitle: { color: "#F0F0FF", fontFamily: "Inter_600SemiBold", fontSize: 15 },
  section: { color: "#8888AA", fontFamily: "Inter_600SemiBold", fontSize: 13, textTransform: "uppercase", letterSpacing: 0.6, marginTop: 12, marginBottom: 8 },
  box: { backgroundColor: "#1C1C2E", borderRadius: 14, borderWidth: 1, borderColor: "#2A2A40", padding: 16, marginBottom: 12 },
  big: { color: "#F0F0FF", fontFamily: "Inter_700Bold", fontSize: 34, marginBottom: 2 },
  lines: { marginTop: 14, gap: 8 },
  line: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  lineFee: { borderTopWidth: 1, borderTopColor: "#2A2A40", paddingTop: 8 },
  lineName: { color: "#F0F0FF", fontFamily: "Inter_500Medium", fontSize: 14, flexShrink: 1 },
  lineValue: { color: "#F0F0FF", fontFamily: "Inter_600SemiBold", fontSize: 14, fontVariant: ["tabular-nums"] },
  testBtn: { marginTop: 14, borderWidth: 1, borderColor: "#64D2FF66", borderRadius: 10, paddingVertical: 10, alignItems: "center" },
  testBtnText: { color: "#64D2FF", fontFamily: "Inter_600SemiBold", fontSize: 14 },
  invoice: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 },
  invoiceBorder: { borderTopWidth: 1, borderTopColor: "#2A2A40" },
  pill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  pillText: { fontFamily: "Inter_600SemiBold", fontSize: 11 },
  footerLink: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 12 },
});
