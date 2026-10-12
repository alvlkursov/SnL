package expo.modules.alarmclock

import android.app.NotificationManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.provider.Settings
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONArray
import java.lang.ref.WeakReference

class AlarmClockModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("AlarmClock")

    // An alarm just fired while the app is on screen: the app opens the ring screen itself
    // and rings from there, so nothing lands in the notification tray
    Events("onRing")

    // The app took over a ring from onRing; without this the tray notification is shown after all
    Function("ackRing") { alarmId: Int ->
      pendingHandoffs.remove(alarmId)
      Unit
    }

    OnCreate { current = WeakReference(this@AlarmClockModule) }
    OnDestroy { if (current?.get() === this@AlarmClockModule) current = null }

    // entriesJson: [{ key, alarmId, at, title, body }]
    Function("setSchedule") { entriesJson: String ->
      val array = JSONArray(entriesJson)
      val entries = (0 until array.length()).map { AlarmEntry.fromJson(array.getJSONObject(it)) }
      AlarmScheduler.apply(context, entries)
    }

    // The user dealt with this ring on the ring screen: silence it and stop showing over the lock screen
    Function("stopRinging") { alarmId: Int ->
      RingNotification.cancel(context, alarmId)
      AlarmLockScreen.release()
    }

    // Silence a ring without touching the lock screen (e.g. its alarm was switched off)
    Function("cancelRing") { alarmId: Int ->
      RingNotification.cancel(context, alarmId)
    }

    // Upcoming scheduled rings as JSON: [{ key, alarmId, at, title, body }]
    Function("getSchedule") {
      val array = JSONArray()
      AlarmScheduler.upcoming(context).forEach { array.put(it.toJson()) }
      array.toString()
    }

    // Last fires on this phone as JSON: [{ time, key, alarmId, outcome }]
    Function("getFireLog") {
      AlarmScheduler.fireLog(context)
    }

    Function("getStatus") {
      val notifications = (context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
        .areNotificationsEnabled()
      mapOf(
        "notifications" to notifications,
        "exactAlarms" to AlarmScheduler.canScheduleExact(context),
        "fullScreen" to RingNotification.canUseFullScreen(context),
        "overlay" to Settings.canDrawOverlays(context),
        "batteryUnrestricted" to (context.getSystemService(Context.POWER_SERVICE) as PowerManager)
          .isIgnoringBatteryOptimizations(context.packageName),
        "isXiaomi" to isXiaomi(),
      )
    }

    // target: app | notifications | exactAlarms | fullScreen | overlay | battery | xiaomiAutostart | xiaomiPermissions
    Function("openSettings") { target: String ->
      val pkg = context.packageName
      val candidates = when (target) {
        "notifications" -> listOf(
          Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, pkg),
        )
        "exactAlarms" -> if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
          listOf(Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:$pkg")))
        } else emptyList()
        "fullScreen" -> if (Build.VERSION.SDK_INT >= 34) {
          listOf(Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:$pkg")))
        } else emptyList()
        "battery" -> listOf(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
        "overlay" -> listOf(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:$pkg")))
        "xiaomiAutostart" -> listOf(
          Intent().setComponent(ComponentName("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity")),
        )
        "xiaomiPermissions" -> listOf(
          Intent("miui.intent.action.APP_PERM_EDITOR")
            .setClassName("com.miui.securitycenter", "com.miui.permcenter.permissions.PermissionsEditorActivity")
            .putExtra("extra_pkgname", pkg),
          Intent("miui.intent.action.APP_PERM_EDITOR")
            .setClassName("com.miui.securitycenter", "com.miui.permcenter.permissions.AppPermissionsEditorActivity")
            .putExtra("extra_pkgname", pkg),
        )
        else -> emptyList()
      }
      // Fall back to the app's system settings page if the specific screen doesn't exist
      val appDetails = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$pkg"))
      openFirst(candidates + appDetails)
    }
  }

  companion object {
    private const val HANDOFF_TIMEOUT_MS = 4000L
    private var current: WeakReference<AlarmClockModule>? = null
    private val pendingHandoffs = java.util.concurrent.ConcurrentHashMap<Int, Long>()

    /**
     * Hands a ring to the running app instead of posting the ringing notification. If the app
     * doesn't confirm with ackRing in time (no JS listening), the notification is shown after all.
     * False when no app is running to hand off to.
     */
    fun handOffRing(context: Context, alarmId: Int, at: Long, title: String, body: String): Boolean {
      val module = current?.get() ?: return false
      pendingHandoffs[alarmId] = at
      try {
        module.sendEvent("onRing", mapOf("alarmId" to alarmId, "at" to at.toDouble()))
      } catch (_: Exception) {
        pendingHandoffs.remove(alarmId)
        return false
      }
      val appContext = context.applicationContext
      Handler(Looper.getMainLooper()).postDelayed({
        if (pendingHandoffs.remove(alarmId, at)) RingNotification.show(appContext, alarmId, at, title, body)
      }, HANDOFF_TIMEOUT_MS)
      return true
    }
  }

  private fun isXiaomi(): Boolean {
    val brand = "${Build.MANUFACTURER} ${Build.BRAND}".lowercase()
    return listOf("xiaomi", "redmi", "poco").any { brand.contains(it) }
  }

  private fun openFirst(intents: List<Intent>): Boolean {
    // Start from the visible activity: MIUI silently blocks activity starts from the app context
    // ("background pop-ups"), which is exactly the permission these screens are meant to grant
    val activity = appContext.currentActivity
    for (intent in intents) {
      try {
        if (activity != null) {
          if (intent.resolveActivity(context.packageManager) == null && intent.component == null) continue
          activity.startActivity(intent)
        } else {
          context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }
        return true
      } catch (_: Exception) {
        // Screen not available on this device/ROM; try the next one
      }
    }
    return false
  }
}
