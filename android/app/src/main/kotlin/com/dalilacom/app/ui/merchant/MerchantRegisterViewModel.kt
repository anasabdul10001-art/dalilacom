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
    /** Public places of the same name close to the pin: the person is offered to claim one instead of registering a duplicate. */
    val similar: List<com.dalilacom.app.data.network.SimilarLandmarkDto> = emptyList(),
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

    suspend fun searchCategories(query: String) = discoverRepository.searchCategories(query)
    suspend fun addressFor(lat: Double, lng: Double) = discoverRepository.addressFor(lat, lng)
    suspend fun searchAddresses(query: String) = discoverRepository.suggestAddresses(query)
    suspend fun guessCategory(name: String) = discoverRepository.guessCategoryForName(name)

    fun dismissSimilar() { _uiState.value = _uiState.value.copy(similar = emptyList()) }

    fun register(businessName: String, categoryId: String?, address: String, phone: String, whatsapp: String, location: Pair<Double, Double>?, suggestedCategory: String? = null, skipSimilar: Boolean = false) {
        if (businessName.isBlank() || categoryId == null) {
            _uiState.value = _uiState.value.copy(error = AppStrings.get(R.string.s_d5a3c41f))
            return
        }
        _uiState.value = _uiState.value.copy(isSubmitting = true, error = null)
        viewModelScope.launch {
            // with a pin: the same name close to it; without one (an address only): the same name and an address that does not contradict
            if (!skipSimilar && (location != null || address.isNotBlank())) {
                val similar = discoverRepository.similarLandmarks(businessName.trim(), location?.first, location?.second, address)
                if (similar.isNotEmpty()) {
                    _uiState.value = _uiState.value.copy(isSubmitting = false, similar = similar)
                    return@launch
                }
            }
            merchantRepository.registerMerchant(
                businessName, categoryId, address.ifBlank { null }, phone.ifBlank { null },
                whatsapp.filter { it.isDigit() }.ifBlank { null }, location, suggestedCategory?.trim()?.takeIf { it.length >= 2 },
            )
                .onSuccess { _uiState.value = _uiState.value.copy(isSubmitting = false, result = it) }
                .onFailure { _uiState.value = _uiState.value.copy(isSubmitting = false, error = it.message) }
        }
    }
}
