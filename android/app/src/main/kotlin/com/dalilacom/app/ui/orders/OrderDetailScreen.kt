package com.dalilacom.app.ui.orders

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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.dalilacom.app.data.AppContainer
import androidx.compose.material3.OutlinedButton
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.platform.LocalContext
import com.dalilacom.app.ui.common.DocumentPrinter
import kotlinx.coroutines.launch
import com.dalilacom.app.ui.common.ORDER_STATUS_TRANSITIONS
import com.dalilacom.app.ui.common.formatCents
import com.dalilacom.app.ui.common.orderStatusColor
import com.dalilacom.app.ui.common.orderStatusLabel

@Composable
fun OrderDetailScreen(container: AppContainer, orderId: String, onBack: () -> Unit) {
    val viewModel: OrderDetailViewModel = viewModel(
        factory = viewModelFactory {
            initializer { OrderDetailViewModel(container.orderRepository, container.reviewsRepository, orderId) }
        },
    )
    val state by viewModel.uiState.collectAsState()
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    state.reviewTarget?.let { target -> com.dalilacom.app.ui.common.ReviewDialog(target, state.reviewBusy, state.reviewError, viewModel::sendReview, viewModel::closeReview) }
    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        TextButton(onClick = onBack) { Text(AppStrings.get(R.string.s_69c86923)) }

        when {
            state.isLoading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
            state.order == null -> Text(state.error ?: AppStrings.get(R.string.s_6e3a209c), color = MaterialTheme.colorScheme.error)
            else -> {
                val order = state.order!!
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(order.orderNumber, style = MaterialTheme.typography.headlineSmall, color = MaterialTheme.colorScheme.primary)
                    Text(orderStatusLabel(order.status), color = orderStatusColor(order.status), style = MaterialTheme.typography.titleMedium)
                }
                order.merchant?.let { Text(it.businessName, style = MaterialTheme.typography.bodyMedium) }
                order.cancelReason?.let { Text(AppStrings.get(R.string.fmt_cancel_reason, it), style = MaterialTheme.typography.bodySmall) }

                Spacer(Modifier.height(16.dp))
                Text(AppStrings.get(R.string.s_6793a69f), style = MaterialTheme.typography.titleMedium)
                order.items.forEach { item ->
                    Row(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("${item.productName} × ${item.quantity}")
                        Text(formatCents(item.unitPriceCents * item.quantity))
                    }
                }

                Spacer(Modifier.height(12.dp))
                order.shippingName?.let { name ->
                    Row(modifier = Modifier.fillMaxWidth().padding(bottom = 6.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("🚚 $name")
                        Text(if (order.shippingCents > 0) formatCents(order.shippingCents) else stringResource(R.string.ship_free))
                    }
                }
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(AppStrings.get(R.string.s_413c51af), style = MaterialTheme.typography.titleMedium)
                    Text(formatCents(order.totalCents), style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.primary)
                }
                if (order.memberDiscountCents > 0) {
                    Text(AppStrings.get(R.string.fmt_saved, formatCents(order.memberDiscountCents)), style = MaterialTheme.typography.bodySmall)
                }

                val rated = order.rated
                if (order.status == "DELIVERED" && rated != null && order.merchant != null) {
                    Spacer(Modifier.height(16.dp))
                    Text(stringResource(R.string.rv_rate_title), style = MaterialTheme.typography.titleMedium)
                    OutlinedButton(onClick = { viewModel.openReview("shop", order.merchant.id, order.merchant.businessName) }, modifier = Modifier.fillMaxWidth()) {
                        Text("🏪  " + stringResource(R.string.rv_rate_shop) + if (rated.shop) " ✓" else "")
                    }
                    order.items.forEach { item ->
                        OutlinedButton(onClick = { viewModel.openReview("product", item.productId, item.productName) }, modifier = Modifier.fillMaxWidth()) {
                            Text("📦  ${item.productName}" + if (item.productId in rated.products) " ✓" else "", maxLines = 1)
                        }
                    }
                }
                val customer = order.customer
                if (order.status == "DELIVERED" && customer != null) {
                    Spacer(Modifier.height(16.dp))
                    Text(stringResource(R.string.rv_customer_title) + ": " + customer.fullName, style = MaterialTheme.typography.titleMedium)
                    val cr = order.customerRating
                    Text(if (cr != null && cr.ratingCount > 0) "${com.dalilacom.app.ui.common.starsText(cr.rating)}  ${"%.1f".format(java.util.Locale.US, cr.rating)} (${cr.ratingCount})" else stringResource(R.string.rv_customer_none), style = MaterialTheme.typography.bodySmall)
                    OutlinedButton(onClick = { viewModel.openReview("customer", customer.id, customer.fullName) }, modifier = Modifier.fillMaxWidth()) {
                        Text("⭐  " + stringResource(if (order.ratedCustomer) R.string.rv_edit else R.string.rv_rate_customer))
                    }
                }

                Spacer(Modifier.height(12.dp))
                OutlinedButton(
                    onClick = { scope.launch { DocumentPrinter.export(context, container.tokenStore, "/invoices/order/${order.id}", AppStrings.get(R.string.fmt_invoice_job, order.orderNumber)) } },
                    modifier = Modifier.fillMaxWidth(),
                ) { Text(AppStrings.get(R.string.s_c2cbfa91)) }

                val canCancel = ORDER_STATUS_TRANSITIONS[order.status]?.contains("CANCELLED") == true
                if (canCancel) {
                    Spacer(Modifier.height(20.dp))
                    Button(onClick = viewModel::cancel, enabled = !state.isCancelling, modifier = Modifier.fillMaxWidth()) {
                        Text(AppStrings.get(R.string.s_b4bbf18b))
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
