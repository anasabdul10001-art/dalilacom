package com.dalilacom.app.ui.accounting

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.dalilacom.app.R
import com.dalilacom.app.data.AppContainer
import com.dalilacom.app.data.network.SellerReportDto
import com.dalilacom.app.data.network.SettlementDto
import kotlinx.coroutines.launch

private fun cur(cents: Long, code: String) = "%.2f %s".format(cents / 100.0, code)

private fun channelLabel(code: String): Int = when (code) {
    "STREET" -> R.string.accounting_channel_STREET
    "DISTRIBUTOR" -> R.string.accounting_channel_DISTRIBUTOR
    "ONLINE" -> R.string.accounting_channel_ONLINE
    "WHOLESALE" -> R.string.accounting_channel_WHOLESALE
    else -> R.string.accounting_channel_SHOP
}

/** The cash a location holds: what it collected, what was handed over, what is still with it; the owner can receive cash. */
@Composable
fun LocationCashBlock(container: AppContainer, locationId: String, canReceive: Boolean, refreshKey: Any, setMessage: (String) -> Unit) {
    val scope = rememberCoroutineScope()
    var data by remember(locationId) { mutableStateOf<SettlementDto?>(null) }
    var reload by remember(locationId) { mutableStateOf(0) }
    LaunchedEffect(locationId, refreshKey, reload) { data = container.accountingRepository.settlement(locationId) }
    val rows = data?.currencies.orEmpty()
    if (rows.isEmpty()) return
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(stringResource(R.string.accounting_cashloc_title), fontWeight = FontWeight.Bold, fontSize = 13.sp)
        rows.forEach { c ->
            var amount by remember(locationId, c.currency) { mutableStateOf("%.2f".format(c.heldCents / 100.0)) }
            Text(stringResource(R.string.accounting_cash_sold) + ": " + cur(c.soldCents, c.currency), fontSize = 12.5.sp)
            Text(stringResource(R.string.accounting_cash_collected) + ": " + cur(c.cashCents - c.refundedCents, c.currency) + "  ·  " + stringResource(R.string.accounting_cash_credit) + ": " + cur(c.creditCents, c.currency), fontSize = 12.5.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(stringResource(R.string.accounting_cash_handed) + ": " + cur(c.handedOverCents, c.currency), fontSize = 12.5.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(stringResource(R.string.accounting_cash_held) + ": " + cur(c.heldCents, c.currency), fontWeight = FontWeight.ExtraBold)
            if (canReceive && c.heldCents > 0) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    OutlinedTextField(amount, { amount = it }, label = { Text(stringResource(R.string.accounting_cash_amount) + " (" + c.currency + ")") }, singleLine = true, modifier = Modifier.weight(1f))
                    Button(onClick = {
                        val cents = Math.round((amount.replace(',', '.').toDoubleOrNull() ?: 0.0) * 100)
                        if (cents > 0) scope.launch { container.accountingRepository.handover(locationId, c.currency, cents).fold({ setMessage(""); reload++ }, { setMessage(it.message.orEmpty()) }) }
                    }) { Text(stringResource(R.string.accounting_cash_receive)) }
                }
            }
        }
    }
}

/** Sales per channel and per seller for a period, with commissions and the cash each distributor still holds. */
@Composable
fun SellerReportCard(container: AppContainer) {
    val scope = rememberCoroutineScope()
    var from by remember { mutableStateOf("") }
    var to by remember { mutableStateOf("") }
    var report by remember { mutableStateOf<SellerReportDto?>(null) }
    var asked by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(stringResource(R.string.accounting_sellerrep_title), style = MaterialTheme.typography.titleSmall)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(from, { from = it }, label = { Text(stringResource(R.string.accounting_rep_from)) }, singleLine = true, modifier = Modifier.weight(1f))
            OutlinedTextField(to, { to = it }, label = { Text(stringResource(R.string.accounting_rep_to)) }, singleLine = true, modifier = Modifier.weight(1f))
        }
        Button(onClick = { scope.launch { report = container.accountingRepository.sellerReport(from.trim().ifBlank { null }, to.trim().ifBlank { null }); asked = true } }) { Text(stringResource(R.string.accounting_rep_show)) }
        val r = report
        if (r != null) {
            if (r.channels.isEmpty() && asked) Text(stringResource(R.string.accounting_sellerrep_empty), color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (r.channels.isNotEmpty()) Text(stringResource(R.string.accounting_rep_channels), fontWeight = FontWeight.Bold)
            r.channels.forEach { c ->
                Text(stringResource(channelLabel(c.channel)) + "  ·  " + stringResource(R.string.accounting_rep_count) + ": " + c.count + "  ·  " + cur(c.totalCents, c.currency), fontSize = 13.sp)
            }
            if (r.sellers.isNotEmpty()) Text(stringResource(R.string.accounting_rep_sellers), fontWeight = FontWeight.Bold)
            r.sellers.forEach { s ->
                Column {
                    Text((if (s.isOwner) stringResource(R.string.accounting_rep_owner) else s.name ?: "—") + "  ·  " + stringResource(R.string.accounting_rep_count) + ": " + s.count + "  ·  " + cur(s.totalCents, s.currency), fontWeight = FontWeight.ExtraBold, fontSize = 13.sp)
                    Text(stringResource(R.string.accounting_rep_commission) + ": " + cur(s.commissionAccruedCents, s.currency) + "  ·  " + stringResource(R.string.accounting_rep_commission_paid) + ": " + cur(s.commissionPaidCents, s.currency) + "  ·  " + stringResource(R.string.accounting_rep_held) + ": " + cur(s.cashHeldCents, s.currency), fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}
