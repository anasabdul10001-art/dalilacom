package com.dalilacom.app.ui.merchantmode

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.dalilacom.app.data.network.ProductDto
import com.dalilacom.app.ui.ViewModelFactory
import com.dalilacom.app.ui.common.formatCents

@Composable
fun CatalogScreen(factory: ViewModelFactory, onProductClick: (String) -> Unit, onAddProduct: () -> Unit) {
    val viewModel: CatalogViewModel = viewModel(factory = factory)
    val state by viewModel.uiState.collectAsState()

    LaunchedEffect(Unit) { viewModel.refresh() }

    Column(modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
        Text("الكتالوج", style = MaterialTheme.typography.headlineSmall, color = MaterialTheme.colorScheme.primary)
        Spacer(Modifier.height(16.dp))

        Card(modifier = Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp)) {
                Text("الحسومات", style = MaterialTheme.typography.titleMedium)
                Spacer(Modifier.height(8.dp))
                if (state.discounts.isEmpty()) {
                    Text("ما في حسومات بعد", style = MaterialTheme.typography.bodySmall)
                } else {
                    state.discounts.forEach { discount ->
                        Text("🏷️ ${discount.title} — ${discount.percent}%", color = MaterialTheme.colorScheme.primary)
                    }
                }
                Spacer(Modifier.height(12.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = state.discountTitle,
                        onValueChange = viewModel::onDiscountTitleChange,
                        label = { Text("عنوان الحسم") },
                        modifier = Modifier.weight(2f),
                    )
                    OutlinedTextField(
                        value = state.discountPercent,
                        onValueChange = viewModel::onDiscountPercentChange,
                        label = { Text("نسبة %") },
                        modifier = Modifier.weight(1f),
                    )
                }
                Spacer(Modifier.height(8.dp))
                Button(onClick = viewModel::addDiscount, enabled = !state.isAddingDiscount) { Text("إضافة حسم") }
            }
        }

        Spacer(Modifier.height(20.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("المنتجات", style = MaterialTheme.typography.titleMedium)
            Button(onClick = onAddProduct) { Text("+ منتج جديد") }
        }
        Spacer(Modifier.height(8.dp))

        when {
            state.isLoading -> CircularProgressIndicator()
            state.products.isEmpty() -> Text("ما في منتجات بعد", style = MaterialTheme.typography.bodyMedium)
            else -> state.products.forEach { product ->
                CatalogProductRow(product, onClick = { onProductClick(product.id) })
            }
        }

        state.error?.let {
            Spacer(Modifier.height(8.dp))
            Text(it, color = MaterialTheme.colorScheme.error)
        }
    }
}

@Composable
private fun CatalogProductRow(product: ProductDto, onClick: () -> Unit) {
    Card(modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp).clickable(onClick = onClick)) {
        Column(Modifier.padding(16.dp)) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(product.name, style = MaterialTheme.typography.titleMedium)
                Text(
                    if (product.isActive) "نشط" else "غير نشط",
                    color = if (product.isActive) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodySmall,
                )
            }
            Text("${formatCents(product.priceCents)} — مخزون: ${product.stock}", style = MaterialTheme.typography.bodySmall)
        }
    }
}
