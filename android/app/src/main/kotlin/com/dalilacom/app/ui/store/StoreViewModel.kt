package com.dalilacom.app.ui.store

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.dalilacom.app.data.network.GeoUnitDto
import com.dalilacom.app.data.network.StoreProductDto
import com.dalilacom.app.data.network.StoreSectionDto
import com.dalilacom.app.data.repository.AuthRepository
import com.dalilacom.app.data.repository.CartRepository
import com.dalilacom.app.data.repository.StoreRepository
import com.dalilacom.app.data.repository.StoreScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class StoreUi(
    val loading: Boolean = true,
    val busy: Boolean = false,
    val country: String = "",
    val countryName: String = "",
    val sections: List<StoreSectionDto> = emptyList(),
    val bestSellers: List<StoreProductDto> = emptyList(),
    val deals: List<StoreProductDto> = emptyList(),
    val newest: List<StoreProductDto> = emptyList(),
    val query: String = "",
    val section: String = "",
    val dealsOnly: Boolean = false,
    val sort: String = "popular",
    val items: List<StoreProductDto> = emptyList(),
    val total: Int = 0,
    // where to look
    val scope: String = "country",
    val regions: List<GeoUnitDto> = emptyList(),
    val cities: List<GeoUnitDto> = emptyList(),
    val regionId: String? = null,
    val cityId: String? = null,
    val radiusKm: Int = 10,
    val position: Pair<Double, Double>? = null,
    val needLocation: Boolean = false,
    // the cart
    val cartCount: Int = 0,
    val justAdded: String? = null,
    val needLogin: Boolean = false,
    val error: String? = null,
) {
    val filtering get() = query.isNotBlank() || section.isNotBlank() || dealsOnly
}

/** The online store: every shop's products of the shopper's own country, narrowed by city or by kilometres around them. */
class StoreViewModel(
    private val store: StoreRepository,
    private val cart: CartRepository,
    private val auth: AuthRepository,
) : ViewModel() {
    private val _ui = MutableStateFlow(StoreUi())
    val ui: StateFlow<StoreUi> = _ui.asStateFlow()

    init {
        reload()
        refreshCart()
    }

    private fun scope(): StoreScope {
        val s = _ui.value
        return when {
            s.scope == "city" && (s.cityId ?: s.regionId) != null -> StoreScope("city", cityId = s.cityId ?: s.regionId)
            s.scope == "radius" && s.position != null -> StoreScope("radius", radiusKm = s.radiusKm, lat = s.position.first, lng = s.position.second)
            else -> StoreScope()
        }
    }

    private fun refreshCart() {
        viewModelScope.launch {
            if (!auth.hasStoredSession()) return@launch
            val view = cart.getCart() ?: return@launch
            _ui.value = _ui.value.copy(cartCount = view.items.sumOf { it.quantity })
        }
    }

    /** The front page, and the result list when a search or a section is chosen. */
    fun reload() {
        viewModelScope.launch {
            val home = store.home(scope())
            _ui.value = _ui.value.copy(
                loading = false,
                country = home?.country ?: _ui.value.country,
                sections = home?.sections ?: emptyList(),
                bestSellers = home?.bestSellers ?: emptyList(),
                deals = home?.deals ?: emptyList(),
                newest = home?.newest ?: emptyList(),
            )
        }
        if (_ui.value.filtering) loadList(false)
    }

    private fun loadList(append: Boolean) {
        val s = _ui.value
        _ui.value = s.copy(busy = true, items = if (append) s.items else emptyList(), total = if (append) s.total else 0)
        viewModelScope.launch {
            val result = store.products(s.query, s.section, s.dealsOnly, s.sort, if (append) s.items.size else 0, scope())
            val now = _ui.value
            _ui.value = now.copy(busy = false, items = if (append) now.items + (result?.items ?: emptyList()) else result?.items ?: emptyList(), total = result?.total ?: now.total)
        }
    }

    fun loadMore() {
        if (!_ui.value.busy) loadList(true)
    }

    fun search(q: String) {
        _ui.value = _ui.value.copy(query = q.trim(), dealsOnly = false)
        if (_ui.value.filtering) loadList(false)
    }

    fun pickSection(id: String) {
        _ui.value = _ui.value.copy(section = id, dealsOnly = false)
        if (_ui.value.filtering) loadList(false)
    }

    /** "See all" of a home row: the member deals, the best sellers or the newest, as a full list. */
    fun seeAll(kind: String) {
        _ui.value = _ui.value.copy(query = "", section = "", dealsOnly = kind == "deals", sort = if (kind == "new") "new" else "popular")
        loadList(false)
    }

    fun setSort(sort: String) {
        _ui.value = _ui.value.copy(sort = sort)
        loadList(false)
    }

    /** Back inside the store first clears the search/section; true when it did so. */
    fun clearFilters(): Boolean {
        if (!_ui.value.filtering) return false
        _ui.value = _ui.value.copy(query = "", section = "", dealsOnly = false)
        return true
    }

    fun setScope(value: String) {
        _ui.value = _ui.value.copy(scope = value, needLocation = false)
        if (value == "city" && _ui.value.regions.isEmpty() && _ui.value.cities.isEmpty()) loadGeo()
        reload()
    }

    /** The shopper's position arrived (or could not be had) for the "around me" choice. */
    fun setPosition(pos: Pair<Double, Double>?) {
        _ui.value = _ui.value.copy(position = pos, needLocation = pos == null)
        if (pos != null) reload()
    }

    fun setRadius(km: Int) {
        _ui.value = _ui.value.copy(radiusKm = km)
        if (_ui.value.position != null) reload()
    }

    private fun loadGeo() {
        viewModelScope.launch {
            val code = _ui.value.country.ifBlank { "SY" }
            val country = auth.countries().firstOrNull { it.isoCode2 == code } ?: return@launch
            val regions = auth.units(countryId = country.id, level = "REGION")
            val cities = if (regions.isEmpty()) auth.units(countryId = country.id, level = "CITY") else emptyList()
            _ui.value = _ui.value.copy(regions = regions, cities = cities, countryName = country.nameArabic.takeIf { com.dalilacom.app.ui.i18n.AppStrings.language == "ar" } ?: country.nameEnglish ?: country.name)
        }
    }

    fun pickRegion(id: String?) {
        _ui.value = _ui.value.copy(regionId = id, cityId = null, cities = emptyList())
        viewModelScope.launch {
            if (id != null) _ui.value = _ui.value.copy(cities = auth.units(parentId = id, level = "CITY"))
        }
        reload()
    }

    fun pickCity(id: String?) {
        _ui.value = _ui.value.copy(cityId = id)
        reload()
    }

    fun addToCart(productId: String) {
        viewModelScope.launch {
            if (!auth.hasStoredSession()) {
                _ui.value = _ui.value.copy(needLogin = true)
                return@launch
            }
            cart.addItem(productId, 1)
                .onSuccess {
                    _ui.value = _ui.value.copy(cartCount = it.items.sumOf { i -> i.quantity }, justAdded = productId, error = null)
                    delay(1600)
                    if (_ui.value.justAdded == productId) _ui.value = _ui.value.copy(justAdded = null)
                }
                .onFailure { _ui.value = _ui.value.copy(error = it.message) }
        }
    }

    fun consumeNeedLogin() {
        _ui.value = _ui.value.copy(needLogin = false)
    }
}
