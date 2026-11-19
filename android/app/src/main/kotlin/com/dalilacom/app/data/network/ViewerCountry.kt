package com.dalilacom.app.data.network

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.setValue

/** The country the person picked (sent with every request, so the shops and the money follow it), and a way for any screen to ask for the city question again. */
object ViewerCountry {
    @Volatile
    var code: String? = null
}

object CityGateRequest {
    var count by mutableIntStateOf(0)
        private set

    fun ask() { count += 1 }
}
