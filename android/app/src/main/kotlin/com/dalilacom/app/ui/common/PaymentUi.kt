package com.dalilacom.app.ui.common

import com.dalilacom.app.ui.i18n.AppStrings
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import com.dalilacom.app.R
import com.dalilacom.app.data.network.OrderDto

/** How an order is paid and whether the seller has confirmed receiving it. */
@Composable
fun PaymentLine(order: OrderDto) {
    val payment = order.payment ?: return
    val status = when (payment.status) {
        "PAID_CASH" -> R.string.pay_paid_cash
        "PAID_ONLINE" -> R.string.pay_paid_online
        "FAILED" -> R.string.pay_failed
        "REFUNDED" -> R.string.pay_refunded
        else -> R.string.pay_pending
    }
    val method = when (payment.method) {
        "BANK_ALSHAM" -> AppStrings.get(R.string.s_20f44d7f)
        "SYRIATEL" -> AppStrings.get(R.string.fit_auto_31d9b741)
        "MTN" -> AppStrings.get(R.string.fit_auto_d79941c7)
        else -> stringResource(R.string.pay_cod)
    }
    Text("💳 $method · " + stringResource(status), style = MaterialTheme.typography.bodySmall)
}

/** The shop's button once the order is on its way: the cash was handed over. */
@Composable
fun ConfirmCashButton(order: OrderDto, onConfirm: () -> Unit) {
    val payment = order.payment ?: return
    if (payment.method != "COD" || payment.status != "PENDING" || order.status !in listOf("SHIPPED", "DELIVERED")) return
    OutlinedButton(onClick = onConfirm) { Text("💵 " + stringResource(R.string.pay_confirm_cash)) }
}
