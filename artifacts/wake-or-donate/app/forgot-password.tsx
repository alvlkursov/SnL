import React, { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import { closeScreen } from "@/lib/navigation";

/** Forgot password: email → 6-digit code from the inbox + new password → signed in. */
export default function ForgotPasswordScreen() {
  const params = useLocalSearchParams<{ email?: string }>();
  const { requestPasswordReset, resetPassword } = useAuth();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState(params.email ?? "");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const sendCode = async () => {
    setError("");
    if (!email.trim()) { setError("Enter your email"); return; }
    setLoading(true);
    try {
      await requestPasswordReset(email.trim());
      setStep("code");
    } catch (e: any) {
      setError(e.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const submit = async () => {
    setError("");
    if (!/^\d{6}$/.test(code.trim())) { setError("Enter the 6-digit code from the email"); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters"); return; }
    setLoading(true);
    try {
      await resetPassword(email.trim(), code.trim(), password);
      router.replace("/(tabs)");
    } catch (e: any) {
      setError(e.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16 }]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text style={styles.title}>Reset password</Text>
            <TouchableOpacity onPress={closeScreen} hitSlop={12}>
              <Feather name="x" size={24} color="#8888AA" />
            </TouchableOpacity>
          </View>

          {step === "email" ? (
            <>
              <Text style={styles.body}>Enter the email you signed up with. We'll send you a 6-digit code.</Text>
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
                  autoFocus={!email}
                />
              </View>
            </>
          ) : (
            <>
              <Text style={styles.body}>
                If an account exists for {email.trim()}, we sent a code to it. It expires in 15 minutes — check spam too.
              </Text>
              <View style={styles.inputContainer}>
                <Feather name="hash" size={18} color="#8888AA" style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, styles.codeInput]}
                  placeholder="6-digit code"
                  placeholderTextColor="#8888AA"
                  value={code}
                  onChangeText={t => setCode(t.replace(/\D/g, "").slice(0, 6))}
                  keyboardType="number-pad"
                  autoComplete="one-time-code"
                  textContentType="oneTimeCode"
                  autoFocus
                />
              </View>
              <View style={styles.inputContainer}>
                <Feather name="lock" size={18} color="#8888AA" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="New password (8+ characters)"
                  placeholderTextColor="#8888AA"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPass}
                />
                <TouchableOpacity onPress={() => setShowPass(!showPass)} style={styles.eyeIcon}>
                  <Feather name={showPass ? "eye-off" : "eye"} size={18} color="#8888AA" />
                </TouchableOpacity>
              </View>
            </>
          )}

          {error ? (
            <View style={styles.errorBox}>
              <Feather name="alert-circle" size={14} color="#FF453A" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
            onPress={step === "email" ? sendCode : submit}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.submitText}>{step === "email" ? "Send code" : "Set new password"}</Text>}
          </TouchableOpacity>

          {step === "code" && (
            <TouchableOpacity style={styles.linkBtn} onPress={sendCode} disabled={loading}>
              <Text style={styles.linkText}>Didn't get it? Send a new code</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0A0A0F" },
  content: { paddingHorizontal: 24, paddingBottom: 40, gap: 12 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  title: { color: "#F0F0FF", fontFamily: "Inter_700Bold", fontSize: 24 },
  body: { color: "#8888AA", fontFamily: "Inter_400Regular", fontSize: 14, lineHeight: 20, marginBottom: 8 },
  inputContainer: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "#141420", borderRadius: 12, paddingHorizontal: 14,
    borderWidth: 1, borderColor: "#2A2A40",
  },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, height: 52, color: "#F0F0FF", fontFamily: "Inter_400Regular", fontSize: 15 },
  codeInput: { fontFamily: "Inter_600SemiBold", fontSize: 20, letterSpacing: 6 },
  eyeIcon: { padding: 8 },
  errorBox: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#2A1215", borderRadius: 8, padding: 12 },
  errorText: { color: "#FF453A", fontSize: 13, fontFamily: "Inter_400Regular", flex: 1 },
  submitBtn: {
    backgroundColor: "#FF5A3C", borderRadius: 12, height: 52,
    alignItems: "center", justifyContent: "center", marginTop: 4,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  linkBtn: { alignItems: "center", paddingVertical: 8 },
  linkText: { color: "#FF5A3C", fontSize: 14, fontFamily: "Inter_500Medium" },
});
