import { router } from "expo-router";

/**
 * Leaves the current screen. Screens opened straight from an alarm (cold start over the lock
 * screen) have nothing to go back to, so fall back to the home screen instead of doing nothing.
 */
export function closeScreen() {
  if (router.canGoBack()) router.back();
  else router.replace("/(tabs)");
}

/** Ends an alarm flow (ring → woke up → receipt): closes every screen of it and lands on Home. */
export function goHome() {
  router.dismissTo("/(tabs)");
}
