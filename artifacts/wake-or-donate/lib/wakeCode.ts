import AsyncStorage from "@react-native-async-storage/async-storage";

// The QR code or barcode the user scans to prove they're out of bed (kept on this phone)
const WAKE_CODE_KEY = "wake-code";

export async function getWakeCode(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(WAKE_CODE_KEY);
  } catch {
    return null;
  }
}

export async function saveWakeCode(code: string): Promise<void> {
  await AsyncStorage.setItem(WAKE_CODE_KEY, code);
}
