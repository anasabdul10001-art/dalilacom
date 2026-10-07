package com.dalilacom.app.ui.responder

import com.dalilacom.app.R
import com.dalilacom.app.ui.i18n.AppStrings
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.dalilacom.app.data.network.WalletDto
import com.dalilacom.app.data.network.WalletMethodsDto
import com.dalilacom.app.data.repository.ResponderRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class WalletUiState(
    val isLoading: Boolean = true,
    val isBusy: Boolean = false,
    val error: String? = null,
    val info: String? = null,
    val wallet: WalletDto? = null,
    val methods: WalletMethodsDto? = null,
)

class WalletViewModel(private val repository: ResponderRepository) : ViewModel() {
    private val _uiState = MutableStateFlow(WalletUiState())
    val uiState: StateFlow<WalletUiState> = _uiState.asStateFlow()

    init {
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }
            val wallet = repository.wallet()
            val methods = repository.walletMethods()
            _uiState.update {
                it.copy(
                    isLoading = false,
                    wallet = wallet.getOrNull() ?: it.wallet,
                    methods = methods.getOrNull() ?: it.methods,
                    error = wallet.exceptionOrNull()?.message,
                )
            }
        }
    }

    fun submitTopUp(method: String, reference: String, amount: String) {
        val parsedAmount = amount.trim().replace(",", ".").toDoubleOrNull()
        if (method.isBlank() || reference.isBlank()) {
            _uiState.update { it.copy(error = AppStrings.get(R.string.s_51ed1058), info = null) }
            return
        }
        viewModelScope.launch {
            _uiState.update { it.copy(isBusy = true, error = null, info = null) }
            val result = repository.topUp(method, reference.trim(), parsedAmount)
            val failure = result.exceptionOrNull()
            val topUp = result.getOrNull()
            _uiState.update {
                it.copy(
                    isBusy = false,
                    error = failure?.message,
                    info = when {
                        failure != null -> null
                        topUp?.status == "APPROVED" -> AppStrings.get(R.string.s_66414100)
                        else -> AppStrings.get(R.string.s_0a2bc37f)
                    },
                )
            }
            if (failure == null) refresh()
        }
    }
}
