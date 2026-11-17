package com.dalilacom.app.data.network

import android.content.Context
import android.os.Build
import android.provider.Settings

/** Which phone this is, sent with the employee's own HR calls so the company can keep attendance to the one registered phone. */
object PhoneIdentity {
    var id: String? = null
        private set
    var name: String = ""
        private set

    fun init(context: Context) {
        id = runCatching { Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID) }.getOrNull()?.takeIf { it.isNotBlank() }
        // header values must be plain ASCII
        name = "${Build.MANUFACTURER} ${Build.MODEL}".filter { it.code in 32..126 }.trim().take(80)
    }
}
