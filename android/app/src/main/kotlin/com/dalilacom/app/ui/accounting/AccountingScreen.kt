package com.dalilacom.app.ui.accounting

import com.dalilacom.app.ui.i18n.AppStrings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.ui.Alignment
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.TextButton
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.dalilacom.app.R
import com.dalilacom.app.data.AppContainer
import com.dalilacom.app.ui.common.MetricTile
import com.dalilacom.app.ui.common.SkeletonList
import androidx.compose.foundation.layout.Row
import com.dalilacom.app.data.network.AccountingEntryRequest
import com.dalilacom.app.data.network.AccountingProductDto
import com.dalilacom.app.data.network.AccountingProductRequest
import com.dalilacom.app.data.network.AccountingInvoiceDraftDto
import com.dalilacom.app.ui.common.Hint
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions
import kotlinx.coroutines.launch

@Composable
fun AccountingScreen(container: AppContainer, onOpenPlans: () -> Unit = {}) {
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    var loading by remember { mutableStateOf(true) }
    var summary by remember { mutableStateOf<com.dalilacom.app.data.network.AccountingSummaryDto?>(null) }
    var products by remember { mutableStateOf<List<AccountingProductDto>>(emptyList()) }
    var barcode by remember { mutableStateOf("") }
    var name by remember { mutableStateOf("") }
    var cost by remember { mutableStateOf("") }
    var price by remember { mutableStateOf("") }
    var quantity by remember { mutableStateOf("0") }
    var entryType by remember { mutableStateOf("INCOME") }
    var category by remember { mutableStateOf("") }
    var description by remember { mutableStateOf("") }
    var amount by remember { mutableStateOf("") }
    var message by remember { mutableStateOf("") }
    var invoiceDraft by remember { mutableStateOf<AccountingInvoiceDraftDto?>(null) }
    var invoiceDescription by remember { mutableStateOf("") }
    var invoiceAmount by remember { mutableStateOf("") }
    var costTarget by remember { mutableStateOf<AccountingProductDto?>(null) }
    var costEditValue by remember { mutableStateOf("") }
    var deleteProductTarget by remember { mutableStateOf<AccountingProductDto?>(null) }
    var editEntryTarget by remember { mutableStateOf<com.dalilacom.app.data.network.AccountingEntryDto?>(null) }
    var editDescription by remember { mutableStateOf("") }
    var editAmount by remember { mutableStateOf("") }
    // a return: which invoice (a sale or a purchase) and the lines with their quantities
    var returnSale by remember { mutableStateOf<com.dalilacom.app.data.network.AccountingSaleDto?>(null) }
    var returnPurchase by remember { mutableStateOf<com.dalilacom.app.data.network.AccountingPurchaseDto?>(null) }
    val returnQty = remember { androidx.compose.runtime.mutableStateMapOf<String, String>() }
    var returnMethod by remember { mutableStateOf("CASH") }
    var purchases by remember { mutableStateOf<List<com.dalilacom.app.data.network.AccountingPurchaseDto>>(emptyList()) }
    var buyBasket by remember { mutableStateOf<List<Triple<AccountingProductDto, Int, Long>>>(emptyList()) }
    var buyPick by remember { mutableStateOf<AccountingProductDto?>(null) }
    var buyPickOpen by remember { mutableStateOf(false) }
    var buyQty by remember { mutableStateOf("1") }
    var buyCost by remember { mutableStateOf("") }
    var buyPartyId by remember { mutableStateOf<String?>(null) }
    var buyPartyOpen by remember { mutableStateOf(false) }
    var buyPaid by remember { mutableStateOf("") }
    var buyPayMethod by remember { mutableStateOf("CASH") }
    var partiesData by remember { mutableStateOf<com.dalilacom.app.data.network.AccountingPartiesDto?>(null) }
    var partyKind by remember { mutableStateOf("CUSTOMER") }
    var partyName by remember { mutableStateOf("") }
    var partyDetail by remember { mutableStateOf<com.dalilacom.app.data.network.AccountingPartyDetailDto?>(null) }
    var payPartyId by remember { mutableStateOf<String?>(null) }
    var payAmount by remember { mutableStateOf("") }
    var payMethodChoice by remember { mutableStateOf("CASH") }
    var chargePartyId by remember { mutableStateOf<String?>(null) }
    var chargeAmount by remember { mutableStateOf("") }
    var chargeBook by remember { mutableStateOf(false) }
    var salePartyId by remember { mutableStateOf<String?>(null) }
    var salePartyOpen by remember { mutableStateOf(false) }
    var salePaid by remember { mutableStateOf("") }
    var report by remember { mutableStateOf<com.dalilacom.app.data.network.AccountingReportDto?>(null) }
    var reportPreset by remember { mutableStateOf("month") }
    var low by remember { mutableStateOf<com.dalilacom.app.data.network.AccountingLowDto?>(null) }
    var countMode by remember { mutableStateOf(false) }
    val counts = remember { androidx.compose.runtime.mutableStateMapOf<String, String>() }
    var minTarget by remember { mutableStateOf<AccountingProductDto?>(null) }
    var minValue by remember { mutableStateOf("") }
    var movesTarget by remember { mutableStateOf<AccountingProductDto?>(null) }
    var moves by remember { mutableStateOf<List<com.dalilacom.app.data.network.AccountingMovementDto>>(emptyList()) }
    var sales by remember { mutableStateOf<List<com.dalilacom.app.data.network.AccountingSaleDto>>(emptyList()) }
    var basket by remember { mutableStateOf<List<Pair<AccountingProductDto, Int>>>(emptyList()) }
    var salePick by remember { mutableStateOf<AccountingProductDto?>(null) }
    var salePickOpen by remember { mutableStateOf(false) }
    var saleQty by remember { mutableStateOf("1") }
    var saleCustomer by remember { mutableStateOf("") }
    var saleDiscount by remember { mutableStateOf("") }
    var saleDiscountPercent by remember { mutableStateOf(false) }
    var salePayMethod by remember { mutableStateOf("CASH") }
    var savedSale by remember { mutableStateOf<com.dalilacom.app.data.network.AccountingSaleDto?>(null) }
    var entryPay by remember { mutableStateOf("CASH") }
    var cashDay by remember { mutableStateOf(java.time.LocalDate.now().toString()) }
    var cash by remember { mutableStateOf<com.dalilacom.app.data.network.AccountingCashDto?>(null) }
    var cashCounted by remember { mutableStateOf("") }
    var salePayTarget by remember { mutableStateOf<AccountingProductDto?>(null) }
    var openingDialog by remember { mutableStateOf(false) }
    var openingValue by remember { mutableStateOf("") }
    var deleteEntryTarget by remember { mutableStateOf<com.dalilacom.app.data.network.AccountingEntryDto?>(null) }

    suspend fun reload() {
        loading = true
        summary = container.accountingRepository.summary()
        products = container.accountingRepository.products()
        cash = container.accountingRepository.cash(cashDay, "EUR")
        sales = container.accountingRepository.sales()
        low = container.accountingRepository.lowStock()
        partiesData = container.accountingRepository.parties()
        purchases = container.accountingRepository.purchases()
        val today = java.time.LocalDate.now(java.time.ZoneOffset.UTC)
        val (rf, rt) = when (reportPreset) { "today" -> today to today; "week" -> today.minusDays(6) to today; "last30" -> today.minusDays(29) to today; else -> today.withDayOfMonth(1) to today }
        report = container.accountingRepository.report(rf.toString(), rt.toString())
        loading = false
    }
    LaunchedEffect(Unit) { reload() }
    val scanner = rememberLauncherForActivityResult(ScanContract()) { result ->
        result.contents?.let { barcode = it }
    }
    val invoicePicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) scope.launch {
            val bytes = runCatching { context.contentResolver.openInputStream(uri)?.use { it.readBytes() } }.getOrNull()
            val mime = context.contentResolver.getType(uri) ?: "image/jpeg"
            if (bytes == null) message = context.getString(R.string.accounting_invoice_read_failed)
            else container.accountingRepository.scanInvoice(bytes, mime).fold({ draft ->
                invoiceDraft = draft
                invoiceDescription = listOfNotNull(draft.extracted?.supplier, draft.extracted?.description).joinToString(" — ")
                invoiceAmount = draft.extracted?.totalCents?.let { "%.2f".format(it / 100.0) }.orEmpty()
                message = context.getString(R.string.accounting_invoice_review)
            }, { message = it.message ?: context.getString(R.string.accounting_invoice_read_failed) })
        }
    }
    fun cents(value: String) = ((value.replace(',', '.').toDoubleOrNull() ?: 0.0) * 100).toInt()
    fun showResult(action: suspend () -> Result<Unit>) {
        scope.launch {
            val result = action()
            message = result.fold({ AppStrings.get(R.string.s_7b9c60b6) }, { it.message ?: AppStrings.get(R.string.ship_failed) })
            if (result.isSuccess) reload()
        }
    }

    if (loading) {
        SkeletonList(2, tiles = true)
        return
    }
    if (container.accountingRepository.requiresPlan) {
        Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.Center, horizontalAlignment = androidx.compose.ui.Alignment.CenterHorizontally) {
            Text(stringResource(R.string.site_planNeeded), style = MaterialTheme.typography.titleMedium, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
            Button(onClick = onOpenPlans, modifier = Modifier.fillMaxWidth().padding(top = 16.dp)) { Text(stringResource(R.string.site_plans)) }
            OutlinedButton(onClick = { scope.launch { reload() } }, modifier = Modifier.fillMaxWidth().padding(top = 8.dp)) { Text(stringResource(R.string.billing_refresh_status)) }
        }
        return
    }
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item { Text(stringResource(R.string.accounting_title), style = MaterialTheme.typography.headlineSmall) }
        item {
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(stringResource(R.string.accounting_summary), style = MaterialTheme.typography.titleMedium)
                    summary?.totals.orEmpty().forEach {
                        Text(it.currency, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            MetricTile(stringResource(R.string.accounting_incomeLabel), money(it.incomeCents), "income", Modifier.weight(1f))
                            MetricTile(stringResource(R.string.accounting_expensesLabel), money(it.expensesCents), "expense", Modifier.weight(1f))
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            MetricTile(stringResource(R.string.accounting_netLabel), money(it.netCents), "net", Modifier.weight(1f))
                            if (it.payrollCents > 0) MetricTile(stringResource(R.string.accounting_payrollLabel), "%.2f".format(it.payrollCents / 100.0), "payroll", Modifier.weight(1f))
                        }
                    }
                    Text(stringResource(R.string.accounting_stock_summary, summary?.inventory?.products ?: 0, summary?.inventory?.units ?: 0))
                }
            }
        }
        cash?.let { c ->
            item {
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(stringResource(R.string.accounting_cash_title), style = MaterialTheme.typography.titleMedium)
                        Text(stringResource(R.string.accounting_cash_help), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                            TextButton(onClick = { cashDay = java.time.LocalDate.parse(cashDay).minusDays(1).toString(); scope.launch { reload() } }) { Text("‹") }
                            Text(c.day, style = MaterialTheme.typography.titleSmall)
                            TextButton(onClick = { cashDay = java.time.LocalDate.parse(cashDay).plusDays(1).toString(); scope.launch { reload() } }) { Text("›") }
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            MetricTile(stringResource(R.string.accounting_cash_opening), money((c.openingCents).toInt()), "net", Modifier.weight(1f))
                            MetricTile(stringResource(R.string.accounting_cash_expected), money((c.expectedCents).toInt()), "net", Modifier.weight(1f))
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            MetricTile(stringResource(R.string.accounting_cash_in), money((c.cashInCents).toInt()), "income", Modifier.weight(1f))
                            MetricTile(stringResource(R.string.accounting_cash_out), money((c.cashOutCents).toInt()), "expense", Modifier.weight(1f))
                        }
                        if (c.openingSource == "previous") com.dalilacom.app.ui.common.StatusChip(stringResource(R.string.accounting_cash_opening_prev), "info")
                        if (c.closed) {
                            val diff = c.differenceCents ?: 0L
                            com.dalilacom.app.ui.common.StatusChip(stringResource(R.string.accounting_cash_closed) + " · " + stringResource(R.string.accounting_cash_counted) + ": " + money((c.countedCents ?: 0L).toInt()) + " · " + (if (diff == 0L) stringResource(R.string.accounting_cash_diff_ok) else stringResource(R.string.accounting_cash_diff) + ": " + (if (diff > 0) "+" else "−") + money(kotlin.math.abs(diff).toInt())), if (diff == 0L) "ok" else "warn")
                            OutlinedButton(onClick = { scope.launch { container.accountingRepository.reopenCash(c.day, c.currency); reload() } }, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.accounting_cash_reopen)) }
                        } else {
                            OutlinedTextField(cashCounted, { cashCounted = it }, label = { Text(stringResource(R.string.accounting_cash_counted)) }, singleLine = true, modifier = Modifier.fillMaxWidth())
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Button(onClick = {
                                    if (cashCounted.isBlank()) { message = context.getString(R.string.accounting_missing_entry); return@Button }
                                    scope.launch { container.accountingRepository.closeCash(c.day, c.currency, cents(cashCounted).toLong()); cashCounted = ""; reload() }
                                }, modifier = Modifier.weight(1f)) { Text(stringResource(R.string.accounting_cash_close)) }
                                OutlinedButton(onClick = { openingValue = money(c.openingCents.toInt()); openingDialog = true }, modifier = Modifier.weight(1f)) { Text(stringResource(R.string.accounting_cash_set_opening)) }
                            }
                        }
                        c.methods.filter { it.payMethod != "CASH" && (it.incomeCents != 0L || it.expensesCents != 0L) }.takeIf { it.isNotEmpty() }?.let { others ->
                            Text(stringResource(R.string.accounting_cash_other) + ": " + others.joinToString(" · ") { m ->
                                (if (m.payMethod == "BANK") context.getString(R.string.accounting_pay_BANK) else context.getString(R.string.accounting_pay_WALLET)) + " +" + money(m.incomeCents.toInt()) + " −" + money(m.expensesCents.toInt())
                            }, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        if (c.unspecified.incomeCents != 0L || c.unspecified.expensesCents != 0L) Text(stringResource(R.string.accounting_cash_unspecified) + ": +" + money(c.unspecified.incomeCents.toInt()) + " −" + money(c.unspecified.expensesCents.toInt()), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }
        item {
            val saleSub = basket.sumOf { (p, q) -> p.salePriceCents.toLong() * q }
            val dv = saleDiscount.replace(',', '.').toDoubleOrNull() ?: 0.0
            val saleDisc = if (saleDiscountPercent) Math.round(saleSub * dv.coerceIn(0.0, 100.0) / 100.0) else Math.round(dv * 100)
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(stringResource(R.string.accounting_sale_title), style = MaterialTheme.typography.titleMedium)
                    val sellable = products.filter { it.quantity > 0 && it.salePriceCents > 0 }
                    androidx.compose.foundation.layout.Box {
                        OutlinedButton(onClick = { salePickOpen = true }, modifier = Modifier.fillMaxWidth()) { Text(salePick?.let { it.name + " · " + money(it.salePriceCents) + " · " + stringResource(R.string.accounting_sale_stock) + ": " + it.quantity } ?: stringResource(R.string.accounting_sale_pick)) }
                        androidx.compose.material3.DropdownMenu(expanded = salePickOpen, onDismissRequest = { salePickOpen = false }) {
                            sellable.forEach { p -> androidx.compose.material3.DropdownMenuItem(text = { Text(p.name + " · " + money(p.salePriceCents) + " · " + p.quantity) }, onClick = { salePick = p; salePickOpen = false }) }
                        }
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                        OutlinedTextField(saleQty, { saleQty = it }, label = { Text(stringResource(R.string.accounting_sale_qty)) }, singleLine = true, modifier = Modifier.weight(1f))
                        Button(onClick = {
                            val p = salePick; val q = saleQty.toIntOrNull() ?: 0
                            if (p == null || q <= 0) return@Button
                            val have = basket.firstOrNull { it.first.id == p.id }?.second ?: 0
                            if (have + q > p.quantity) { message = AppStrings.get(R.string.s_0a2edd30); return@Button }
                            basket = basket.filter { it.first.id != p.id } + (p to (have + q))
                            saleQty = "1"
                        }) { Text(stringResource(R.string.accounting_sale_add)) }
                    }
                    if (basket.isEmpty()) Text(stringResource(R.string.accounting_sale_empty), color = MaterialTheme.colorScheme.onSurfaceVariant)
                    basket.forEach { (p, q) ->
                        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) { Text(p.name, style = MaterialTheme.typography.titleSmall); Text("$q × " + money(p.salePriceCents), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                            Text(money((p.salePriceCents.toLong() * q).toInt()), fontWeight = androidx.compose.ui.text.font.FontWeight.ExtraBold)
                            TextButton(onClick = { basket = basket.filter { it.first.id != p.id } }) { Text("✕", color = MaterialTheme.colorScheme.error) }
                        }
                    }
                    androidx.compose.foundation.layout.Box {
                        OutlinedButton(onClick = { salePartyOpen = true }, modifier = Modifier.fillMaxWidth()) { Text(partiesData?.parties?.firstOrNull { it.id == salePartyId }?.name ?: stringResource(R.string.accounting_sale_party)) }
                        androidx.compose.material3.DropdownMenu(expanded = salePartyOpen, onDismissRequest = { salePartyOpen = false }) {
                            androidx.compose.material3.DropdownMenuItem(text = { Text(stringResource(R.string.accounting_sale_no_party)) }, onClick = { salePartyId = null; salePartyOpen = false })
                            partiesData?.parties.orEmpty().filter { it.kind == "CUSTOMER" }.forEach { c -> androidx.compose.material3.DropdownMenuItem(text = { Text(c.name) }, onClick = { salePartyId = c.id; salePartyOpen = false }) }
                        }
                    }
                    OutlinedTextField(salePaid, { salePaid = it }, label = { Text(stringResource(R.string.accounting_sale_paid_now)) }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(saleCustomer, { saleCustomer = it }, label = { Text(stringResource(R.string.accounting_sale_customer)) }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                        OutlinedTextField(saleDiscount, { saleDiscount = it }, label = { Text(stringResource(R.string.accounting_sale_discount)) }, singleLine = true, modifier = Modifier.weight(1f))
                        if (!saleDiscountPercent) Button(onClick = { saleDiscountPercent = false }) { Text(stringResource(R.string.accounting_sale_discount_amount)) } else OutlinedButton(onClick = { saleDiscountPercent = false }) { Text(stringResource(R.string.accounting_sale_discount_amount)) }
                        if (saleDiscountPercent) Button(onClick = { saleDiscountPercent = true }) { Text(stringResource(R.string.accounting_sale_discount_percent)) } else OutlinedButton(onClick = { saleDiscountPercent = true }) { Text(stringResource(R.string.accounting_sale_discount_percent)) }
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        listOf("CASH" to R.string.accounting_pay_CASH, "BANK" to R.string.accounting_pay_BANK, "WALLET" to R.string.accounting_pay_WALLET).forEach { (code, label) ->
                            if (salePayMethod == code) Button(onClick = { salePayMethod = code }) { Text(stringResource(label)) } else OutlinedButton(onClick = { salePayMethod = code }) { Text(stringResource(label)) }
                        }
                    }
                    Text(stringResource(R.string.accounting_sale_subtotal) + ": " + money(saleSub.toInt()) + "   ·   " + stringResource(R.string.accounting_sale_total) + ": " + money(kotlin.math.max(saleSub - saleDisc, 0L).toInt()), fontWeight = androidx.compose.ui.text.font.FontWeight.ExtraBold)
                    Button(
                        enabled = basket.isNotEmpty(),
                        onClick = {
                            scope.launch {
                                val req = com.dalilacom.app.data.network.AccountingSaleRequest(
                                    items = basket.map { com.dalilacom.app.data.network.AccountingSaleItemRequest(it.first.id, it.second) },
                                    discountCents = if (!saleDiscountPercent && dv > 0) Math.round(dv * 100) else null,
                                    discountPercent = if (saleDiscountPercent && dv > 0) dv.coerceIn(0.0, 100.0) else null,
                                    customerName = saleCustomer.trim().ifEmpty { null }, payMethod = salePayMethod, partyId = salePartyId, paidCents = salePaid.trim().takeIf { it.isNotEmpty() }?.let { cents(it).toLong() },
                                )
                                container.accountingRepository.createSale(req).fold({ sale ->
                                    savedSale = sale; basket = emptyList(); saleCustomer = ""; saleDiscount = ""; salePaid = ""; salePartyId = null; salePick = null; reload()
                                }, { message = it.message ?: AppStrings.get(R.string.ship_failed) })
                            }
                        },
                        modifier = Modifier.fillMaxWidth(),
                    ) { Text(stringResource(R.string.accounting_sale_save)) }
                    if (sales.isNotEmpty()) {
                        Text(stringResource(R.string.accounting_sale_recent), style = MaterialTheme.typography.titleSmall)
                        sales.take(5).forEach { sl ->
                            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                                Column(Modifier.weight(1f)) { Text("#" + sl.number + (sl.customerName?.let { " · $it" } ?: ""), style = MaterialTheme.typography.titleSmall); Text(sl.occurredAt.take(10), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                                Text(money(sl.totalCents.toInt()), fontWeight = androidx.compose.ui.text.font.FontWeight.ExtraBold)
                                TextButton(onClick = { savedSale = sl }) { Text(stringResource(R.string.accounting_sale_share)) }
                                TextButton(onClick = { returnQty.clear(); returnMethod = sl.payMethod; returnSale = sl }) { Text(stringResource(R.string.accounting_ret_btn)) }
                            }
                        }
                    }
                }
            }
        }
        item {
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(stringResource(R.string.accounting_buy_title), style = MaterialTheme.typography.titleMedium)
                    Text(stringResource(R.string.accounting_buy_help), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    androidx.compose.foundation.layout.Box {
                        OutlinedButton(onClick = { buyPickOpen = true }, modifier = Modifier.fillMaxWidth()) { Text(buyPick?.let { it.name + " · " + stringResource(R.string.accounting_sale_stock) + ": " + it.quantity } ?: stringResource(R.string.accounting_sale_pick)) }
                        androidx.compose.material3.DropdownMenu(expanded = buyPickOpen, onDismissRequest = { buyPickOpen = false }) {
                            products.filter { !it.id.startsWith("store:") }.forEach { p -> androidx.compose.material3.DropdownMenuItem(text = { Text(p.name + " · " + p.quantity) }, onClick = { buyPick = p; buyCost = money(p.costCents); buyPickOpen = false }) }
                        }
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                        OutlinedTextField(buyQty, { buyQty = it }, label = { Text(stringResource(R.string.accounting_sale_qty)) }, singleLine = true, modifier = Modifier.weight(1f))
                        OutlinedTextField(buyCost, { buyCost = it }, label = { Text(stringResource(R.string.accounting_buy_cost)) }, singleLine = true, modifier = Modifier.weight(1f))
                    }
                    Button(onClick = {
                        val p = buyPick; val q = buyQty.toIntOrNull() ?: 0; val c = cents(buyCost).toLong()
                        if (p == null || q <= 0 || c <= 0) return@Button
                        val have = buyBasket.firstOrNull { it.first.id == p.id }
                        val nq = (have?.second ?: 0) + q
                        val nc = if (have != null) Math.round((have.second * have.third + q * c).toDouble() / nq) else c
                        buyBasket = buyBasket.filter { it.first.id != p.id } + Triple(p, nq, nc)
                        buyQty = "1"
                    }, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.accounting_sale_add)) }
                    if (buyBasket.isEmpty()) Text(stringResource(R.string.accounting_buy_empty), color = MaterialTheme.colorScheme.onSurfaceVariant)
                    buyBasket.forEach { (p, q, c) ->
                        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) { Text(p.name, style = MaterialTheme.typography.titleSmall); Text("$q × " + money(c.toInt()), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                            Text(money((c * q).toInt()), fontWeight = androidx.compose.ui.text.font.FontWeight.ExtraBold)
                            TextButton(onClick = { buyBasket = buyBasket.filter { it.first.id != p.id } }) { Text("✕", color = MaterialTheme.colorScheme.error) }
                        }
                    }
                    androidx.compose.foundation.layout.Box {
                        OutlinedButton(onClick = { buyPartyOpen = true }, modifier = Modifier.fillMaxWidth()) { Text(partiesData?.parties?.firstOrNull { it.id == buyPartyId }?.name ?: stringResource(R.string.accounting_buy_supplier)) }
                        androidx.compose.material3.DropdownMenu(expanded = buyPartyOpen, onDismissRequest = { buyPartyOpen = false }) {
                            androidx.compose.material3.DropdownMenuItem(text = { Text(stringResource(R.string.accounting_buy_no_supplier)) }, onClick = { buyPartyId = null; buyPartyOpen = false })
                            partiesData?.parties.orEmpty().filter { it.kind == "SUPPLIER" }.forEach { c -> androidx.compose.material3.DropdownMenuItem(text = { Text(c.name) }, onClick = { buyPartyId = c.id; buyPartyOpen = false }) }
                        }
                    }
                    OutlinedTextField(buyPaid, { buyPaid = it }, label = { Text(stringResource(R.string.accounting_buy_paid_now)) }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        listOf("CASH" to R.string.accounting_pay_CASH, "BANK" to R.string.accounting_pay_BANK, "WALLET" to R.string.accounting_pay_WALLET).forEach { (code, label) ->
                            if (buyPayMethod == code) Button(onClick = { buyPayMethod = code }) { Text(stringResource(label)) } else OutlinedButton(onClick = { buyPayMethod = code }) { Text(stringResource(label)) }
                        }
                    }
                    Text(stringResource(R.string.accounting_buy_total) + ": " + money(buyBasket.sumOf { it.third * it.second }.toInt()), fontWeight = androidx.compose.ui.text.font.FontWeight.ExtraBold)
                    Button(
                        enabled = buyBasket.isNotEmpty(),
                        onClick = {
                            scope.launch {
                                val req = com.dalilacom.app.data.network.AccountingPurchaseRequest(
                                    items = buyBasket.map { com.dalilacom.app.data.network.AccountingPurchaseItemRequest(it.first.id, it.second, it.third) },
                                    partyId = buyPartyId, paidCents = buyPaid.trim().takeIf { it.isNotEmpty() }?.let { cents(it).toLong() }, payMethod = buyPayMethod,
                                )
                                container.accountingRepository.createPurchase(req).fold({ pu ->
                                    message = context.getString(R.string.accounting_buy_saved, pu.number); buyBasket = emptyList(); buyPaid = ""; buyPartyId = null; buyPick = null; reload()
                                }, { message = it.message ?: AppStrings.get(R.string.ship_failed) })
                            }
                        },
                        modifier = Modifier.fillMaxWidth(),
                    ) { Text(stringResource(R.string.accounting_buy_save)) }
                    if (purchases.isNotEmpty()) {
                        Text(stringResource(R.string.accounting_buy_recent), style = MaterialTheme.typography.titleSmall)
                        purchases.take(5).forEach { pu ->
                            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                                Column(Modifier.weight(1f)) { Text("#" + pu.number + (pu.supplierName?.let { " · $it" } ?: ""), style = MaterialTheme.typography.titleSmall); Text(pu.occurredAt.take(10), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                                Text(money(pu.totalCents.toInt()), fontWeight = androidx.compose.ui.text.font.FontWeight.ExtraBold)
                                TextButton(onClick = { returnQty.clear(); returnMethod = pu.payMethod; returnPurchase = pu }) { Text(stringResource(R.string.accounting_ret_btn)) }
                            }
                        }
                    }
                }
            }
        }
        partiesData?.let { pd ->
            item {
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(stringResource(R.string.accounting_party_title), style = MaterialTheme.typography.titleMedium)
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            if (partyKind == "CUSTOMER") Button(onClick = {}) { Text(stringResource(R.string.accounting_party_customers)) } else OutlinedButton(onClick = { partyKind = "CUSTOMER" }) { Text(stringResource(R.string.accounting_party_customers)) }
                            if (partyKind == "SUPPLIER") Button(onClick = {}) { Text(stringResource(R.string.accounting_party_suppliers)) } else OutlinedButton(onClick = { partyKind = "SUPPLIER" }) { Text(stringResource(R.string.accounting_party_suppliers)) }
                        }
                        val tot = if (partyKind == "CUSTOMER") pd.receivable else pd.payable
                        Text(stringResource(if (partyKind == "CUSTOMER") R.string.accounting_party_receivable else R.string.accounting_party_payable) + ": " + (if (tot.isEmpty()) "0" else tot.joinToString(" · ") { money(it.cents.toInt()) + " " + it.currency }), fontWeight = androidx.compose.ui.text.font.FontWeight.ExtraBold)
                        val list = pd.parties.filter { it.kind == partyKind }
                        if (list.isEmpty()) Text(stringResource(R.string.accounting_party_empty), color = MaterialTheme.colorScheme.onSurfaceVariant)
                        list.forEach { p ->
                            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                com.dalilacom.app.ui.common.PersonAvatar(p.name, 40)
                                Column(Modifier.weight(1f)) {
                                    Text(p.name, style = MaterialTheme.typography.titleSmall)
                                    Text(stringResource(R.string.accounting_party_balance) + ": " + (if (p.balances.isEmpty()) stringResource(R.string.accounting_party_settled) else p.balances.joinToString(" · ") { money(it.balanceCents.toInt()) + " " + it.currency }), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                                TextButton(onClick = { scope.launch { partyDetail = container.accountingRepository.party(p.id) } }) { Text(stringResource(R.string.accounting_party_statement)) }
                            }
                        }
                        OutlinedTextField(partyName, { partyName = it }, label = { Text(stringResource(R.string.accounting_party_name)) }, singleLine = true, modifier = Modifier.fillMaxWidth())
                        Button(onClick = {
                            if (partyName.trim().length < 2) return@Button
                            scope.launch { container.accountingRepository.addParty(partyKind, partyName.trim()).fold({ partyName = ""; reload() }, { message = it.message ?: AppStrings.get(R.string.ship_failed) }) }
                        }, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.accounting_party_add)) }
                    }
                }
            }
        }
        report?.let { rp ->
            item {
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(stringResource(R.string.accounting_rep_title), style = MaterialTheme.typography.titleMedium)
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            listOf("today" to R.string.accounting_rep_today, "week" to R.string.accounting_rep_week, "month" to R.string.accounting_rep_month, "last30" to R.string.accounting_rep_last30).forEach { (code, label) ->
                                if (reportPreset == code) Button(onClick = {}, contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 10.dp)) { Text(stringResource(label), fontSize = 12.sp) }
                                else OutlinedButton(onClick = { reportPreset = code; scope.launch { reload() } }, contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 10.dp)) { Text(stringResource(label), fontSize = 12.sp) }
                            }
                        }
                        val tt = rp.totals
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            MetricTile(stringResource(R.string.accounting_incomeLabel), money(tt.incomeCents.toInt()), "income", Modifier.weight(1f))
                            MetricTile(stringResource(R.string.accounting_expensesLabel), money(tt.expensesCents.toInt()), "expense", Modifier.weight(1f))
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            MetricTile(stringResource(R.string.accounting_netLabel), money(tt.netCents.toInt()), "net", Modifier.weight(1f))
                            MetricTile(stringResource(R.string.accounting_rep_gross), money(tt.grossProfitCents.toInt()), "net", Modifier.weight(1f))
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            MetricTile(stringResource(R.string.accounting_rep_sales), money(tt.salesCents.toInt()), "income", Modifier.weight(1f))
                            MetricTile(stringResource(R.string.accounting_rep_cogs), money(tt.costOfGoodsCents.toInt()), "expense", Modifier.weight(1f))
                        }
                        if (rp.series.isEmpty()) Text(stringResource(R.string.accounting_rep_empty), color = MaterialTheme.colorScheme.onSurfaceVariant)
                        else {
                            Text(stringResource(R.string.accounting_rep_series), style = MaterialTheme.typography.titleSmall)
                            rp.series.takeLast(10).forEach { pr ->
                                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                    Text(pr.period, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    Text((if (pr.netCents < 0) "−" else "+") + money(kotlin.math.abs(pr.netCents).toInt()), color = if (pr.netCents < 0) androidx.compose.ui.graphics.Color(0xFFC62828) else androidx.compose.ui.graphics.Color(0xFF2E7D32), fontWeight = androidx.compose.ui.text.font.FontWeight.ExtraBold)
                                }
                            }
                        }
                        if (rp.byProduct.isNotEmpty()) {
                            Text(stringResource(R.string.accounting_rep_by_product), style = MaterialTheme.typography.titleSmall)
                            rp.byProduct.take(8).forEach { bp ->
                                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                    Text(bp.name + " × " + bp.quantity, modifier = Modifier.weight(1f))
                                    Text(money(bp.profitCents.toInt()), fontWeight = androidx.compose.ui.text.font.FontWeight.ExtraBold, color = if (bp.profitCents < 0) androidx.compose.ui.graphics.Color(0xFFC62828) else androidx.compose.ui.graphics.Color(0xFF2E7D32))
                                }
                            }
                        }
                    }
                }
            }
        }
        low?.let { lw ->
            item {
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(stringResource(R.string.accounting_low_title), style = MaterialTheme.typography.titleMedium)
                        if (countMode) {
                            Text(stringResource(R.string.accounting_count_help), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            products.filter { !it.id.startsWith("store:") }.forEach { p ->
                                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    Column(Modifier.weight(1f)) { Text(p.name, style = MaterialTheme.typography.titleSmall); Text(stringResource(R.string.accounting_count_book) + ": " + p.quantity, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                                    OutlinedTextField(counts[p.id].orEmpty(), { counts[p.id] = it }, label = { Text(stringResource(R.string.accounting_count_counted)) }, singleLine = true, modifier = Modifier.widthIn(min = 120.dp, max = 140.dp))
                                }
                            }
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Button(onClick = {
                                    val items = counts.entries.mapNotNull { (id, v) -> v.trim().toIntOrNull()?.takeIf { it >= 0 }?.let { id to it } }
                                    if (items.isEmpty()) { message = context.getString(R.string.accounting_missing_entry); return@Button }
                                    scope.launch {
                                        container.accountingRepository.countStock(items).fold({ r ->
                                            message = if (r.changed.isEmpty()) context.getString(R.string.accounting_count_same) else context.getString(R.string.accounting_count_done, r.changed.size)
                                            counts.clear(); countMode = false; reload()
                                        }, { message = it.message ?: AppStrings.get(R.string.ship_failed) })
                                    }
                                }, modifier = Modifier.weight(1f)) { Text(stringResource(R.string.accounting_count_apply)) }
                                OutlinedButton(onClick = { counts.clear(); countMode = false }, modifier = Modifier.weight(1f)) { Text(stringResource(R.string.accounting_count_cancel)) }
                            }
                        } else {
                            if (lw.items.isEmpty()) Text(stringResource(R.string.accounting_low_none), color = MaterialTheme.colorScheme.onSurfaceVariant)
                            lw.items.forEach { it ->
                                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                        Text(it.name, style = MaterialTheme.typography.titleSmall)
                                        Text(stringResource(R.string.accounting_low_left, it.quantity) + (if (it.lowStockAt > 0) " · " + stringResource(R.string.accounting_low_min) + ": " + it.lowStockAt else ""), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    }
                                    com.dalilacom.app.ui.common.StatusChip(stringResource(if (it.level == "OUT") R.string.accounting_low_out else R.string.accounting_low_low), if (it.level == "OUT") "bad" else "warn")
                                }
                            }
                            OutlinedButton(onClick = { countMode = true }, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.accounting_count_start)) }
                        }
                    }
                }
            }
        }
        item {
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(stringResource(R.string.accounting_add_entry), style = MaterialTheme.typography.titleMedium)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedButton(onClick = { entryType = "INCOME" }) { Text(stringResource(R.string.accounting_incomeLabel)) }
                        OutlinedButton(onClick = { entryType = "EXPENSE" }) { Text(stringResource(R.string.accounting_expense)) }
                    }
                    Text(stringResource(R.string.accounting_pay), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        listOf("CASH" to R.string.accounting_pay_CASH, "BANK" to R.string.accounting_pay_BANK, "WALLET" to R.string.accounting_pay_WALLET).forEach { (code, label) ->
                            if (entryPay == code) Button(onClick = { entryPay = code }) { Text(stringResource(label)) } else OutlinedButton(onClick = { entryPay = code }) { Text(stringResource(label)) }
                        }
                    }
                    OutlinedTextField(category, { category = it }, label = { Text(stringResource(R.string.accounting_category)) }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(description, { description = it }, label = { Text(stringResource(R.string.accounting_description)) }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(amount, { amount = it }, label = { Text(stringResource(R.string.accounting_amount)) }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    Button(onClick = {
                        if (category.isBlank() || description.isBlank() || cents(amount) <= 0) { message = context.getString(R.string.accounting_missing_entry); return@Button }
                        showResult { container.accountingRepository.addEntry(AccountingEntryRequest(entryType, category, description, cents(amount), payMethod = entryPay)) }
                    }, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.accounting_save)) }
                }
            }
        }
        item {
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(stringResource(R.string.accounting_invoice_photo), style = MaterialTheme.typography.titleMedium)
                    Text(stringResource(R.string.accounting_invoice_help), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    OutlinedButton(onClick = { invoicePicker.launch("image/*") }, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.accounting_invoice_choose)) }
                    invoiceDraft?.let { draft ->
                        Text(stringResource(R.string.accounting_invoice_review), color = MaterialTheme.colorScheme.tertiary)
                        OutlinedTextField(invoiceDescription, { invoiceDescription = it }, label = { Text(stringResource(R.string.accounting_description)) }, modifier = Modifier.fillMaxWidth())
                        OutlinedTextField(invoiceAmount, { invoiceAmount = it }, label = { Text(stringResource(R.string.accounting_amount)) }, singleLine = true, modifier = Modifier.fillMaxWidth())
                        Button(onClick = {
                            val value = cents(invoiceAmount)
                            if (value <= 0 || invoiceDescription.isBlank()) { message = context.getString(R.string.accounting_invoice_manual_amount); return@Button }
                            scope.launch { container.accountingRepository.confirmInvoice(draft.id, invoiceDescription, value, draft.extracted?.currency ?: "EUR").fold({
                                invoiceDraft = null; invoiceDescription = ""; invoiceAmount = ""; message = context.getString(R.string.accounting_invoice_saved); reload()
                            }, { message = it.message ?: context.getString(R.string.accounting_invoice_read_failed) }) }
                        }, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.accounting_invoice_confirm)) }
                    }
                }
            }
        }
        item {
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(stringResource(R.string.accounting_inventory), style = MaterialTheme.typography.titleMedium)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedTextField(barcode, { barcode = it }, label = { Text(stringResource(R.string.accounting_barcode)) }, singleLine = true, modifier = Modifier.weight(1f))
                        OutlinedButton(onClick = { scanner.launch(ScanOptions().setDesiredBarcodeFormats(ScanOptions.ONE_D_CODE_TYPES).setPrompt(context.getString(R.string.accounting_scan_prompt)).setBeepEnabled(false)) }) { Text(stringResource(R.string.accounting_scan)) }
                    }
                    OutlinedTextField(name, { name = it }, label = { Text(stringResource(R.string.accounting_product_name)) }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedTextField(cost, { cost = it }, label = { Text(stringResource(R.string.accounting_cost)) }, singleLine = true, modifier = Modifier.weight(1f))
                        OutlinedTextField(price, { price = it }, label = { Text(stringResource(R.string.accounting_price)) }, singleLine = true, modifier = Modifier.weight(1f))
                    }
                    OutlinedTextField(quantity, { quantity = it }, label = { Text(stringResource(R.string.accounting_quantity)) }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    Button(onClick = {
                        if (name.isBlank()) { message = context.getString(R.string.accounting_missing_name); return@Button }
                        showResult { container.accountingRepository.addProduct(AccountingProductRequest(name, barcode.ifBlank { null }, costCents = cents(cost), salePriceCents = cents(price), quantity = quantity.toIntOrNull() ?: 0)) }
                    }, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.accounting_add_product)) }
                }
            }
        }
        if (message.isNotBlank()) item { Text(message, color = MaterialTheme.colorScheme.primary) }
        if (products.isEmpty()) item { Text(stringResource(R.string.accounting_empty_stock), color = MaterialTheme.colorScheme.onSurfaceVariant) }
        items(products, key = { it.id }) { p ->
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(p.name, style = MaterialTheme.typography.titleMedium)
                    Text(stringResource(R.string.accounting_product_details, p.barcode.orEmpty(), p.quantity, money(p.costCents), money(p.salePriceCents), p.currency), style = MaterialTheme.typography.bodyMedium)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedButton(onClick = { costTarget = p; costEditValue = "%.2f".format(p.costCents / 100.0) }) { Text(stringResource(R.string.accounting_set_cost)) }
                        OutlinedButton(onClick = {
                            val count = 1
                            showResult { container.accountingRepository.stock(p.id, "STOCK_IN", count) }
                        }) { Text("+1") }
                        OutlinedButton(onClick = {
                            if (p.quantity > 0) showResult { container.accountingRepository.stock(p.id, "STOCK_OUT", 1) }
                        }, enabled = p.quantity > 0) { Text("−1") }
                        Button(onClick = { salePayTarget = p }, enabled = p.quantity > 0 && p.salePriceCents > 0) { Text(stringResource(R.string.accounting_sell_one)) }
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        if (!p.id.startsWith("store:")) TextButton(onClick = { minTarget = p; minValue = p.lowStockAt.toString() }) { Text(stringResource(R.string.accounting_low_min) + (if (p.lowStockAt > 0) ": " + p.lowStockAt else "")) }
                        TextButton(onClick = { movesTarget = p; scope.launch { moves = container.accountingRepository.movements(p.id) } }) { Text(stringResource(R.string.accounting_moves)) }
                    }
                    if (!p.id.startsWith("store:")) TextButton(onClick = { deleteProductTarget = p }) { Text(stringResource(R.string.accounting_delete), color = MaterialTheme.colorScheme.error) }
                }
            }
        }
        val recent = summary?.recent.orEmpty()
        if (recent.isNotEmpty()) item { Text(stringResource(R.string.accounting_recent), style = MaterialTheme.typography.titleMedium) }
        items(recent, key = { "entry-" + it.id }) { e ->
            Card(Modifier.fillMaxWidth()) {
                Row(Modifier.padding(14.dp), horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                    com.dalilacom.app.ui.common.PersonAvatar(if (e.type == "EXPENSE") "↓" else "↑", 40)
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text(e.description, style = MaterialTheme.typography.titleSmall)
                        Text(e.category + " · " + e.occurredAt.take(10), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        if (e.source == "PAYROLL") com.dalilacom.app.ui.common.StatusChip(stringResource(R.string.accounting_payrollLabel), "warn")
                        e.payMethod?.let { pm -> com.dalilacom.app.ui.common.StatusChip(stringResource(when (pm) { "BANK" -> R.string.accounting_pay_BANK; "WALLET" -> R.string.accounting_pay_WALLET; else -> R.string.accounting_pay_CASH })) }
                    }
                    Text(
                        (if ((e.type == "EXPENSE" || e.type == "PAYOUT") != (e.amountCents < 0)) "−" else "+") + money(kotlin.math.abs(e.amountCents)) + " " + e.currency,
                        color = if (e.type == "EXPENSE") androidx.compose.ui.graphics.Color(0xFFC62828) else androidx.compose.ui.graphics.Color(0xFF2E7D32),
                        fontWeight = androidx.compose.ui.text.font.FontWeight.ExtraBold,
                    )
                    // entries the store writes by itself (orders, commissions, delivery) follow the order and cannot be removed here
                    if (e.source == "MANUAL" || e.source == "INVOICE") TextButton(onClick = { editEntryTarget = e; editDescription = e.description; editAmount = money(e.amountCents) }) { Text(stringResource(R.string.accounting_edit)) }
                    if (e.source == "MANUAL" || e.source == "INVOICE") TextButton(onClick = { deleteEntryTarget = e }) { Text(stringResource(R.string.accounting_delete), color = MaterialTheme.colorScheme.error) }
                }
            }
        }
        item { Hint(stringResource(R.string.accounting_footer)) }
    }
    deleteProductTarget?.let { product ->
        AlertDialog(
            onDismissRequest = { deleteProductTarget = null },
            title = { Text(stringResource(R.string.accounting_delete)) },
            text = { Text(stringResource(R.string.accounting_delete_confirm, product.name)) },
            confirmButton = { Button(onClick = { showResult { container.accountingRepository.deleteProduct(product.id) }; deleteProductTarget = null }) { Text(stringResource(R.string.accounting_delete)) } },
            dismissButton = { OutlinedButton(onClick = { deleteProductTarget = null }) { Text(stringResource(R.string.account_cancel)) } },
        )
    }
    minTarget?.let { p ->
        AlertDialog(
            onDismissRequest = { minTarget = null },
            title = { Text(p.name) },
            text = { OutlinedTextField(minValue, { minValue = it }, label = { Text(stringResource(R.string.accounting_low_min_prompt)) }, singleLine = true) },
            confirmButton = { Button(onClick = { val v = minValue.trim().toIntOrNull(); minTarget = null; if (v != null && v >= 0) showResult { container.accountingRepository.setMin(p.id, v) } }) { Text(stringResource(R.string.accounting_save)) } },
            dismissButton = { OutlinedButton(onClick = { minTarget = null }) { Text(stringResource(R.string.account_cancel)) } },
        )
    }
    movesTarget?.let { p ->
        AlertDialog(
            onDismissRequest = { movesTarget = null },
            title = { Text(p.name + " · " + stringResource(R.string.accounting_moves)) },
            text = {
                Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (moves.isEmpty()) Text(stringResource(R.string.accounting_moves_none))
                    moves.forEach { m ->
                        Column {
                            Text(stringResource(when (m.action) { "STOCK_OUT" -> R.string.accounting_move_STOCK_OUT; "ADJUSTMENT" -> R.string.accounting_move_ADJUSTMENT; else -> R.string.accounting_move_STOCK_IN }) + ": " + (if (m.action == "ADJUSTMENT") "→ " else if (m.action == "STOCK_OUT") "−" else "+") + m.quantity, style = MaterialTheme.typography.titleSmall)
                            Text(m.occurredAt.take(16).replace('T', ' ') + (m.note?.let { " · $it" } ?: ""), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            },
            confirmButton = { OutlinedButton(onClick = { movesTarget = null }) { Text(stringResource(R.string.accounting_sale_close)) } },
        )
    }
    partyDetail?.let { d ->
        AlertDialog(
            onDismissRequest = { partyDetail = null },
            title = { Text(d.name) },
            text = {
                Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(stringResource(R.string.accounting_party_balance) + ": " + (if (d.balances.isEmpty()) stringResource(R.string.accounting_party_settled) else d.balances.joinToString(" · ") { money(it.balanceCents.toInt()) + " " + it.currency }), fontWeight = androidx.compose.ui.text.font.FontWeight.ExtraBold)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(onClick = { payPartyId = d.id; payAmount = d.balances.firstOrNull()?.let { money(it.balanceCents.toInt()) } ?: "" }, enabled = d.balances.isNotEmpty()) { Text(stringResource(R.string.accounting_party_pay)) }
                        OutlinedButton(onClick = { chargePartyId = d.id; chargeAmount = ""; chargeBook = false }) { Text(stringResource(R.string.accounting_party_charge)) }
                    }
                    d.entries.forEach { e ->
                        Column {
                            Text((if (e.kind == "PAYMENT") stringResource(R.string.accounting_party_payment_row) else stringResource(R.string.accounting_party_charge_row)) + (e.saleNumber?.let { " · #$it" } ?: "") + ": " + (if (e.kind == "PAYMENT") "−" else "+") + money(e.amountCents.toInt()) + " " + e.currency, style = MaterialTheme.typography.titleSmall)
                            Text(e.occurredAt.take(10) + " · " + stringResource(R.string.accounting_party_after) + ": " + money(e.balanceAfterCents.toInt()), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            },
            confirmButton = { OutlinedButton(onClick = { partyDetail = null }) { Text(stringResource(R.string.accounting_party_close)) } },
        )
    }
    payPartyId?.let { id ->
        AlertDialog(
            onDismissRequest = { payPartyId = null },
            title = { Text(stringResource(R.string.accounting_party_pay)) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(payAmount, { payAmount = it }, label = { Text(stringResource(R.string.accounting_party_amount)) }, singleLine = true)
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        listOf("CASH" to R.string.accounting_pay_CASH, "BANK" to R.string.accounting_pay_BANK, "WALLET" to R.string.accounting_pay_WALLET).forEach { (code, label) ->
                            if (payMethodChoice == code) Button(onClick = { payMethodChoice = code }, contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 10.dp)) { Text(stringResource(label), fontSize = 12.sp) } else OutlinedButton(onClick = { payMethodChoice = code }, contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 10.dp)) { Text(stringResource(label), fontSize = 12.sp) }
                        }
                    }
                }
            },
            confirmButton = {
                Button(onClick = {
                    val c = cents(payAmount).toLong(); val cur = partyDetail?.balances?.firstOrNull()?.currency ?: "EUR"; payPartyId = null
                    if (c > 0) scope.launch { container.accountingRepository.payParty(id, c, cur, payMethodChoice).fold({ partyDetail = container.accountingRepository.party(id); reload() }, { message = it.message ?: AppStrings.get(R.string.ship_failed) }) }
                }) { Text(stringResource(R.string.accounting_save)) }
            },
            dismissButton = { OutlinedButton(onClick = { payPartyId = null }) { Text(stringResource(R.string.account_cancel)) } },
        )
    }
    chargePartyId?.let { id ->
        AlertDialog(
            onDismissRequest = { chargePartyId = null },
            title = { Text(stringResource(R.string.accounting_party_charge)) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(chargeAmount, { chargeAmount = it }, label = { Text(stringResource(R.string.accounting_party_amount)) }, singleLine = true)
                    Row(verticalAlignment = Alignment.CenterVertically) { androidx.compose.material3.Checkbox(checked = chargeBook, onCheckedChange = { chargeBook = it }); Text(stringResource(R.string.accounting_party_book)) }
                }
            },
            confirmButton = {
                Button(onClick = {
                    val c = cents(chargeAmount).toLong(); chargePartyId = null
                    if (c > 0) scope.launch { container.accountingRepository.chargeParty(id, c, "EUR", chargeBook).fold({ partyDetail = container.accountingRepository.party(id); reload() }, { message = it.message ?: AppStrings.get(R.string.ship_failed) }) }
                }) { Text(stringResource(R.string.accounting_save)) }
            },
            dismissButton = { OutlinedButton(onClick = { chargePartyId = null }) { Text(stringResource(R.string.account_cancel)) } },
        )
    }
    if (returnSale != null || returnPurchase != null) {
        val saleRet = returnSale
        val purRet = returnPurchase
        val rows: List<Triple<String, String, Int>> = saleRet?.lines?.map { Triple(it.id, it.name, it.quantity - it.returnedQuantity) } ?: purRet?.lines?.map { Triple(it.id, it.name, it.quantity - it.returnedQuantity) }.orEmpty()
        AlertDialog(
            onDismissRequest = { returnSale = null; returnPurchase = null },
            title = { Text(stringResource(R.string.accounting_ret_title)) },
            text = {
                Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    val open = rows.filter { it.third > 0 }
                    if (open.isEmpty()) Text(stringResource(R.string.accounting_ret_all))
                    open.forEach { (lineId, name, left) ->
                        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Column(Modifier.weight(1f)) { Text(name, style = MaterialTheme.typography.titleSmall); Text(stringResource(R.string.accounting_ret_max, left), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                            OutlinedTextField(returnQty[lineId].orEmpty(), { returnQty[lineId] = it }, singleLine = true, modifier = Modifier.widthIn(min = 80.dp, max = 100.dp))
                        }
                    }
                    Text(stringResource(R.string.accounting_ret_method), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        listOf("CASH" to R.string.accounting_pay_CASH, "BANK" to R.string.accounting_pay_BANK, "WALLET" to R.string.accounting_pay_WALLET).forEach { (code, label) ->
                            if (returnMethod == code) Button(onClick = { returnMethod = code }, contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 10.dp)) { Text(stringResource(label), fontSize = 12.sp) } else OutlinedButton(onClick = { returnMethod = code }, contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 10.dp)) { Text(stringResource(label), fontSize = 12.sp) }
                        }
                    }
                }
            },
            confirmButton = {
                Button(onClick = {
                    val items = rows.mapNotNull { (id, _, left) -> returnQty[id]?.trim()?.toIntOrNull()?.takeIf { it in 1..left }?.let { id to it } }
                    if (items.isEmpty()) { message = context.getString(R.string.accounting_ret_none); return@Button }
                    val sId = saleRet?.id; val pId = purRet?.id
                    returnSale = null; returnPurchase = null
                    scope.launch {
                        val r = if (sId != null) container.accountingRepository.returnSale(sId, items, returnMethod) else container.accountingRepository.returnPurchase(pId!!, items, returnMethod)
                        r.fold({ message = context.getString(R.string.accounting_ret_done); reload() }, { message = it.message ?: AppStrings.get(R.string.ship_failed) })
                    }
                }) { Text(stringResource(R.string.accounting_ret_save)) }
            },
            dismissButton = { OutlinedButton(onClick = { returnSale = null; returnPurchase = null }) { Text(stringResource(R.string.account_cancel)) } },
        )
    }
    savedSale?.let { sale ->
        val text = buildString {
            append(context.getString(R.string.accounting_sale_number, sale.number)); append("\n")
            sale.customerName?.let { append(it); append("\n") }
            sale.lines.forEach { l -> append(l.name + " × " + l.quantity + " = " + money(l.lineTotalCents.toInt()) + " " + sale.currency + "\n") }
            if (sale.discountCents > 0) append(context.getString(R.string.accounting_sale_discount) + ": −" + money(sale.discountCents.toInt()) + " " + sale.currency + "\n")
            append(context.getString(R.string.accounting_sale_total) + ": " + money(sale.totalCents.toInt()) + " " + sale.currency)
        }
        AlertDialog(
            onDismissRequest = { savedSale = null },
            title = { Text(stringResource(R.string.accounting_sale_saved, sale.number)) },
            text = { Text(text) },
            confirmButton = {
                Button(onClick = {
                    val send = android.content.Intent(android.content.Intent.ACTION_SEND).apply { type = "text/plain"; putExtra(android.content.Intent.EXTRA_TEXT, text) }
                    context.startActivity(android.content.Intent.createChooser(send, context.getString(R.string.accounting_sale_share)))
                }) { Text(stringResource(R.string.accounting_sale_share)) }
            },
            dismissButton = { OutlinedButton(onClick = { savedSale = null }) { Text(stringResource(R.string.accounting_sale_close)) } },
        )
    }
    salePayTarget?.let { product ->
        AlertDialog(
            onDismissRequest = { salePayTarget = null },
            title = { Text(stringResource(R.string.accounting_sell_pay)) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("CASH" to R.string.accounting_pay_CASH, "BANK" to R.string.accounting_pay_BANK, "WALLET" to R.string.accounting_pay_WALLET).forEach { (code, label) ->
                        Button(onClick = { salePayTarget = null; showResult { container.accountingRepository.sell(product.id, 1, code) } }, modifier = Modifier.fillMaxWidth()) { Text(stringResource(label)) }
                    }
                }
            },
            confirmButton = {},
            dismissButton = { OutlinedButton(onClick = { salePayTarget = null }) { Text(stringResource(R.string.account_cancel)) } },
        )
    }
    if (openingDialog) {
        AlertDialog(
            onDismissRequest = { openingDialog = false },
            title = { Text(stringResource(R.string.accounting_cash_opening)) },
            text = { OutlinedTextField(openingValue, { openingValue = it }, label = { Text(stringResource(R.string.accounting_amount)) }, singleLine = true) },
            confirmButton = {
                Button(onClick = {
                    val c = cash
                    openingDialog = false
                    if (c != null) scope.launch { container.accountingRepository.setCashOpening(c.day, c.currency, cents(openingValue).toLong()); reload() }
                }) { Text(stringResource(R.string.accounting_save)) }
            },
            dismissButton = { OutlinedButton(onClick = { openingDialog = false }) { Text(stringResource(R.string.account_cancel)) } },
        )
    }
    editEntryTarget?.let { entry ->
        AlertDialog(
            onDismissRequest = { editEntryTarget = null },
            title = { Text(stringResource(R.string.accounting_edit)) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(editDescription, { editDescription = it }, label = { Text(stringResource(R.string.accounting_description)) }, singleLine = true)
                    OutlinedTextField(editAmount, { editAmount = it }, label = { Text(stringResource(R.string.accounting_amount)) }, singleLine = true, keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = androidx.compose.ui.text.input.KeyboardType.Decimal))
                }
            },
            confirmButton = {
                Button(
                    enabled = editDescription.isNotBlank() && cents(editAmount) > 0,
                    onClick = { showResult { container.accountingRepository.editEntry(entry.id, editDescription.trim(), cents(editAmount)) }; editEntryTarget = null },
                ) { Text(stringResource(R.string.accounting_save)) }
            },
            dismissButton = { OutlinedButton(onClick = { editEntryTarget = null }) { Text(stringResource(R.string.account_cancel)) } },
        )
    }
    deleteEntryTarget?.let { entry ->
        AlertDialog(
            onDismissRequest = { deleteEntryTarget = null },
            title = { Text(stringResource(R.string.accounting_delete)) },
            text = { Text(stringResource(R.string.accounting_delete_confirm, entry.description)) },
            confirmButton = { Button(onClick = { showResult { container.accountingRepository.deleteEntry(entry.id) }; deleteEntryTarget = null }) { Text(stringResource(R.string.accounting_delete)) } },
            dismissButton = { OutlinedButton(onClick = { deleteEntryTarget = null }) { Text(stringResource(R.string.account_cancel)) } },
        )
    }
    costTarget?.let { product ->
        AlertDialog(
            onDismissRequest = { costTarget = null },
            title = { Text(stringResource(R.string.accounting_cost)) },
            text = { OutlinedTextField(costEditValue, { costEditValue = it }, label = { Text(stringResource(R.string.accounting_cost)) }, singleLine = true) },
            confirmButton = { Button(onClick = {
                val value = cents(costEditValue)
                if (value >= 0) {
                    showResult { container.accountingRepository.stock(product.id, "ADJUSTMENT", product.quantity, value) }
                    costTarget = null
                }
            }) { Text(stringResource(R.string.accounting_save)) } },
            dismissButton = { OutlinedButton(onClick = { costTarget = null }) { Text(stringResource(R.string.account_cancel)) } },
        )
    }
}

private fun money(cents: Int) = "%.2f".format(cents / 100.0)
