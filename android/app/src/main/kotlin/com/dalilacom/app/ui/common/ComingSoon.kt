package com.dalilacom.app.ui.common

import android.content.Context
import android.widget.Toast

/** Not open yet: the buttons stay, a tap only says it is coming. Flip these when the Meta app and the auto-responder are ready. */
object ComingSoon {
    const val FACEBOOK_LOGIN = false
    const val RESPONDER = true

    fun say(context: Context, message: String) = Toast.makeText(context, message, Toast.LENGTH_LONG).show()
}
