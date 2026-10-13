import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Linking from "expo-linking";
import { useLocalSearchParams } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import { ModalHeader } from "@/components/ModalHeader";
import { billingApi, formatCents, formatDate, formatPeriod, type InvoiceDetails } from "@/lib/billing";

/** One monthly bill: what it paid for, our fee, and proof each charity got its money. */
export default function InvoiceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { token } = useAuth();
  const insets = useSafeAreaInsets();
  const [invoice, setInvoice] = useState<InvoiceDetails | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;
    billingApi<InvoiceDetails>(token, `/invoices/${id}`).then(setInvoice).catch(e => setError(e.message));
  }, [id, token]);

  return (
    <ScrollView style={styles.container}
      contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 40, paddingHorizontal: 20 }}>
      <ModalHeader title="Receipt" />
      {!invoice ? (
        error ? <Text style={styles.error}>{error}</Text> : <ActivityIndicator color="#FF5A3C" />
      ) : (
        <>
          <Text style={styles.period}>{formatPeriod(invoice.period)}</Text>
          <Text style={styles.big}>{formatCents(invoice.totalCents)}</Text>
          <Text style={styles.muted}>
            {invoice.status === "paid" ? `Charged ${formatDate(invoice.paidAt)} · Bill #${invoice.id}` : `Not paid yet · ${invoice.lastError ?? ""}`}
          </Text>

          <View style={styles.box}>
            {invoice.lines.map(l => (
              <View key={l.charityName} style={styles.line}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{l.charityName}</Text>
                  <Text style={[styles.status, { color: l.sent ? "#30D158" : "#8888AA" }]}>
                    {l.charityName === "Piggy bank"
                      ? "Kept in your piggy bank"
                      : l.sent ? `Delivered ${formatDate(l.sentAt)}` : "Goes out in our next monthly payout"}
                  </Text>
                  {l.receiptUrl && (
                    <TouchableOpacity onPress={() => Linking.openURL(l.receiptUrl!)} style={styles.receiptLink}>
                      <Feather name="file-text" size={13} color="#FF5A3C" />
                      <Text style={styles.link}>Charity's receipt</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <Text style={styles.amount}>{formatCents(l.cents)}</Text>
              </View>
            ))}
            <View style={[styles.line, styles.sep]}>
              <Text style={styles.muted}>Donations</Text><Text style={styles.muted}>{formatCents(invoice.subtotalCents)}</Text>
            </View>
            <View style={styles.line}>
              <Text style={styles.muted}>Our fee (10%, min $1)</Text><Text style={styles.muted}>{formatCents(invoice.feeCents)}</Text>
            </View>
            {invoice.refundedCents > 0 && (
              <View style={styles.line}>
                <Text style={styles.muted}>Returned from piggy bank</Text><Text style={styles.muted}>−{formatCents(invoice.refundedCents)}</Text>
              </View>
            )}
            <View style={[styles.line, styles.sep]}>
              <Text style={styles.name}>Total</Text><Text style={styles.amount}>{formatCents(invoice.totalCents)}</Text>
            </View>
          </View>

          <Text style={styles.note}>
            WakeOrDonate collects these donations and passes them on to each charity in one monthly payout. Because we are
            the donor of record, this payment isn't tax-deductible for you.
          </Text>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0A0A0F" },
  error: { color: "#FF453A", fontFamily: "Inter_500Medium" },
  period: { color: "#8888AA", fontFamily: "Inter_600SemiBold", fontSize: 14 },
  big: { color: "#F0F0FF", fontFamily: "Inter_700Bold", fontSize: 40 },
  muted: { color: "#8888AA", fontFamily: "Inter_400Regular", fontSize: 13 },
  box: { backgroundColor: "#1C1C2E", borderRadius: 14, borderWidth: 1, borderColor: "#2A2A40", padding: 16, marginTop: 20, gap: 12 },
  line: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 },
  sep: { borderTopWidth: 1, borderTopColor: "#2A2A40", paddingTop: 12 },
  name: { color: "#F0F0FF", fontFamily: "Inter_600SemiBold", fontSize: 15 },
  status: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 2 },
  amount: { color: "#F0F0FF", fontFamily: "Inter_600SemiBold", fontSize: 15, fontVariant: ["tabular-nums"] },
  receiptLink: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  link: { color: "#FF5A3C", fontFamily: "Inter_500Medium", fontSize: 13 },
  note: { color: "#66667A", fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 18, marginTop: 16 },
});
