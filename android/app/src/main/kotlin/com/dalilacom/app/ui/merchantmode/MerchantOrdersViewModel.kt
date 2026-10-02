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
)

class MerchantOrdersViewModel(private val repository: OrderRepository) : ViewModel() {
    private val _uiState = MutableStateFlow(MerchantOrdersUiState())
    val uiState: StateFlow<MerchantOrdersUiState> = _uiState.asStateFlow()

    init {
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true)
            _uiState.value = MerchantOrdersUiState(isLoading = false, orders = repository.getMerchantOrders())
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
