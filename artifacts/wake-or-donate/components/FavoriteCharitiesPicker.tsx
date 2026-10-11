import React, { useEffect, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, SectionList, TextInput, ActivityIndicator, Pressable,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BASE_URL, useAuth } from "@/context/AuthContext";

export const MAX_FAVORITES = 3;

export interface CharityInfo {
  id: number;
  name: string;
  description: string;
  category: "recommended" | "general" | "hated";
  cause: string | null;
}

interface Props {
  visible: boolean;
  selectedIds: number[];
  onClose: () => void;
  onSaved: (favorites: CharityInfo[]) => void;
}

/** Choose up to 3 favorite charities from the full catalog; saved on the server. */
export function FavoriteCharitiesPicker({ visible, selectedIds, onClose, onSaved }: Props) {
  const { token } = useAuth();
  const insets = useSafeAreaInsets();
  const [catalog, setCatalog] = useState<CharityInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<number[]>(selectedIds);

  useEffect(() => {
    if (!visible) return;
    setSelected(selectedIds);
    setQuery("");
    setError("");
    if (catalog.length) return;
    setLoading(true);
    fetch(`${BASE_URL}/charities?category=catalog`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error("Couldn't load charities"))))
      .then(setCatalog)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [visible]);

  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    const groups = new Map<string, CharityInfo[]>();
    for (const c of catalog) {
      if (q && !`${c.name} ${c.description} ${c.cause ?? ""}`.toLowerCase().includes(q)) continue;
      const cause = c.cause ?? "Other";
      groups.set(cause, [...(groups.get(cause) ?? []), c]);
    }
    return [...groups.entries()].map(([title, data]) => ({ title, data }));
  }, [catalog, query]);

  const toggle = (id: number) => {
    setError("");
    setSelected(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= MAX_FAVORITES) {
        setError(`You can pick up to ${MAX_FAVORITES}. Remove one first.`);
        return prev;
      }
      return [...prev, id];
    });
  };

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`${BASE_URL}/charities/favorites`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ charityIds: selected }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Couldn't save");
      onSaved(data);
      onClose();
    } catch (e: any) {
      setError(e?.message ?? "Couldn't save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.handle} />
          <Text style={styles.title}>Favorite charities</Text>
          <Text style={styles.subtitle}>
            Pick up to {MAX_FAVORITES}. Alarms set to "Favorite" donate to one of them. {selected.length}/{MAX_FAVORITES} selected
          </Text>
          <View style={styles.search}>
            <Feather name="search" size={16} color="#8888AA" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search charities or causes"
              placeholderTextColor="#8888AA"
              value={query}
              onChangeText={setQuery}
            />
          </View>
          {loading ? (
            <ActivityIndicator color="#FF5A3C" style={{ marginVertical: 32 }} />
          ) : (
            <SectionList
              style={{ flexGrow: 0 }}
              sections={sections}
              keyExtractor={c => String(c.id)}
              stickySectionHeadersEnabled={false}
              keyboardShouldPersistTaps="handled"
              renderSectionHeader={({ section }) => <Text style={styles.section}>{section.title}</Text>}
              renderItem={({ item }) => {
                const isSelected = selected.includes(item.id);
                return (
                  <TouchableOpacity style={[styles.row, isSelected && styles.rowSelected]} onPress={() => toggle(item.id)}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.name, isSelected && { color: "#30D158" }]}>
                        {item.name}{item.category === "recommended" ? "  ★" : ""}
                      </Text>
                      <Text style={styles.description} numberOfLines={2}>{item.description}</Text>
                    </View>
                    <Feather name={isSelected ? "check-circle" : "circle"} size={20} color={isSelected ? "#30D158" : "#44445A"} />
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={<Text style={styles.description}>No charities match "{query}".</Text>}
            />
          )}
          {!!error && <Text style={styles.error}>{error}</Text>}
          <TouchableOpacity style={styles.saveBtn} onPress={save} disabled={saving || loading}>
            <Text style={styles.saveText}>{saving ? "Saving…" : "Save"}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "#000000AA", justifyContent: "flex-end" },
  sheet: {
    maxHeight: "88%", backgroundColor: "#141420", borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 16, paddingTop: 10,
  },
  handle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: "#2A2A40", marginBottom: 12 },
  title: { fontSize: 20, fontFamily: "Inter_700Bold", color: "#F0F0FF" },
  subtitle: { fontSize: 13, fontFamily: "Inter_400Regular", color: "#8888AA", marginTop: 4, marginBottom: 12, lineHeight: 18 },
  search: {
    flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#1C1C2E", borderRadius: 12,
    paddingHorizontal: 12, borderWidth: 1, borderColor: "#2A2A40", marginBottom: 8,
  },
  searchInput: { flex: 1, paddingVertical: 10, color: "#F0F0FF", fontFamily: "Inter_400Regular", fontSize: 15 },
  section: {
    fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#8888AA", textTransform: "uppercase",
    letterSpacing: 0.8, marginTop: 14, marginBottom: 6,
  },
  row: {
    flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 12,
    backgroundColor: "#1C1C2E", marginBottom: 6, borderWidth: 1, borderColor: "transparent",
  },
  rowSelected: { borderColor: "#30D15866" },
  name: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#F0F0FF" },
  description: { fontSize: 12, fontFamily: "Inter_400Regular", color: "#8888AA", marginTop: 2, lineHeight: 16 },
  error: { fontSize: 13, fontFamily: "Inter_500Medium", color: "#FF453A", marginTop: 8 },
  saveBtn: { backgroundColor: "#FF5A3C", borderRadius: 14, paddingVertical: 14, alignItems: "center", marginTop: 12 },
  saveText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#fff" },
});
