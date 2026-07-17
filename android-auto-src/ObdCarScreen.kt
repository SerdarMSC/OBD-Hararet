package com.obdsicaklik.izleyici.auto

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import androidx.car.app.CarContext
import androidx.car.app.Screen
import androidx.car.app.model.Action
import androidx.car.app.model.CarColor
import androidx.car.app.model.MessageTemplate
import androidx.car.app.model.Template
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner

class ObdCarScreen(carContext: CarContext) : Screen(carContext) {

    private val receiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            invalidate()
        }
    }

    init {
        lifecycle.addObserver(object : DefaultLifecycleObserver {
            override fun onStart(owner: LifecycleOwner) {
                val filter = IntentFilter(ACTION_OBD_UPDATE)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    carContext.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
                } else {
                    @Suppress("UnspecifiedRegisterReceiverFlag")
                    carContext.registerReceiver(receiver, filter)
                }
            }

            override fun onStop(owner: LifecycleOwner) {
                try {
                    carContext.unregisterReceiver(receiver)
                } catch (_: Exception) {
                }
            }
        })
    }

    override fun onGetTemplate(): Template {
        val prefs = carContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val tempFloat = prefs.getFloat(KEY_TEMPERATURE, Float.MIN_VALUE)
        val isAlert = prefs.getBoolean(KEY_IS_ALERT, false)
        val updatedAt = prefs.getLong(KEY_UPDATED_AT, 0L)

        val hasData = tempFloat != Float.MIN_VALUE && updatedAt > 0L

        return when {
            !hasData ->
                MessageTemplate.Builder(
                    "OBD adaptörüne bağlanılmadı.\nTelefondaki uygulamadan bağlantı kurun."
                )
                    .setTitle("Motor Sıcaklığı")
                    .setHeaderAction(Action.APP_ICON)
                    .build()

            isAlert ->
                MessageTemplate.Builder(
                    "Motor sıcaklığı kritik!\n${tempFloat.toInt()}°C"
                )
                    .setTitle("SICAKLIK UYARISI")
                    .setHeaderAction(Action.APP_ICON)
                    .addAction(
                        Action.Builder()
                            .setTitle("Tamam")
                            .setBackgroundColor(CarColor.RED)
                            .setOnClickListener { invalidate() }
                            .build()
                    )
                    .build()

            else ->
                MessageTemplate.Builder(
                    "${tempFloat.toInt()}°C\nMotor sıcaklığı normal."
                )
                    .setTitle("Motor Sıcaklığı")
                    .setHeaderAction(Action.APP_ICON)
                    .build()
        }
    }

    companion object {
        const val PREFS_NAME = "obd_auto_data"
        const val KEY_TEMPERATURE = "temperature"
        const val KEY_IS_ALERT = "is_alert"
        const val KEY_UPDATED_AT = "updated_at"
        const val ACTION_OBD_UPDATE = "com.obdsicaklik.izleyici.OBD_UPDATE"
    }
}
