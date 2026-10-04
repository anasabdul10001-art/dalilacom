package com.dalilacom.app.ui.merchant

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
import com.dalilacom.app.ui.common.LocationPicker
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class MerchantProfileUiState(
    val isLoading: Boolean = true,
    val isSaving: Boolean = false,
    val categoryOptions: List<CategoryOption> = emptyList(),
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
            val options = discover.getCategories().flatMap { top ->
                listOf(CategoryOption(top.id, top.name)) + top.children.map { CategoryOption(it.id, "${top.name} / ${it.name}") }
            }
            val me = merchants.getMerchantMe()
            _uiState.value = MerchantProfileUiState(
                isLoading = false,
                categoryOptions = options,
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
    fun onCategory(id: String) = _uiState.update { it.copy(categoryId = id, message = null) }
    fun onAddress(value: String) = _uiState.update { it.copy(address = value, message = null) }
    fun onPhone(value: String) = _uiState.update { it.copy(phone = value, message = null) }
    fun onWhatsapp(value: String) = _uiState.update { it.copy(whatsapp = value, message = null) }
    fun onLocation(value: Pair<Double, Double>) = _uiState.update { it.copy(location = value, message = null) }

    fun save() {
        val s = _uiState.value
        if (s.businessName.trim().length < 2) {
            _uiState.update { it.copy(message = "اكتب اسم المحل", isError = true) }
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
                    message = result.exceptionOrNull()?.message ?: "✅ انحفظت بيانات المحل",
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
            TextButton(onClick = onBack) { Text("‹ رجوع") }
            Text("بيانات المحل ومكانه", style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.primary)
        }
        if (state.isLoading) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            return@Column
        }
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
            OutlinedTextField(
                value = state.businessName,
                onValueChange = viewModel::onName,
                label = { Text("اسم المحل") },
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(12.dp))
            Text("التصنيف", style = MaterialTheme.typography.bodyMedium)
            Spacer(Modifier.height(4.dp))
            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                items(state.categoryOptions) { option ->
                    FilterChip(
                        selected = state.categoryId == option.id,
                        onClick = { viewModel.onCategory(option.id) },
                        label = { Text(option.label) },
                    )
                }
            }
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(value = state.address, onValueChange = viewModel::onAddress, label = { Text("العنوان") }, modifier = Modifier.fillMaxWidth())
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(value = state.phone, onValueChange = viewModel::onPhone, label = { Text("الهاتف") }, modifier = Modifier.fillMaxWidth())
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(
                value = state.whatsapp,
                onValueChange = viewModel::onWhatsapp,
                label = { Text("واتساب (مع رمز الدولة، مثل 9639xxxxxxxx)") },
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(16.dp))
            LocationPicker(value = state.location, onChange = viewModel::onLocation)
            Spacer(Modifier.height(16.dp))
            Button(onClick = viewModel::save, enabled = !state.isSaving, shape = RoundedCornerShape(14.dp), modifier = Modifier.fillMaxWidth().height(52.dp)) {
                Text("حفظ")
            }
            state.message?.let {
                Spacer(Modifier.height(8.dp))
                Text(it, color = if (state.isError) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary)
            }
            Spacer(Modifier.height(24.dp))
        }
    }
}
