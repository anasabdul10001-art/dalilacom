package com.dalilacom.app.ui.merchantmode

import com.dalilacom.app.R
import com.dalilacom.app.ui.i18n.AppStrings
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.dalilacom.app.data.network.DiscountDto
import com.dalilacom.app.data.network.ProductDto
import com.dalilacom.app.data.repository.MerchantRepository
import com.dalilacom.app.data.repository.ProductRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import com.dalilacom.app.ui.common.parseInt

data class CatalogUiState(
    val isLoading: Boolean = true,
    val discounts: List<DiscountDto> = emptyList(),
    val products: List<ProductDto> = emptyList(),
    val discountTitle: String = "",
    val discountPercent: String = "",
    val isAddingDiscount: Boolean = false,
    val error: String? = null,
)

class CatalogViewModel(
    private val merchantRepository: MerchantRepository,
    private val productRepository: ProductRepository,
) : ViewModel() {
    private val _uiState = MutableStateFlow(CatalogUiState())
    val uiState: StateFlow<CatalogUiState> = _uiState.asStateFlow()

    init {
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true)
            val me = merchantRepository.getMerchantMe()
            val products = productRepository.getMyProducts()
            _uiState.value = _uiState.value.copy(
                isLoading = false,
                discounts = me?.discounts.orEmpty(),
                products = products,
            )
        }
    }

    fun onDiscountTitleChange(value: String) {
        _uiState.value = _uiState.value.copy(discountTitle = value)
    }

    fun onDiscountPercentChange(value: String) {
        _uiState.value = _uiState.value.copy(discountPercent = value)
    }

    fun addDiscount() {
        val state = _uiState.value
        val percent = state.discountPercent.parseInt()
        if (state.discountTitle.isBlank() || percent == null || percent !in 1..100) {
            _uiState.value = state.copy(error = AppStrings.get(R.string.s_96a2838a))
            return
        }
        _uiState.value = state.copy(isAddingDiscount = true, error = null)
        viewModelScope.launch {
            merchantRepository.addDiscount(state.discountTitle.trim(), percent)
                .onSuccess {
                    _uiState.value = _uiState.value.copy(
                        isAddingDiscount = false,
                        discountTitle = "",
                        discountPercent = "",
                    )
                    refresh()
                }
                .onFailure { _uiState.value = _uiState.value.copy(isAddingDiscount = false, error = it.message) }
        }
    }
}
