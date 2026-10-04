package com.dalilacom.app.ui.merchant

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.dalilacom.app.data.network.MerchantDto
import com.dalilacom.app.data.network.ProductDto
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
    val products: List<ProductDto> = emptyList(),
    val saved: Boolean = false,
    val message: String? = null,
    val error: String? = null,
)

class MerchantDetailViewModel(
    private val discoverRepository: DiscoverRepository,
    private val productRepository: ProductRepository,
    private val placesRepository: PlacesRepository,
    private val merchantId: String,
) : ViewModel() {
    private val _uiState = MutableStateFlow(MerchantDetailUiState())
    val uiState: StateFlow<MerchantDetailUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            val merchant = discoverRepository.getMerchant(merchantId)
            if (merchant == null) {
                _uiState.value = MerchantDetailUiState(isLoading = false, error = "هذا المحل غير متوفر")
                return@launch
            }
            val products = productRepository.getProducts(merchantId)
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
}
