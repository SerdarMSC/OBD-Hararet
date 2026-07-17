package expo.modules.obdautobridge

import android.content.Context
import android.content.Intent
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ObdAutoBridgeModule : Module() {
    companion object {
        const val PREFS_NAME = "obd_auto_data"
        const val KEY_TEMPERATURE = "temperature"
        const val KEY_IS_ALERT = "is_alert"
        const val KEY_UPDATED_AT = "updated_at"
        const val ACTION_OBD_UPDATE = "com.obdsicaklik.izleyici.OBD_UPDATE"
    }

    override fun definition() = ModuleDefinition {
        Name("ObdAutoBridge")

        Function("updateTemperature") { temp: Double, isAlert: Boolean ->
            val ctx = appContext.reactContext ?: return@Function
            ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit()
                .putFloat(KEY_TEMPERATURE, temp.toFloat())
                .putBoolean(KEY_IS_ALERT, isAlert)
                .putLong(KEY_UPDATED_AT, System.currentTimeMillis())
                .apply()

            val intent = Intent(ACTION_OBD_UPDATE).apply { setPackage(ctx.packageName) }
            ctx.sendBroadcast(intent)
        }
    }
}
