package com.dalilacom.app.ui.orders

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
import com.dalilacom.app.ui.common.ORDER_STATUS_TRANSITIONS
import com.dalilacom.app.ui.common.formatCents
import com.dalilacom.app.ui.common.orderStatusColor
import com.dalilacom.app.ui.common.orderStatusLabel

@Composable
fun OrderDetailScreen(container: AppContainer, orderId: String, onBack: () -> Unit) {
    val viewModel: OrderDetailViewModel = viewModel(
        factory = viewModelFactory {
            initializer { OrderDetailViewModel(container.orderRepository, orderId) }
        },
    )
    val state by viewModel.uiState.collectAsState()

    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        TextButton(onClick = onBack) { Text("‹ رجوع") }

        when {
            state.isLoading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
            state.order == null -> Text(state.error ?: "الطلب غير موجود", color = MaterialTheme.colorScheme.error)
            else -> {
                val order = state.order!!
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(order.orderNumber, style = MaterialTheme.typography.headlineSmall, color = MaterialTheme.colorScheme.primary)
                    Text(orderStatusLabel(order.status), color = orderStatusColor(order.status), style = MaterialTheme.typography.titleMedium)
                }
                order.merchant?.let { Text(it.businessName, style = MaterialTheme.typography.bodyMedium) }
                order.cancelReason?.let { Text("سبب الإلغاء: $it", style = MaterialTheme.typography.bodySmall) }

                Spacer(Modifier.height(16.dp))
                Text("المنتجات", style = MaterialTheme.typography.titleMedium)
                order.items.forEach { item ->
                    Row(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("${item.productName} × ${item.quantity}")
                        Text(formatCents(item.unitPriceCents * item.quantity))
                    }
                }

                Spacer(Modifier.height(12.dp))
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("الإجمالي", style = MaterialTheme.typography.titleMedium)
                    Text(formatCents(order.totalCents), style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.primary)
                }
                if (order.memberDiscountCents > 0) {
                    Text("وفّرت ${formatCents(order.memberDiscountCents)} بسعر أعضاء دليلكم", style = MaterialTheme.typography.bodySmall)
                }

                val canCancel = ORDER_STATUS_TRANSITIONS[order.status]?.contains("CANCELLED") == true
                if (canCancel) {
                    Spacer(Modifier.height(20.dp))
                    Button(onClick = viewModel::cancel, enabled = !state.isCancelling, modifier = Modifier.fillMaxWidth()) {
                        Text("إلغاء الطلب")
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
