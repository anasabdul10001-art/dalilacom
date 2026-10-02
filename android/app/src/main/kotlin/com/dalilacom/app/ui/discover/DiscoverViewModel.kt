package com.dalilacom.app.ui.discover

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.dalilacom.app.data.network.CategoryDto
import com.dalilacom.app.data.network.MerchantDto
import com.dalilacom.app.data.repository.DiscoverRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt

enum class LocationStatus { Idle, Loading, Ready, Denied, Unavailable }

data class DiscoverUiState(
    val isLoading: Boolean = true,
    val categories: List<CategoryDto> = emptyList(),
    val selectedCategoryId: String? = null,
    val query: String = "",
    val radiusKm: Double? = null,
    val discountsOnly: Boolean = false,
    val allMerchants: List<MerchantDto> = emptyList(),
    /** Filtered, with distance filled in, nearest first. */
    val merchants: List<MerchantDto> = emptyList(),
    val selectedMerchantId: String? = null,
    val userLocation: Pair<Double, Double>? = null,
    val locationStatus: LocationStatus = LocationStatus.Idle,
    val locationRequested: Boolean = false,
)

class DiscoverViewModel(private val repository: DiscoverRepository) : ViewModel() {
    private val _uiState = MutableStateFlow(DiscoverUiState())
    val uiState: StateFlow<DiscoverUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            val categories = repository.getCategories()
            _uiState.update { it.copy(categories = categories) }
            search()
        }
    }

    fun onQueryChange(query: String) {
        _uiState.update { it.copy(query = query) }
        search()
    }

    fun onCategorySelected(categoryId: String?) {
        _uiState.update { it.copy(selectedCategoryId = categoryId) }
        search()
    }

    fun onRadiusSelected(radiusKm: Double?) = _uiState.update { recompute(it.copy(radiusKm = radiusKm)) }

    fun onDiscountsOnlyChange(value: Boolean) = _uiState.update { recompute(it.copy(discountsOnly = value)) }

    fun selectMerchant(id: String?) = _uiState.update { it.copy(selectedMerchantId = id) }

    fun markLocationRequested() = _uiState.update { it.copy(locationRequested = true, locationStatus = LocationStatus.Loading) }

    fun onLocation(location: Pair<Double, Double>) =
        _uiState.update { recompute(it.copy(userLocation = location, locationStatus = LocationStatus.Ready)) }

    fun onLocationDenied() = _uiState.update { it.copy(locationStatus = LocationStatus.Denied) }

    fun onLocationUnavailable() = _uiState.update { it.copy(locationStatus = LocationStatus.Unavailable) }

    /** Always loads the full directory (including merchants without coordinates); distance and radius are applied locally. */
    private fun search() {
        val state = _uiState.value
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }
            val results = repository.searchMerchants(
                query = state.query.ifBlank { null },
                categoryId = state.selectedCategoryId,
            )
            _uiState.update { recompute(it.copy(isLoading = false, allMerchants = results)) }
        }
    }

    private fun recompute(state: DiscoverUiState): DiscoverUiState {
        val here = state.userLocation
        val withDistance = state.allMerchants.map { merchant ->
            val lat = merchant.latitude
            val lng = merchant.longitude
            if (here != null && lat != null && lng != null) {
                merchant.copy(distanceKm = haversineKm(here.first, here.second, lat, lng))
            } else merchant
        }
        val filtered = withDistance
            .filter { !state.discountsOnly || it.discounts.isNotEmpty() }
            .filter { m -> state.radiusKm == null || here == null || (m.distanceKm != null && m.distanceKm <= state.radiusKm) }
            .sortedWith(compareBy({ it.distanceKm == null }, { it.distanceKm ?: 0.0 }, { it.businessName }))
        return state.copy(merchants = filtered)
    }

    private fun haversineKm(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
        val r = 6371.0
        val dLat = Math.toRadians(lat2 - lat1)
        val dLon = Math.toRadians(lon2 - lon1)
        val a = sin(dLat / 2) * sin(dLat / 2) +
            cos(Math.toRadians(lat1)) * cos(Math.toRadians(lat2)) * sin(dLon / 2) * sin(dLon / 2)
        return r * 2 * atan2(sqrt(a), sqrt(1 - a))
    }
}
