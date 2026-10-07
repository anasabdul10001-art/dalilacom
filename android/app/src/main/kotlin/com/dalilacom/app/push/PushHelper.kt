package com.dalilacom.app.push

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.dalilacom.app.MainActivity
import com.dalilacom.app.R
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume

/**
 * Push notifications need the Firebase config file (android/app/google-services.json). Without it the app
 * still builds and runs — these helpers just report "not available" and do nothing.
 */
object PushHelper {
    /** Must match ANDROID_CHANNEL_ID on the server, or the phone drops notifications sent while the app is closed. */
    const val CHANNEL_ID = "dalilacom_default"

    fun available(context: Context): Boolean = runCatching { FirebaseApp.getApps(context).isNotEmpty() }.getOrDefault(false)

    fun ensureChannel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.createNotificationChannel(
            NotificationChannel(CHANNEL_ID, context.getString(R.string.push_channel_name), NotificationManager.IMPORTANCE_HIGH).apply {
                description = context.getString(R.string.push_channel_description)
            },
        )
    }

    /** This phone's current FCM token, or null when Firebase isn't set up or the lookup fails. */
    suspend fun currentToken(context: Context): String? {
        if (!available(context)) return null
        return suspendCancellableCoroutine { continuation ->
            FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
                if (continuation.isActive) continuation.resume(if (task.isSuccessful) task.result else null)
            }
        }
    }

    /** Shows a notification while the app is open (Firebase only draws one itself when the app is in the background). */
    fun show(context: Context, title: String?, body: String?, data: Map<String, String> = emptyMap()) {
        if (title.isNullOrBlank() && body.isNullOrBlank()) return
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
        ensureChannel(context)
        val open = PendingIntent.getActivity(
            context,
            0,
            Intent(Intent.ACTION_VIEW, Uri.parse("dalilacom://app/notifications"), context, MainActivity::class.java).apply {
                // the same keys a tray-tapped push carries, so MainActivity routes both alike
                data.forEach { (key, value) -> putExtra(key, value) }
            },
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setAutoCancel(true)
            .setContentIntent(open)
            .build()
        NotificationManagerCompat.from(context).notify(System.currentTimeMillis().toInt(), notification)
    }
}
