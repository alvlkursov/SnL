import { router } from "expo-router";

/**
 * Leaves the current screen. Screens opened straight from an alarm (cold start over the lock
 * screen) have nothing to go back to, so fall back to the home screen instead of doing nothing.
 */
export function closeScreen() {
  if (router.canGoBack()) router.back();
  else router.replace("/(tabs)");
}
