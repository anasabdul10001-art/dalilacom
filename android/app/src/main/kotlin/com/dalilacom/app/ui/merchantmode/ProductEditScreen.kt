package com.dalilacom.app.ui.merchantmode

import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.dalilacom.app.data.AppContainer

@Composable
fun ProductEditScreen(
    container: AppContainer,
    productId: String?,
    onSaved: () -> Unit,
    onBack: () -> Unit,
) {
    val viewModel: ProductEditViewModel = viewModel(
        factory = viewModelFactory {
            initializer { ProductEditViewModel(container.productRepository, container.discoverRepository, productId) }
        },
    )
    val state by viewModel.uiState.collectAsState()

    LaunchedEffect(state.saved) { if (state.saved) onSaved() }

    Column(modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
        TextButton(onClick = onBack) { Text("‹ رجوع") }
        Text(
            if (state.isNew) "منتج جديد" else "تعديل المنتج",
            style = MaterialTheme.typography.headlineSmall,
            color = MaterialTheme.colorScheme.primary,
        )
        Spacer(Modifier.height(16.dp))

        if (state.isLoading) {
            CircularProgressIndicator()
        } else {
            OutlinedTextField(
                value = state.name,
                onValueChange = viewModel::onNameChange,
                label = { Text("اسم المنتج") },
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(10.dp))
            OutlinedTextField(
                value = state.description,
                onValueChange = viewModel::onDescriptionChange,
                label = { Text("الوصف (اختياري)") },
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(10.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedTextField(
                    value = state.priceText,
                    onValueChange = viewModel::onPriceChange,
                    label = { Text("السعر") },
                    modifier = Modifier.weight(1f),
                )
                OutlinedTextField(
                    value = state.stockText,
                    onValueChange = viewModel::onStockChange,
                    label = { Text("المخزون") },
                    modifier = Modifier.weight(1f),
                )
            }
            Spacer(Modifier.height(10.dp))
            OutlinedTextField(
                value = state.sku,
                onValueChange = viewModel::onSkuChange,
                label = { Text("SKU (اختياري)") },
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(16.dp))

            Text("التصنيف", style = MaterialTheme.typography.bodyMedium)
            Spacer(Modifier.height(4.dp))
            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                items(state.categoryOptions) { option ->
                    FilterChip(
                        selected = state.selectedCategoryId == option.id,
                        onClick = {
                            viewModel.onCategorySelected(if (state.selectedCategoryId == option.id) null else option.id)
                        },
                        label = { Text(option.label) },
                    )
                }
            }
            Spacer(Modifier.height(16.dp))

            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("حسم أعضاء دليلكم", modifier = Modifier.weight(1f))
                Switch(checked = state.memberDiscountEnabled, onCheckedChange = viewModel::onMemberDiscountToggle)
            }
            if (state.memberDiscountEnabled) {
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = state.memberPriceText,
                    onValueChange = viewModel::onMemberPriceChange,
                    label = { Text("سعر العضو") },
                    modifier = Modifier.fillMaxWidth(),
                )
            }

            if (!state.isNew) {
                Spacer(Modifier.height(12.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("المنتج نشط", modifier = Modifier.weight(1f))
                    Switch(checked = state.isActive, onCheckedChange = viewModel::onActiveToggle)
                }
            }

            Spacer(Modifier.height(20.dp))
            Button(onClick = viewModel::save, enabled = !state.isSaving, modifier = Modifier.fillMaxWidth()) {
                Text("حفظ")
            }
        }

        state.error?.let {
            Spacer(Modifier.height(8.dp))
            Text(it, color = MaterialTheme.colorScheme.error)
        }
    }
}
