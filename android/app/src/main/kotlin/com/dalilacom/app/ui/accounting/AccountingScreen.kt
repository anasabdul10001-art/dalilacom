package com.dalilacom.app.ui.accounting

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.AlertDialog
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

    suspend fun reload() {
        loading = true
        summary = container.accountingRepository.summary()
        products = container.accountingRepository.products()
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
            message = result.fold({ "تم الحفظ" }, { it.message ?: "تعذّر الحفظ" })
            if (result.isSuccess) reload()
        }
    }

    if (loading) {
        Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.Center) { CircularProgressIndicator() }
        return
    }
    if (container.accountingRepository.requiresPlan) {
        Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.Center, horizontalAlignment = androidx.compose.ui.Alignment.CenterHorizontally) {
            Text(stringResource(R.string.accounting_plan_required), style = MaterialTheme.typography.titleMedium)
            Button(onClick = onOpenPlans, modifier = Modifier.fillMaxWidth().padding(top = 16.dp)) { Text(stringResource(R.string.accounting_open_plans)) }
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
                        Text(stringResource(R.string.accounting_totals_line, it.currency, money(it.incomeCents), money(it.expensesCents), money(it.netCents)))
                    }
                    Text(stringResource(R.string.accounting_stock_summary, summary?.inventory?.products ?: 0, summary?.inventory?.units ?: 0))
                }
            }
        }
        item {
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(stringResource(R.string.accounting_add_entry), style = MaterialTheme.typography.titleMedium)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedButton(onClick = { entryType = "INCOME" }) { Text(stringResource(R.string.accounting_income)) }
                        OutlinedButton(onClick = { entryType = "EXPENSE" }) { Text(stringResource(R.string.accounting_expense)) }
                    }
                    OutlinedTextField(category, { category = it }, label = { Text(stringResource(R.string.accounting_category)) }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(description, { description = it }, label = { Text(stringResource(R.string.accounting_description)) }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(amount, { amount = it }, label = { Text(stringResource(R.string.accounting_amount)) }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    Button(onClick = {
                        if (category.isBlank() || description.isBlank() || cents(amount) <= 0) { message = context.getString(R.string.accounting_missing_entry); return@Button }
                        showResult { container.accountingRepository.addEntry(AccountingEntryRequest(entryType, category, description, cents(amount))) }
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
                        Button(onClick = { showResult { container.accountingRepository.sell(p.id, 1) } }, enabled = p.quantity > 0 && p.salePriceCents > 0) { Text(stringResource(R.string.accounting_sell_one)) }
                    }
                }
            }
        }
        item { Hint(stringResource(R.string.accounting_footer)) }
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
