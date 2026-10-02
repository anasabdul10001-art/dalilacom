package com.dalilacom.app.data.store

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext

/**
 * The JWT is the one real credential this app stores locally, so it lives in Keystore-backed
 * EncryptedSharedPreferences rather than plain DataStore (section: Android Token Storage — a
 * plaintext DataStore file combined with android:allowBackup="true" made the token extractable
 * via `adb backup` on a non-rooted device). [[SessionStore]] still uses plain DataStore, which is
 * fine: it only caches a non-authoritative UI hint, never a credential.
 *
 * [migrateFromLegacyStoreIfNeeded] performs a one-time transparent migration of any token left
 * over in the old plaintext store, so upgrading the app does not force existing signed-in users
 * to log out.
 */
class TokenStore(private val context: Context) {
    private val legacyTokenKey = stringPreferencesKey("auth_token")
    private val secureTokenKey = "auth_token"
    private var migrated = false

    private val securePrefs by lazy {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        EncryptedSharedPreferences.create(
            context,
            "dalilacom_secure_prefs",
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    private suspend fun migrateFromLegacyStoreIfNeeded() {
        if (migrated) return
        migrated = true
        runCatching {
            if (!securePrefs.contains(secureTokenKey)) {
                val legacyToken = context.dalilacomDataStore.data.map { it[legacyTokenKey] }.first()
                if (legacyToken != null) {
                    securePrefs.edit().putString(secureTokenKey, legacyToken).apply()
                }
            }
            context.dalilacomDataStore.edit { it.remove(legacyTokenKey) }
        }
    }

    /** A locally corrupted/unreadable secure store means "not signed in", not a crash. */
    suspend fun getToken(): String? = withContext(Dispatchers.IO) {
        migrateFromLegacyStoreIfNeeded()
        runCatching { securePrefs.getString(secureTokenKey, null) }.getOrNull()
    }

    suspend fun saveToken(token: String) = withContext(Dispatchers.IO) {
        runCatching { securePrefs.edit().putString(secureTokenKey, token).apply() }
        Unit
    }

    suspend fun clearToken() = withContext(Dispatchers.IO) {
        runCatching { securePrefs.edit().remove(secureTokenKey).apply() }
        Unit
    }
}
