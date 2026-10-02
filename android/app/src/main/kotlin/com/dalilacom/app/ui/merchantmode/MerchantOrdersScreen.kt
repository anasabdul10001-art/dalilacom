package com.dalilacom.app.ui.merchantmode

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
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.dalilacom.app.data.network.OrderDto
import com.dalilacom.app.ui.ViewModelFactory
import com.dalilacom.app.ui.common.ORDER_STATUS_TRANSITIONS
import com.dalilacom.app.ui.common.formatCents
import com.dalilacom.app.ui.common.orderActionLabel
import com.dalilacom.app.ui.common.orderStatusColor
import com.dalilacom.app.ui.common.orderStatusLabel

@Composable
fun MerchantOrdersScreen(factory: ViewModelFactory) {
    val viewModel: MerchantOrdersViewModel = viewModel(factory = factory)
    val state by viewModel.uiState.collectAsState()
    var cancellingOrderId by remember { mutableStateOf<String?>(null) }
    var cancelReason by remember { mutableStateOf("") }

    LaunchedEffect(Unit) { viewModel.refresh() }

    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        Text("طلبات واردة", style = MaterialTheme.typography.headlineSmall, color = MaterialTheme.colorScheme.primary)
        Spacer(Modifier.height(12.dp))

        when {
            state.isLoading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
            state.orders.isEmpty() -> Text("ما في طلبات بعد", style = MaterialTheme.typography.bodyMedium)
            else -> LazyColumn {
                items(state.orders, key = { it.id }) { order ->
                    MerchantOrderRow(
                        order = order,
                        onAdvance = { status -> viewModel.advance(order.id, status) },
                        onRequestCancel = { cancellingOrderId = order.id; cancelReason = "" },
                    )
                }
            }
        }

        state.error?.let {
            Spacer(Modifier.height(8.dp))
            Text(it, color = MaterialTheme.colorScheme.error)
        }
    }

    val targetOrderId = cancellingOrderId
    if (targetOrderId != null) {
        AlertDialog(
            onDismissRequest = { cancellingOrderId = null },
            title = { Text("سبب الإلغاء") },
            text = {
                OutlinedTextField(
                    value = cancelReason,
                    onValueChange = { cancelReason = it },
                    label = { Text("السبب") },
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    if (cancelReason.trim().length >= 3) {
                        viewModel.cancelWithReason(targetOrderId, cancelReason.trim())
                        cancellingOrderId = null
                    }
                }) { Text("تأكيد") }
            },
            dismissButton = {
                TextButton(onClick = { cancellingOrderId = null }) { Text("تراجع") }
            },
        )
    }
}

@Composable
private fun MerchantOrderRow(order: OrderDto, onAdvance: (String) -> Unit, onRequestCancel: () -> Unit) {
    Card(modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
        Column(Modifier.padding(16.dp)) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(order.orderNumber, style = MaterialTheme.typography.titleMedium)
                Text(orderStatusLabel(order.status), color = orderStatusColor(order.status))
            }
            order.user?.let { Text(it.fullName, style = MaterialTheme.typography.bodySmall) }
            Text(formatCents(order.totalCents), style = MaterialTheme.typography.bodyMedium)

            val nextStatuses = ORDER_STATUS_TRANSITIONS[order.status].orEmpty()
            if (nextStatuses.isNotEmpty()) {
                Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    nextStatuses.filter { it != "CANCELLED" }.forEach { next ->
                        Button(onClick = { onAdvance(next) }) { Text(orderActionLabel(next)) }
                    }
                    if (nextStatuses.contains("CANCELLED")) {
                        OutlinedButton(onClick = onRequestCancel) { Text("إلغاء") }
                    }
                }
            }
        }
    }
}
