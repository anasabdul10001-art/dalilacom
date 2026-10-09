package com.dalilacom.app.ui.merchantmode

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.dalilacom.app.data.network.DiscountInput
import com.dalilacom.app.data.network.MyDiscountDto
import com.dalilacom.app.data.network.ProductDto
import com.dalilacom.app.data.network.StoreSectionDto
import com.dalilacom.app.data.repository.MerchantRepository
import com.dalilacom.app.data.repository.ProductRepository
import com.dalilacom.app.data.repository.StoreRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class DiscountsUiState(
    val isLoading: Boolean = true,
    val items: List<MyDiscountDto> = emptyList(),
    val products: List<ProductDto> = emptyList(),
    val sections: List<StoreSectionDto> = emptyList(),
    val isSaving: Boolean = false,
    val error: String? = null,
)

/** The shop's discount system: its list, and sending a new or changed discount to the admin. */
class DiscountsViewModel(
    private val merchantRepository: MerchantRepository,
    private val productRepository: ProductRepository,
    private val storeRepository: StoreRepository,
) : ViewModel() {
    private val _uiState = MutableStateFlow(DiscountsUiState())
    val uiState: StateFlow<DiscountsUiState> = _uiState.asStateFlow()

    init {
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            val items = merchantRepository.myDiscounts()
            val products = productRepository.getMyProducts()
            val sections = storeRepository.allSections()
            _uiState.value = _uiState.value.copy(isLoading = false, items = items, products = products, sections = sections)
        }
    }

    fun clearError() {
        _uiState.value = _uiState.value.copy(error = null)
    }

    /** [onDone] runs only when the admin has received it. */
    fun save(id: String?, input: DiscountInput, onDone: () -> Unit) {
        _uiState.value = _uiState.value.copy(isSaving = true, error = null)
        viewModelScope.launch {
            merchantRepository.saveDiscount(id, input)
                .onSuccess {
                    _uiState.value = _uiState.value.copy(isSaving = false)
                    refresh()
                    onDone()
                }
                .onFailure { _uiState.value = _uiState.value.copy(isSaving = false, error = it.message) }
        }
    }

    fun setActive(id: String, active: Boolean) = act { merchantRepository.setDiscountActive(id, active) }

    fun endNow(id: String) = act { merchantRepository.endDiscountNow(id) }

    fun delete(id: String) = act { merchantRepository.deleteDiscount(id) }

    private fun act(call: suspend () -> Result<Unit>) {
        viewModelScope.launch {
            call().onFailure { _uiState.value = _uiState.value.copy(error = it.message) }
            refresh()
        }
    }
}
