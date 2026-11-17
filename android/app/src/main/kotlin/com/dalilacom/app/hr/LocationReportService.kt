package com.dalilacom.app.hr

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.dalilacom.app.DalilacomApp
import com.dalilacom.app.R
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.time.Instant

/**
 * A driver or distributor's phone reports where it is while they are checked in (the owner turned tracking on for them and the
 * employee agreed on first use). It shows a notification the whole time, sends the positions to the company about once a minute,
 * and stops at check-out, when the server stops accepting positions, or after 12 hours at the most.
 */
class LocationReportService : Service() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val buffer = ArrayList<JsonObject>()
    private var manager: LocationManager? = null
    private val listener = LocationListener { loc -> add(loc) }

    private fun add(loc: Location) {
        val point = buildJsonObject {
            put("latitude", loc.latitude)
            put("longitude", loc.longitude)
            if (loc.hasAccuracy()) put("accuracy", loc.accuracy.toDouble())
            if (loc.hasSpeed()) put("speed", loc.speed.toDouble())
            put("at", Instant.ofEpochMilli(loc.time).toString())
        }
        synchronized(buffer) { buffer.add(point); if (buffer.size > 300) buffer.removeAt(0) }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val channelId = "hr_tracking"
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) nm.createNotificationChannel(NotificationChannel(channelId, getString(R.string.hr_trk_notifTitle), NotificationManager.IMPORTANCE_LOW))
        val notification: Notification = NotificationCompat.Builder(this, channelId)
            .setSmallIcon(R.drawable.ic_stat_dalilacom)
            .setContentTitle(getString(R.string.hr_trk_notifTitle))
            .setOngoing(true)
            .build()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) startForeground(4711, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION) else startForeground(4711, notification)

        val allowed = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
        if (!allowed) { stopSelf(); return START_NOT_STICKY }
        val lm = getSystemService(Context.LOCATION_SERVICE) as LocationManager
        manager = lm
        runCatching {
            for (provider in listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER)) {
                if (lm.isProviderEnabled(provider)) lm.requestLocationUpdates(provider, 30_000L, 25f, listener, Looper.getMainLooper())
            }
        }
        val repo = (application as DalilacomApp).container.hrRepository
        scope.launch {
            val deadline = System.currentTimeMillis() + 12 * 3_600_000L
            while (isActive && System.currentTimeMillis() < deadline) {
                delay(60_000L)
                val batch = synchronized(buffer) { buffer.take(50) }
                if (batch.isEmpty()) continue
                val status = repo.postStatus("hr/me/locations", buildJsonObject { put("points", JsonArray(batch)) })
                when {
                    status in 200..299 -> synchronized(buffer) { repeat(batch.size) { if (buffer.isNotEmpty()) buffer.removeAt(0) } }
                    status == 409 -> break // the server says the employee is not checked in any more: stop for good
                }
            }
            stopSelf()
        }
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        runCatching { manager?.removeUpdates(listener) }
        scope.cancel()
        super.onDestroy()
    }

    companion object {
        fun start(context: Context) = ContextCompat.startForegroundService(context, Intent(context, LocationReportService::class.java))
        fun stop(context: Context) { context.stopService(Intent(context, LocationReportService::class.java)) }
    }
}
