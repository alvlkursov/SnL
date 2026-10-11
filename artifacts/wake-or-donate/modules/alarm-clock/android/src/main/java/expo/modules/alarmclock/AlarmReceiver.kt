package expo.modules.alarmclock

import android.app.ActivityManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/** Fired by AlarmManager at ring time: shows the full-screen ringing alarm. */
class AlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != AlarmScheduler.ACTION_FIRE) return
    val alarmId = intent.getIntExtra("alarmId", 0)
    if (alarmId == 0) return
    RingNotification.show(
      context,
      alarmId,
      intent.getStringExtra("title") ?: "Alarm",
      intent.getStringExtra("body") ?: "",
    )
    // While the app is open, Android shows full-screen alarms only as a banner:
    // jump straight to the ring screen instead (allowed because we are in the foreground)
    if (isAppInForeground()) {
      try {
        context.startActivity(AlarmScheduler.launchIntent(context, alarmId))
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
