import React, { useRef, useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, useWindowDimensions,
  type NativeScrollEvent, type NativeSyntheticEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { closeScreen } from "@/lib/navigation";
import { WELCOME_SEEN_KEY } from "@/lib/onboarding";

const SLIDES = [
  {
    icon: "alarm",
    color: "#FF5A3C",
    title: "Wake up — or donate",
    body: "Set an alarm and put a few dollars on the line. Get up on time and it costs you nothing.",
  },
  {
    icon: "alarm-snooze",
    color: "#FF9F0A",
    title: "Snoozing has a price",
    body: "Each snooze donates your alarm's amount, up to 3 per alarm. Sleep through it completely and it's double.",
  },
  {
    icon: "brain",
    color: "#30D158",
    title: "Prove you're awake",
    body: "Turn the alarm off by solving a sum, shaking your phone or scanning a code across the room. Not done in time? It snoozes for you.",
  },
  {
    icon: "heart-outline",
    color: "#FF453A",
    title: "Your sleep-ins do good",
    body: "Donations go to charities you choose: your favorites, our picks — or causes you can't stand, for maximum motivation.",
  },
] as const;

/** First-launch intro to the idea of the app; also reachable from Profile. */
export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const scroller = useRef<ScrollView>(null);
  const [page, setPage] = useState(0);
  const last = page === SLIDES.length - 1;

  const finish = async () => {
    await AsyncStorage.setItem(WELCOME_SEEN_KEY, "1").catch(() => {});
    closeScreen();
  };

  const next = () => {
    if (last) { finish(); return; }
    scroller.current?.scrollTo({ x: (page + 1) * width, animated: true });
    setPage(page + 1);
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setPage(Math.round(e.nativeEvent.contentOffset.x / width));
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.topBar}>
        {!last && (
          <TouchableOpacity onPress={finish} hitSlop={12}>
            <Text style={styles.skip}>Skip</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        ref={scroller}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScroll}
        style={{ flex: 1 }}
      >
        {SLIDES.map(slide => (
          <View key={slide.title} style={[styles.slide, { width }]}>
            <View style={[styles.iconWrap, { backgroundColor: `${slide.color}18`, borderColor: `${slide.color}44` }]}>
              <MaterialCommunityIcons name={slide.icon} size={64} color={slide.color} />
            </View>
            <Text style={styles.title}>{slide.title}</Text>
            <Text style={styles.body}>{slide.body}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={styles.dots}>
        {SLIDES.map((s, i) => (
          <View key={s.title} style={[styles.dot, i === page && styles.dotActive]} />
        ))}
      </View>

      <TouchableOpacity style={styles.button} onPress={next} activeOpacity={0.85}>
        <Text style={styles.buttonText}>{last ? "Get started" : "Next"}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0A0A0F" },
  topBar: { height: 28, paddingHorizontal: 24, alignItems: "flex-end" },
  skip: { color: "#8888AA", fontFamily: "Inter_500Medium", fontSize: 15 },
  slide: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },
  iconWrap: {
    width: 128, height: 128, borderRadius: 64, borderWidth: 1.5,
    alignItems: "center", justifyContent: "center", marginBottom: 36,
  },
  title: { color: "#F0F0FF", fontFamily: "Inter_700Bold", fontSize: 28, textAlign: "center", marginBottom: 16 },
  body: { color: "#AAAACC", fontFamily: "Inter_400Regular", fontSize: 16, lineHeight: 24, textAlign: "center" },
  dots: { flexDirection: "row", justifyContent: "center", gap: 8, marginBottom: 24 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#2A2A40" },
  dotActive: { width: 24, backgroundColor: "#FF5A3C" },
  button: {
    marginHorizontal: 24, backgroundColor: "#FF5A3C", borderRadius: 14, height: 56,
    alignItems: "center", justifyContent: "center",
  },
  buttonText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 17 },
});
