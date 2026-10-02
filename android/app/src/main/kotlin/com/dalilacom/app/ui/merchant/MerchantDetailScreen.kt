package com.dalilacom.app.ui.merchant

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.dalilacom.app.data.AppContainer
import com.dalilacom.app.data.network.ProductDto
import com.dalilacom.app.ui.common.formatCents

@Composable
fun MerchantDetailScreen(
    container: AppContainer,
    merchantId: String,
    onProductClick: (String) -> Unit,
    onBack: () -> Unit,
) {
    val viewModel: MerchantDetailViewModel = viewModel(
        factory = viewModelFactory {
            initializer { MerchantDetailViewModel(container.discoverRepository, container.productRepository, merchantId) }
        },
    )
    val state by viewModel.uiState.collectAsState()

    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        TextButton(onClick = onBack) { Text("‹ رجوع") }

        when {
            state.isLoading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
            state.error != null -> Text(state.error!!, color = MaterialTheme.colorScheme.error)
            else -> {
                val merchant = state.merchant!!
                Text(merchant.businessName, style = MaterialTheme.typography.headlineSmall, color = MaterialTheme.colorScheme.primary)
                merchant.category?.let { Text(it.name, style = MaterialTheme.typography.bodyMedium) }
                merchant.address?.let { Text("📍 $it", style = MaterialTheme.typography.bodyMedium) }

                if (merchant.discounts.isNotEmpty()) {
                    Spacer(Modifier.height(8.dp))
                    merchant.discounts.forEach { discount ->
                        Text(
                            "🏷️ ${discount.title} — ${discount.percent}%",
                            color = MaterialTheme.colorScheme.primary,
                            style = MaterialTheme.typography.bodyMedium,
                        )
                    }
                }

                Spacer(Modifier.height(16.dp))
                Text("المنتجات", style = MaterialTheme.typography.titleMedium)
                Spacer(Modifier.height(8.dp))

                if (state.products.isEmpty()) {
                    Text("ما في منتجات بعد", style = MaterialTheme.typography.bodyMedium)
                } else {
                    LazyColumn {
                        items(state.products, key = { it.id }) { product ->
                            ProductRow(product, onClick = { onProductClick(product.id) })
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ProductRow(product: ProductDto, onClick: () -> Unit) {
    Card(modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp).clickable(onClick = onClick)) {
        Column(Modifier.padding(16.dp)) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(product.name, style = MaterialTheme.typography.titleMedium)
                if (!product.isActive || product.stock <= 0) {
                    Text("غير متوفر", color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                }
            }
            if (product.memberDiscountEnabled && product.memberPriceCents != null) {
                Text(
                    "${formatCents(product.priceCents)}  →  ${formatCents(product.memberPriceCents)} لأعضاء دليلكم",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.primary,
                )
            } else {
                Text(formatCents(product.priceCents), style = MaterialTheme.typography.bodyMedium)
            }
        }
    }
}
