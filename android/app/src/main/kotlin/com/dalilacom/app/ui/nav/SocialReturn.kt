package com.dalilacom.app.ui.nav

import android.content.Intent

/** What dalilacom://auth/social brought back from a Google/Facebook sign-in: a one-time ticket, or why it did not work. */
data class SocialReturn(val ticket: String?, val error: String?) {
    companion object {
        fun from(intent: Intent?): SocialReturn? {
            val uri = intent?.data ?: return null
            if (uri.scheme != "dalilacom" || uri.host != "auth" || uri.path?.startsWith("/social") != true) return null
            return SocialReturn(ticket = uri.getQueryParameter("ticket"), error = uri.getQueryParameter("social_error"))
        }
    }
}
