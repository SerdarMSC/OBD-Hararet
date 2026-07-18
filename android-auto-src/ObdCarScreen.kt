package com.obdsicaklik.izleyici.auto

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.SharedPreferences
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

    private data class SensorReading(
        val label: String,
        val enabled: Boolean,
        val hasValue: Boolean,
        val value: Float,
        val unit: String,
        val isAlert: Boolean,
    )

    private fun readSensor(prefs: SharedPreferences, key: String, label: String, unit: String): SensorReading {
        val enabled = prefs.getBoolean("${key}_enabled", false)
        val value = prefs.getFloat("${key}_value", NO_VALUE)
        val hasValue = value != NO_VALUE
        val isAlert = prefs.getBoolean("${key}_alert", false)
        return SensorReading(label, enabled, hasValue, value, unit, isAlert)
    }

    override fun onGetTemplate(): Template {
        val prefs = carContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

        val coolant = readSensor(prefs, "coolant", "Motor sıcaklığı", "°C")
        val voltage = readSensor(prefs, "voltage", "Akü voltajı", "V")
        val oilTemp = readSensor(prefs, "oilTemp", "Yağ sıcaklığı", "°C")
        val egt = readSensor(prefs, "egt", "EGT sıcaklığı", "°C")

        // Coolant is always the "connected at all?" signal — it's the one
        // sensor that's never independently toggleable.
        if (!coolant.hasValue) {
            return MessageTemplate.Builder(
                "OBD adaptörüne bağlanılmadı.\nTelefondaki uygulamadan bağlantı kurun."
            )
                .setTitle("Motor Sıcaklığı")
                .setHeaderAction(Action.APP_ICON)
                .build()
        }

        val allSensors = listOf(coolant, voltage, oilTemp, egt)
        val activeAlerts = allSensors.filter { it.enabled && it.hasValue && it.isAlert }
        val normalRows = allSensors.filter { it.enabled && it.hasValue }

        if (activeAlerts.isNotEmpty()) {
            val body = activeAlerts.joinToString("\n") { "${it.label}: ${formatValue(it.value)}${it.unit}" }
            return MessageTemplate.Builder("$body\n\nAracı kontrol edin.")
                .setTitle(if (activeAlerts.size > 1) "BİRDEN FAZLA UYARI!" else "UYARI!")
                .setHeaderAction(Action.APP_ICON)
                .addAction(
                    Action.Builder()
                        .setTitle("Tamam")
                        .setBackgroundColor(CarColor.RED)
                        .setOnClickListener {
                            val ackIntent = Intent(ACTION_OBD_ACKNOWLEDGE).apply {
                                setPackage(carContext.packageName)
                            }
                            carContext.sendBroadcast(ackIntent)
                            invalidate()
                        }
                        .build()
                )
                .build()
        }

        val body = normalRows.joinToString("\n") { "${it.label}: ${formatValue(it.value)}${it.unit}" }
        return MessageTemplate.Builder(body)
            .setTitle("Motor Sıcaklığı")
            .setHeaderAction(Action.APP_ICON)
            .build()
    }

    private fun formatValue(value: Float): String {
        return if (value == value.toInt().toFloat()) value.toInt().toString() else value.toString()
    }

    companion object {
        const val PREFS_NAME = "obd_auto_data"
        const val NO_VALUE = -9999.0f
        const val ACTION_OBD_UPDATE = "com.obdsicaklik.izleyici.OBD_UPDATE"
        const val ACTION_OBD_ACKNOWLEDGE = "com.obdsicaklik.izleyici.OBD_ACKNOWLEDGE_FROM_CAR"
    }
}
