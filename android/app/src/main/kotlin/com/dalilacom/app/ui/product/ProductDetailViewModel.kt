package com.dalilacom.app.ui.product

import com.dalilacom.app.R
import com.dalilacom.app.ui.i18n.AppStrings
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.dalilacom.app.data.network.ProductDto
import com.dalilacom.app.data.repository.CartRepository
import com.dalilacom.app.data.repository.ProductRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class ProductDetailUiState(
    val isLoading: Boolean = true,
    val product: ProductDto? = null,
    val quantity: Int = 1,
    val isAddingToCart: Boolean = false,
    val addedToCart: Boolean = false,
    val error: String? = null,
)

class ProductDetailViewModel(
    private val productRepository: ProductRepository,
    private val cartRepository: CartRepository,
    private val productId: String,
) : ViewModel() {
    private val _uiState = MutableStateFlow(ProductDetailUiState())
    val uiState: StateFlow<ProductDetailUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            val product = productRepository.getProduct(productId)
            _uiState.value = if (product == null) {
                ProductDetailUiState(isLoading = false, error = AppStrings.get(R.string.s_a652e16c))
            } else {
                ProductDetailUiState(isLoading = false, product = product)
            }
        }
    }

    fun incrementQuantity() {
        val product = _uiState.value.product ?: return
        val next = _uiState.value.quantity + 1
        if (next <= product.stock) _uiState.value = _uiState.value.copy(quantity = next)
    }

    fun decrementQuantity() {
        val next = _uiState.value.quantity - 1
        if (next >= 1) _uiState.value = _uiState.value.copy(quantity = next)
    }

    fun addToCart() {
        val quantity = _uiState.value.quantity
        _uiState.value = _uiState.value.copy(isAddingToCart = true, error = null)
        viewModelScope.launch {
            cartRepository.addItem(productId, quantity)
                .onSuccess { _uiState.value = _uiState.value.copy(isAddingToCart = false, addedToCart = true) }
                .onFailure { _uiState.value = _uiState.value.copy(isAddingToCart = false, error = it.message) }
        }
    }

    fun consumeAddedToCart() {
        _uiState.value = _uiState.value.copy(addedToCart = false)
    }
}
