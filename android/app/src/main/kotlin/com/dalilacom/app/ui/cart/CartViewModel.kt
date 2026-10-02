package com.dalilacom.app.ui.cart

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.dalilacom.app.data.network.CartItemDto
import com.dalilacom.app.data.network.CartViewDto
import com.dalilacom.app.data.network.OrderDto
import com.dalilacom.app.data.repository.CartRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class CartUiState(
    val isLoading: Boolean = true,
    val items: List<CartItemDto> = emptyList(),
    val totalCents: Int = 0,
    val error: String? = null,
    val checkoutOrders: List<OrderDto>? = null,
)

class CartViewModel(private val repository: CartRepository) : ViewModel() {
    private val _uiState = MutableStateFlow(CartUiState())
    val uiState: StateFlow<CartUiState> = _uiState.asStateFlow()

    init {
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, error = null)
            val cart = repository.getCart()
            _uiState.value = _uiState.value.copy(
                isLoading = false,
                items = cart?.items.orEmpty(),
                totalCents = cart?.totalCents ?: 0,
            )
        }
    }

    fun increment(item: CartItemDto) = updateQuantity(item, item.quantity + 1)

    fun decrement(item: CartItemDto) {
        if (item.quantity <= 1) remove(item) else updateQuantity(item, item.quantity - 1)
    }

    private fun updateQuantity(item: CartItemDto, quantity: Int) {
        viewModelScope.launch {
            repository.updateItem(item.id, quantity)
                .onSuccess(::applyCart)
                .onFailure { _uiState.value = _uiState.value.copy(error = it.message) }
        }
    }

    fun remove(item: CartItemDto) {
        viewModelScope.launch {
            repository.removeItem(item.id)
                .onSuccess(::applyCart)
                .onFailure { _uiState.value = _uiState.value.copy(error = it.message) }
        }
    }

    fun checkout() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, error = null)
            repository.checkout()
                .onSuccess { orders ->
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        items = emptyList(),
                        totalCents = 0,
                        checkoutOrders = orders,
                    )
                }
                .onFailure { _uiState.value = _uiState.value.copy(isLoading = false, error = it.message) }
        }
    }

    fun consumeCheckoutSuccess() {
        _uiState.value = _uiState.value.copy(checkoutOrders = null)
    }

    private fun applyCart(cart: CartViewDto) {
        _uiState.value = _uiState.value.copy(items = cart.items, totalCents = cart.totalCents)
    }
}
