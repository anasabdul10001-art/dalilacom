package com.dalilacom.app.ui.profile

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.dalilacom.app.R
import com.dalilacom.app.data.AppContainer
import com.dalilacom.app.data.network.DiscountTxDto
import com.dalilacom.app.data.network.TxSummaryDto
import com.dalilacom.app.ui.common.DocumentPrinter
import com.dalilacom.app.ui.common.formatCents
import com.dalilacom.app.ui.i18n.AppStrings
import kotlinx.coroutines.launch

/**
 * The discounts that were applied, for both sides: a customer sees where he saved (and how much), a shop sees whom it gave a
 * discount and the total. Each entry opens its PDF receipt.
 */
@Composable
fun DiscountHistoryScreen(container: AppContainer, shop: Boolean, onBack: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var loading by remember { mutableStateOf(true) }
    var failed by remember { mutableStateOf(false) }
    var items by remember { mutableStateOf<List<DiscountTxDto>>(emptyList()) }
    var summary by remember { mutableStateOf(TxSummaryDto()) }
    LaunchedEffect(shop) {
        loading = true
        if (shop) {
            val r = container.merchantRepository.shopDiscountHistory()
            failed = r == null; items = r?.items.orEmpty(); summary = r?.summary ?: TxSummaryDto()
        } else {
            val r = container.merchantRepository.myDiscountHistory()
            failed = r == null; items = r.orEmpty()
            summary = TxSummaryDto(items.size, items.sumOf { it.billAmountCents }, items.sumOf { it.discountAmountCents })
        }
        loading = false
    }

    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = onBack) { Text(AppStrings.get(R.string.back)) }
        }
        Text(
            "🧾 " + stringResource(if (shop) R.string.dh_title_shop else R.string.dh_title_mine),
            style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary,
            modifier = Modifier.padding(horizontal = 20.dp),
        )
        if (loading) { Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }; return@Column }
        if (failed) { Text(stringResource(R.string.dh_failed), color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(20.dp)); return@Column }
        LazyColumn(contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            item {
                Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.primary.copy(alpha = 0.08f), modifier = Modifier.fillMaxWidth()) {
                    Row(Modifier.padding(14.dp), horizontalArrangement = Arrangement.SpaceEvenly) {
                        SummaryCell(summary.count.toString(), stringResource(R.string.dh_count), Modifier.weight(1f))
                        SummaryCell(formatCents(summary.billCents), stringResource(R.string.dh_bills), Modifier.weight(1f))
                        SummaryCell(formatCents(summary.discountCents), stringResource(if (shop) R.string.dh_given else R.string.dh_saved), Modifier.weight(1f), highlight = true)
                    }
                }
            }
            if (items.isEmpty()) item {
                Text(stringResource(if (shop) R.string.dh_empty_shop else R.string.dh_empty_mine), color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(vertical = 24.dp))
            }
            items(items, key = { it.transactionRef }) { x ->
                Surface(shape = RoundedCornerShape(18.dp), tonalElevation = 2.dp, shadowElevation = 2.dp, modifier = Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(if (shop) x.memberName.orEmpty() else x.merchant?.businessName.orEmpty(), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                            Text(x.createdAt.take(16).replace("T", " "), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        AmountRow(stringResource(R.string.dh_bill), formatCents(x.billAmountCents))
                        AmountRow(stringResource(R.string.dh_discount, x.discountPercent), "- " + formatCents(x.discountAmountCents), highlight = true)
                        AmountRow(stringResource(R.string.dh_final), formatCents(x.finalAmountCents), bold = true)
                        OutlinedButton(
                            onClick = { scope.launch { DocumentPrinter.export(context, container.tokenStore, "/invoices/discount/" + x.transactionRef, AppStrings.get(R.string.s_153612e1)) } },
                            shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth(),
                        ) { Text("📄 " + stringResource(R.string.dh_receipt)) }
                    }
                }
            }
        }
    }
}

@Composable
private fun SummaryCell(value: String, label: String, modifier: Modifier, highlight: Boolean = false) {
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium, color = if (highlight) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface)
        Text(label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun AmountRow(label: String, value: String, highlight: Boolean = false, bold: Boolean = false) {
    Row(Modifier.fillMaxWidth()) {
        Text(label, modifier = Modifier.weight(1f), fontWeight = if (bold) FontWeight.Bold else FontWeight.Normal)
        Text(value, fontWeight = if (bold || highlight) FontWeight.Bold else FontWeight.Normal, color = if (highlight) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface)
    }
}
