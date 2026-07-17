package com.obdsicaklik.izleyici.auto

import android.content.Intent
import androidx.car.app.Screen
import androidx.car.app.Session

class ObdCarSession : Session() {
    override fun onCreateScreen(intent: Intent): Screen = ObdCarScreen(carContext)
}
