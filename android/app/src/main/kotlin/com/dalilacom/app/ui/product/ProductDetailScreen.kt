package com.dalilacom.app.ui.product

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.dalilacom.app.data.AppContainer
import com.dalilacom.app.ui.common.formatCents

@Composable
fun ProductDetailScreen(
    container: AppContainer,
    productId: String,
    onBack: () -> Unit,
    onGoToCart: () -> Unit,
) {
    val viewModel: ProductDetailViewModel = viewModel(
        factory = viewModelFactory {
            initializer { ProductDetailViewModel(container.productRepository, container.cartRepository, productId) }
        },
    )
    val state by viewModel.uiState.collectAsState()

    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        TextButton(onClick = onBack) { Text("‹ رجوع") }

        when {
            state.isLoading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
            state.error != null && state.product == null -> Text(state.error!!, color = MaterialTheme.colorScheme.error)
            else -> {
                val product = state.product!!
                Text(product.name, style = MaterialTheme.typography.headlineSmall, color = MaterialTheme.colorScheme.primary)
                Spacer(Modifier.height(8.dp))
                product.description?.let { Text(it, style = MaterialTheme.typography.bodyMedium) }
                Spacer(Modifier.height(12.dp))

                if (product.memberDiscountEnabled && product.memberPriceCents != null) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            formatCents(product.priceCents),
                            style = MaterialTheme.typography.titleMedium,
                            textDecoration = TextDecoration.LineThrough,
                        )
                        Text(
                            "  ${formatCents(product.memberPriceCents)} — سعر أعضاء دليلكم",
                            style = MaterialTheme.typography.titleMedium,
                            color = MaterialTheme.colorScheme.primary,
                        )
                    }
                } else {
                    Text(formatCents(product.priceCents), style = MaterialTheme.typography.titleMedium)
                }

                Spacer(Modifier.height(8.dp))
                val available = product.isActive && product.stock > 0
                if (!available) {
                    Text("غير متوفر حاليًا", color = MaterialTheme.colorScheme.error)
                } else {
                    Text("المتوفر بالمخزون: ${product.stock}", style = MaterialTheme.typography.bodySmall)
                }

                Spacer(Modifier.height(20.dp))

                if (available) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        OutlinedButton(onClick = viewModel::decrementQuantity) { Text("-") }
                        Text("${state.quantity}", modifier = Modifier.padding(horizontal = 16.dp))
                        OutlinedButton(onClick = viewModel::incrementQuantity) { Text("+") }
                    }
                    Spacer(Modifier.height(16.dp))
                    Button(
                        onClick = viewModel::addToCart,
                        enabled = !state.isAddingToCart,
                        modifier = Modifier.fillMaxWidth(),
                    ) { Text("أضف للسلة") }

                    if (state.addedToCart) {
                        Spacer(Modifier.height(8.dp))
                        Text("تمت الإضافة للسلة ✓", color = MaterialTheme.colorScheme.primary)
                        TextButton(onClick = onGoToCart) { Text("روح للسلة") }
                    }
                }

                state.error?.let {
                    Spacer(Modifier.height(8.dp))
                    Text(it, color = MaterialTheme.colorScheme.error)
                }
            }
        }
    }
}
