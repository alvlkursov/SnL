import React, { useRef } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Linking, type StyleProp, type ViewStyle } from "react-native";
import { CameraView, useCameraPermissions, type BarcodeType } from "expo-camera";

// QR stickers plus the barcodes on everyday products (toothpaste, coffee…)
const BARCODE_TYPES: BarcodeType[] = ["qr", "ean13", "ean8", "upc_a", "upc_e", "code128", "code39", "datamatrix"];
// The camera reports the same code many times a second
const REPEAT_MS = 1500;

/** Live camera that reports each scanned QR code / barcode, asking for camera access first. */
export function CodeScanner({ onScan, style }: { onScan: (data: string) => void; style?: StyleProp<ViewStyle> }) {
  const [permission, requestPermission] = useCameraPermissions();
  const last = useRef({ data: "", at: 0 });

  if (!permission) {
    return (
      <View style={[styles.box, style]}>
        <ActivityIndicator color="#FF5A3C" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[styles.box, style]}>
        <Text style={styles.text}>Camera access is needed to scan your code</Text>
        <TouchableOpacity
          style={styles.button}
          onPress={() => (permission.canAskAgain ? requestPermission() : Linking.openSettings())}
        >
          <Text style={styles.buttonText}>{permission.canAskAgain ? "Allow camera" : "Open settings"}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.box, style]}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: BARCODE_TYPES }}
        onBarcodeScanned={({ data }) => {
          if (!data) return;
          const now = Date.now();
          if (data === last.current.data && now - last.current.at < REPEAT_MS) return;
          last.current = { data, at: now };
          onScan(data);
        }}
      />
      <View style={styles.frame} pointerEvents="none" />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    width: "100%", aspectRatio: 1, maxHeight: 320, borderRadius: 20, overflow: "hidden",
    backgroundColor: "#141420", alignItems: "center", justifyContent: "center", padding: 0,
  },
  frame: {
    width: "60%", aspectRatio: 1, borderRadius: 16, borderWidth: 2, borderColor: "#FF5A3CCC",
  },
  text: { color: "#CCCCDD", fontFamily: "Inter_500Medium", fontSize: 14, textAlign: "center", marginBottom: 16, paddingHorizontal: 24 },
  button: { backgroundColor: "#FF5A3C", borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12 },
  buttonText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 15 },
});
