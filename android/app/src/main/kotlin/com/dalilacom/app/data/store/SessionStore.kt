package com.dalilacom.app.data.store

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

/**
 * Locally cached copy of the signed-in user's role, kept in sync with the server after
 * login/register/merchant-registration. The backend re-reads the real role from the DB on
 * every request regardless of this value, so this only drives which UI entry points show —
 * it is never trusted for authorization.
 */
class SessionStore(private val context: Context) {
    private val roleKey = stringPreferencesKey("user_role")
    private val recentKey = stringPreferencesKey("recent_searches")
    private val themeKey = stringPreferencesKey("theme_mode")

    /** "light" or "dark" once the user picked one with the button; null = follow the phone. */
    val themeFlow: Flow<String?> = context.dalilacomDataStore.data.map { it[themeKey] }

    suspend fun saveTheme(mode: String) {
        runCatching { context.dalilacomDataStore.edit { it[themeKey] = mode } }
    }

    val roleFlow: Flow<String?> = context.dalilacomDataStore.data.map { it[roleKey] }

    suspend fun getRole(): String? = runCatching {
        context.dalilacomDataStore.data.map { it[roleKey] }.first()
    }.getOrNull()

    suspend fun saveRole(role: String) {
        runCatching { context.dalilacomDataStore.edit { it[roleKey] = role } }
    }

    suspend fun clearRole() {
        runCatching { context.dalilacomDataStore.edit { it.remove(roleKey) } }
    }

    /** The last few things the user searched for on the map, newest first. */
    suspend fun getRecentSearches(): List<String> = runCatching {
        context.dalilacomDataStore.data.map { it[recentKey] }.first()
    }.getOrNull()?.split("\n")?.filter { it.isNotBlank() }.orEmpty()

    suspend fun pushRecentSearch(query: String) {
        val q = query.trim()
        if (q.isEmpty()) return
        val updated = (listOf(q) + getRecentSearches().filter { it != q }).take(6)
        runCatching { context.dalilacomDataStore.edit { it[recentKey] = updated.joinToString("\n") } }
    }
}
