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

private val ROLES = listOf("CASHIER", "STOCK", "ASSISTANT", "MANAGER")
private fun cents(c: Long, currency: String) = "%.2f %s".format(c / 100.0, currency)

@Composable
fun staffRoleName(role: String): String = stringResource(
    when (role) {
        "STOCK" -> R.string.staff_role_stock
        "ASSISTANT" -> R.string.staff_role_assistant
        "MANAGER" -> R.string.staff_role_manager
        else -> R.string.staff_role_cashier
    },
)

@Composable
private fun staffRoleHelp(role: String): String = stringResource(
    when (role) {
        "STOCK" -> R.string.staff_help_stock
        "ASSISTANT" -> R.string.staff_help_assistant
        "MANAGER" -> R.string.staff_help_manager
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
fun StaffMyWork(container: AppContainer, workplace: StaffWorkplaceDto) {
    var rows by remember(workplace.staffId) { mutableStateOf<List<StaffCommissionDto>?>(null) }
    LaunchedEffect(workplace.staffId) { rows = container.staffRepository.myCommissions(workplace.staffId) }
    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            StatusChip(staffRoleName(workplace.role), "info")
            if (workplace.salesRateBp > 0) StatusChip(stringResource(R.string.staff_my_rate, workplace.salesRateBp / 100.0), "info")
        }
        workplace.unpaidCommissions.filter { it.cents > 0 }.forEach { Text(stringResource(R.string.staff_unpaid) + ": " + cents(it.cents, it.currency), style = MaterialTheme.typography.titleSmall) }
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
    suspend fun reload() { list = container.staffRepository.list() }
    LaunchedEffect(Unit) { reload() }
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
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
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
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
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
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        if (s.inviteState != "LINKED") OutlinedButton(onClick = { scope.launch { container.staffRepository.invite(s.id).fold({ code = it; reload() }, { message = it.message.orEmpty() }) } }) { Text(stringResource(R.string.staff_invite)) }
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
    payTarget?.let { (s, o) ->
        AlertDialog(
            onDismissRequest = { payTarget = null },
            text = { Text(stringResource(R.string.staff_pay_confirm, cents(o.cents, o.currency), s.name)) },
            confirmButton = { TextButton(onClick = { scope.launch { container.staffRepository.pay(s.id, o.currency).fold({ message = AppStrings.get(R.string.staff_paid); reload() }, { message = it.message.orEmpty() }); payTarget = null } }) { Text(stringResource(R.string.staff_pay)) } },
            dismissButton = { TextButton(onClick = { payTarget = null }) { Text(stringResource(R.string.staff_cancel)) } },
        )
    }
}
