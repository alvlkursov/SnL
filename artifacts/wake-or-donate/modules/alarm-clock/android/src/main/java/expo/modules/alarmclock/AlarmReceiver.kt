package expo.modules.alarmclock

import android.app.ActivityManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Settings
import android.util.Log

/** Fired by AlarmManager at ring time: shows the full-screen ringing alarm. */
class AlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != AlarmScheduler.ACTION_FIRE) return
    val alarmId = intent.getIntExtra("alarmId", 0)
    if (alarmId == 0) return
    val at = intent.getLongExtra("at", 0L)
    val key = intent.getStringExtra("key") ?: ""
    // Defense in depth: only ring for occurrences that are still scheduled. Anything else
    // (a ring cancelled by switching the alarm off, a stale PendingIntent) stays silent.
    if (key.isNotEmpty() && !AlarmScheduler.isScheduled(context, key)) {
      AlarmScheduler.logFire(context, key, alarmId, "ignored: no longer scheduled")
      return
    }
    AlarmScheduler.logFire(context, key, alarmId, "rang")
    val title = intent.getStringExtra("title") ?: "Alarm"
    val body = intent.getStringExtra("body") ?: ""
    // App open on screen: it switches to the ring screen and rings itself, no tray notification
    // (MIUI may also block an activity start from here even in the foreground)
    if (isAppInForeground() && AlarmClockModule.handOffRing(context, alarmId, at, title, body)) return
    RingNotification.show(context, alarmId, at, title, body)
    // While the phone is in use Android shows full-screen alarms only as a banner. Open the
    // ring screen directly instead: allowed in the foreground, or anytime with "display over
    // other apps" (the standard background-start exemption alarm apps rely on)
    if (isAppInForeground() || Settings.canDrawOverlays(context)) {
      try {
        context.startActivity(AlarmScheduler.launchIntent(context, alarmId, at))
      } catch (e: Exception) {
        Log.w("AlarmClock", "Could not open ring screen", e)
      }
    }
  }

  private fun isAppInForeground(): Boolean {
    val state = ActivityManager.RunningAppProcessInfo()
    ActivityManager.getMyMemoryState(state)
    return state.importance == ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND
  }
}
