package com.dalilacom.app.data.store

import android.content.Context
import androidx.datastore.preferences.preferencesDataStore

/**
 * The single DataStore instance backing both TokenStore and SessionStore. Jetpack DataStore
 * crashes at runtime ("multiple DataStores active for the same file") if two separate
 * `preferencesDataStore(name = ...)` delegates ever point at the same file — so this must stay
 * the only place that name is declared.
 */
internal val Context.dalilacomDataStore by preferencesDataStore(name = "dalilacom_prefs")
