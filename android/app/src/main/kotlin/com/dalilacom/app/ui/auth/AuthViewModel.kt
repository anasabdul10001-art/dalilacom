package com.dalilacom.app.ui.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
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

    fun register(email: String, password: String, fullName: String) {
        if (email.isBlank() || password.isBlank() || fullName.isBlank()) {
            _uiState.value = AuthUiState.Error("عبّي كل الحقول أول")
            return
        }
        _uiState.value = AuthUiState.Loading
        viewModelScope.launch {
            repository.register(email, password, fullName)
                .onSuccess { _uiState.value = AuthUiState.Success }
                .onFailure { _uiState.value = AuthUiState.Error(it.message ?: "صار خطأ") }
        }
    }

    fun login(email: String, password: String) {
        if (email.isBlank() || password.isBlank()) {
            _uiState.value = AuthUiState.Error("دخّل الإيميل وكلمة السر")
            return
        }
        _uiState.value = AuthUiState.Loading
        viewModelScope.launch {
            repository.login(email, password)
                .onSuccess { _uiState.value = AuthUiState.Success }
                .onFailure { _uiState.value = AuthUiState.Error(it.message ?: "صار خطأ") }
        }
    }

    fun resetState() {
        _uiState.value = AuthUiState.Idle
    }
}
