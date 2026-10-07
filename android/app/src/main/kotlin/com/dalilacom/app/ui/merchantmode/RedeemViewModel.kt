package com.dalilacom.app.ui.merchantmode

import com.dalilacom.app.R
import com.dalilacom.app.ui.i18n.AppStrings
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.dalilacom.app.data.network.RedeemResponse
import com.dalilacom.app.data.repository.MerchantRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import com.dalilacom.app.ui.common.parseCents

enum class RedeemPhase { INPUT, VERIFIED, DONE }

data class RedeemUiState(
    val memberNumber: String = "",
    val code: String = "",
    val phase: RedeemPhase = RedeemPhase.INPUT,
    val isLoading: Boolean = false,
    val memberName: String? = null,
    val discountPercent: Int = 0,
    val billAmountText: String = "",
    val receipt: RedeemResponse? = null,
    val error: String? = null,
)

class RedeemViewModel(private val repository: MerchantRepository) : ViewModel() {
    private val _uiState = MutableStateFlow(RedeemUiState())
    val uiState: StateFlow<RedeemUiState> = _uiState.asStateFlow()

    /** The scanned QR encodes "memberNumber:code" — see CardScreen's QR generation. */
    fun onScanned(rawText: String) {
        val parts = rawText.split(":", limit = 2)
        if (parts.size == 2) {
            _uiState.value = _uiState.value.copy(memberNumber = parts[0], code = parts[1], error = null)
        } else {
            _uiState.value = _uiState.value.copy(error = AppStrings.get(R.string.s_8970aed0))
        }
    }

    fun onMemberNumberChange(value: String) {
        _uiState.value = _uiState.value.copy(memberNumber = value)
    }

    fun onCodeChange(value: String) {
        _uiState.value = _uiState.value.copy(code = value)
    }

    fun onBillAmountChange(value: String) {
        _uiState.value = _uiState.value.copy(billAmountText = value)
    }

    fun verify() {
        val state = _uiState.value
        if (state.memberNumber.isBlank() || state.code.length != 6) {
            _uiState.value = state.copy(error = AppStrings.get(R.string.s_48e7fe4b))
            return
        }
        _uiState.value = state.copy(isLoading = true, error = null)
        viewModelScope.launch {
            repository.verifyMember(state.memberNumber, state.code)
                .onSuccess { response ->
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        phase = RedeemPhase.VERIFIED,
                        memberName = response.member.fullName,
                        discountPercent = response.discount?.percent ?: 0,
                    )
                }
                .onFailure { _uiState.value = _uiState.value.copy(isLoading = false, error = it.message) }
        }
    }

    fun confirmRedeem() {
        val state = _uiState.value
        val billCents = state.billAmountText.parseCents()
        if (billCents == null || billCents <= 0) {
            _uiState.value = state.copy(error = AppStrings.get(R.string.s_33093b21))
            return
        }
        _uiState.value = state.copy(isLoading = true, error = null)
        viewModelScope.launch {
            repository.redeem(state.memberNumber, state.code, billCents)
                .onSuccess { response ->
                    _uiState.value = _uiState.value.copy(isLoading = false, phase = RedeemPhase.DONE, receipt = response)
                }
                .onFailure { _uiState.value = _uiState.value.copy(isLoading = false, error = it.message) }
        }
    }

    fun reset() {
        _uiState.value = RedeemUiState()
    }
}
