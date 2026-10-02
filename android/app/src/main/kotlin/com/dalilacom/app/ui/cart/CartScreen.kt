package com.dalilacom.app.ui.cart

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.dalilacom.app.data.network.CartItemDto
import com.dalilacom.app.ui.ViewModelFactory
import com.dalilacom.app.ui.common.formatCents

@Composable
fun CartScreen(factory: ViewModelFactory, onCheckoutSuccess: () -> Unit) {
    val viewModel: CartViewModel = viewModel(factory = factory)
    val state by viewModel.uiState.collectAsState()

    LaunchedEffect(state.checkoutOrders) {
        if (state.checkoutOrders != null) {
            viewModel.consumeCheckoutSuccess()
            onCheckoutSuccess()
        }
    }

    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        Text("سلتي", style = MaterialTheme.typography.headlineSmall, color = MaterialTheme.colorScheme.primary)
        Spacer(Modifier.height(12.dp))

        when {
            state.isLoading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
            state.items.isEmpty() -> Text("سلتك فاضية", style = MaterialTheme.typography.bodyMedium)
            else -> {
                LazyColumn(modifier = Modifier.weight(1f, fill = false)) {
                    items(state.items, key = { it.id }) { item ->
                        CartItemRow(
                            item = item,
                            onIncrement = { viewModel.increment(item) },
                            onDecrement = { viewModel.decrement(item) },
                            onRemove = { viewModel.remove(item) },
                        )
                    }
                }
                Spacer(Modifier.height(12.dp))
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("الإجمالي", style = MaterialTheme.typography.titleMedium)
                    Text(
                        formatCents(state.totalCents),
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.primary,
                    )
                }
                Spacer(Modifier.height(12.dp))
                Button(onClick = viewModel::checkout, modifier = Modifier.fillMaxWidth()) {
                    Text("إتمام الطلب")
                }
            }
        }

        state.error?.let {
            Spacer(Modifier.height(8.dp))
            Text(it, color = MaterialTheme.colorScheme.error)
        }
    }
}

@Composable
private fun CartItemRow(
    item: CartItemDto,
    onIncrement: () -> Unit,
    onDecrement: () -> Unit,
    onRemove: () -> Unit,
) {
    Card(modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
        Column(Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(item.product.name, style = MaterialTheme.typography.titleMedium)
                TextButton(onClick = onRemove) { Text("حذف") }
            }
            Text(item.product.merchant.businessName, style = MaterialTheme.typography.bodySmall)

            if (item.unitPriceCents < item.regularPriceCents) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        formatCents(item.regularPriceCents),
                        style = MaterialTheme.typography.bodySmall,
                        textDecoration = TextDecoration.LineThrough,
                    )
                    Spacer(Modifier.width(8.dp))
                    Text(
                        formatCents(item.unitPriceCents),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.primary,
                    )
                }
            } else {
                Text(formatCents(item.unitPriceCents), style = MaterialTheme.typography.bodySmall)
            }

            Spacer(Modifier.height(8.dp))
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                OutlinedButton(onClick = onDecrement) { Text("-") }
                Text("${item.quantity}", modifier = Modifier.padding(horizontal = 12.dp))
                OutlinedButton(onClick = onIncrement) { Text("+") }
                Spacer(Modifier.weight(1f))
                Text(formatCents(item.lineTotalCents), style = MaterialTheme.typography.titleSmall)
            }
        }
    }
}
