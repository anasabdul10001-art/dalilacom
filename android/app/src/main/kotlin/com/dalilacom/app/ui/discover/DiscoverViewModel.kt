package com.dalilacom.app.ui.discover

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.dalilacom.app.data.RouteTarget
import com.dalilacom.app.data.network.CategoryDto
import com.dalilacom.app.data.network.MerchantDto
import com.dalilacom.app.data.network.RouteDto
import com.dalilacom.app.data.network.SuggestResponse
import com.dalilacom.app.data.repository.DiscoverRepository
import com.dalilacom.app.data.repository.MapBounds
import com.dalilacom.app.data.repository.PlacesRepository
import com.dalilacom.app.data.store.SessionStore
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
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

/** A route being shown on the map: where to, by what means, and what the server answered. */
data class RouteUi(
    val target: RouteTarget,
    val mode: String = "driving",
    val isLoading: Boolean = true,
    val data: RouteDto? = null,
    val error: String? = null,
)

data class DiscoverUiState(
    val isLoading: Boolean = true,
    val categories: List<CategoryDto> = emptyList(),
    val selectedCategoryId: String? = null,
    val query: String = "",
    val openNow: Boolean = false,
    val radiusKm: Double? = null,
    val discountsOnly: Boolean = false,
    val allMerchants: List<MerchantDto> = emptyList(),
    /** Filtered, with distance filled in, nearest first. */
    val merchants: List<MerchantDto> = emptyList(),
    val selectedMerchantId: String? = null,
    val userLocation: Pair<Double, Double>? = null,
    val locationStatus: LocationStatus = LocationStatus.Idle,
    val locationRequested: Boolean = false,
    val searchBounds: MapBounds? = null,
    val areaDirty: Boolean = false,
    val suggestions: SuggestResponse = SuggestResponse(),
    val recentSearches: List<String> = emptyList(),
    val searchFocused: Boolean = false,
    val favoriteIds: Set<String> = emptySet(),
    val route: RouteUi? = null,
    /** Open sections browser: the ids of the nodes drilled into so far (empty = the top level). */
    val browseTrail: List<String>? = null,
    val message: String? = null,
)

class DiscoverViewModel(
    private val repository: DiscoverRepository,
    private val places: PlacesRepository,
    private val sessionStore: SessionStore,
) : ViewModel() {
    private val _uiState = MutableStateFlow(DiscoverUiState())
    val uiState: StateFlow<DiscoverUiState> = _uiState.asStateFlow()
    private var suggestJob: Job? = null
    private var lastViewport: MapBounds? = null

    init {
        viewModelScope.launch {
            val categories = repository.getCategories()
            _uiState.update { it.copy(categories = categories, recentSearches = sessionStore.getRecentSearches()) }
            search()
        }
        refreshFavorites()
    }

    /** Saved-place hearts; empty (not an error) for guests. Call again after signing in. */
    fun refreshFavorites() {
        viewModelScope.launch { _uiState.update { it.copy(favoriteIds = places.favoriteIds()) } }
    }

    fun onQueryChange(query: String) {
        _uiState.update { it.copy(query = query) }
        suggestJob?.cancel()
        suggestJob = viewModelScope.launch {
            delay(280)
            val suggestions = if (query.isBlank()) SuggestResponse() else places.suggest(query.trim())
            _uiState.update { it.copy(suggestions = suggestions) }
            search()
        }
    }

    fun onSearchFocus(focused: Boolean) = _uiState.update { it.copy(searchFocused = focused) }

    fun submitSearch() {
        val query = _uiState.value.query
        viewModelScope.launch {
            sessionStore.pushRecentSearch(query)
            _uiState.update { it.copy(recentSearches = sessionStore.getRecentSearches(), searchFocused = false) }
        }
    }

    fun pickRecent(query: String) {
        _uiState.update { it.copy(query = query, searchFocused = false) }
        viewModelScope.launch {
            sessionStore.pushRecentSearch(query)
            _uiState.update { it.copy(recentSearches = sessionStore.getRecentSearches()) }
        }
        search()
    }

    fun pickCategory(id: String) {
        _uiState.update { it.copy(query = "", selectedCategoryId = id, searchFocused = false, browseTrail = null) }
        search()
    }

    fun onCategorySelected(categoryId: String?) {
        _uiState.update { it.copy(selectedCategoryId = categoryId) }
        search()
    }

    fun resetFilters() {
        _uiState.update { recompute(it.copy(selectedCategoryId = null, openNow = false, discountsOnly = false)) }
        search()
    }

    fun onOpenNowChange(value: Boolean) = _uiState.update { recompute(it.copy(openNow = value)) }

    fun onRadiusSelected(radiusKm: Double?) = _uiState.update { recompute(it.copy(radiusKm = radiusKm)) }

    fun onDiscountsOnlyChange(value: Boolean) = _uiState.update { recompute(it.copy(discountsOnly = value)) }

    fun selectMerchant(id: String?) = _uiState.update { it.copy(selectedMerchantId = id) }

    fun markLocationRequested() = _uiState.update { it.copy(locationRequested = true, locationStatus = LocationStatus.Loading) }

    fun onLocation(location: Pair<Double, Double>) =
        _uiState.update { recompute(it.copy(userLocation = location, locationStatus = LocationStatus.Ready)) }

    fun onLocationDenied() = _uiState.update { it.copy(locationStatus = LocationStatus.Denied) }

    fun onLocationUnavailable() = _uiState.update { it.copy(locationStatus = LocationStatus.Unavailable) }

    /** The user dragged/zoomed the map: remember where, and offer "search this area". */
    fun onViewportMoved(bounds: MapBounds) {
        lastViewport = bounds
        _uiState.update { if (it.areaDirty) it else it.copy(areaDirty = true) }
    }

    fun searchThisArea() {
        val bounds = lastViewport ?: return
        _uiState.update { it.copy(searchBounds = bounds) }
        search()
    }

    fun clearSearchArea() {
        _uiState.update { it.copy(searchBounds = null) }
        search()
    }

    fun toggleFavorite(merchantId: String) {
        val saved = merchantId in _uiState.value.favoriteIds
        // Optimistic: flip the heart now, undo and explain if the server refuses (e.g. signed out).
        _uiState.update { it.copy(favoriteIds = if (saved) it.favoriteIds - merchantId else it.favoriteIds + merchantId) }
        viewModelScope.launch {
            places.setSaved(merchantId, !saved).onFailure { error ->
                _uiState.update {
                    it.copy(
                        favoriteIds = if (saved) it.favoriteIds + merchantId else it.favoriteIds - merchantId,
                        message = error.message,
                    )
                }
            }
        }
    }

    fun clearMessage() = _uiState.update { it.copy(message = null) }

    fun openBrowse() = _uiState.update { it.copy(browseTrail = emptyList(), searchFocused = false) }
    fun closeBrowse() = _uiState.update { it.copy(browseTrail = null) }
    fun browseInto(id: String) = _uiState.update { state -> state.browseTrail?.let { state.copy(browseTrail = it + id) } ?: state }
    fun browseBack() = _uiState.update { state ->
        val trail = state.browseTrail
        if (trail == null || trail.isEmpty()) state.copy(browseTrail = null) else state.copy(browseTrail = trail.dropLast(1))
    }

    private var routeJob: Job? = null

    /** Draws the road to [target] from [from]; switching [mode] just calls this again. */
    fun startRoute(target: RouteTarget, mode: String, from: Pair<Double, Double>) {
        routeJob?.cancel()
        _uiState.update { it.copy(route = RouteUi(target, mode), selectedMerchantId = target.id) }
        routeJob = viewModelScope.launch {
            val result = places.route(from, target.latitude to target.longitude, mode)
            _uiState.update { state ->
                val current = state.route
                if (current == null || current.target.id != target.id || current.mode != mode) state
                else state.copy(route = current.copy(isLoading = false, data = result.getOrNull(), error = result.exceptionOrNull()?.message))
            }
        }
    }

    fun cancelRoute() {
        routeJob?.cancel()
        _uiState.update { it.copy(route = null) }
    }

    /** Loads the directory (including merchants without coordinates); distance and radius are applied locally. */
    private fun search() {
        val state = _uiState.value
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }
            val results = repository.searchMerchants(
                query = state.query.ifBlank { null },
                categoryId = state.selectedCategoryId,
                bounds = state.searchBounds,
            )
            _uiState.update { recompute(it.copy(isLoading = false, allMerchants = results, areaDirty = false)) }
        }
    }

    private fun recompute(state: DiscoverUiState): DiscoverUiState {
        val here = state.userLocation
        val withDistance = state.allMerchants.map { merchant ->
            val lat = merchant.latitude
            val lng = merchant.longitude
            if (here != null && lat != null && lng != null) merchant.copy(distanceKm = haversineKm(here.first, here.second, lat, lng)) else merchant
        }
        val filtered = withDistance
            .filter { !state.openNow || it.openStatus?.isOpen == true }
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
