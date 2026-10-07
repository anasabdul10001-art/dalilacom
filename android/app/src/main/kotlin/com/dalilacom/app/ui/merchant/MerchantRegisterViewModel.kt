package com.dalilacom.app.ui.merchant

import com.dalilacom.app.R
import com.dalilacom.app.ui.i18n.AppStrings
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.dalilacom.app.data.network.CategoryDto
import com.dalilacom.app.data.network.RegisterMerchantResponse
import com.dalilacom.app.data.repository.DiscoverRepository
import com.dalilacom.app.data.repository.MerchantRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class CategoryOption(val id: String, val label: String)

data class MerchantRegisterUiState(
    val categories: List<CategoryDto> = emptyList(),
    val isSubmitting: Boolean = false,
    val error: String? = null,
    val result: RegisterMerchantResponse? = null,
)

class MerchantRegisterViewModel(
    private val merchantRepository: MerchantRepository,
    private val discoverRepository: DiscoverRepository,
) : ViewModel() {
    private val _uiState = MutableStateFlow(MerchantRegisterUiState())
    val uiState: StateFlow<MerchantRegisterUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(categories = discoverRepository.getCategories())
        }
    }

    fun register(businessName: String, categoryId: String?, address: String, phone: String, whatsapp: String, location: Pair<Double, Double>?) {
        if (businessName.isBlank() || categoryId == null) {
            _uiState.value = _uiState.value.copy(error = AppStrings.get(R.string.s_d5a3c41f))
            return
        }
        _uiState.value = _uiState.value.copy(isSubmitting = true, error = null)
        viewModelScope.launch {
            merchantRepository.registerMerchant(
                businessName, categoryId, address.ifBlank { null }, phone.ifBlank { null },
                whatsapp.filter { it.isDigit() }.ifBlank { null }, location,
            )
                .onSuccess { _uiState.value = _uiState.value.copy(isSubmitting = false, result = it) }
                .onFailure { _uiState.value = _uiState.value.copy(isSubmitting = false, error = it.message) }
        }
    }
}
