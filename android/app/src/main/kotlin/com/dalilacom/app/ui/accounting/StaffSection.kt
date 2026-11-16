package com.dalilacom.app.ui.accounting

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.unit.dp
import com.dalilacom.app.R
import com.dalilacom.app.data.AppContainer
import com.dalilacom.app.data.network.StaffAmountDto
import com.dalilacom.app.data.network.StaffCommissionDto
import com.dalilacom.app.data.network.StaffDto
import com.dalilacom.app.data.network.StaffWorkplaceDto
import com.dalilacom.app.ui.common.StatusChip
import com.dalilacom.app.ui.i18n.AppStrings
import kotlinx.coroutines.launch

private val ROLES = listOf("CASHIER", "STOCK", "ASSISTANT", "MANAGER", "DRIVER", "MARKETER")
private fun cents(c: Long, currency: String) = "%.2f %s".format(c / 100.0, currency)

@Composable
fun staffRoleName(role: String): String = stringResource(
    when (role) {
        "STOCK" -> R.string.staff_role_stock
        "ASSISTANT" -> R.string.staff_role_assistant
        "MANAGER" -> R.string.staff_role_manager
        "DRIVER" -> R.string.staff_role_driver
        "MARKETER" -> R.string.staff_role_marketer
        else -> R.string.staff_role_cashier
    },
)

@Composable
private fun staffRoleHelp(role: String): String = stringResource(
    when (role) {
        "STOCK" -> R.string.staff_help_stock
        "ASSISTANT" -> R.string.staff_help_assistant
        "MANAGER" -> R.string.staff_help_manager
        "DRIVER" -> R.string.staff_help_driver
        "MARKETER" -> R.string.staff_help_marketer
        else -> R.string.staff_help_cashier
    },
)

/** The bar for accounts that work for someone: switch between their own accounting and each workplace. Nothing for everybody else. */
@Composable
fun StaffSwitcher(workplaces: List<StaffWorkplaceDto>, actingId: String?, onSwitch: (String?) -> Unit) {
    if (workplaces.isEmpty()) return
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            if (actingId == null) Button(onClick = { onSwitch(null) }, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.staff_switch_mine)) }
            else OutlinedButton(onClick = { onSwitch(null) }, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.staff_switch_mine)) }
            workplaces.forEach { w ->
                val label = stringResource(R.string.staff_working_at, w.businessName.orEmpty())
                if (w.ownerId == actingId) Button(onClick = { onSwitch(w.ownerId) }, modifier = Modifier.fillMaxWidth()) { Text(label) }
                else OutlinedButton(onClick = { onSwitch(w.ownerId) }, modifier = Modifier.fillMaxWidth()) { Text(label) }
            }
        }
    }
}

/** What a staff member sees of their own job: role, rate, and the commissions they earned. */
@Composable
fun StaffMyWork(container: AppContainer, workplace: StaffWorkplaceDto, refreshKey: Int = 0) {
    var rows by remember(workplace.staffId) { mutableStateOf<List<StaffCommissionDto>?>(null) }
    LaunchedEffect(workplace.staffId, refreshKey) { rows = container.staffRepository.myCommissions(workplace.staffId) }
    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            StatusChip(staffRoleName(workplace.role), "info")
            if (workplace.salesRateBp > 0) StatusChip(stringResource(R.string.staff_my_rate, workplace.salesRateBp / 100.0), "info")
        }
        // the unpaid total follows the list that was just loaded; the workplace figure is only the start value
        val unpaid = rows?.filter { it.status == "ACCRUED" }?.groupBy { it.currency }?.map { it.key to it.value.sumOf { c -> c.amountCents } }
            ?: workplace.unpaidCommissions.filter { it.cents > 0 }.map { it.currency to it.cents }
        unpaid.filter { it.second > 0 }.forEach { Text(stringResource(R.string.staff_unpaid) + ": " + cents(it.second, it.first), style = MaterialTheme.typography.titleSmall) }
        Text(stringResource(R.string.staff_commissions), style = MaterialTheme.typography.titleSmall)
        val list = rows
        if (list == null) Text("...") else if (list.isEmpty()) Text(stringResource(R.string.staff_no_commissions), color = MaterialTheme.colorScheme.onSurfaceVariant)
        else list.forEach { c ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(cents(c.amountCents, c.currency) + " | " + c.createdAt.take(10) + " | " + "%.1f%%".format(c.rateBp / 100.0))
                Text(stringResource(when (c.status) { "PAID" -> R.string.staff_status_paid; "VOID" -> R.string.staff_status_void; else -> R.string.staff_status_accrued }), color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

/** The owner staff list (add, invite, commission, remove, pay) and, for anybody, the field to enter an invitation code. */
/** The invitation-code entry on its own: a person without an accounting plan (a staff member) must still be able to join a workplace. */
@Composable
fun StaffJoinCard(container: AppContainer, onJoined: (String) -> Unit) {
    val scope = rememberCoroutineScope()
    var joinCode by remember { mutableStateOf("") }
    var message by remember { mutableStateOf("") }
    Column(Modifier.fillMaxWidth().padding(top = 24.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(stringResource(R.string.staff_join_title), style = MaterialTheme.typography.titleSmall)
        Text(stringResource(R.string.staff_join_help), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        OutlinedTextField(joinCode, { joinCode = it }, singleLine = true, modifier = Modifier.fillMaxWidth())
        OutlinedButton(
            onClick = {
                scope.launch {
                    container.staffRepository.accept(joinCode.trim()).fold({ joinCode = ""; message = AppStrings.get(R.string.staff_joined); onJoined(it.ownerId) }, { message = it.message.orEmpty() })
                }
            },
            modifier = Modifier.fillMaxWidth(),
        ) { Text(stringResource(R.string.staff_join_btn)) }
        if (message.isNotBlank()) Text(message, style = MaterialTheme.typography.bodySmall)
    }
}

@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
fun StaffOwnerSection(container: AppContainer, onJoined: (String) -> Unit) {
    val scope = rememberCoroutineScope()
    val clipboard = LocalClipboardManager.current
    var list by remember { mutableStateOf<List<StaffDto>?>(null) }
    var message by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }
    var joinCode by remember { mutableStateOf("") }
    var name by remember { mutableStateOf("") }
    var role by remember { mutableStateOf("CASHIER") }
    var rate by remember { mutableStateOf("0") }
    var fixed by remember { mutableStateOf("0") }
    var rateTarget by remember { mutableStateOf<StaffDto?>(null) }
    var rateValue by remember { mutableStateOf("") }
    var removeTarget by remember { mutableStateOf<StaffDto?>(null) }
    var payTarget by remember { mutableStateOf<Pair<StaffDto, StaffAmountDto>?>(null) }
    var salaryTarget by remember { mutableStateOf<StaffDto?>(null) }
    var hrEmps by remember { mutableStateOf<List<com.dalilacom.app.data.network.StaffHrEmployeeDto>>(emptyList()) }
    var hrTarget by remember { mutableStateOf<StaffDto?>(null) }
    suspend fun reload() { list = container.staffRepository.list() }
    LaunchedEffect(Unit) { reload(); hrEmps = container.staffRepository.hrEmployees() }
    fun pct(v: String) = ((v.replace(',', '.').toDoubleOrNull() ?: 0.0) * 100).toInt()

    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(stringResource(R.string.staff_help), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (message.isNotBlank()) Text(message, color = MaterialTheme.colorScheme.primary)
        if (code.isNotBlank()) {
            Text(stringResource(R.string.staff_invite_show), style = MaterialTheme.typography.bodySmall)
            Text(code, style = MaterialTheme.typography.titleSmall)
            OutlinedButton(onClick = { clipboard.setText(AnnotatedString(code)); message = AppStrings.get(R.string.staff_copied) }) { Text(stringResource(R.string.staff_copy)) }
        }
        Text(stringResource(R.string.staff_add), style = MaterialTheme.typography.titleSmall)
        OutlinedTextField(name, { name = it }, label = { Text(stringResource(R.string.staff_name)) }, singleLine = true, modifier = Modifier.fillMaxWidth())
        // six roles do not fit in one line on a phone: wrap them so none is cut off
        androidx.compose.foundation.layout.FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            ROLES.forEach { r ->
                if (r == role) Button(onClick = { role = r }, contentPadding = PaddingValues(horizontal = 8.dp)) { Text(staffRoleName(r), maxLines = 1) }
                else OutlinedButton(onClick = { role = r }, contentPadding = PaddingValues(horizontal = 8.dp)) { Text(staffRoleName(r), maxLines = 1) }
            }
        }
        Text(staffRoleHelp(role), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        OutlinedTextField(rate, { rate = it }, label = { Text(stringResource(R.string.staff_rate)) }, supportingText = { Text(stringResource(R.string.staff_rate_help)) }, singleLine = true, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(fixed, { fixed = it }, label = { Text(stringResource(R.string.staff_fixed)) }, singleLine = true, modifier = Modifier.fillMaxWidth())
        Button(
            onClick = {
                if (name.trim().length < 2) { message = AppStrings.get(R.string.staff_name); return@Button }
                scope.launch {
                    container.staffRepository.create(name.trim(), role, pct(rate), pct(fixed).toLong()).fold({ name = ""; message = AppStrings.get(R.string.staff_saved); reload() }, { message = it.message.orEmpty() })
                }
            },
            modifier = Modifier.fillMaxWidth(),
        ) { Text(stringResource(R.string.staff_add)) }

        val rows = list
        if (rows == null) Text("...") else if (rows.isEmpty()) Text(stringResource(R.string.staff_none), color = MaterialTheme.colorScheme.onSurfaceVariant)
        rows.orEmpty().forEach { s ->
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(s.name, style = MaterialTheme.typography.titleSmall)
                    androidx.compose.foundation.layout.FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        StatusChip(staffRoleName(s.role), "info")
                        StatusChip(stringResource(when (s.inviteState) { "LINKED" -> R.string.staff_state_linked; "PENDING" -> R.string.staff_state_pending; else -> R.string.staff_state_none }), if (s.inviteState == "LINKED") "info" else "warning")
                        if (s.salesRateBp > 0) StatusChip("%.1f%%".format(s.salesRateBp / 100.0), "info")
                    }
                    s.unpaidCommissions.filter { it.cents > 0 }.forEach { o ->
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                            Text(stringResource(R.string.staff_unpaid) + ": " + cents(o.cents, o.currency))
                            Button(onClick = { payTarget = s to o }) { Text(stringResource(R.string.staff_pay)) }
                        }
                    }
                    if (s.fixedPayCents > 0) OutlinedButton(onClick = { salaryTarget = s }) { Text(stringResource(R.string.staff_pay_salary)) }
                    // up to four buttons: they wrap onto a second line instead of being squeezed into slivers
                    androidx.compose.foundation.layout.FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        if (s.inviteState != "LINKED") OutlinedButton(onClick = { scope.launch { container.staffRepository.invite(s.id).fold({ code = it; reload() }, { message = it.message.orEmpty() }) } }) { Text(stringResource(R.string.staff_invite)) }
                        if (hrEmps.isNotEmpty()) OutlinedButton(onClick = { hrTarget = s }) { Text(if (s.hrEmployeeId != null) stringResource(R.string.staff_hr_linked, hrEmps.firstOrNull { it.id == s.hrEmployeeId }?.name.orEmpty()) else stringResource(R.string.staff_hr_link)) }
                        OutlinedButton(onClick = { rateTarget = s; rateValue = (s.salesRateBp / 100.0).toString() }) { Text(stringResource(R.string.staff_edit_rate)) }
                        OutlinedButton(onClick = { removeTarget = s }) { Text(stringResource(R.string.staff_remove)) }
                    }
                }
            }
        }

        Text(stringResource(R.string.staff_join_title), style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = 8.dp))
        Text(stringResource(R.string.staff_join_help), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        OutlinedTextField(joinCode, { joinCode = it }, singleLine = true, modifier = Modifier.fillMaxWidth())
        OutlinedButton(
            onClick = {
                scope.launch {
                    container.staffRepository.accept(joinCode.trim()).fold({ joinCode = ""; message = AppStrings.get(R.string.staff_joined); onJoined(it.ownerId) }, { message = it.message.orEmpty() })
                }
            },
            modifier = Modifier.fillMaxWidth(),
        ) { Text(stringResource(R.string.staff_join_btn)) }
    }

    rateTarget?.let { s ->
        AlertDialog(
            onDismissRequest = { rateTarget = null },
            title = { Text(stringResource(R.string.staff_rate)) },
            text = { OutlinedTextField(rateValue, { rateValue = it }, singleLine = true) },
            confirmButton = { TextButton(onClick = { scope.launch { container.staffRepository.setRate(s.id, pct(rateValue)).fold({ message = AppStrings.get(R.string.staff_saved); reload() }, { message = it.message.orEmpty() }); rateTarget = null } }) { Text(stringResource(R.string.staff_save)) } },
            dismissButton = { TextButton(onClick = { rateTarget = null }) { Text(stringResource(R.string.staff_cancel)) } },
        )
    }
    removeTarget?.let { s ->
        AlertDialog(
            onDismissRequest = { removeTarget = null },
            text = { Text(stringResource(R.string.staff_remove_confirm, s.name)) },
            confirmButton = { TextButton(onClick = { scope.launch { container.staffRepository.remove(s.id).fold({ reload() }, { message = it.message.orEmpty() }); removeTarget = null } }) { Text(stringResource(R.string.staff_remove)) } },
            dismissButton = { TextButton(onClick = { removeTarget = null }) { Text(stringResource(R.string.staff_cancel)) } },
        )
    }
    hrTarget?.let { s ->
        AlertDialog(
            onDismissRequest = { hrTarget = null },
            title = { Text(stringResource(R.string.staff_hr_pick)) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    OutlinedButton(onClick = { scope.launch { container.staffRepository.linkHr(s.id, null).fold({ reload() }, { message = it.message.orEmpty() }); hrTarget = null } }, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.staff_hr_none)) }
                    hrEmps.forEach { e -> OutlinedButton(onClick = { scope.launch { container.staffRepository.linkHr(s.id, e.id).fold({ reload() }, { message = it.message.orEmpty() }); hrTarget = null } }, modifier = Modifier.fillMaxWidth()) { Text(e.name) } }
                }
            },
            confirmButton = {},
            dismissButton = { TextButton(onClick = { hrTarget = null }) { Text(stringResource(R.string.staff_cancel)) } },
        )
    }
    salaryTarget?.let { s ->
        AlertDialog(
            onDismissRequest = { salaryTarget = null },
            text = { Text(stringResource(R.string.staff_pay_salary_confirm, "%.2f".format(s.fixedPayCents / 100.0), s.name)) },
            confirmButton = { TextButton(onClick = { scope.launch { container.staffRepository.paySalary(s.id).fold({ message = AppStrings.get(R.string.staff_paid) }, { message = it.message.orEmpty() }); salaryTarget = null } }) { Text(stringResource(R.string.staff_pay)) } },
            dismissButton = { TextButton(onClick = { salaryTarget = null }) { Text(stringResource(R.string.staff_cancel)) } },
        )
    }
    payTarget?.let { (s, o) ->
        AlertDialog(
            onDismissRequest = { payTarget = null },
            text = { Text(stringResource(R.string.staff_pay_confirm, cents(o.cents, o.currency), s.name)) },
            confirmButton = { TextButton(onClick = { scope.launch { container.staffRepository.pay(s.id, o.currency).fold({ message = AppStrings.get(R.string.staff_paid); reload() }, { message = it.message.orEmpty() }); payTarget = null } }) { Text(stringResource(R.string.staff_pay)) } },
            dismissButton = { TextButton(onClick = { payTarget = null }) { Text(stringResource(R.string.staff_cancel)) } },
        )
    }
}

/** The driver list: the shop orders ready to take, and the ones on the road. */
@Composable
fun StaffDriverOrders(container: AppContainer, workplace: StaffWorkplaceDto, onChanged: () -> Unit = {}) {
    val scope = rememberCoroutineScope()
    var rows by remember(workplace.staffId) { mutableStateOf<List<com.dalilacom.app.data.network.StaffOrderDto>?>(null) }
    var message by remember { mutableStateOf("") }
    suspend fun reload() { rows = container.staffRepository.driverOrders(workplace.staffId) }
    LaunchedEffect(workplace.staffId) { reload() }
    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (message.isNotBlank()) Text(message, color = MaterialTheme.colorScheme.primary)
        OutlinedButton(onClick = { scope.launch { reload() } }) { Text(stringResource(R.string.staff_refresh)) }
        val list = rows
        if (list == null) Text("...") else if (list.isEmpty()) Text(stringResource(R.string.staff_no_deliveries), color = MaterialTheme.colorScheme.onSurfaceVariant)
        list.orEmpty().forEach { o ->
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text(o.orderNumber + (o.customerName?.let { " | " + it } ?: ""), style = MaterialTheme.typography.titleSmall)
                        Text("%.2f".format(o.totalCents / 100.0))
                    }
                    StatusChip(stringResource(if (o.status == "SHIPPED") R.string.staff_order_shipped else R.string.staff_order_preparing), if (o.status == "SHIPPED") "warning" else "info")
                    Text(o.items.joinToString(", ") { it.productName + " x" + it.quantity }, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Button(
                        onClick = {
                            scope.launch {
                                val picking = o.status == "PREPARING"
                                val r = if (picking) container.staffRepository.pickup(workplace.staffId, o.id) else container.staffRepository.deliver(workplace.staffId, o.id)
                                r.fold({ message = AppStrings.get(if (picking) R.string.staff_picked_up else R.string.staff_delivered); onChanged() }, { message = it.message.orEmpty() })
                                reload()
                            }
                        },
                        modifier = Modifier.fillMaxWidth(),
                    ) { Text(stringResource(if (o.status == "PREPARING") R.string.staff_pickup else R.string.staff_deliver)) }
                }
            }
        }
    }
}

/** The marketer: the shop offers (new, start, stop) and an announcement to its followers. Both go to the administration for review. */
@Composable
fun StaffMarketing(container: AppContainer) {
    val scope = rememberCoroutineScope()
    androidx.compose.runtime.DisposableEffect(Unit) {
        com.dalilacom.app.data.network.ActingBusiness.marketing = true
        onDispose { com.dalilacom.app.data.network.ActingBusiness.marketing = false }
    }
    var offers by remember { mutableStateOf<List<com.dalilacom.app.data.network.MyDiscountDto>?>(null) }
    var message by remember { mutableStateOf("") }
    var title by remember { mutableStateOf("") }
    var percent by remember { mutableStateOf("") }
    var aTitle by remember { mutableStateOf("") }
    var aBody by remember { mutableStateOf("") }
    suspend fun reload() { offers = container.staffRepository.marketerOffers() }
    LaunchedEffect(Unit) { reload() }
    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (message.isNotBlank()) Text(message, color = MaterialTheme.colorScheme.primary)
        Text(stringResource(R.string.staff_offer_new), style = MaterialTheme.typography.titleSmall)
        OutlinedTextField(title, { title = it }, label = { Text(stringResource(R.string.staff_offer_title)) }, singleLine = true, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(percent, { percent = it }, label = { Text(stringResource(R.string.staff_offer_percent)) }, singleLine = true, modifier = Modifier.fillMaxWidth())
        Text(stringResource(R.string.staff_offer_note), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Button(
            onClick = {
                val p = percent.toIntOrNull() ?: 0
                if (title.trim().length < 2 || p !in 1..100) { message = AppStrings.get(R.string.staff_offer_title); return@Button }
                scope.launch { container.staffRepository.marketerAddOffer(title.trim(), p).fold({ title = ""; percent = ""; message = AppStrings.get(R.string.staff_saved); reload() }, { message = it.message.orEmpty() }) }
            },
            modifier = Modifier.fillMaxWidth(),
        ) { Text(stringResource(R.string.staff_offer_add)) }
        val list = offers
        if (list == null) Text("...") else if (list.isEmpty()) Text(stringResource(R.string.staff_offer_none), color = MaterialTheme.colorScheme.onSurfaceVariant)
        list.orEmpty().forEach { d ->
            Card(Modifier.fillMaxWidth()) {
                Row(Modifier.padding(12.dp).fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(d.title, style = MaterialTheme.typography.titleSmall)
                        Text(d.percent.toString() + "% | " + d.state, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    OutlinedButton(onClick = { scope.launch { container.staffRepository.marketerToggleOffer(d.id, !d.isActive).fold({ reload() }, { message = it.message.orEmpty() }) } }) { Text(stringResource(if (d.isActive) R.string.staff_offer_stop else R.string.staff_offer_start)) }
                }
            }
        }
        Text(stringResource(R.string.staff_announce_title), style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = 8.dp))
        Text(stringResource(R.string.staff_announce_help), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        OutlinedTextField(aTitle, { aTitle = it }, label = { Text(stringResource(R.string.staff_offer_title)) }, singleLine = true, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(aBody, { aBody = it }, label = { Text(stringResource(R.string.staff_announce_body)) }, modifier = Modifier.fillMaxWidth())
        Button(
            onClick = {
                if (aTitle.isBlank() || aBody.isBlank()) { message = AppStrings.get(R.string.staff_announce_body); return@Button }
                scope.launch { container.staffRepository.marketerAnnounce(aTitle.trim(), aBody.trim()).fold({ aTitle = ""; aBody = ""; message = AppStrings.get(R.string.staff_announce_sent) }, { message = it.message.orEmpty() }) }
            },
            modifier = Modifier.fillMaxWidth(),
        ) { Text(stringResource(R.string.staff_announce_send)) }
    }
}
