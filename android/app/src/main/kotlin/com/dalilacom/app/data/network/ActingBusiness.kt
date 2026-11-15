package com.dalilacom.app.data.network

import android.content.Context

/**
 * The business this account works for as staff (null: its own accounting). While it is set, every accounting request
 * names the business (header X-Business-Owner) and the server answers as that business's accounting, within the staff role.
 */
object ActingBusiness {
    @Volatile var ownerId: String? = null
        private set
    /** True only while the marketer tab is on screen: then the offers and announcements calls name the business too. */
    @Volatile var marketing: Boolean = false
    private var appContext: Context? = null
    private const val PREFS = "dalilacom_staff"

    fun init(context: Context) {
        appContext = context.applicationContext
        ownerId = appContext?.getSharedPreferences(PREFS, Context.MODE_PRIVATE)?.getString("owner", null)
    }

    fun set(id: String?) {
        ownerId = id
        appContext?.getSharedPreferences(PREFS, Context.MODE_PRIVATE)?.edit()?.apply { if (id == null) remove("owner") else putString("owner", id) }?.apply()
    }
}
