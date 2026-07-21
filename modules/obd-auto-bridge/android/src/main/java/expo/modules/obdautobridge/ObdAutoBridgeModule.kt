package expo.modules.obdautobridge

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import androidx.core.app.NotificationChannelCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.Person
import androidx.core.app.RemoteInput
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ObdAutoBridgeModule : Module() {
    companion object {
        const val PREFS_NAME = "obd_auto_data"
        const val ACTION_OBD_UPDATE = "com.obdsicaklik.izleyici.OBD_UPDATE"
        const val ACTION_OBD_ACKNOWLEDGE = "com.obdsicaklik.izleyici.OBD_ACKNOWLEDGE_FROM_CAR"
        const val NO_VALUE = -9999.0

        // Dedicated channel for the Android-Auto-visible messaging-style
        // alert. Kept separate from the app's normal alert channels so its
        // importance/behavior can be tuned without affecting phone alerts.
        const val AUTO_CHANNEL_ID = "obd-auto-messages"
        const val AUTO_NOTIFICATION_ID = 4827

        // Actions for the mark-as-read / reply PendingIntents that Android
        // Auto requires on a MessagingStyle notification.
        const val ACTION_MESSAGE_READ = "com.obdsicaklik.izleyici.AUTO_MESSAGE_READ"
        const val ACTION_MESSAGE_REPLY = "com.obdsicaklik.izleyici.AUTO_MESSAGE_REPLY"
        const val REMOTE_INPUT_KEY = "obd_auto_reply"
    }

    private var receiver: BroadcastReceiver? = null

    override fun definition() = ModuleDefinition {
        Name("ObdAutoBridge")

        Events("onAcknowledgeFromCar")

        OnCreate {
            val ctx = appContext.reactContext ?: return@OnCreate
            ensureAutoChannel(ctx)
            val r = object : BroadcastReceiver() {
                override fun onReceive(context: Context?, intent: Intent?) {
                    sendEvent("onAcknowledgeFromCar", mapOf<String, Any?>())
                }
            }
            receiver = r
            val filter = IntentFilter(ACTION_OBD_ACKNOWLEDGE)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                ctx.registerReceiver(r, filter, Context.RECEIVER_NOT_EXPORTED)
            } else {
                @Suppress("UnspecifiedRegisterReceiverFlag")
                ctx.registerReceiver(r, filter)
            }
        }

        OnDestroy {
            receiver?.let {
                try {
                    appContext.reactContext?.unregisterReceiver(it)
                } catch (_: Exception) {
                }
            }
        }

        Function("updateSensor") { key: String, enabled: Boolean, value: Double, isAlert: Boolean ->
            try {
                val ctx = appContext.reactContext
                if (ctx != null) {
                    ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                        .edit()
                        .putBoolean("${key}_enabled", enabled)
                        .putFloat("${key}_value", value.toFloat())
                        .putBoolean("${key}_alert", isAlert)
                        .putLong("${key}_updatedAt", System.currentTimeMillis())
                        .apply()

                    val intent = Intent(ACTION_OBD_UPDATE).apply { setPackage(ctx.packageName) }
                    ctx.sendBroadcast(intent)
                }
            } catch (_: Throwable) {
                // Never let an Android Auto bridge failure crash the app —
                // the phone-side monitoring/alerting must keep working.
            }
            null
        }

        // Posts (or updates) a MessagingStyle notification. This is the same
        // mechanism messaging apps like WhatsApp use to have their alerts
        // shown as heads-up cards on the Android Auto display — Android Auto
        // only surfaces notifications in the Messages/Reminders/etc.
        // categories, and MessagingStyle is what marks a notification as a
        // "message". We package our sensor alert text as a single-message
        // conversation so it renders on the car screen.
        Function("postAutoMessage") { title: String, body: String ->
            try {
                val ctx = appContext.reactContext
                if (ctx != null) {
                    postAutoMessage(ctx, title, body)
                }
            } catch (_: Throwable) {
                // Building/posting the car notification must never crash the
                // app — the phone-side alert (sound + overlay) still fires.
            }
            null
        }

        // Removes the Android Auto message notification (e.g. after the
        // alert has been acknowledged / temperature dropped back to normal).
        Function("clearAutoMessage") {
            try {
                val ctx = appContext.reactContext
                if (ctx != null) {
                    NotificationManagerCompat.from(ctx).cancel(AUTO_NOTIFICATION_ID)
                }
            } catch (_: Throwable) {
                // ignore — nothing to clean up we can safely act on
            }
            null
        }
    }

    private fun ensureAutoChannel(ctx: Context) {
        val channel = NotificationChannelCompat.Builder(
            AUTO_CHANNEL_ID,
            NotificationManagerCompat.IMPORTANCE_HIGH,
        )
            .setName("Araç ekranı uyarıları")
            .setDescription("Android Auto ekranında görünen sürüş uyarıları")
            .build()
        NotificationManagerCompat.from(ctx).createNotificationChannel(channel)
    }

    private fun postAutoMessage(ctx: Context, title: String, body: String) {
        // Android Auto requires both a reply and a mark-as-read action on a
        // MessagingStyle notification. We don't want real user-facing reply
        // UI (this isn't a chat), so both point at no-op broadcast receivers
        // and are marked as showing no UI.
        val readIntent = Intent(ACTION_MESSAGE_READ).setPackage(ctx.packageName)
        val readPending = PendingIntent.getBroadcast(
            ctx, 0, readIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val replyIntent = Intent(ACTION_MESSAGE_REPLY).setPackage(ctx.packageName)
        val replyPending = PendingIntent.getBroadcast(
            ctx, 1, replyIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE,
        )
        val remoteInput = RemoteInput.Builder(REMOTE_INPUT_KEY).setLabel("Yanıt").build()

        val markAsReadAction = NotificationCompat.Action.Builder(
            android.R.drawable.ic_menu_view, "Okundu", readPending,
        )
            .setSemanticAction(NotificationCompat.Action.SEMANTIC_ACTION_MARK_AS_READ)
            .setShowsUserInterface(false)
            .build()

        val replyAction = NotificationCompat.Action.Builder(
            android.R.drawable.ic_menu_send, "Yanıtla", replyPending,
        )
            .setSemanticAction(NotificationCompat.Action.SEMANTIC_ACTION_REPLY)
            .setShowsUserInterface(false)
            .addRemoteInput(remoteInput)
            .build()

        // The "sender" of our synthetic conversation is the app/vehicle.
        val sender = Person.Builder().setName("Motor İzleyici").build()
        val messagingStyle = NotificationCompat.MessagingStyle(sender)
            .setConversationTitle(title)
            .addMessage(body, System.currentTimeMillis(), sender)

        val appIconRes = ctx.applicationInfo.icon

        val notification = NotificationCompat.Builder(ctx, AUTO_CHANNEL_ID)
            .setSmallIcon(appIconRes)
            .setStyle(messagingStyle)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .addAction(markAsReadAction)
            .addAction(replyAction)
            .setAutoCancel(true)
            .build()

        try {
            ensureAutoChannel(ctx)
            NotificationManagerCompat.from(ctx).notify(AUTO_NOTIFICATION_ID, notification)
        } catch (_: Throwable) {
            // POST_NOTIFICATIONS not granted, or an OEM notification quirk —
            // the phone-side alert (sound + overlay) still fires regardless.
        }
    }
}
