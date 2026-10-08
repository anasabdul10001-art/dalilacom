package com.dalilacom.app.ui.discover

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.dalilacom.app.R
import com.dalilacom.app.data.RouteTarget
import com.dalilacom.app.ui.i18n.AppStrings
import com.dalilacom.app.data.network.CategoryDto
import com.dalilacom.app.data.network.MerchantDto
import com.dalilacom.app.data.network.RouteDto
import com.dalilacom.app.data.network.SuggestResponse
import com.dalilacom.app.data.repository.DiscoverRepository
import com.dalilacom.app.data.repository.MapBounds
import com.dalilacom.app.data.repository.PlacesRepository
import com.dalilacom.app.data.store.SessionStore
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
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

/** A route being shown on the map: where to, by what means, and what the server answered (both ways, so they can be compared). */
data class RouteUi(
    val target: RouteTarget,
    val mode: String = "driving",
    val isLoading: Boolean = true,
    val options: Map<String, RouteDto> = emptyMap(),
    val error: String? = null,
    /** "Start trip" was pressed: live guidance. */
    val navigating: Boolean = false,
    val nav: NavUi? = null,
) {
    val data: RouteDto? get() = options[mode]
}

/** Where the trip stands: the next manoeuvre, what is left, and the live position. */
data class NavUi(
    val idx: Int,
    val position: Pair<Double, Double>? = null,
    val heading: Float? = null,
    val distToNext: Double? = null,
    val remainingMeters: Int = 0,
    val remainingSeconds: Int = 0,
    val rerouting: Boolean = false,
    val arrived: Boolean = false,
    /** The map follows the person; turned off when they move the map themselves. */
    val follow: Boolean = true,
    val voice: Boolean = true,
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
    private val profileRepository: com.dalilacom.app.data.repository.ProfileRepository,
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

    fun onLocation(location: Pair<Double, Double>) {
        _uiState.update { recompute(it.copy(userLocation = location, locationStatus = LocationStatus.Ready)) }
        // Only for someone who opted in (profile switch): shops nearby can then reach them. Guests have no account to tell.
        viewModelScope.launch { if (sessionStore.getShareLocation()) profileRepository.reportLocation(location.first, location.second) }
    }

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

    /** What the screen should say aloud (collected by the screen, which owns the text-to-speech engine). */
    private val _speech = MutableSharedFlow<String>(extraBufferCapacity = 8)
    val speech: SharedFlow<String> = _speech.asSharedFlow()
    private var navOffCount = 0
    private var navLastReroute = 0L
    private val navSpoke = mutableSetOf<String>()

    /** Draws the road to [target] from [from] both by car and on foot, so the person can compare and choose before starting. */
    fun startRoute(target: RouteTarget, mode: String, from: Pair<Double, Double>) {
        routeJob?.cancel()
        resetNavBookkeeping()
        _uiState.update { it.copy(route = RouteUi(target, mode), selectedMerchantId = target.id) }
        routeJob = viewModelScope.launch {
            val to = target.latitude to target.longitude
            val car = async { places.route(from, to, "driving") }
            val walk = async { places.route(from, to, "walking") }
            val results = mapOf("driving" to car.await(), "walking" to walk.await())
            _uiState.update { state ->
                val current = state.route
                if (current == null || current.target.id != target.id) state
                else state.copy(
                    route = current.copy(
                        isLoading = false,
                        options = results.mapNotNull { (key, value) -> value.getOrNull()?.let { key to it } }.toMap(),
                        error = results.values.firstNotNullOfOrNull { it.exceptionOrNull()?.message }.takeIf { results.values.none { r -> r.isSuccess } },
                    ),
                )
            }
        }
    }

    /** Car or on foot: both answers are already here, so this only switches which one is drawn. */
    fun setRouteMode(mode: String) = _uiState.update { state ->
        val route = state.route
        if (route == null || route.navigating) state else state.copy(route = route.copy(mode = mode))
    }

    fun cancelRoute() {
        routeJob?.cancel()
        resetNavBookkeeping()
        _uiState.update { it.copy(route = null) }
    }

    private fun resetNavBookkeeping() {
        navOffCount = 0
        navLastReroute = 0L
        navSpoke.clear()
    }

    private fun speak(text: String) {
        if (_uiState.value.route?.nav?.voice == true) _speech.tryEmit(text)
    }

    /** "Start trip": the screen starts listening to the GPS and calls [onNavLocation] for every reading. */
    fun startNavigation() {
        val route = _uiState.value.route ?: return
        val data = route.data ?: return
        resetNavBookkeeping()
        val steps = data.steps
        _uiState.update {
            it.copy(route = route.copy(navigating = true, nav = NavUi(idx = minOf(1, maxOf(0, steps.size - 1)), remainingMeters = data.distanceMeters, remainingSeconds = data.durationSeconds)))
        }
        steps.firstOrNull()?.let { speak(NavText.instruction(it)) }
    }

    /** Leaves the guidance but keeps the route on the map (back to the choice of car or on foot). */
    fun endNavigation() = _uiState.update { state ->
        val route = state.route
        if (route == null) state else state.copy(route = route.copy(navigating = false, nav = null))
    }

    /** The trip is over (arrived): the route goes too. */
    fun finishNavigation() = cancelRoute()

    fun toggleNavVoice() = _uiState.update { state ->
        val route = state.route
        val nav = route?.nav
        if (route == null || nav == null) state else state.copy(route = route.copy(nav = nav.copy(voice = !nav.voice)))
    }

    /** The person moved the map: stop following them until they ask for it. */
    fun onNavPanned() = _uiState.update { state ->
        val route = state.route
        val nav = route?.nav
        if (route == null || nav == null || !nav.follow) state else state.copy(route = route.copy(nav = nav.copy(follow = false)))
    }

    fun recenterNav() = _uiState.update { state ->
        val route = state.route
        val nav = route?.nav
        if (route == null || nav == null) state else state.copy(route = route.copy(nav = nav.copy(follow = true)))
    }

    /** One GPS reading during the trip: off the road? arrived? passed the manoeuvre? what is left? */
    fun onNavLocation(latitude: Double, longitude: Double, accuracy: Float?, bearing: Float?) {
        val state = _uiState.value
        val route = state.route ?: return
        val nav = route.nav ?: return
        val data = route.data ?: return
        if (!route.navigating || nav.arrived || nav.rerouting) return
        val here = latitude to longitude
        val walking = route.mode == "walking"
        val steps = data.steps
        val acc = (accuracy ?: 0f).toDouble()

        // off the road for a few readings in a row: a new route from here
        val off = distanceToRouteMeters(here, data.geometry)
        val limit = maxOf(if (walking) 45.0 else 70.0, acc * 1.5)
        navOffCount = if (off > limit) navOffCount + 1 else 0
        if (navOffCount >= 3 && System.currentTimeMillis() - navLastReroute > 15_000) {
            reroute(route, here, bearing)
            return
        }

        // arrived? (the shop can sit off the road, so the end of the route counts too)
        val end = steps.lastOrNull()?.location?.takeIf { it.size >= 2 }
        val toEnd = if (end != null) haversineMeters(here, end[0] to end[1]) else Double.MAX_VALUE
        val toShop = haversineMeters(here, route.target.latitude to route.target.longitude)
        if (minOf(toEnd, toShop) < maxOf(if (walking) 20.0 else 35.0, acc)) {
            speak(AppStrings.get(R.string.nav_arrive))
            _uiState.update { it.copy(route = route.copy(nav = nav.copy(position = here, heading = bearing ?: nav.heading, arrived = true, distToNext = 0.0, remainingMeters = 0, remainingSeconds = 0))) }
            return
        }

        // passed the manoeuvre we were heading to?
        var idx = nav.idx
        val reachedAt = if (walking) 15.0 else 25.0
        var moved = false
        while (idx < steps.size - 1 && steps[idx].location.size >= 2 && haversineMeters(here, steps[idx].location[0] to steps[idx].location[1]) < reachedAt) { idx++; moved = true }
        val next = steps.getOrNull(idx)
        val distToNext = if (next != null && next.location.size >= 2) haversineMeters(here, next.location[0] to next.location[1]) else 0.0

        // what is left
        var remM = distToNext
        var remS = 0.0
        for (k in idx until steps.size) { remM += steps[k].distanceMeters; remS += steps[k].durationSeconds }
        val speed = data.distanceMeters.toDouble() / maxOf(1, data.durationSeconds)
        remS += distToNext / maxOf(0.5, speed)

        // the voice: once when it is near, and once at the manoeuvre
        if (next != null) {
            val near = if (walking) 40.0 else 180.0
            if (distToNext < near && navSpoke.add("$idx-near")) {
                speak(NavText.sayIn(distToNext) + " " + NavText.instruction(next))
            } else if (moved && navSpoke.add("$idx")) {
                speak(NavText.instruction(next))
            }
        }

        _uiState.update {
            it.copy(route = route.copy(nav = nav.copy(idx = idx, position = here, heading = bearing ?: nav.heading, distToNext = distToNext, remainingMeters = remM.toInt(), remainingSeconds = remS.toInt())))
        }
    }

    private fun reroute(route: RouteUi, from: Pair<Double, Double>, bearing: Float?) {
        navLastReroute = System.currentTimeMillis()
        navOffCount = 0
        _uiState.update { s -> s.route?.nav?.let { n -> s.copy(route = s.route.copy(nav = n.copy(rerouting = true, position = from, heading = bearing ?: n.heading))) } ?: s }
        viewModelScope.launch {
            val result = places.route(from, route.target.latitude to route.target.longitude, route.mode)
            _uiState.update { s ->
                val current = s.route
                val nav = current?.nav
                if (current == null || nav == null || !current.navigating) s
                else {
                    val fresh = result.getOrNull()
                    if (fresh == null) s.copy(route = current.copy(nav = nav.copy(rerouting = false)))
                    else {
                        navSpoke.clear()
                        s.copy(route = current.copy(options = current.options + (current.mode to fresh), nav = nav.copy(rerouting = false, idx = minOf(1, maxOf(0, fresh.steps.size - 1)), remainingMeters = fresh.distanceMeters, remainingSeconds = fresh.durationSeconds)))
                    }
                }
            }
            if (result.isSuccess) speak(AppStrings.get(R.string.nav_rerouted))
        }
    }

    private fun haversineMeters(a: Pair<Double, Double>, b: Pair<Double, Double>): Double = haversineKm(a.first, a.second, b.first, b.second) * 1000.0

    /** Distance from a point to the drawn road (the nearest segment), in metres. */
    private fun distanceToRouteMeters(p: Pair<Double, Double>, geometry: List<List<Double>>): Double {
        if (geometry.size < 2) return Double.MAX_VALUE
        val k = cos(Math.toRadians(p.first))
        val px = p.second * k * 111_320.0
        val py = p.first * 110_540.0
        var best = Double.MAX_VALUE
        for (i in 0 until geometry.size - 1) {
            val ax = geometry[i][1] * k * 111_320.0
            val ay = geometry[i][0] * 110_540.0
            val bx = geometry[i + 1][1] * k * 111_320.0
            val by = geometry[i + 1][0] * 110_540.0
            val dx = bx - ax
            val dy = by - ay
            val len2 = dx * dx + dy * dy
            val u = if (len2 > 0) (((px - ax) * dx + (py - ay) * dy) / len2).coerceIn(0.0, 1.0) else 0.0
            val d = sqrt((px - (ax + u * dx)) * (px - (ax + u * dx)) + (py - (ay + u * dy)) * (py - (ay + u * dy)))
            if (d < best) best = d
        }
        return best
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
