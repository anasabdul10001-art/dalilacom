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
    private val languageKey = stringPreferencesKey("app_language")
    private val shareLocationKey = androidx.datastore.preferences.core.booleanPreferencesKey("share_location")

    /** The person's own opt-in to let nearby shops reach them: the app reports its position to the server only while this is on. */
    val shareLocationFlow: Flow<Boolean> = context.dalilacomDataStore.data.map { it[shareLocationKey] ?: false }

    suspend fun getShareLocation(): Boolean = runCatching { shareLocationFlow.first() }.getOrDefault(false)

    suspend fun setShareLocation(on: Boolean) {
        runCatching { context.dalilacomDataStore.edit { it[shareLocationKey] = on } }
    }

    private val dealsIntroKey = androidx.datastore.preferences.core.booleanPreferencesKey("deals_intro_hidden")

    /** Whether the person asked never to see the message that opens the deals tab again. */
    suspend fun getDealsIntroHidden(): Boolean = runCatching { context.dalilacomDataStore.data.map { it[dealsIntroKey] ?: false }.first() }.getOrDefault(false)

    suspend fun hideDealsIntro() {
        runCatching { context.dalilacomDataStore.edit { it[dealsIntroKey] = true } }
    }

    /** The language the user picked; null = the default (Arabic). */
    val languageFlow: Flow<String?> = context.dalilacomDataStore.data.map { it[languageKey] }

    suspend fun getLanguage(): String? = runCatching { languageFlow.first() }.getOrNull()

    suspend fun saveLanguage(code: String) {
        runCatching { context.dalilacomDataStore.edit { it[languageKey] = code } }
    }

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
