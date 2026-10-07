package com.dalilacom.app.data.repository

import android.content.Context
import com.dalilacom.app.data.network.ApiService
import com.dalilacom.app.data.network.DeviceRequest
import com.dalilacom.app.data.network.NotificationDto
import com.dalilacom.app.data.network.NotificationPreferenceDto
import com.dalilacom.app.data.network.NotificationPreferencesRequest
import com.dalilacom.app.data.network.UnregisterDeviceRequest
import com.dalilacom.app.data.network.safeApiCall
import com.dalilacom.app.push.PushHelper

/** The inbox, the per-type preferences and this phone's push registration. */
class NotificationRepository(private val api: ApiService, private val context: Context) {

    data class Inbox(val items: List<NotificationDto>, val unread: Int)

    suspend fun inbox(): Inbox? {
        val response = safeApiCall { api.getNotifications() } ?: return null
        val body = response.body()
        return if (response.isSuccessful && body != null) Inbox(body.items, body.unread) else null
    }

    suspend fun unreadCount(): Int {
        val response = safeApiCall { api.getUnreadCount() } ?: return 0
        return if (response.isSuccessful) response.body()?.unread ?: 0 else 0
    }

    suspend fun markRead(id: String) {
        safeApiCall { api.markNotificationRead(id) }
    }

    suspend fun markAllRead() {
        safeApiCall { api.markAllNotificationsRead() }
    }

    suspend fun preferences(): List<NotificationPreferenceDto> {
        val response = safeApiCall { api.getNotificationPreferences() } ?: return emptyList()
        return if (response.isSuccessful) response.body().orEmpty() else emptyList()
    }

    suspend fun setPreference(preference: NotificationPreferenceDto): List<NotificationPreferenceDto>? {
        val response = safeApiCall { api.setNotificationPreferences(NotificationPreferencesRequest(listOf(preference))) } ?: return null
        return if (response.isSuccessful) response.body() else null
    }

    /** Tells the server this phone's FCM token belongs to the signed-in account. Silent when Firebase isn't set up. */
    suspend fun registerCurrentDevice() {
        PushHelper.currentToken(context)?.let { registerToken(it) }
    }

    suspend fun registerToken(token: String) {
        safeApiCall { api.registerDevice(DeviceRequest(token)) }
    }

    /** Sign-out: stop this account's notifications reaching this phone. */
    suspend fun unregisterCurrentDevice() {
        val token = PushHelper.currentToken(context) ?: return
        safeApiCall { api.unregisterDevice(UnregisterDeviceRequest(token)) }
    }
}
