import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { BASE_URL } from "@/context/AuthContext";

export type FundCategory = "favorite" | "hated";

interface Charity { id: number; name: string; description: string; cause: string | null }

/** Older alarms may still say 'recommended' or 'piggy': both behave like Favorite now. */
export function toFundCategory(category: string | null | undefined): FundCategory {
  return category === "hated" ? "hated" : "favorite";
}

/**
 * Where snoozes go: a cause you'd hate to fund (picked from the list, the strongest motivation)
 * or your favorites (rotating; with none picked yet the money waits in your piggy bank).
 */
export function FundPicker({ token, category, onCategory, charityId, onCharity }: {
  token: string | null;
  category: FundCategory;
  onCategory: (c: FundCategory) => void;
  charityId: number | null;
  onCharity: (id: number | null) => void;
}) {
  const [charities, setCharities] = useState<Charity[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!token) return;
    setLoaded(false);
    fetch(`${BASE_URL}/charities?category=${category}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => (r.ok ? r.json() : []))
      .then((list: Charity[]) => { setCharities(list); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, [category, token]);

  const byCause = useMemo(() => {
    const groups = new Map<string, Charity[]>();
    for (const c of charities) groups.set(c.cause ?? "Other", [...(groups.get(c.cause ?? "Other") ?? []), c]);
    return [...groups];
  }, [charities]);

  const choose = (c: FundCategory) => {
    if (c === category) return;
    onCategory(c);
    onCharity(null); // a charity from the other list no longer applies
  };

  return (
    <View>
      <View style={styles.buttons}>
        <TouchableOpacity
          style={[styles.btn, category === "hated" && styles.btnHated]}
          onPress={() => choose("hated")}
          activeOpacity={0.85}
        >
          <MaterialCommunityIcons name="emoticon-angry-outline" size={26} color={category === "hated" ? "#FF453A" : "#8888AA"} />
          <Text style={[styles.btnTitle, category === "hated" && { color: "#FF453A" }]}>Hated</Text>
          <Text style={styles.btnDesc}>A cause you'd hate to fund.{"\n"}Max motivation</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btn, category === "favorite" && styles.btnFavorite]}
          onPress={() => choose("favorite")}
          activeOpacity={0.85}
        >
          <Feather name="heart" size={24} color={category === "favorite" ? "#30D158" : "#8888AA"} />
          <Text style={[styles.btnTitle, category === "favorite" && { color: "#30D158" }]}>Favorite</Text>
          <Text style={styles.btnDesc}>Charities you love.{"\n"}Guilt-free snoozing</Text>
        </TouchableOpacity>
      </View>

      {category === "hated" && loaded && (
        <View style={styles.list}>
          <Text style={styles.listLabel}>Pick the one you'd hate to fund the most</Text>
          {byCause.map(([cause, list]) => (
            <View key={cause} style={{ gap: 6 }}>
              <Text style={styles.cause}>{cause}</Text>
              {list.map(c => (
                <TouchableOpacity
                  key={c.id}
                  style={[styles.item, charityId === c.id && styles.itemHated]}
                  onPress={() => onCharity(c.id)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{c.name}</Text>
                    <Text style={styles.desc}>{c.description}</Text>
                  </View>
                  {charityId === c.id && <Feather name="check" size={18} color="#FF453A" />}
                </TouchableOpacity>
              ))}
            </View>
          ))}
        </View>
      )}

      {category === "favorite" && loaded && (
        charities.length === 0 ? (
          <TouchableOpacity style={styles.note} onPress={() => router.push("/(tabs)/profile")}>
            <Text style={styles.noteText}>
              You haven't picked favorites yet. Until you do, snoozes go to your piggy bank and you decide later.{" "}
              <Text style={{ color: "#30D158" }}>Choose favorites in Profile →</Text>
            </Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.list}>
            <Text style={styles.listLabel}>Your favorites — tap one to always use it, or leave it to rotate</Text>
            {charities.map(c => (
              <TouchableOpacity
                key={c.id}
                style={[styles.item, charityId === c.id && styles.itemFavorite]}
                onPress={() => onCharity(charityId === c.id ? null : c.id)}
              >
                <Text style={[styles.name, { flex: 1 }]}>{c.name}</Text>
                {charityId === c.id && <Feather name="check" size={18} color="#30D158" />}
              </TouchableOpacity>
            ))}
          </View>
        )
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  buttons: { flexDirection: "row", gap: 10 },
  btn: {
    flex: 1, alignItems: "center", gap: 6, paddingVertical: 18, paddingHorizontal: 10,
    backgroundColor: "#141420", borderRadius: 16, borderWidth: 1.5, borderColor: "#2A2A40",
  },
  btnHated: { borderColor: "#FF453A", backgroundColor: "#FF453A14" },
  btnFavorite: { borderColor: "#30D158", backgroundColor: "#30D15814" },
  btnTitle: { fontSize: 17, fontFamily: "Inter_700Bold", color: "#F0F0FF" },
  btnDesc: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#8888AA", textAlign: "center", lineHeight: 16 },
  list: { marginTop: 14, gap: 10 },
  listLabel: { fontSize: 13, fontFamily: "Inter_500Medium", color: "#AAAACC" },
  cause: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#8888AA", textTransform: "uppercase", letterSpacing: 0.6, marginTop: 4 },
  item: {
    flexDirection: "row", alignItems: "center", gap: 10, padding: 12,
    backgroundColor: "#141420", borderRadius: 12, borderWidth: 1, borderColor: "#2A2A40",
  },
  itemHated: { borderColor: "#FF453A", backgroundColor: "#FF453A11" },
  itemFavorite: { borderColor: "#30D158", backgroundColor: "#30D15811" },
  name: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#F0F0FF" },
  desc: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#8888AA", marginTop: 2 },
  note: { marginTop: 12 },
  noteText: { fontSize: 13, color: "#8888AA", fontFamily: "Inter_400Regular", lineHeight: 19 },
});
