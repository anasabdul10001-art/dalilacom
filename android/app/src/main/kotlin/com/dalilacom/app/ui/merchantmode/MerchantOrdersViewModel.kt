package com.dalilacom.app.ui.merchantmode

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.dalilacom.app.data.network.OrderDto
import com.dalilacom.app.data.repository.OrderRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class MerchantOrdersUiState(
    val isLoading: Boolean = true,
    val orders: List<OrderDto> = emptyList(),
    val error: String? = null,
    val reviewTarget: com.dalilacom.app.ui.common.ReviewTarget? = null,
    val reviewBusy: Boolean = false,
    val reviewError: String? = null,
)

class MerchantOrdersViewModel(private val repository: OrderRepository, private val reviews: com.dalilacom.app.data.repository.ReviewsRepository) : ViewModel() {
    private val _uiState = MutableStateFlow(MerchantOrdersUiState())
    val uiState: StateFlow<MerchantOrdersUiState> = _uiState.asStateFlow()

    init {
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true)
            _uiState.value = _uiState.value.copy(isLoading = false, orders = repository.getMerchantOrders())
        }
    }

    fun openReview(customerId: String, name: String) {
        _uiState.value = _uiState.value.copy(reviewTarget = com.dalilacom.app.ui.common.ReviewTarget("customer", customerId, name), reviewError = null)
    }

    fun closeReview() { _uiState.value = _uiState.value.copy(reviewTarget = null) }

    fun sendReview(stars: Int, comment: String) {
        val target = _uiState.value.reviewTarget ?: return
        _uiState.value = _uiState.value.copy(reviewBusy = true, reviewError = null)
        viewModelScope.launch {
            reviews.send("customer", target.id, stars, comment)
                .onSuccess { _uiState.value = _uiState.value.copy(reviewBusy = false, reviewTarget = null); refresh() }
                .onFailure { e -> _uiState.value = _uiState.value.copy(reviewBusy = false, reviewError = e.message) }
        }
    }

    fun advance(orderId: String, status: String) {
        viewModelScope.launch {
            repository.updateStatus(orderId, status)
                .onSuccess { refresh() }
                .onFailure { _uiState.value = _uiState.value.copy(error = it.message) }
        }
    }

    fun cancelWithReason(orderId: String, reason: String) {
        viewModelScope.launch {
            repository.updateStatus(orderId, "CANCELLED", reason)
                .onSuccess { refresh() }
                .onFailure { _uiState.value = _uiState.value.copy(error = it.message) }
        }
    }
}
