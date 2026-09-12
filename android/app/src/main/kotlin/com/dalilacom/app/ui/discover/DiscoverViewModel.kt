package com.dalilacom.app.ui.discover

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.dalilacom.app.data.network.CategoryDto
import com.dalilacom.app.data.network.MerchantDto
import com.dalilacom.app.data.repository.DiscoverRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class DiscoverUiState(
    val isLoading: Boolean = true,
    val categories: List<CategoryDto> = emptyList(),
    val selectedCategoryId: String? = null,
    val query: String = "",
    val merchants: List<MerchantDto> = emptyList(),
)

class DiscoverViewModel(private val repository: DiscoverRepository) : ViewModel() {
    private val _uiState = MutableStateFlow(DiscoverUiState())
    val uiState: StateFlow<DiscoverUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            val categories = repository.getCategories()
            _uiState.value = _uiState.value.copy(categories = categories)
            search()
        }
    }

    fun onQueryChange(query: String) {
        _uiState.value = _uiState.value.copy(query = query)
        search()
    }

    fun onCategorySelected(categoryId: String?) {
        _uiState.value = _uiState.value.copy(selectedCategoryId = categoryId)
        search()
    }

    private fun search() {
        val state = _uiState.value
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true)
            val results = repository.searchMerchants(
                query = state.query.ifBlank { null },
                categoryId = state.selectedCategoryId,
            )
            _uiState.value = _uiState.value.copy(isLoading = false, merchants = results)
        }
    }
}
