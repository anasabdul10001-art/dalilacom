package com.dalilacom.app.ui.merchant

import androidx.lifecycle.ViewModel
import com.dalilacom.app.R
import com.dalilacom.app.ui.i18n.AppStrings
import androidx.lifecycle.viewModelScope
import com.dalilacom.app.data.network.MerchantDto
import com.dalilacom.app.data.network.StoreProductDto
import com.dalilacom.app.data.repository.AuthRepository
import com.dalilacom.app.data.repository.CartRepository
import com.dalilacom.app.data.repository.StoreRepository
import com.dalilacom.app.data.repository.StoreScope
import kotlinx.coroutines.delay
import com.dalilacom.app.data.repository.DiscoverRepository
import com.dalilacom.app.data.repository.PlacesRepository
import com.dalilacom.app.data.repository.ProductRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class MerchantDetailUiState(
    val isLoading: Boolean = true,
    val merchant: MerchantDto? = null,
    val products: List<StoreProductDto> = emptyList(),
    val tab: String = "home",
    val sort: String = "popular",
    val justAdded: String? = null,
    val needLogin: Boolean = false,
    val saved: Boolean = false,
    val message: String? = null,
    val error: String? = null,
)

class MerchantDetailViewModel(
    private val discoverRepository: DiscoverRepository,
    private val storeRepository: StoreRepository,
    private val cartRepository: CartRepository,
    private val authRepository: AuthRepository,
    private val placesRepository: PlacesRepository,
    private val merchantId: String,
) : ViewModel() {
    private val _uiState = MutableStateFlow(MerchantDetailUiState())
    val uiState: StateFlow<MerchantDetailUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            val merchant = discoverRepository.getMerchant(merchantId)
            if (merchant == null) {
                _uiState.value = MerchantDetailUiState(isLoading = false, error = AppStrings.get(R.string.place_not_found))
                return@launch
            }
            val products = storeRepository.products(null, null, false, "popular", 0, StoreScope(), merchantId = merchantId, limit = 60)?.items.orEmpty()
            val saved = merchantId in placesRepository.favoriteIds()
            _uiState.value = MerchantDetailUiState(isLoading = false, merchant = merchant, products = products, saved = saved)
        }
    }

    fun toggleSaved() {
        val saved = _uiState.value.saved
        _uiState.update { it.copy(saved = !saved) }
        viewModelScope.launch {
            placesRepository.setSaved(merchantId, !saved).onFailure { error ->
                _uiState.update { it.copy(saved = saved, message = error.message) }
            }
        }
    }

    fun clearMessage() = _uiState.update { it.copy(message = null) }

    fun setTab(tab: String) = _uiState.update { it.copy(tab = tab) }

    fun setSort(sort: String) = _uiState.update { it.copy(sort = sort) }

    fun consumeNeedLogin() = _uiState.update { it.copy(needLogin = false) }

    fun addToCart(productId: String) {
        viewModelScope.launch {
            if (!authRepository.hasStoredSession()) {
                _uiState.update { it.copy(needLogin = true) }
                return@launch
            }
            cartRepository.addItem(productId, 1)
                .onSuccess {
                    _uiState.update { s -> s.copy(justAdded = productId) }
                    delay(1600)
                    _uiState.update { s -> if (s.justAdded == productId) s.copy(justAdded = null) else s }
                }
                .onFailure { e -> _uiState.update { it.copy(message = e.message) } }
        }
    }
}
