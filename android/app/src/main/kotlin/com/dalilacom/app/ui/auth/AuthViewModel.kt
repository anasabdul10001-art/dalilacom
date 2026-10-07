package com.dalilacom.app.ui.auth

import com.dalilacom.app.R
import com.dalilacom.app.ui.i18n.AppStrings
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.dalilacom.app.data.network.SocialProvidersDto
import com.dalilacom.app.data.repository.AuthRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed interface AuthUiState {
    data object Idle : AuthUiState
    data object Loading : AuthUiState
    data object Success : AuthUiState
    data class Error(val message: String) : AuthUiState
}

class AuthViewModel(private val repository: AuthRepository) : ViewModel() {
    private val _uiState = MutableStateFlow<AuthUiState>(AuthUiState.Idle)
    val uiState: StateFlow<AuthUiState> = _uiState.asStateFlow()

    private val _socialProviders = MutableStateFlow(SocialProvidersDto())
    val socialProviders: StateFlow<SocialProvidersDto> = _socialProviders.asStateFlow()

    init {
        viewModelScope.launch { _socialProviders.value = repository.socialProviders() }
    }

    fun exchangeTicket(ticket: String) {
        _uiState.value = AuthUiState.Loading
        viewModelScope.launch {
            repository.socialExchange(ticket)
                .onSuccess { _uiState.value = AuthUiState.Success }
                .onFailure { _uiState.value = AuthUiState.Error(it.message ?: AppStrings.get(R.string.social_failed)) }
        }
    }

    fun register(email: String, password: String, fullName: String) {
        if (email.isBlank() || password.isBlank() || fullName.isBlank()) {
            _uiState.value = AuthUiState.Error(AppStrings.get(R.string.s_c5324447))
            return
        }
        _uiState.value = AuthUiState.Loading
        viewModelScope.launch {
            repository.register(email, password, fullName)
                .onSuccess { _uiState.value = AuthUiState.Success }
                .onFailure { _uiState.value = AuthUiState.Error(it.message ?: AppStrings.get(R.string.s_6c21e27c)) }
        }
    }

    fun login(email: String, password: String) {
        if (email.isBlank() || password.isBlank()) {
            _uiState.value = AuthUiState.Error(AppStrings.get(R.string.s_1dbf1d4a))
            return
        }
        _uiState.value = AuthUiState.Loading
        viewModelScope.launch {
            repository.login(email, password)
                .onSuccess { _uiState.value = AuthUiState.Success }
                .onFailure { _uiState.value = AuthUiState.Error(it.message ?: AppStrings.get(R.string.s_6c21e27c)) }
        }
    }

    fun resetState() {
        _uiState.value = AuthUiState.Idle
    }
}
