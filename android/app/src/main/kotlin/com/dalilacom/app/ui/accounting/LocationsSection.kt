package com.dalilacom.app.ui.accounting

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Button
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
import com.dalilacom.app.data.network.AccountingLocationDto
import com.dalilacom.app.data.network.AccountingOverviewRowDto
import com.dalilacom.app.data.network.AccountingProductDto
import com.dalilacom.app.ui.common.StatusChip
import kotlinx.coroutines.launch

/**
 * Goods outside the main store: shop branches and distributors. The main store is the product's own quantity; giving goods out
 * takes them from it, returning puts them back, and a sale made from a location takes them from that location only.
 */
@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
fun LocationsSection(
    container: AppContainer,
    products: List<AccountingProductDto>,
    locations: List<AccountingLocationDto>,
    canMove: Boolean,
    isOwner: Boolean,
    canReceive: Boolean = false,
    canReport: Boolean = false,
    onChanged: () -> Unit,
    setMessage: (String) -> Unit,
) {
    val scope = rememberCoroutineScope()
    val context = androidx.compose.ui.platform.LocalContext.current
    var overview by remember { mutableStateOf<List<AccountingOverviewRowDto>?>(null) }
    LaunchedEffect(locations, products) { overview = container.accountingRepository.stockOverview() }
    var newName by remember { mutableStateOf("") }
    var newKind by remember { mutableStateOf("DISTRIBUTOR") }
    var deleteLocId by remember { mutableStateOf<String?>(null) }

    fun run(call: suspend () -> Result<Unit>) {
        scope.launch { call().fold({ setMessage(""); onChanged() }, { setMessage(it.message.orEmpty()) }) }
    }

    deleteLocId?.let { id ->
        androidx.compose.material3.AlertDialog(
            onDismissRequest = { deleteLocId = null },
            title = { Text(stringResource(R.string.accounting_loc_deleteAsk)) },
            confirmButton = { androidx.compose.material3.TextButton(onClick = { deleteLocId = null; run { container.accountingRepository.deleteLocation(id) } }) { Text(stringResource(R.string.accounting_loc_delete), color = MaterialTheme.colorScheme.error) } },
            dismissButton = { androidx.compose.material3.TextButton(onClick = { deleteLocId = null }) { Text(stringResource(R.string.account_cancel)) } },
        )
    }
    Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(stringResource(R.string.accounting_loc_overview), style = MaterialTheme.typography.titleSmall)
        overview.orEmpty().filter { it.inMainStore > 0 || it.distributed > 0 || it.sold > 0 || it.inOnlineStore > 0 || it.soldOnline > 0 }.forEach { r ->
            Column {
                Text(r.name, fontWeight = FontWeight.ExtraBold)
                Text(
                    stringResource(R.string.accounting_loc_main) + ": " + r.inMainStore + "  ·  " + stringResource(R.string.accounting_loc_distributed) + ": " + r.distributed + "  ·  " + stringResource(R.string.accounting_store_in) + ": " + r.inOnlineStore + "  ·  " + stringResource(R.string.accounting_loc_sold) + ": " + (r.sold + r.soldOnline),
                    fontSize = 12.5.sp, color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        val own = products.filter { !it.id.startsWith("store:") }
        val free = products.filter { it.id.startsWith("store:") }
        if (canMove && own.isNotEmpty() && (free.isNotEmpty() || own.any { it.storeProductId != null })) {
            var sp by remember { mutableStateOf<AccountingProductDto?>(null) }
            var spOpen by remember { mutableStateOf(false) }
            var ss by remember { mutableStateOf<AccountingProductDto?>(null) }
            var ssOpen by remember { mutableStateOf(false) }
            var sq by remember { mutableStateOf("1") }
            Text(stringResource(R.string.accounting_store_title), style = MaterialTheme.typography.titleSmall)
            Text(stringResource(R.string.accounting_store_hint), fontSize = 12.5.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            androidx.compose.foundation.layout.Box {
                OutlinedButton(onClick = { spOpen = true }, modifier = Modifier.fillMaxWidth()) { Text(sp?.name ?: stringResource(R.string.accounting_loc_pick)) }
                DropdownMenu(expanded = spOpen, onDismissRequest = { spOpen = false }) {
                    own.forEach { p -> DropdownMenuItem(text = { Text(p.name + if (p.storeProductId != null) " · " + stringResource(R.string.accounting_store_in) + ": " + p.storeUnits else "") }, onClick = { sp = p; spOpen = false }) }
                }
            }
            if (sp?.storeProductId == null) {
                androidx.compose.foundation.layout.Box {
                    OutlinedButton(onClick = { ssOpen = true }, modifier = Modifier.fillMaxWidth()) { Text(ss?.name ?: stringResource(R.string.accounting_store_pick)) }
                    DropdownMenu(expanded = ssOpen, onDismissRequest = { ssOpen = false }) {
                        free.forEach { p -> DropdownMenuItem(text = { Text(p.name) }, onClick = { ss = p; ssOpen = false }) }
                    }
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(sq, { sq = it }, label = { Text(stringResource(R.string.accounting_store_qty)) }, singleLine = true, modifier = Modifier.weight(1f))
                Button(onClick = {
                    val p = sp; val q = sq.toIntOrNull() ?: -1
                    val target = p?.storeProductId ?: ss?.id?.removePrefix("store:")
                    if (p != null && target != null && q >= 0) run { container.accountingRepository.setStoreShare(p.id, target, q) }
                }) { Text(stringResource(R.string.accounting_store_save)) }
                if (sp?.storeProductId != null) OutlinedButton(onClick = { val p = sp; if (p != null) run { container.accountingRepository.unlinkStore(p.id).also { if (it.isSuccess) sp = null } } }) { Text(stringResource(R.string.accounting_store_unlink)) }
            }
        }
        Text(stringResource(R.string.accounting_loc_title), style = MaterialTheme.typography.titleSmall)
        if (locations.isEmpty()) Text(stringResource(R.string.accounting_loc_none), color = MaterialTheme.colorScheme.onSurfaceVariant)
        locations.forEach { l ->
            var pick by remember(l.id) { mutableStateOf<AccountingProductDto?>(null) }
            var pickOpen by remember(l.id) { mutableStateOf(false) }
            var qty by remember(l.id) { mutableStateOf("1") }
            var scanning by remember(l.id) { mutableStateOf(false) }
            var scanNote by remember(l.id) { mutableStateOf<ScanReply?>(null) }
            var lastScanned by remember(l.id) { mutableStateOf<String?>(null) }
            // a scan chooses the product; each further scan of the same product is one piece more. Nothing moves before the button.
            suspend fun chooseByBarcode(code: String): ScanReply {
                val found = (products.firstOrNull { it.barcode == code } ?: container.accountingRepository.products(code).firstOrNull { it.barcode == code })?.takeIf { !it.id.startsWith("store:") }
                    ?: return ScanReply(context.getString(R.string.barcode_unknown), false)
                val n = if (lastScanned == found.id && pick?.id == found.id) (qty.toIntOrNull() ?: 0) + 1 else 1
                lastScanned = found.id; pick = found; qty = n.toString()
                return ScanReply(context.getString(R.string.barcode_chosen, found.name, n), true)
            }
            if (scanning) ContinuousScanDialog(onCode = { code -> chooseByBarcode(code).also { scanNote = it } }, onDismiss = { scanning = false })
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(l.name, fontWeight = FontWeight.ExtraBold)
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    StatusChip(stringResource(if (l.kind == "BRANCH") R.string.accounting_loc_kind_BRANCH else R.string.accounting_loc_kind_DISTRIBUTOR), if (l.isActive) "info" else "warn")
                    l.staffName?.let { StatusChip(it) }
                }
                Text(stringResource(R.string.accounting_loc_held, l.onHandUnits) + "  ·  " + stringResource(R.string.accounting_loc_sold) + ": " + l.soldUnits, fontSize = 12.5.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                l.items.forEach { i -> Text(i.name + "  ·  " + stringResource(R.string.accounting_loc_onhand) + ": " + i.onHand + "  ·  " + stringResource(R.string.accounting_loc_sold) + ": " + i.sold, fontSize = 13.sp) }
                LocationCashBlock(container, l.id, canReceive, locations, setMessage)
                if (canMove && l.isActive) {
                    BarcodeEntryRow(scanNote, onCamera = { scanning = true }) { code -> scope.launch { scanNote = chooseByBarcode(code) } }
                    androidx.compose.foundation.layout.Box {
                        OutlinedButton(onClick = { pickOpen = true }, modifier = Modifier.fillMaxWidth()) { Text(pick?.name ?: stringResource(R.string.accounting_loc_pick)) }
                        DropdownMenu(expanded = pickOpen, onDismissRequest = { pickOpen = false }) {
                            products.filter { !it.id.startsWith("store:") }.forEach { p -> DropdownMenuItem(text = { Text(p.name + " · " + p.quantity) }, onClick = { pick = p; pickOpen = false }) }
                        }
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                        OutlinedTextField(qty, { qty = it }, label = { Text(stringResource(R.string.accounting_loc_qty)) }, singleLine = true, modifier = Modifier.weight(1f))
                        Button(onClick = { val p = pick; val q = qty.toIntOrNull() ?: 0; if (p != null && q > 0) run { container.accountingRepository.giveStock(l.id, p.id, q) } }) { Text(stringResource(R.string.accounting_loc_give)) }
                        OutlinedButton(onClick = { val p = pick; val q = qty.toIntOrNull() ?: 0; if (p != null && q > 0) run { container.accountingRepository.returnStock(l.id, p.id, q) } }) { Text(stringResource(R.string.accounting_loc_return)) }
                    }
                }
                if (isOwner) Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = { run { container.accountingRepository.setLocationActive(l.id, !l.isActive) } }) { Text(stringResource(if (l.isActive) R.string.accounting_loc_switch_off else R.string.accounting_loc_switch_on)) }
                    OutlinedButton(onClick = { deleteLocId = l.id }) { Text(stringResource(R.string.accounting_loc_delete), color = MaterialTheme.colorScheme.error) }
                }
            }
        }
        if (isOwner) {
            Text(stringResource(R.string.accounting_loc_add), style = MaterialTheme.typography.titleSmall)
            OutlinedTextField(newName, { newName = it }, label = { Text(stringResource(R.string.accounting_loc_name)) }, singleLine = true, modifier = Modifier.fillMaxWidth())
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("BRANCH" to R.string.accounting_loc_kind_BRANCH, "DISTRIBUTOR" to R.string.accounting_loc_kind_DISTRIBUTOR).forEach { (code, label) ->
                    if (newKind == code) Button(onClick = { newKind = code }) { Text(stringResource(label)) } else OutlinedButton(onClick = { newKind = code }) { Text(stringResource(label)) }
                }
            }
            Button(onClick = { if (newName.isNotBlank()) run { container.accountingRepository.createLocation(newName.trim(), newKind).also { if (it.isSuccess) newName = "" } } }) { Text(stringResource(R.string.accounting_loc_add_btn)) }
        }
        if (canReport) SellerReportCard(container)
    }
}
