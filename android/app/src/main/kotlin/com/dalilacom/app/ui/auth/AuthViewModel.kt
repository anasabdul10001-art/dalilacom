package com.dalilacom.app.ui.auth

import com.dalilacom.app.R
import com.dalilacom.app.ui.i18n.AppStrings
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.dalilacom.app.data.network.GeoUnitDto
import com.dalilacom.app.data.network.SocialProvidersDto
import com.dalilacom.app.data.repository.AuthRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed interface AuthUiState {
    data object Idle : AuthUiState
    data object Loading : AuthUiState
    data object Success : AuthUiState
    data class Error(val message: String) : AuthUiState
}

class AuthViewModel(private val repository: AuthRepository) : ViewModel() {
    private val _uiState = MutableStateFlow<AuthUiState>(AuthUiState.Idle)
    val uiState: StateFlow<AuthUiState> = _uiState.asStateFlow()

    private val _socialProviders = MutableStateFlow(SocialProvidersDto())
    val socialProviders: StateFlow<SocialProvidersDto> = _socialProviders.asStateFlow()

    init {
        viewModelScope.launch { _socialProviders.value = repository.socialProviders() }
    }

    private val _forgotMessage = MutableStateFlow<String?>(null)
    val forgotMessage: StateFlow<String?> = _forgotMessage.asStateFlow()

    fun forgotPassword(email: String) {
        if (email.isBlank()) { _forgotMessage.value = AppStrings.get(R.string.account_email_enter); return }
        viewModelScope.launch {
            repository.forgotPassword(email)
                .onSuccess { _forgotMessage.value = it }
                .onFailure { _forgotMessage.value = it.message }
        }
    }

    fun clearForgotMessage() { _forgotMessage.value = null }

    fun completeSocial(pending: String, email: String) {
        if (email.isBlank()) { _uiState.value = AuthUiState.Error(AppStrings.get(R.string.account_email_enter)); return }
        _uiState.value = AuthUiState.Loading
        viewModelScope.launch {
            repository.socialComplete(pending, email)
                .onSuccess { _uiState.value = AuthUiState.Success }
                .onFailure { _uiState.value = AuthUiState.Error(it.message ?: AppStrings.get(R.string.social_failed)) }
        }
    }

    fun exchangeTicket(ticket: String) {
        _uiState.value = AuthUiState.Loading
        viewModelScope.launch {
            repository.socialExchange(ticket)
                .onSuccess { _uiState.value = AuthUiState.Success }
                .onFailure { _uiState.value = AuthUiState.Error(it.message ?: AppStrings.get(R.string.social_failed)) }
        }
    }

    /** The country / governorate / city lists of the sign-up page. */
    data class PlaceLists(
        val countries: List<GeoUnitDto> = emptyList(),
        val regions: List<GeoUnitDto> = emptyList(),
        val cities: List<GeoUnitDto> = emptyList(),
        val countryId: String? = null,
        val regionId: String? = null,
        val cityId: String? = null,
    )

    private val _places = MutableStateFlow(PlaceLists())
    val places: StateFlow<PlaceLists> = _places.asStateFlow()

    fun loadPlaces() {
        if (_places.value.countries.isNotEmpty()) return
        viewModelScope.launch {
            val countries = repository.countries()
            _places.value = PlaceLists(countries = countries)
            countries.firstOrNull { it.isoCode2 == "SY" }?.let { pickCountry(it) }
        }
    }

    fun pickCountry(country: GeoUnitDto) {
        _places.value = _places.value.copy(countryId = country.id, regions = emptyList(), cities = emptyList(), regionId = null, cityId = null)
        viewModelScope.launch {
            val regions = repository.units(countryId = country.id, level = "REGION")
            // a country with no governorates in our list: its cities come straight under it
            val cities = if (regions.isEmpty()) repository.units(countryId = country.id, level = "CITY") else emptyList()
            if (_places.value.countryId == country.id) _places.value = _places.value.copy(regions = regions, cities = cities)
        }
    }

    fun pickRegion(region: GeoUnitDto) {
        _places.value = _places.value.copy(regionId = region.id, cities = emptyList(), cityId = null)
        viewModelScope.launch {
            val cities = repository.units(parentId = region.id, level = "CITY")
            if (_places.value.regionId == region.id) _places.value = _places.value.copy(cities = cities)
        }
    }

    fun pickCity(city: GeoUnitDto) {
        _places.value = _places.value.copy(cityId = city.id)
    }

    fun register(email: String, password: String, fullName: String) {
        if (email.isBlank() || password.isBlank() || fullName.isBlank()) {
            _uiState.value = AuthUiState.Error(AppStrings.get(R.string.s_c5324447))
            return
        }
        _uiState.value = AuthUiState.Loading
        val p = _places.value
        val countryCode = p.countries.firstOrNull { it.id == p.countryId }?.isoCode2
        viewModelScope.launch {
            repository.register(email, password, fullName, countryCode, p.cityId)
                .onSuccess { _uiState.value = AuthUiState.Success }
                .onFailure { _uiState.value = AuthUiState.Error(it.message ?: AppStrings.get(R.string.s_6c21e27c)) }
        }
    }

    fun login(email: String, password: String) {
        if (email.isBlank() || password.isBlank()) {
            _uiState.value = AuthUiState.Error(AppStrings.get(R.string.s_1dbf1d4a))
            return
        }
        _uiState.value = AuthUiState.Loading
        viewModelScope.launch {
            repository.login(email, password)
                .onSuccess { _uiState.value = AuthUiState.Success }
                .onFailure { _uiState.value = AuthUiState.Error(it.message ?: AppStrings.get(R.string.s_6c21e27c)) }
        }
    }

    fun resetState() {
        _uiState.value = AuthUiState.Idle
    }
}
