package expo.modules.alarmclock

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build

/**
 * The ringing alarm: a full-screen-intent notification on the alarm audio stream that
 * loops its sound (FLAG_INSISTENT) until the user confirms in the app or 10 minutes pass.
 * Over the lock screen Android opens the ring screen directly; while the phone is in use
 * it shows as a heads-up banner, like system alarm clocks do.
 */
object RingNotification {
  // Android locks a channel's sound once created; bump the id to change it.
  private const val CHANNEL_ID = "alarm-ring-v1"
  private const val NOTIFICATION_ID_BASE = 700_000
  private const val RING_TIMEOUT_MS = 10 * 60 * 1000L
  private val VIBRATION = longArrayOf(0, 800, 400, 800, 400, 800)

  fun show(context: Context, alarmId: Int, title: String, body: String) {
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    ensureChannel(context, manager)

    val open = PendingIntent.getActivity(
      context, alarmId, AlarmScheduler.launchIntent(context, alarmId),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(context, CHANNEL_ID)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(context)
        .setPriority(Notification.PRIORITY_MAX)
        .setSound(soundUri(context), AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_ALARM)
          .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
          .build())
        .setVibrate(VIBRATION)
    }
    builder
      .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
      .setContentTitle(title)
      .setContentText(body)
      .setCategory(Notification.CATEGORY_ALARM)
      .setVisibility(Notification.VISIBILITY_PUBLIC)
      .setOngoing(true)
      .setAutoCancel(false)
      .setContentIntent(open)
      .setFullScreenIntent(open, true)
      .addAction(Notification.Action.Builder(null, "Open alarm", open).build())
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      builder.setTimeoutAfter(RING_TIMEOUT_MS)
    }

    val notification = builder.build()
    notification.flags = notification.flags or Notification.FLAG_INSISTENT
    manager.notify(NOTIFICATION_ID_BASE + alarmId, notification)
  }

  fun cancel(context: Context, alarmId: Int) {
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    manager.cancel(NOTIFICATION_ID_BASE + alarmId)
  }

  fun canUseFullScreen(context: Context): Boolean {
    if (Build.VERSION.SDK_INT < 34) return true
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    return manager.canUseFullScreenIntent()
  }

  private fun soundUri(context: Context): Uri {
    // alarm.wav is copied into res/raw by the expo-notifications config plugin
    val resId = context.resources.getIdentifier("alarm", "raw", context.packageName)
    return if (resId != 0) {
      Uri.parse("android.resource://${context.packageName}/$resId")
    } else {
      RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
    }
  }

  private fun ensureChannel(context: Context, manager: NotificationManager) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    if (manager.getNotificationChannel(CHANNEL_ID) != null) return
    val channel = NotificationChannel(CHANNEL_ID, "Ringing alarms", NotificationManager.IMPORTANCE_HIGH).apply {
      description = "Full-screen ringing alarms"
      setSound(soundUri(context), AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_ALARM)
        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
        .build())
      enableVibration(true)
      vibrationPattern = VIBRATION
      setBypassDnd(true)
      lockscreenVisibility = Notification.VISIBILITY_PUBLIC
    }
    manager.createNotificationChannel(channel)
  }
}
