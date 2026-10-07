import React, { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
} from "react-native";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useAuth } from "@/context/AuthContext";

export default function AuthScreen() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login, register } = useAuth();
  const insets = useSafeAreaInsets();

  const handleSubmit = async () => {
    setError("");
    if (!email || !password || (mode === "register" && !name)) {
      setError("Please fill in all fields");
      return;
    }
    if (mode === "register" && password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    setLoading(true);
    try {
      if (mode === "login") {
        await login(email.trim(), password);
      } else {
        await register(email.trim(), password, name.trim());
      }
      router.replace("/(tabs)");
    } catch (e: any) {
      setError(e.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0) }]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <MaterialCommunityIcons name="alarm" size={32} color="#FF5A3C" />
            </View>
            <Text style={styles.appName}>WakeOrDonate</Text>
            <Text style={styles.tagline}>Wake up or donate to charity</Text>
          </View>

          {/* Mode toggle */}
          <View style={styles.toggleContainer}>
            <TouchableOpacity
              style={[styles.toggleBtn, mode === "login" && styles.toggleActive]}
              onPress={() => { setMode("login"); setError(""); }}
            >
              <Text style={[styles.toggleText, mode === "login" && styles.toggleTextActive]}>Sign In</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleBtn, mode === "register" && styles.toggleActive]}
              onPress={() => { setMode("register"); setError(""); }}
            >
              <Text style={[styles.toggleText, mode === "register" && styles.toggleTextActive]}>Register</Text>
            </TouchableOpacity>
          </View>

          {/* Form */}
          <View style={styles.form}>
            {mode === "register" && (
              <View style={styles.inputContainer}>
                <Feather name="user" size={18} color="#8888AA" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Your name"
                  placeholderTextColor="#8888AA"
                  value={name}
                  onChangeText={setName}
                  autoCapitalize="words"
                />
              </View>
            )}
            <View style={styles.inputContainer}>
              <Feather name="mail" size={18} color="#8888AA" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Email"
                placeholderTextColor="#8888AA"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
              />
            </View>
            <View style={styles.inputContainer}>
              <Feather name="lock" size={18} color="#8888AA" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Password"
                placeholderTextColor="#8888AA"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPass}
              />
              <TouchableOpacity onPress={() => setShowPass(!showPass)} style={styles.eyeIcon}>
                <Feather name={showPass ? "eye-off" : "eye"} size={18} color="#8888AA" />
              </TouchableOpacity>
            </View>

            {error ? (
              <View style={styles.errorBox}>
                <Feather name="alert-circle" size={14} color="#FF453A" />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitText}>
                  {mode === "login" ? "Sign In" : "Create Account"}
                </Text>
              )}
            </TouchableOpacity>
          </View>

          {/* How it works */}
          <View style={styles.howItWorks}>
            <Text style={styles.howTitle}>How it works</Text>
            <View style={styles.howStep}>
              <View style={[styles.howDot, { backgroundColor: "#30D158" }]} />
              <Text style={styles.howText}>Set an alarm and a donation amount</Text>
            </View>
            <View style={styles.howStep}>
              <View style={[styles.howDot, { backgroundColor: "#FF9F0A" }]} />
              <Text style={styles.howText}>Choose where your money goes if you snooze</Text>
            </View>
            <View style={styles.howStep}>
              <View style={[styles.howDot, { backgroundColor: "#FF5A3C" }]} />
              <Text style={styles.howText}>Wake up or donate — your choice!</Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0A0A0F" },
  content: { paddingHorizontal: 24, paddingBottom: 40 },
  header: { alignItems: "center", paddingTop: 40, paddingBottom: 32 },
  iconContainer: {
    width: 80, height: 80, borderRadius: 24,
    backgroundColor: "#1C1C2E", alignItems: "center", justifyContent: "center",
    marginBottom: 16,
    borderWidth: 1, borderColor: "#2A2A40",
  },
  appName: { fontSize: 28, fontWeight: "700", color: "#F0F0FF", fontFamily: "Inter_700Bold", marginBottom: 6 },
  tagline: { fontSize: 15, color: "#8888AA", fontFamily: "Inter_400Regular" },
  toggleContainer: {
    flexDirection: "row", backgroundColor: "#141420",
    borderRadius: 12, padding: 4, marginBottom: 24,
    borderWidth: 1, borderColor: "#2A2A40",
  },
  toggleBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center" },
  toggleActive: { backgroundColor: "#FF5A3C" },
  toggleText: { fontSize: 15, color: "#8888AA", fontFamily: "Inter_600SemiBold" },
  toggleTextActive: { color: "#fff" },
  form: { gap: 12, marginBottom: 32 },
  inputContainer: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "#141420", borderRadius: 12, paddingHorizontal: 14,
    borderWidth: 1, borderColor: "#2A2A40",
  },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, height: 52, color: "#F0F0FF", fontFamily: "Inter_400Regular", fontSize: 15 },
  eyeIcon: { padding: 8 },
  errorBox: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#2A1215", borderRadius: 8, padding: 12 },
  errorText: { color: "#FF453A", fontSize: 13, fontFamily: "Inter_400Regular", flex: 1 },
  submitBtn: {
    backgroundColor: "#FF5A3C", borderRadius: 12, height: 52,
    alignItems: "center", justifyContent: "center", marginTop: 4,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  howItWorks: { gap: 12 },
  howTitle: { fontSize: 14, color: "#8888AA", fontFamily: "Inter_600SemiBold", marginBottom: 4 },
  howStep: { flexDirection: "row", alignItems: "center", gap: 10 },
  howDot: { width: 8, height: 8, borderRadius: 4 },
  howText: { color: "#F0F0FF", fontSize: 14, fontFamily: "Inter_400Regular" },
});
