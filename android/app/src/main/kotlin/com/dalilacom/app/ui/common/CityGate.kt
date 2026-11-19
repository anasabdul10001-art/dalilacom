package com.dalilacom.app.ui.common

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.dalilacom.app.R
import com.dalilacom.app.data.AppContainer
import com.dalilacom.app.data.network.CityGateRequest
import com.dalilacom.app.data.network.GeoUnitDto
import com.dalilacom.app.data.network.PlaceDto
import com.dalilacom.app.data.network.ViewerCountry
import com.dalilacom.app.ui.i18n.AppStrings
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * The person's country and city, asked once: the first time the app is used, or the first sign-in. The place is guessed from the
 * connection (one tap to confirm); otherwise they pick any country of the world and search their city. Without it area announcements
 * cannot reach them. A signed-in person's city lives on the account (a choice made before signing in is copied there); a visitor's stays on the phone.
 */
@Composable
fun CityGate(container: AppContainer, signedInKey: Boolean) {
    val scope = rememberCoroutineScope()
    var countries by remember { mutableStateOf<List<GeoUnitDto>>(emptyList()) }
    var country by remember { mutableStateOf<GeoUnitDto?>(null) }
    var detected by remember { mutableStateOf<PlaceDto?>(null) }
    var searching by remember { mutableStateOf(false) }
    var searched by remember { mutableStateOf(false) }
    var query by remember { mutableStateOf("") }
    var results by remember { mutableStateOf<List<PlaceDto>>(emptyList()) }
    var open by remember { mutableStateOf(false) }
    var menu by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var failed by remember { mutableStateOf(false) }
    val again = CityGateRequest.count

    LaunchedEffect(signedInKey, again) {
        val store = container.sessionStore
        val mine = store.getCityId()
        var profileCountry: String? = null
        if (again == 0) { // the question again (from the account screen) skips the "already answered" checks
            if (container.authRepository.hasStoredSession()) {
                val p = container.accountRepository.profile() ?: return@LaunchedEffect
                if (p.cityId != null) {
                    if (mine != p.cityId) store.saveCity(p.cityId, p.countryCode.orEmpty())
                    return@LaunchedEffect
                }
                if (mine != null) {
                    container.accountRepository.update(countryCode = store.getCityCountry(), cityId = mine)
                    return@LaunchedEffect
                }
                profileCountry = p.countryCode
            } else if (mine != null) {
                return@LaunchedEffect
            }
        }
        val list = container.accountRepository.countries()
        if (list.isEmpty()) return@LaunchedEffect
        val guess = container.accountRepository.detectPlace()
        val code = profileCountry ?: guess?.country ?: store.getCityCountry()
        val c = list.firstOrNull { it.isoCode2 == code } ?: list.first()
        countries = list.sortedBy { if (AppStrings.language == "ar") (it.nameArabic ?: it.name) else (it.nameEnglish ?: it.name) }
        country = c
        detected = guess?.city?.takeIf { it.country == c.isoCode2 }
        query = ""; results = emptyList(); searched = false; failed = false
        open = true
    }

    // search while typing (a short pause first, so a word being typed is not asked letter by letter)
    LaunchedEffect(query, country?.isoCode2) {
        val iso = country?.isoCode2 ?: return@LaunchedEffect
        if (query.trim().length < 2) { results = emptyList(); searched = false; searching = false; return@LaunchedEffect }
        delay(450)
        searching = true
        results = container.accountRepository.searchCities(iso, query.trim())
        searching = false
        searched = true
    }

    if (!open) return
    fun name(u: GeoUnitDto) = if (AppStrings.language == "ar") (u.nameArabic ?: u.name) else (u.nameEnglish ?: u.name)

    fun pick(place: PlaceDto) {
        busy = true; failed = false
        scope.launch {
            val picked = container.accountRepository.pickCity(place.token)
            if (picked == null) { busy = false; failed = true; return@launch }
            val code = picked.country.isoCode2.orEmpty()
            val saved = if (container.authRepository.hasStoredSession()) container.accountRepository.update(countryCode = code, cityId = picked.city.id).isSuccess else true
            busy = false
            if (saved) {
                container.sessionStore.saveCity(picked.city.id, code)
                ViewerCountry.code = code.takeIf { it.length == 2 } // the shops and the money follow the chosen country
                open = false
            } else failed = true
        }
    }

    val guess = detected
    AlertDialog(
        onDismissRequest = {},
        title = { Text("📍  " + stringResource(R.string.city_title)) },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                Text(stringResource(R.string.city_sub), style = MaterialTheme.typography.bodyMedium)
                Spacer(Modifier.height(12.dp))
                LanguageChips()
                Spacer(Modifier.height(12.dp))
                if (guess != null) {
                    Text(stringResource(R.string.city_detected, guess.name + " - " + (country?.let { name(it) } ?: "")), style = MaterialTheme.typography.titleMedium)
                    Spacer(Modifier.height(12.dp))
                    Button(onClick = { pick(guess) }, enabled = !busy, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.city_yes)) }
                    OutlinedButton(onClick = { detected = null }, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.city_change)) }
                } else {
                    Text(stringResource(R.string.city_country), style = MaterialTheme.typography.labelMedium)
                    OutlinedButton(onClick = { menu = true }, modifier = Modifier.fillMaxWidth()) { Text(country?.let { name(it) } ?: "") }
                    DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                        countries.forEach { c -> DropdownMenuItem(text = { Text(name(c)) }, onClick = { country = c; query = ""; menu = false }) }
                    }
                    Spacer(Modifier.height(8.dp))
                    OutlinedTextField(
                        value = query,
                        onValueChange = { query = it },
                        label = { Text(stringResource(R.string.city_search)) },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Column(Modifier.heightIn(max = 220.dp).verticalScroll(rememberScrollState())) {
                        if (searching) Text(stringResource(R.string.city_searching), style = MaterialTheme.typography.bodySmall)
                        else if (results.isNotEmpty()) results.forEach { r ->
                            TextButton(onClick = { pick(r) }, enabled = !busy, modifier = Modifier.fillMaxWidth()) {
                                Text("📍 " + r.name + (r.detail?.let { " ($it)" } ?: ""), modifier = Modifier.fillMaxWidth())
                            }
                        } else if (searched) Text(stringResource(R.string.city_none), style = MaterialTheme.typography.bodySmall)
                    }
                }
                if (failed) Text(stringResource(R.string.city_failed), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            }
        },
        confirmButton = {},
        dismissButton = { TextButton(onClick = { open = false }) { Text(stringResource(R.string.city_later)) } },
    )
}
