import React from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";

const SUGGESTIONS = ["Work", "Gym", "School", "Flight", "Weekend", "Meds"];

/** The alarm's name: type your own or tap a suggestion. Shown in the list and on the ring screen. */
export function AlarmNameInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <View>
      <View style={styles.input}>
        <Feather name="edit-3" size={16} color="#8888AA" />
        <TextInput
          style={styles.field}
          value={value}
          onChangeText={onChange}
          placeholder="Name your alarm, e.g. Work"
          placeholderTextColor="#66667A"
          maxLength={40}
          returnKeyType="done"
        />
        {value.length > 0 && (
          <TouchableOpacity onPress={() => onChange("")} hitSlop={10}>
            <Feather name="x-circle" size={16} color="#66667A" />
          </TouchableOpacity>
        )}
      </View>
      <View style={styles.chips}>
        {SUGGESTIONS.map(s => (
          <TouchableOpacity key={s} style={[styles.chip, value === s && styles.chipActive]} onPress={() => onChange(s)}>
            <Text style={[styles.chipText, value === s && styles.chipTextActive]}>{s}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

/** What gets saved when the name is left empty. */
export const alarmName = (value: string) => value.trim() || "Alarm";

const styles = StyleSheet.create({
  input: {
    flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#141420",
    borderRadius: 12, borderWidth: 1, borderColor: "#2A2A40", paddingHorizontal: 14,
  },
  field: { flex: 1, height: 50, color: "#F0F0FF", fontFamily: "Inter_600SemiBold", fontSize: 16 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: "#141420", borderWidth: 1, borderColor: "#2A2A40" },
  chipActive: { borderColor: "#FF5A3C", backgroundColor: "#FF5A3C18" },
  chipText: { color: "#AAAACC", fontFamily: "Inter_500Medium", fontSize: 13 },
  chipTextActive: { color: "#FF5A3C" },
});
