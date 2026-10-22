package com.dalilacom.app.ui.common

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
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
import com.dalilacom.app.data.network.GeoUnitDto
import com.dalilacom.app.ui.i18n.AppStrings
import kotlinx.coroutines.launch

/**
 * The person's city, asked once: the first time the app is used, or the first sign-in. Without it area announcements cannot reach them.
 * A signed-in person's city lives on the account (a choice made before signing in is copied there); a visitor's stays on the phone.
 */
@Composable
fun CityGate(container: AppContainer, signedInKey: Boolean) {
    val scope = rememberCoroutineScope()
    var cities by remember { mutableStateOf<List<GeoUnitDto>>(emptyList()) }
    var country by remember { mutableStateOf<GeoUnitDto?>(null) }
    var picked by remember { mutableStateOf<GeoUnitDto?>(null) }
    var open by remember { mutableStateOf(false) }
    var menu by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var failed by remember { mutableStateOf(false) }

    LaunchedEffect(signedInKey) {
        val store = container.sessionStore
        val mine = store.getCityId()
        var profileCountry: String? = null
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
        // the country is told from the account or the connection (one country today): only the city is asked
        val countries = container.accountRepository.countries()
        val c = countries.firstOrNull { profileCountry != null && it.isoCode2 == profileCountry } ?: countries.firstOrNull() ?: return@LaunchedEffect
        val list = container.accountRepository.units(c.id, "CITY", null)
        if (list.isEmpty()) return@LaunchedEffect // no cities set up yet
        country = c
        cities = list
        open = true
    }

    if (!open) return
    fun name(u: GeoUnitDto) = if (AppStrings.language == "ar") (u.nameArabic ?: u.name) else (u.nameEnglish ?: u.name)

    AlertDialog(
        onDismissRequest = {}, // it cannot be skipped
        title = { Text("📍  " + stringResource(R.string.city_title)) },
        text = {
            Column {
                Text(stringResource(R.string.city_sub), style = MaterialTheme.typography.bodyMedium)
                Spacer(Modifier.height(12.dp))
                OutlinedButton(onClick = { menu = true }, modifier = Modifier.fillMaxWidth()) {
                    Text(picked?.let { name(it) } ?: stringResource(R.string.city_choose))
                }
                DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                    cities.forEach { c -> DropdownMenuItem(text = { Text(name(c)) }, onClick = { picked = c; menu = false }) }
                }
                if (failed) Text(stringResource(R.string.city_failed), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            }
        },
        confirmButton = {
            Button(
                enabled = picked != null && !busy,
                onClick = {
                    val city = picked ?: return@Button
                    val code = country?.isoCode2.orEmpty()
                    busy = true; failed = false
                    scope.launch {
                        val saved = if (container.authRepository.hasStoredSession()) container.accountRepository.update(countryCode = code, cityId = city.id).isSuccess else true
                        busy = false
                        if (saved) { container.sessionStore.saveCity(city.id, code); open = false } else failed = true
                    }
                },
            ) { Text(stringResource(R.string.city_confirm)) }
        },
    )
}
