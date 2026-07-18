package expo.modules.obdautobridge

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ObdAutoBridgeModule : Module() {
    companion object {
        const val PREFS_NAME = "obd_auto_data"
        const val ACTION_OBD_UPDATE = "com.obdsicaklik.izleyici.OBD_UPDATE"
        const val ACTION_OBD_ACKNOWLEDGE = "com.obdsicaklik.izleyici.OBD_ACKNOWLEDGE_FROM_CAR"
        // Sentinel used instead of a nullable Double for "this sensor has no
        // value right now" — keeps the bridge function signature simple and
        // consistent with the original 2-arg updateTemperature() that's
        // already confirmed to compile and work.
        const val NO_VALUE = -9999.0
    }

    private var receiver: BroadcastReceiver? = null

    override fun definition() = ModuleDefinition {
        Name("ObdAutoBridge")

        // Fired when the user taps "Tamam" on the Android Auto screen while
        // an alert is showing, so the phone-side JS can acknowledge it too
        // (stop the looping alarm sound, dismiss the phone's own overlay).
        Events("onAcknowledgeFromCar")

        OnCreate {
            val ctx = appContext.reactContext ?: return@OnCreate
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
                    // already unregistered — ignore
                }
            }
        }

        // key: "coolant" | "voltage" | "oilTemp" | "egt"
        // value: NO_VALUE (-9999.0) means "this sensor has no reading right now"
        Function("updateSensor") { key: String, enabled: Boolean, value: Double, isAlert: Boolean ->
            val ctx = appContext.reactContext ?: return@Function
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
    }
}
