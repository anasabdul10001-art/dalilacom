package com.dalilacom.app.ui.account

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.dalilacom.app.R
import com.dalilacom.app.data.network.AddressDto
import com.dalilacom.app.data.network.AddressRequest
import com.dalilacom.app.data.network.GeoUnitDto
import com.dalilacom.app.data.network.ProfileDto
import com.dalilacom.app.data.repository.AccountRepository
import com.dalilacom.app.ui.ViewModelFactory
import com.dalilacom.app.ui.i18n.AppStrings
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class AddressForm(
    val label: String = "HOME",
    val country: GeoUnitDto? = null,
    val regions: List<GeoUnitDto> = emptyList(),
    val cities: List<GeoUnitDto> = emptyList(),
    val areas: List<GeoUnitDto> = emptyList(),
    val regionId: String? = null,
    val cityId: String? = null,
    val areaId: String? = null,
    val street: String = "",
    val building: String = "",
    val postal: String = "",
    val isDefault: Boolean = false,
)

data class AccountUiState(
    val isLoading: Boolean = true,
    val profile: ProfileDto? = null,
    val countries: List<GeoUnitDto> = emptyList(),
    val profileCities: List<GeoUnitDto> = emptyList(),
    val addresses: List<AddressDto> = emptyList(),
    val form: AddressForm? = null,
    val info: String? = null,
    val error: String? = null,
)

class AccountSettingsViewModel(private val repository: AccountRepository) : ViewModel() {
    private val _uiState = MutableStateFlow(AccountUiState())
    val uiState: StateFlow<AccountUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            val profile = repository.profile()
            val countries = repository.countries()
            _uiState.update { it.copy(isLoading = false, profile = profile, countries = countries, addresses = repository.addresses()) }
            profile?.countryCode?.let { code -> loadProfileCities(code) }
        }
    }

    private fun done(message: String?, error: String? = null) = _uiState.update { it.copy(info = message, error = error) }

    private suspend fun loadProfileCities(isoCode: String?) {
        val country = _uiState.value.countries.firstOrNull { it.isoCode2 == isoCode }
        _uiState.update { it.copy(profileCities = if (country == null) emptyList() else emptyList()) }
        if (country != null) {
            val cities = repository.units(countryId = country.id, level = "CITY")
            _uiState.update { it.copy(profileCities = cities) }
        }
    }

    fun savePhone(phone: String) = viewModelScope.launch {
        repository.update(phone = phone.trim())
            .onSuccess { p -> _uiState.update { it.copy(profile = p) }; done(AppStrings.get(R.string.account_saved)) }
            .onFailure { e -> done(null, e.message) }
    }

    fun pickProfileCountry(isoCode: String?) = viewModelScope.launch {
        _uiState.update { it.copy(profile = it.profile?.copy(countryCode = isoCode, cityId = null)) }
        loadProfileCities(isoCode)
    }

    fun pickProfileCity(id: String?) = _uiState.update { it.copy(profile = it.profile?.copy(cityId = id)) }

    fun saveLocation(vat: String) = viewModelScope.launch {
        val p = _uiState.value.profile ?: return@launch
        repository.update(countryCode = p.countryCode, cityId = p.cityId, vatNumber = vat.trim())
            .onSuccess { updated -> _uiState.update { it.copy(profile = updated) }; done(AppStrings.get(R.string.account_saved)) }
            .onFailure { e -> done(null, e.message) }
    }

    fun changePassword(current: String, new: String, again: String) = viewModelScope.launch {
        when {
            current.isBlank() || new.isBlank() -> done(null, AppStrings.get(R.string.account_pw_enter_both))
            new.length < 8 -> done(null, AppStrings.get(R.string.account_pw_short))
            new != again -> done(null, AppStrings.get(R.string.account_pw_mismatch))
            else -> repository.changePassword(current, new)
                .onSuccess { done(AppStrings.get(R.string.account_pw_changed)) }
                .onFailure { e -> done(null, e.message) }
        }
    }

    /* ---- addresses ---- */

    fun newAddress() = _uiState.update { it.copy(form = AddressForm(isDefault = it.addresses.isEmpty()), info = null, error = null) }
    fun cancelAddress() = _uiState.update { it.copy(form = null) }
    fun editForm(change: (AddressForm) -> AddressForm) = _uiState.update { it.copy(form = it.form?.let(change)) }

    fun pickAddressCountry(country: GeoUnitDto) = viewModelScope.launch {
        val regions = repository.units(countryId = country.id, level = "REGION")
        editForm { it.copy(country = country, regions = regions, cities = emptyList(), areas = emptyList(), regionId = null, cityId = null, areaId = null) }
    }

    fun pickAddressRegion(id: String) = viewModelScope.launch {
        val cities = repository.units(parentId = id)
        editForm { it.copy(regionId = id, cities = cities, areas = emptyList(), cityId = null, areaId = null) }
    }

    fun pickAddressCity(id: String) = viewModelScope.launch {
        val areas = repository.units(parentId = id)
        editForm { it.copy(cityId = id, areas = areas, areaId = null) }
    }

    fun saveAddress() = viewModelScope.launch {
        val f = _uiState.value.form ?: return@launch
        val country = f.country ?: return@launch done(null, AppStrings.get(R.string.account_choose_country))
        repository.addAddress(
            AddressRequest(
                countryId = country.id,
                regionId = f.regionId,
                cityId = f.cityId,
                areaId = f.areaId,
                street = f.street.trim().ifBlank { null },
                buildingNumber = f.building.trim().ifBlank { null },
                postalCode = f.postal.trim().ifBlank { null },
                label = f.label,
                isDefault = f.isDefault,
            ),
        )
            .onSuccess { _uiState.update { it.copy(form = null, addresses = emptyList()) }; refreshAddresses(AppStrings.get(R.string.account_address_saved)) }
            .onFailure { e -> done(null, e.message) }
    }

    fun makeDefault(id: String) = viewModelScope.launch {
        repository.makeDefault(id).onSuccess { refreshAddresses(AppStrings.get(R.string.account_saved)) }.onFailure { e -> done(null, e.message) }
    }

    fun deleteAddress(id: String) = viewModelScope.launch {
        repository.deleteAddress(id).onSuccess { refreshAddresses(AppStrings.get(R.string.account_deleted)) }.onFailure { e -> done(null, e.message) }
    }

    private suspend fun refreshAddresses(message: String) {
        _uiState.update { it.copy(addresses = emptyList()) }
        val list = repository.addresses()
        _uiState.update { it.copy(addresses = list, info = message, error = null) }
    }
}

private fun GeoUnitDto.title(): String = nameArabic?.takeIf { AppStrings.language == "ar" } ?: nameEnglish ?: name

@Composable
private fun SectionCard(title: String, content: @Composable () -> Unit) {
    Surface(shape = RoundedCornerShape(18.dp), border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant), modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium)
            content()
        }
    }
}

/** A drop-down of places (country, governorate, city, area), shown as a button with the current choice. */
@Composable
private fun PlaceDropdown(label: String, options: List<GeoUnitDto>, selectedId: String?, onSelect: (GeoUnitDto) -> Unit) {
    var open by remember { mutableStateOf(false) }
    val chosen = options.firstOrNull { it.id == selectedId }
    Column {
        Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Box {
            OutlinedButton(onClick = { open = true }, modifier = Modifier.fillMaxWidth()) { Text(chosen?.title() ?: AppStrings.get(R.string.account_choose)) }
            DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
                options.forEach { unit -> DropdownMenuItem(text = { Text(unit.title()) }, onClick = { onSelect(unit); open = false }) }
            }
        }
    }
}

@Composable
fun AccountSettingsScreen(factory: ViewModelFactory, onBack: () -> Unit) {
    val viewModel: AccountSettingsViewModel = viewModel(factory = factory)
    val state by viewModel.uiState.collectAsState()
    val profile = state.profile

    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = onBack) { Text(AppStrings.get(R.string.back)) }
            Text(AppStrings.get(R.string.account_title), style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.primary)
        }
        if (state.isLoading || profile == null) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            return@Column
        }
        var phone by remember(profile.phone) { mutableStateOf(profile.phone.orEmpty()) }
        var vat by remember(profile.vatNumber) { mutableStateOf(profile.vatNumber.orEmpty()) }
        var pwOld by remember { mutableStateOf("") }
        var pwNew by remember { mutableStateOf("") }
        var pwAgain by remember { mutableStateOf("") }

        LazyColumn(contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            item {
                state.info?.let { Text(it, color = MaterialTheme.colorScheme.primary) }
                state.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
            item {
                SectionCard(AppStrings.get(R.string.account_email)) {
                    Text(profile.email, style = MaterialTheme.typography.bodyLarge)
                    Text(
                        AppStrings.get(if (profile.emailVerified) R.string.account_email_verified else R.string.account_email_unverified),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Text(AppStrings.get(R.string.account_email_soon), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            item {
                SectionCard(AppStrings.get(R.string.account_password)) {
                    OutlinedTextField(pwOld, { pwOld = it }, label = { Text(AppStrings.get(R.string.account_pw_current)) }, singleLine = true, visualTransformation = PasswordVisualTransformation(), modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(pwNew, { pwNew = it }, label = { Text(AppStrings.get(R.string.account_pw_new)) }, singleLine = true, visualTransformation = PasswordVisualTransformation(), modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(pwAgain, { pwAgain = it }, label = { Text(AppStrings.get(R.string.account_pw_again)) }, singleLine = true, visualTransformation = PasswordVisualTransformation(), modifier = Modifier.fillMaxWidth())
                    Button(onClick = { viewModel.changePassword(pwOld, pwNew, pwAgain); pwOld = ""; pwNew = ""; pwAgain = "" }) { Text(AppStrings.get(R.string.account_pw_change)) }
                }
            }
            item {
                SectionCard(AppStrings.get(R.string.account_phone)) {
                    OutlinedTextField(phone, { phone = it }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone), modifier = Modifier.fillMaxWidth())
                    Button(onClick = { viewModel.savePhone(phone) }) { Text(AppStrings.get(R.string.account_save)) }
                }
            }
            item {
                SectionCard(AppStrings.get(R.string.account_place)) {
                    Text(AppStrings.get(R.string.account_place_hint), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    val countryId = state.countries.firstOrNull { it.isoCode2 == profile.countryCode }?.id
                    PlaceDropdown(AppStrings.get(R.string.account_country), state.countries, countryId) { viewModel.pickProfileCountry(it.isoCode2) }
                    PlaceDropdown(AppStrings.get(R.string.account_city), state.profileCities, profile.cityId) { viewModel.pickProfileCity(it.id) }
                    OutlinedTextField(vat, { vat = it }, label = { Text(AppStrings.get(R.string.account_vat)) }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    Button(onClick = { viewModel.saveLocation(vat) }) { Text(AppStrings.get(R.string.account_save)) }
                }
            }
            item {
                SectionCard(AppStrings.get(R.string.account_addresses)) {
                    if (state.addresses.isEmpty()) Text(AppStrings.get(R.string.account_no_addresses), color = MaterialTheme.colorScheme.onSurfaceVariant)
                    state.addresses.forEach { address ->
                        Column(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                                Text(
                                    AppStrings.get(when (address.label) { "HOME" -> R.string.account_label_home; "WORK" -> R.string.account_label_work; else -> R.string.account_label_other }),
                                    style = MaterialTheme.typography.titleSmall,
                                )
                                if (address.isDefault) Text(AppStrings.get(R.string.account_default), color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelMedium)
                            }
                            val line = listOfNotNull(address.street, address.buildingNumber, address.area?.title(), address.city?.title(), address.region?.title(), address.country.title()).joinToString(", ")
                            Text(line, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                if (!address.isDefault) TextButton(onClick = { viewModel.makeDefault(address.id) }) { Text(AppStrings.get(R.string.account_make_default)) }
                                TextButton(onClick = { viewModel.deleteAddress(address.id) }) { Text(AppStrings.get(R.string.account_delete), color = MaterialTheme.colorScheme.error) }
                            }
                        }
                    }
                    val form = state.form
                    if (form == null) {
                        Button(onClick = viewModel::newAddress) { Text(AppStrings.get(R.string.account_add_address)) }
                    } else {
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            listOf("HOME" to R.string.account_label_home, "WORK" to R.string.account_label_work, "OTHER" to R.string.account_label_other).forEach { (key, label) ->
                                FilterChip(selected = form.label == key, onClick = { viewModel.editForm { it.copy(label = key) } }, label = { Text(AppStrings.get(label)) })
                            }
                        }
                        PlaceDropdown(AppStrings.get(R.string.account_country), state.countries, form.country?.id) { viewModel.pickAddressCountry(it) }
                        if (form.regions.isNotEmpty()) PlaceDropdown(AppStrings.get(R.string.account_region), form.regions, form.regionId) { viewModel.pickAddressRegion(it.id) }
                        if (form.cities.isNotEmpty()) PlaceDropdown(AppStrings.get(R.string.account_city), form.cities, form.cityId) { viewModel.pickAddressCity(it.id) }
                        if (form.areas.isNotEmpty()) PlaceDropdown(AppStrings.get(R.string.account_area), form.areas, form.areaId) { unit -> viewModel.editForm { it.copy(areaId = unit.id) } }
                        OutlinedTextField(form.street, { v -> viewModel.editForm { it.copy(street = v) } }, label = { Text(AppStrings.get(R.string.account_street)) }, singleLine = true, modifier = Modifier.fillMaxWidth())
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedTextField(form.building, { v -> viewModel.editForm { it.copy(building = v) } }, label = { Text(AppStrings.get(R.string.account_building)) }, singleLine = true, modifier = Modifier.weight(1f))
                            OutlinedTextField(form.postal, { v -> viewModel.editForm { it.copy(postal = v) } }, label = { Text(AppStrings.get(R.string.account_postal)) }, singleLine = true, modifier = Modifier.weight(1f))
                        }
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Checkbox(checked = form.isDefault, onCheckedChange = { c -> viewModel.editForm { it.copy(isDefault = c) } })
                            Text(AppStrings.get(R.string.account_make_primary))
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Button(onClick = viewModel::saveAddress) { Text(AppStrings.get(R.string.account_save_address)) }
                            OutlinedButton(onClick = viewModel::cancelAddress) { Text(AppStrings.get(R.string.account_cancel)) }
                        }
                    }
                }
            }
            item { Spacer(Modifier.height(24.dp)) }
        }
    }
}
