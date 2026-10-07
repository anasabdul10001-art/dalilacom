package com.dalilacom.app.push

import com.dalilacom.app.DalilacomApp
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class DalilacomMessagingService : FirebaseMessagingService() {

    /** Firebase rotated this phone's token: tell the server (it ignores the call when nobody is signed in). */
    override fun onNewToken(token: String) {
        val container = (application as DalilacomApp).container
        CoroutineScope(Dispatchers.IO).launch { container.notificationRepository.registerToken(token) }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        PushHelper.show(this, message.notification?.title ?: message.data["title"], message.notification?.body ?: message.data["body"], message.data)
    }
}
