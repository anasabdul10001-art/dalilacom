package com.dalilacom.app.ui.card

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.dalilacom.app.data.network.MembershipPlanDto
import com.dalilacom.app.data.repository.MembershipRepository
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class CardUiState(
    val isLoading: Boolean = true,
    val memberNumber: String? = null,
    val membershipStatus: String? = null,
    val validUntil: String? = null,
    val code: String? = null,
    val secondsRemaining: Int = 0,
    val availablePlans: List<MembershipPlanDto> = emptyList(),
    val error: String? = null,
)

class CardViewModel(private val repository: MembershipRepository) : ViewModel() {
    private val _uiState = MutableStateFlow(CardUiState())
    val uiState: StateFlow<CardUiState> = _uiState.asStateFlow()

    private var countdownJob: Job? = null

    init {
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, error = null)
            val membership = repository.getMyMembership()
            if (membership == null) {
                val plans = repository.getPlans().getOrDefault(emptyList())
                _uiState.value = CardUiState(isLoading = false, availablePlans = plans)
                return@launch
            }
            _uiState.value = _uiState.value.copy(
                isLoading = false,
                memberNumber = membership.memberNumber,
                membershipStatus = membership.status,
                validUntil = membership.endDate,
            )
            startCodeLoop()
        }
    }

    fun subscribe(planId: String) {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, error = null)
            repository.subscribe(planId)
                .onSuccess { refresh() }
                .onFailure { _uiState.value = _uiState.value.copy(isLoading = false, error = it.message) }
        }
    }

    private fun startCodeLoop() {
        countdownJob?.cancel()
        countdownJob = viewModelScope.launch {
            while (true) {
                val qr = repository.getMyQrCode()
                if (qr == null) {
                    _uiState.value = _uiState.value.copy(error = "تعذّر جلب الكود")
                    return@launch
                }
                _uiState.value = _uiState.value.copy(code = qr.code, secondsRemaining = qr.expiresInSeconds)
                // Tick the countdown locally each second, then fetch a fresh code once it hits zero.
                repeat(qr.expiresInSeconds) {
                    delay(1000)
                    _uiState.value = _uiState.value.copy(secondsRemaining = _uiState.value.secondsRemaining - 1)
                }
            }
        }
    }

    override fun onCleared() {
        super.onCleared()
        countdownJob?.cancel()
    }
}
