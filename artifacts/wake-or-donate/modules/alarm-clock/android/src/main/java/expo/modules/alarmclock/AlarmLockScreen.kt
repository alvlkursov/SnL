package expo.modules.alarmclock

import android.app.Activity
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import expo.modules.core.interfaces.ReactActivityLifecycleListener
import java.lang.ref.WeakReference

/**
 * Lets the app's activity appear over the lock screen and wake the display, but only while
 * it was opened for a ringing alarm. Released again once the alarm is dismissed or snoozed.
 */
object AlarmLockScreen {
  private var activityRef: WeakReference<Activity>? = null

  fun track(activity: Activity) {
    activityRef = WeakReference(activity)
  }

  fun applyFor(intent: Intent?) {
    val data = intent?.data ?: return
    if (data.scheme == AlarmScheduler.DEEP_LINK_SCHEME && data.host == "alarm") {
      activityRef?.get()?.let { setShowOverLock(it, true) }
    }
  }

  fun release() {
    val activity = activityRef?.get() ?: return
    activity.runOnUiThread { setShowOverLock(activity, false) }
  }

  private fun setShowOverLock(activity: Activity, enabled: Boolean) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      activity.setShowWhenLocked(enabled)
      activity.setTurnScreenOn(enabled)
    } else {
      @Suppress("DEPRECATION")
      val flags = WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
      if (enabled) activity.window.addFlags(flags) else activity.window.clearFlags(flags)
    }
  }
}

class AlarmLockScreenListener : ReactActivityLifecycleListener {
  override fun onCreate(activity: Activity?, savedInstanceState: Bundle?) {
    if (activity == null) return
    AlarmLockScreen.track(activity)
    val intent = activity.intent
    val launchedFromHistory = (intent?.flags ?: 0) and Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY != 0
    if (launchedFromHistory || savedInstanceState != null) {
      // Reopened from recents / recreated after being killed: Android replays the original
      // launch intent, which may be an old alarm link. Don't re-open the ring screen for it.
      if (intent?.data?.host == "alarm") activity.intent = Intent(intent).setData(null)
      return
    }
    AlarmLockScreen.applyFor(intent)
  }

  override fun onResume(activity: Activity?) {
    if (activity != null) AlarmLockScreen.track(activity)
  }

  override fun onNewIntent(intent: Intent?): Boolean {
    AlarmLockScreen.applyFor(intent)
    return false
  }
}
