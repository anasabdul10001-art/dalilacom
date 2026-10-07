package com.dalilacom.app.ui.orders

import com.dalilacom.app.R
import com.dalilacom.app.ui.i18n.AppStrings
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
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.dalilacom.app.data.network.OrderDto
import com.dalilacom.app.ui.ViewModelFactory
import com.dalilacom.app.ui.common.formatCents
import com.dalilacom.app.ui.common.orderStatusColor
import com.dalilacom.app.ui.common.orderStatusLabel

@Composable
fun OrdersScreen(factory: ViewModelFactory, onOrderClick: (String) -> Unit) {
    val viewModel: OrdersViewModel = viewModel(factory = factory)
    val state by viewModel.uiState.collectAsState()

    // Re-fetch every time this tab becomes visible again — an order placed or updated
    // elsewhere in the app shouldn't show stale status here.
    LaunchedEffect(Unit) { viewModel.refresh() }

    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        Text(AppStrings.get(R.string.s_00246e91), style = MaterialTheme.typography.headlineSmall, color = MaterialTheme.colorScheme.primary)
        Spacer(Modifier.height(12.dp))

        when {
            state.isLoading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
            state.orders.isEmpty() -> Text(AppStrings.get(R.string.s_01f05ae9), style = MaterialTheme.typography.bodyMedium)
            else -> LazyColumn {
                items(state.orders, key = { it.id }) { order ->
                    OrderRow(order, onClick = { onOrderClick(order.id) })
                }
            }
        }
    }
}

@Composable
private fun OrderRow(order: OrderDto, onClick: () -> Unit) {
    Card(modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp).clickable(onClick = onClick)) {
        Column(Modifier.padding(16.dp)) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(order.orderNumber, style = MaterialTheme.typography.titleMedium)
                Text(orderStatusLabel(order.status), color = orderStatusColor(order.status), style = MaterialTheme.typography.bodyMedium)
            }
            order.merchant?.let { Text(it.businessName, style = MaterialTheme.typography.bodySmall) }
            Text(formatCents(order.totalCents), style = MaterialTheme.typography.bodyMedium)
        }
    }
}
