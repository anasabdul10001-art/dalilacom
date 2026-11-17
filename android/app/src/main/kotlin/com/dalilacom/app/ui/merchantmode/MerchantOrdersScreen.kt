package com.dalilacom.app.ui.merchantmode

import androidx.compose.ui.res.stringResource

import com.dalilacom.app.ui.common.Hint

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
    state.reviewTarget?.let { target -> com.dalilacom.app.ui.common.ReviewDialog(target, state.reviewBusy, state.reviewError, viewModel::sendReview, viewModel::closeReview) }

    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        Text(AppStrings.get(R.string.s_c5ffc332), style = MaterialTheme.typography.headlineSmall, color = MaterialTheme.colorScheme.primary)
        Spacer(Modifier.height(12.dp))

        when {
            state.isLoading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
            state.orders.isEmpty() -> Text(AppStrings.get(R.string.s_7d943798), style = MaterialTheme.typography.bodyMedium)
            else -> LazyColumn {
                items(state.orders, key = { it.id }) { order ->
                    MerchantOrderRow(
                        order = order,
                        onAdvance = { status, c, n -> viewModel.advance(order.id, status, c, n) },
                        onRequestCancel = { cancellingOrderId = order.id; cancelReason = "" },
                        onRateCustomer = { order.user?.let { viewModel.openReview(it.id, it.fullName) } },
                        onConfirmCash = { viewModel.confirmCash(order.id) },
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
            title = { Text(AppStrings.get(R.string.s_935d8234)) },
            text = {
                OutlinedTextField(
                    value = cancelReason,
                    onValueChange = { cancelReason = it },
                    label = { Text(AppStrings.get(R.string.s_a2e93da9)) },
                placeholder = { Hint(stringResource(R.string.ph_cancel_reason)) },
            )
            },
            confirmButton = {
                TextButton(onClick = {
                    if (cancelReason.trim().length >= 3) {
                        viewModel.cancelWithReason(targetOrderId, cancelReason.trim())
                        cancellingOrderId = null
                    }
                }) { Text(AppStrings.get(R.string.s_911aafd4)) }
            },
            dismissButton = {
                TextButton(onClick = { cancellingOrderId = null }) { Text(AppStrings.get(R.string.s_98df46fb)) }
            },
        )
    }
}

@Composable
private fun MerchantOrderRow(order: OrderDto, onAdvance: (String, String?, String?) -> Unit, onRequestCancel: () -> Unit, onRateCustomer: () -> Unit, onConfirmCash: () -> Unit) {
    var askCourier by androidx.compose.runtime.remember { androidx.compose.runtime.mutableStateOf(false) }
    var company by androidx.compose.runtime.remember { androidx.compose.runtime.mutableStateOf("") }
    var tracking by androidx.compose.runtime.remember { androidx.compose.runtime.mutableStateOf("") }
    if (askCourier) {
        androidx.compose.material3.AlertDialog(
            onDismissRequest = { askCourier = false },
            title = { Text(androidx.compose.ui.res.stringResource(R.string.ord_courier)) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    androidx.compose.material3.OutlinedTextField(value = company, onValueChange = { company = it.take(60) }, singleLine = true, placeholder = { Text(androidx.compose.ui.res.stringResource(R.string.ord_ask_courier)) })
                    androidx.compose.material3.OutlinedTextField(value = tracking, onValueChange = { tracking = it.take(60) }, singleLine = true, placeholder = { Text(androidx.compose.ui.res.stringResource(R.string.ord_ask_tracking)) })
                }
            },
            confirmButton = { TextButton(onClick = { if (company.trim().length >= 2 && tracking.trim().length >= 2) { askCourier = false; onAdvance("SHIPPED", company.trim(), tracking.trim()) } }) { Text(AppStrings.get(R.string.s_911aafd4)) } },
            dismissButton = { TextButton(onClick = { askCourier = false }) { Text(AppStrings.get(R.string.s_98df46fb)) } },
        )
    }
    Card(modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
        Column(Modifier.padding(16.dp)) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(order.orderNumber, style = MaterialTheme.typography.titleMedium)
                Text(orderStatusLabel(order.status), color = orderStatusColor(order.status))
            }
            order.user?.let { Text(it.fullName, style = MaterialTheme.typography.bodySmall) }
            order.customerRating?.takeIf { it.ratingCount > 0 }?.let { Text("${com.dalilacom.app.ui.common.starsText(it.rating)}  ${"%.1f".format(java.util.Locale.US, it.rating)} (${it.ratingCount})", color = androidx.compose.ui.graphics.Color(0xFFF0A30A), style = MaterialTheme.typography.bodySmall) }
            if (order.status == "DELIVERED" && order.user != null) {
                OutlinedButton(onClick = onRateCustomer) { Text("⭐  " + androidx.compose.ui.res.stringResource(if (order.ratedCustomer) R.string.rv_edit else R.string.rv_rate_customer)) }
            }
            Text(formatCents(order.totalCents), style = MaterialTheme.typography.bodyMedium)
            com.dalilacom.app.ui.common.OrderDeliveryInfo(order)
            com.dalilacom.app.ui.common.PaymentLine(order)
            com.dalilacom.app.ui.common.ConfirmCashButton(order, onConfirmCash)

            var nextStatuses = ORDER_STATUS_TRANSITIONS[order.status].orEmpty()
            if (order.shippingKind == "PICKUP" && order.status == "PREPARING") nextStatuses = listOf("DELIVERED", "CANCELLED") // handed over at the shop
            if (nextStatuses.isNotEmpty()) {
                Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    nextStatuses.filter { it != "CANCELLED" }.forEach { next ->
                        Button(onClick = { if (next == "SHIPPED" && order.shippingKind == "COURIER") askCourier = true else onAdvance(next, null, null) }) { Text(orderActionLabel(next)) }
                    }
                    if (nextStatuses.contains("CANCELLED")) {
                        OutlinedButton(onClick = onRequestCancel) { Text(AppStrings.get(R.string.s_e776b020)) }
                    }
                }
            }
        }
    }
}
