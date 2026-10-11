package expo.modules.alarmclock

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject

/** One scheduled ring: [key] is unique per occurrence, [at] is epoch millis. */
data class AlarmEntry(
  val key: String,
  val alarmId: Int,
  val at: Long,
  val title: String,
  val body: String,
) {
  fun toJson(): JSONObject = JSONObject()
    .put("key", key).put("alarmId", alarmId).put("at", at).put("title", title).put("body", body)

  companion object {
    fun fromJson(o: JSONObject) = AlarmEntry(
      key = o.getString("key"),
      alarmId = o.getInt("alarmId"),
      at = o.getLong("at"),
      title = o.optString("title", "Alarm"),
      body = o.optString("body", ""),
    )
  }
}

/**
 * Schedules rings with AlarmManager.setAlarmClock: the same mechanism system clock apps use.
 * It is exact, fires in Doze, and is exempt from background-start limits.
 * The schedule is persisted so it can be restored after a reboot or app update.
 */
object AlarmScheduler {
  private const val TAG = "AlarmClock"
  private const val PREFS = "wake_or_donate_alarm_clock"
  private const val KEY_ENTRIES = "entries"
  const val ACTION_FIRE = "expo.modules.alarmclock.FIRE"
  const val DEEP_LINK_SCHEME = "wake-or-donate"

  /** [at] is the scheduled ring time, so the server can match the exact occurrence. */
  fun ringUri(alarmId: Int, at: Long = 0): Uri =
    Uri.parse("$DEEP_LINK_SCHEME://alarm/active?id=$alarmId" + if (at > 0) "&at=$at" else "")

  /** Replaces the whole schedule with [entries]. */
  fun apply(context: Context, entries: List<AlarmEntry>) {
    val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    for (old in load(context)) {
      alarmManager.cancel(firePendingIntent(context, old))
    }
    save(context, entries)
    scheduleAll(context, entries)
  }

  /** Re-arms the persisted schedule (after boot, update or a clock change). */
  fun restore(context: Context) {
    scheduleAll(context, load(context))
  }

  private fun scheduleAll(context: Context, entries: List<AlarmEntry>) {
    val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    val now = System.currentTimeMillis()
    for (entry in entries) {
      if (entry.at <= now) continue
      val fire = firePendingIntent(context, entry)
      try {
        val show = PendingIntent.getActivity(
          context, entry.key.hashCode(), launchIntent(context, entry.alarmId, entry.at),
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        alarmManager.setAlarmClock(AlarmManager.AlarmClockInfo(entry.at, show), fire)
      } catch (e: SecurityException) {
        // Exact alarms not allowed (user revoked it): best effort so the alarm still fires
        Log.w(TAG, "Exact alarm not permitted, falling back to inexact", e)
        alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, entry.at, fire)
      }
    }
  }

  fun canScheduleExact(context: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true
    val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    return alarmManager.canScheduleExactAlarms()
  }

  /** Opens the app at the ring screen for [alarmId]. */
  fun launchIntent(context: Context, alarmId: Int, at: Long = 0): Intent {
    val intent = context.packageManager.getLaunchIntentForPackage(context.packageName)
      ?: Intent(Intent.ACTION_MAIN).setPackage(context.packageName)
    return intent
      .setAction(Intent.ACTION_VIEW)
      .setData(ringUri(alarmId, at))
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
  }

  private fun firePendingIntent(context: Context, entry: AlarmEntry): PendingIntent {
    val intent = Intent(context, AlarmReceiver::class.java)
      .setAction(ACTION_FIRE)
      // Unique data so each occurrence gets its own PendingIntent
      .setData(Uri.parse("$DEEP_LINK_SCHEME://fire/${Uri.encode(entry.key)}"))
      .putExtra("alarmId", entry.alarmId)
      .putExtra("at", entry.at)
      .putExtra("title", entry.title)
      .putExtra("body", entry.body)
    return PendingIntent.getBroadcast(
      context, entry.key.hashCode(), intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  /** Upcoming scheduled rings, for the diagnostics screen. */
  fun upcoming(context: Context): List<AlarmEntry> {
    val now = System.currentTimeMillis()
    return load(context).filter { it.at > now }.sortedBy { it.at }
  }

  private fun load(context: Context): List<AlarmEntry> {
    val raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_ENTRIES, null)
      ?: return emptyList()
    return try {
      val array = JSONArray(raw)
      (0 until array.length()).map { AlarmEntry.fromJson(array.getJSONObject(it)) }
    } catch (e: Exception) {
      Log.w(TAG, "Corrupt alarm schedule, ignoring", e)
      emptyList()
    }
  }

  private fun save(context: Context, entries: List<AlarmEntry>) {
    val array = JSONArray()
    entries.forEach { array.put(it.toJson()) }
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
      .putString(KEY_ENTRIES, array.toString()).apply()
  }
}
