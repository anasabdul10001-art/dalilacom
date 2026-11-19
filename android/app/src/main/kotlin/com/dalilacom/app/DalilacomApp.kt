package com.dalilacom.app

import android.app.Application
import com.dalilacom.app.data.AppContainer
import com.dalilacom.app.push.PushHelper

/** Owns the one AppContainer, so the activity and the push service share the same repositories. */
class DalilacomApp : Application() {
    val container: AppContainer by lazy { AppContainer(this) }

    override fun onCreate() {
        super.onCreate()
        com.dalilacom.app.data.network.PhoneIdentity.init(this)
        com.dalilacom.app.data.network.ViewerCountry.code = kotlinx.coroutines.runBlocking { container.sessionStore.getCityCountry() }?.takeIf { it.length == 2 }
        PushHelper.ensureChannel(this)
    }
}
