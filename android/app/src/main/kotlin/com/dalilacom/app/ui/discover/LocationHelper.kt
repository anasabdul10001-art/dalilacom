package com.dalilacom.app.ui.discover

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Looper
import androidx.core.content.ContextCompat
import androidx.core.location.LocationManagerCompat
import androidx.core.os.CancellationSignal
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull
import kotlin.coroutines.resume

/** One reading of the position while a trip is going on. */
data class LiveFix(val latitude: Double, val longitude: Double, val accuracy: Float?, val bearing: Float?)

object LocationHelper {
    val PERMISSIONS = arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)

    fun hasPermission(context: Context): Boolean = PERMISSIONS.any {
        ContextCompat.checkSelfPermission(context, it) == PackageManager.PERMISSION_GRANTED
    }

    /** A stream of position readings (about every second while moving) from GPS, with the network position as a fallback. */
    @SuppressLint("MissingPermission")
    fun updates(context: Context): Flow<LiveFix> = callbackFlow {
        val manager = context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager
        if (manager == null || !hasPermission(context)) {
            close()
            return@callbackFlow
        }
        val listener = LocationListener { location ->
            trySend(LiveFix(location.latitude, location.longitude, if (location.hasAccuracy()) location.accuracy else null, if (location.hasBearing()) location.bearing else null))
        }
        for (provider in listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER)) {
            if (runCatching { manager.isProviderEnabled(provider) }.getOrDefault(false)) {
                runCatching { manager.requestLocationUpdates(provider, 1000L, 3f, listener, Looper.getMainLooper()) }
            }
        }
        awaitClose { manager.removeUpdates(listener) }
    }

    /**
     * The user's position without Google Play services: a fresh fix from the best enabled provider
     * (GPS, then network), falling back to the last known one. Null when location is off/unavailable.
     */
    @SuppressLint("MissingPermission")
    suspend fun current(context: Context): Pair<Double, Double>? {
        if (!hasPermission(context)) return null
        val manager = context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager ?: return null
        val providers = listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER)
            .filter { runCatching { manager.isProviderEnabled(it) }.getOrDefault(false) }

        for (provider in providers) {
            val fresh = withTimeoutOrNull(8_000) {
                suspendCancellableCoroutine<Location?> { continuation ->
                    val signal = CancellationSignal()
                    continuation.invokeOnCancellation { signal.cancel() }
                    LocationManagerCompat.getCurrentLocation(
                        manager, provider, signal, ContextCompat.getMainExecutor(context),
                    ) { location -> if (continuation.isActive) continuation.resume(location) }
                }
            }
            if (fresh != null) return fresh.latitude to fresh.longitude
        }
        for (provider in providers) {
            val last = runCatching { manager.getLastKnownLocation(provider) }.getOrNull()
            if (last != null) return last.latitude to last.longitude
        }
        return null
    }
}
