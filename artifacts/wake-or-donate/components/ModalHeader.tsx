import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Feather } from "@expo/vector-icons";
import { closeScreen } from "@/lib/navigation";

/** Title row with a close button, for modal screens. */
export function ModalHeader({ title }: { title: string }) {
  return (
    <View style={styles.header}>
      <Text style={styles.title}>{title}</Text>
      <TouchableOpacity onPress={closeScreen} hitSlop={12}>
        <Feather name="x" size={24} color="#8888AA" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  title: { color: "#F0F0FF", fontFamily: "Inter_700Bold", fontSize: 24 },
});
