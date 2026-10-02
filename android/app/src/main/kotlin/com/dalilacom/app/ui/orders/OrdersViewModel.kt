package com.dalilacom.app.ui.orders

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.dalilacom.app.data.network.OrderDto
import com.dalilacom.app.data.repository.OrderRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class OrdersUiState(
    val isLoading: Boolean = true,
    val orders: List<OrderDto> = emptyList(),
)

class OrdersViewModel(private val repository: OrderRepository) : ViewModel() {
    private val _uiState = MutableStateFlow(OrdersUiState())
    val uiState: StateFlow<OrdersUiState> = _uiState.asStateFlow()

    init {
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true)
            val orders = repository.getMyOrders()
            _uiState.value = OrdersUiState(isLoading = false, orders = orders)
        }
    }
}
