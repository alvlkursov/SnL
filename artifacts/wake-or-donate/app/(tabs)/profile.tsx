import React, { useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Platform, Alert, TextInput, Modal, FlatList,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "@/context/AuthContext";
import { router } from "expo-router";

const CHARITIES = [
  "Animal Shelter", "Red Cross", "UNICEF", "WWF", "Doctors Without Borders",
  "Habitat for Humanity", "Save the Children", "Amnesty International",
  "Greenpeace", "Food Bank",
];

const DEFAULT_CHARITY_OPTIONS = CHARITIES;

function SectionHeader({ title }: { title: string }) {
  return <Text style={styles.sectionTitle}>{title}</Text>;
}

function Card({ children }: { children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

function Row({
  icon, label, value, onPress, danger, right,
}: {
  icon?: string;
  label: string;
  value?: string;
  onPress?: () => void;
  danger?: boolean;
  right?: React.ReactNode;
}) {
  const content = (
    <View style={styles.row}>
      {icon ? <Feather name={icon as any} size={16} color={danger ? "#FF453A" : "#8888AA"} /> : <View style={{ width: 16 }} />}
      <Text style={[styles.rowLabel, danger && { color: "#FF453A" }]}>{label}</Text>
      <View style={styles.rowRight}>
        {right ?? (value ? <Text style={styles.rowValue}>{value}</Text> : null)}
        {onPress && !right && <Feather name="chevron-right" size={16} color="#44445A" />}
      </View>
    </View>
  );
  if (onPress) return <TouchableOpacity onPress={onPress} activeOpacity={0.7}>{content}</TouchableOpacity>;
  return content;
}

function Divider() {
  return <View style={styles.divider} />;
}

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const insets = useSafeAreaInsets();
  const topPad = insets.top + (Platform.OS === "web" ? 67 : 0);
  const bottomPad = insets.bottom + (Platform.OS === "web" ? 34 : 84);

  const [cardConnected, setCardConnected] = useState(false);
  const [donationAmount, setDonationAmount] = useState("5");
  const [snoozeLimit, setSnoozeLimit] = useState("3");
  const [defaultCharity, setDefaultCharity] = useState("Animal Shelter");
  const [dailyLimit, setDailyLimit] = useState("20");
  const [monthlyLimit, setMonthlyLimit] = useState("200");
  const [favoriteCharities, setFavoriteCharities] = useState<string[]>(["Animal Shelter"]);

  const [showDefaultCharityPicker, setShowDefaultCharityPicker] = useState(false);
  const [showFavoritePicker, setShowFavoritePicker] = useState(false);

  const handleLogout = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out", style: "destructive", onPress: async () => {
          await logout();
          router.replace("/auth");
        }
      },
    ]);
  };

  const handleSignIn = () => router.replace("/auth");

  const toggleFavorite = (charity: string) => {
    setFavoriteCharities(prev => {
      if (prev.includes(charity)) return prev.filter(c => c !== charity);
      if (prev.length >= 3) {
        Alert.alert("Limit reached", "You can only pick 3 favorite charities.");
        return prev;
      }
      return [...prev, charity];
    });
  };

  return (
    <ScrollView
      style={[styles.container, { paddingTop: topPad }]}
      contentContainerStyle={{ paddingBottom: bottomPad }}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.pageTitle}>Profile</Text>

      {/* ── PERSONAL ── */}
      <SectionHeader title="Personal" />
      <Card>
        <Row icon="user" label="Name" value={user?.name ?? "—"} />
        <Divider />
        <Row icon="mail" label="Email" value={user?.email ?? "—"} />
        <Divider />
        {user ? (
          <Row icon="log-out" label="Sign Out" onPress={handleLogout} danger />
        ) : (
          <Row icon="log-in" label="Sign In" onPress={handleSignIn} />
        )}
      </Card>

      {/* ── PAYMENT ── */}
      <SectionHeader title="Payment" />
      <Card>
        <Row
          icon="credit-card"
          label="Payment Method"
          right={
            <View style={[styles.badge, cardConnected ? styles.badgeGreen : styles.badgeGray]}>
              <Text style={[styles.badgeText, cardConnected ? { color: "#30D158" } : { color: "#8888AA" }]}>
                {cardConnected ? "Card connected" : "Not connected"}
              </Text>
            </View>
          }
        />
        <Divider />
        {!cardConnected ? (
          <Row
            icon="plus-circle"
            label="Connect card"
            onPress={() => {
              Alert.alert("Connect Card", "Payment integration coming soon.");
              setCardConnected(false);
            }}
          />
        ) : (
          <Row
            icon="trash-2"
            label="Remove card"
            onPress={() => {
              Alert.alert("Remove Card", "Are you sure?", [
                { text: "Cancel", style: "cancel" },
                { text: "Remove", style: "destructive", onPress: () => setCardConnected(false) },
              ]);
            }}
            danger
          />
        )}
      </Card>

      {/* ── DONATIONS ── */}
      <SectionHeader title="Donations" />
      <Card>
        <View style={styles.row}>
          <Feather name="dollar-sign" size={16} color="#8888AA" />
          <Text style={styles.rowLabel}>Default donation amount</Text>
          <View style={styles.rowRight}>
            <View style={styles.inputWrap}>
              <TextInput
                style={styles.input}
                value={donationAmount}
                onChangeText={setDonationAmount}
                keyboardType="numeric"
                selectTextOnFocus
              />
            </View>
            <Text style={styles.rowValue}>₪</Text>
          </View>
        </View>
        <Divider />
        <View style={styles.row}>
          <Feather name="clock" size={16} color="#8888AA" />
          <Text style={styles.rowLabel}>Default snooze limit</Text>
          <View style={styles.rowRight}>
            <View style={styles.inputWrap}>
              <TextInput
                style={styles.input}
                value={snoozeLimit}
                onChangeText={setSnoozeLimit}
                keyboardType="numeric"
                selectTextOnFocus
              />
            </View>
          </View>
        </View>
        <Divider />
        <Row
          icon="heart"
          label="Default charity"
          value={defaultCharity}
          onPress={() => setShowDefaultCharityPicker(true)}
        />
        <Divider />
        <Row
          icon="star"
          label="Favorite charities"
          value={favoriteCharities.length === 0 ? "Choose up to 3" : favoriteCharities.join(", ")}
          onPress={() => setShowFavoritePicker(true)}
        />
        <Divider />
        <View style={styles.row}>
          <Feather name="sun" size={16} color="#8888AA" />
          <Text style={styles.rowLabel}>Daily limit</Text>
          <View style={styles.rowRight}>
            <View style={styles.inputWrap}>
              <TextInput
                style={styles.input}
                value={dailyLimit}
                onChangeText={setDailyLimit}
                keyboardType="numeric"
                selectTextOnFocus
              />
            </View>
            <Text style={styles.rowValue}>₪</Text>
          </View>
        </View>
        <Divider />
        <View style={styles.row}>
          <Feather name="calendar" size={16} color="#8888AA" />
          <Text style={styles.rowLabel}>Monthly limit</Text>
          <View style={styles.rowRight}>
            <View style={styles.inputWrap}>
              <TextInput
                style={styles.input}
                value={monthlyLimit}
                onChangeText={setMonthlyLimit}
                keyboardType="numeric"
                selectTextOnFocus
              />
            </View>
            <Text style={styles.rowValue}>₪</Text>
          </View>
        </View>
      </Card>

      {/* ── LEGAL ── */}
      <SectionHeader title="Legal" />
      <Card>
        {[
          { label: "Privacy Policy", icon: "shield" },
          { label: "Terms of Use", icon: "file-text" },
          { label: "Donation Policy", icon: "gift" },
          { label: "Refund Policy", icon: "refresh-cw" },
          { label: "About", icon: "info" },
          { label: "Contact Support", icon: "message-circle" },
        ].map((item, i, arr) => (
          <React.Fragment key={item.label}>
            <Row
              icon={item.icon}
              label={item.label}
              onPress={() => Alert.alert(item.label, "Coming soon.")}
            />
            {i < arr.length - 1 && <Divider />}
          </React.Fragment>
        ))}
      </Card>

      {/* ── Default Charity Picker ── */}
      <Modal visible={showDefaultCharityPicker} transparent animationType="slide">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowDefaultCharityPicker(false)}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Default Charity</Text>
            <FlatList
              data={DEFAULT_CHARITY_OPTIONS}
              keyExtractor={i => i}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.pickerRow}
                  onPress={() => { setDefaultCharity(item); setShowDefaultCharityPicker(false); }}
                >
                  <Text style={[styles.pickerText, item === defaultCharity && { color: "#FF5A3C" }]}>{item}</Text>
                  {item === defaultCharity && <Feather name="check" size={16} color="#FF5A3C" />}
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Favorite Charities Picker ── */}
      <Modal visible={showFavoritePicker} transparent animationType="slide">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowFavoritePicker(false)}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Favorite Charities (max 3)</Text>
            <FlatList
              data={CHARITIES}
              keyExtractor={i => i}
              renderItem={({ item }) => {
                const selected = favoriteCharities.includes(item);
                return (
                  <TouchableOpacity style={styles.pickerRow} onPress={() => toggleFavorite(item)}>
                    <Text style={[styles.pickerText, selected && { color: "#FF5A3C" }]}>{item}</Text>
                    {selected && <Feather name="check" size={16} color="#FF5A3C" />}
                  </TouchableOpacity>
                );
              }}
            />
            <TouchableOpacity style={styles.doneBtn} onPress={() => setShowFavoritePicker(false)}>
              <Text style={styles.doneBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0A0A0F" },
  pageTitle: {
    fontSize: 28, fontFamily: "Inter_700Bold", color: "#F0F0FF",
    marginHorizontal: 16, marginTop: 8, marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#8888AA",
    textTransform: "uppercase", letterSpacing: 0.8,
    marginHorizontal: 16, marginBottom: 8, marginTop: 16,
  },
  card: {
    backgroundColor: "#141420", borderRadius: 16,
    marginHorizontal: 16, borderWidth: 1, borderColor: "#2A2A40",
    overflow: "hidden",
  },
  row: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 14, gap: 12,
  },
  rowLabel: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", color: "#F0F0FF" },
  rowRight: { flexDirection: "row", alignItems: "center", gap: 6, maxWidth: "50%" },
  rowValue: { fontSize: 14, fontFamily: "Inter_400Regular", color: "#8888AA", textAlign: "right" },
  divider: { height: 1, backgroundColor: "#2A2A40", marginLeft: 44 },
  badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  badgeGreen: { backgroundColor: "#30D15820" },
  badgeGray: { backgroundColor: "#2A2A40" },
  badgeText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  inputWrap: {
    backgroundColor: "#0A0A0F", borderRadius: 8,
    borderWidth: 1, borderColor: "#2A2A40",
    paddingHorizontal: 8, paddingVertical: 2,
  },
  input: {
    fontSize: 14, fontFamily: "Inter_400Regular",
    color: "#F0F0FF", minWidth: 36, textAlign: "right",
  },
  modalOverlay: {
    flex: 1, backgroundColor: "#00000088", justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: "#141420", borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingBottom: 40, maxHeight: "70%",
  },
  modalHandle: {
    width: 40, height: 4, backgroundColor: "#2A2A40",
    borderRadius: 2, alignSelf: "center", marginTop: 12, marginBottom: 8,
  },
  modalTitle: {
    fontSize: 16, fontFamily: "Inter_700Bold", color: "#F0F0FF",
    marginHorizontal: 20, marginBottom: 12,
  },
  pickerRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: "#2A2A40",
  },
  pickerText: { fontSize: 15, fontFamily: "Inter_400Regular", color: "#F0F0FF" },
  doneBtn: {
    margin: 16, backgroundColor: "#FF5A3C", borderRadius: 14, padding: 14, alignItems: "center",
  },
  doneBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#FFF" },
});
