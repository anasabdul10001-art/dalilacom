package com.dalilacom.app.ui.cart

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.dalilacom.app.R
import com.dalilacom.app.ui.i18n.AppStrings
import com.dalilacom.app.data.network.CartItemDto
import com.dalilacom.app.data.network.CartShippingDto
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
    val shipping: List<CartShippingDto> = emptyList(),
    val picks: Map<String, String> = emptyMap(), // shop id -> chosen shipping method id
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
                shipping = cart?.shipping.orEmpty(),
                picks = withSingles(cart?.shipping.orEmpty(), _uiState.value.picks),
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

    fun pick(merchantId: String, methodId: String) {
        _uiState.value = _uiState.value.copy(picks = _uiState.value.picks + (merchantId to methodId), error = null)
    }

    /** What the chosen shipping methods cost, all shops together. */
    fun shippingTotal(state: CartUiState): Int =
        state.shipping.sumOf { s -> s.methods.firstOrNull { it.id == state.picks[s.merchantId] }?.costCents ?: 0 }

    fun checkout() {
        val state = _uiState.value
        if (state.shipping.any { s -> s.methods.isNotEmpty() && s.methods.none { it.id == state.picks[s.merchantId] } }) {
            _uiState.value = state.copy(error = AppStrings.get(R.string.ship_pick_all))
            return
        }
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, error = null)
            repository.checkout(state.picks)
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
        _uiState.value = _uiState.value.copy(items = cart.items, totalCents = cart.totalCents, shipping = cart.shipping, picks = withSingles(cart.shipping, _uiState.value.picks))
    }

    /** A shop with a single method needs no choosing; choices for methods that no longer exist are dropped. */
    private fun withSingles(shipping: List<CartShippingDto>, picks: Map<String, String>): Map<String, String> {
        val kept = picks.filter { (shop, id) -> shipping.any { s -> s.merchantId == shop && s.methods.any { it.id == id } } }
        return kept + shipping.filter { it.methods.size == 1 && it.merchantId !in kept }.associate { it.merchantId to it.methods[0].id }
    }
}
