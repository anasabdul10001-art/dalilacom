package com.dalilacom.app.ui.orders

import com.dalilacom.app.R
import com.dalilacom.app.ui.i18n.AppStrings
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.dalilacom.app.data.network.OrderDto
import com.dalilacom.app.data.repository.OrderRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class OrderDetailUiState(
    val isLoading: Boolean = true,
    val order: OrderDto? = null,
    val isCancelling: Boolean = false,
    val error: String? = null,
)

class OrderDetailViewModel(
    private val repository: OrderRepository,
    private val orderId: String,
) : ViewModel() {
    private val _uiState = MutableStateFlow(OrderDetailUiState())
    val uiState: StateFlow<OrderDetailUiState> = _uiState.asStateFlow()

    init {
        load()
    }

    private fun load() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true)
            val order = repository.getOrder(orderId)
            _uiState.value = if (order == null) {
                OrderDetailUiState(isLoading = false, error = AppStrings.get(R.string.s_6e3a209c))
            } else {
                OrderDetailUiState(isLoading = false, order = order)
            }
        }
    }

    fun cancel() {
        _uiState.value = _uiState.value.copy(isCancelling = true, error = null)
        viewModelScope.launch {
            repository.cancel(orderId)
                .onSuccess { _uiState.value = _uiState.value.copy(isCancelling = false, order = it) }
                .onFailure { _uiState.value = _uiState.value.copy(isCancelling = false, error = it.message) }
        }
    }
}
