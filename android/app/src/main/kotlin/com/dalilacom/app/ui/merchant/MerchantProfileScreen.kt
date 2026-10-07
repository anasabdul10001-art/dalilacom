package com.dalilacom.app.ui.merchant

import com.dalilacom.app.R
import com.dalilacom.app.ui.i18n.AppStrings
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.dalilacom.app.data.network.UpdateMerchantRequest
import com.dalilacom.app.data.repository.DiscoverRepository
import com.dalilacom.app.data.repository.MerchantRepository
import com.dalilacom.app.ui.ViewModelFactory
import com.dalilacom.app.data.network.CategoryDto
import com.dalilacom.app.ui.common.CategoryPicker
import com.dalilacom.app.ui.common.LocationPicker
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class MerchantProfileUiState(
    val isLoading: Boolean = true,
    val isSaving: Boolean = false,
    val categories: List<CategoryDto> = emptyList(),
    val businessName: String = "",
    val categoryId: String? = null,
    val address: String = "",
    val phone: String = "",
    val whatsapp: String = "",
    val location: Pair<Double, Double>? = null,
    val message: String? = null,
    val isError: Boolean = false,
)

class MerchantProfileViewModel(
    private val merchants: MerchantRepository,
    private val discover: DiscoverRepository,
) : ViewModel() {
    private val _uiState = MutableStateFlow(MerchantProfileUiState())
    val uiState: StateFlow<MerchantProfileUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            val categories = discover.getCategories()
            val me = merchants.getMerchantMe()
            _uiState.value = MerchantProfileUiState(
                isLoading = false,
                categories = categories,
                businessName = me?.businessName.orEmpty(),
                categoryId = me?.categoryId,
                address = me?.address.orEmpty(),
                phone = me?.phone.orEmpty(),
                whatsapp = me?.whatsapp.orEmpty(),
                location = if (me?.latitude != null && me.longitude != null) me.latitude to me.longitude else null,
            )
        }
    }

    fun onName(value: String) = _uiState.update { it.copy(businessName = value, message = null) }
    fun onCategory(id: String?) = _uiState.update { it.copy(categoryId = id, message = null) }
    fun onAddress(value: String) = _uiState.update { it.copy(address = value, message = null) }
    fun onPhone(value: String) = _uiState.update { it.copy(phone = value, message = null) }
    fun onWhatsapp(value: String) = _uiState.update { it.copy(whatsapp = value, message = null) }
    fun onLocation(value: Pair<Double, Double>) = _uiState.update { it.copy(location = value, message = null) }

    fun save() {
        val s = _uiState.value
        if (s.businessName.trim().length < 2) {
            _uiState.update { it.copy(message = AppStrings.get(R.string.s_f835f24d), isError = true) }
            return
        }
        viewModelScope.launch {
            _uiState.update { it.copy(isSaving = true, message = null) }
            val result = merchants.updateListing(
                UpdateMerchantRequest(
                    businessName = s.businessName.trim(),
                    categoryId = s.categoryId,
                    address = s.address.trim(),
                    phone = s.phone.trim(),
                    whatsapp = s.whatsapp.filter { it.isDigit() },
                    latitude = s.location?.first,
                    longitude = s.location?.second,
                ),
            )
            _uiState.update {
                it.copy(
                    isSaving = false,
                    isError = result.isFailure,
                    message = result.exceptionOrNull()?.message ?: AppStrings.get(R.string.s_997f9752),
                )
            }
        }
    }
}

/** A merchant edits what customers see on the map and on the shop's page. */
@Composable
fun MerchantProfileScreen(factory: ViewModelFactory, onBack: () -> Unit) {
    val viewModel: MerchantProfileViewModel = viewModel(factory = factory)
    val state by viewModel.uiState.collectAsState()

    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = onBack) { Text(AppStrings.get(R.string.s_69c86923)) }
            Text(AppStrings.get(R.string.s_e2e9f99a), style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.primary)
        }
        if (state.isLoading) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            return@Column
        }
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
            OutlinedTextField(
                value = state.businessName,
                onValueChange = viewModel::onName,
                label = { Text(AppStrings.get(R.string.s_59539fc9)) },
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(12.dp))
            CategoryPicker(tree = state.categories, selectedId = state.categoryId, onSelect = viewModel::onCategory)
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(value = state.address, onValueChange = viewModel::onAddress, label = { Text(AppStrings.get(R.string.s_baffa49c)) }, modifier = Modifier.fillMaxWidth())
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(value = state.phone, onValueChange = viewModel::onPhone, label = { Text(AppStrings.get(R.string.s_760c65a1)) }, modifier = Modifier.fillMaxWidth())
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(
                value = state.whatsapp,
                onValueChange = viewModel::onWhatsapp,
                label = { Text(AppStrings.get(R.string.s_1bef7f7d)) },
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(16.dp))
            LocationPicker(value = state.location, onChange = viewModel::onLocation)
            Spacer(Modifier.height(16.dp))
            Button(onClick = viewModel::save, enabled = !state.isSaving, shape = RoundedCornerShape(14.dp), modifier = Modifier.fillMaxWidth().height(52.dp)) {
                Text(AppStrings.get(R.string.s_56ee6e0d))
            }
            state.message?.let {
                Spacer(Modifier.height(8.dp))
                Text(it, color = if (state.isError) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary)
            }
            Spacer(Modifier.height(24.dp))
        }
    }
}
