package com.dalilacom.app.ui.common

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.dalilacom.app.R
import com.dalilacom.app.data.network.OrderDto

/** Where the order goes (or that the customer collects it), the phone, and the outside courier with its tracking number. */
@Composable
fun OrderDeliveryInfo(order: OrderDto) {
    Column(Modifier.padding(bottom = 6.dp)) {
        if (order.shippingKind == "PICKUP") {
            Text("\uD83C\uDFEA " + stringResource(R.string.ship_kind_pickup), color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
            return@Column
        }
        order.deliveryAddress?.let { Text(stringResource(R.string.ord_addr) + ": " + it, style = MaterialTheme.typography.bodyMedium) }
        order.deliveryPhone?.let { Text(stringResource(R.string.ord_phone) + ": " + it, style = MaterialTheme.typography.bodyMedium) }
        order.courierCompany?.let { Text(stringResource(R.string.ord_courier) + ": " + it, style = MaterialTheme.typography.bodyMedium) }
        order.trackingNumber?.let { Text(stringResource(R.string.ord_tracking) + ": " + it, style = MaterialTheme.typography.bodyMedium) }
    }
}
