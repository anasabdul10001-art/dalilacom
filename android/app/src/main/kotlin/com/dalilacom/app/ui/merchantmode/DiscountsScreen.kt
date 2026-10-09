package com.dalilacom.app.ui.merchantmode

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.dalilacom.app.R
import com.dalilacom.app.data.network.DiscountInput
import com.dalilacom.app.data.network.DiscountSectionDto
import com.dalilacom.app.data.network.MyDiscountDto
import com.dalilacom.app.ui.ViewModelFactory
import com.dalilacom.app.ui.common.formatCents
import com.dalilacom.app.ui.i18n.AppStrings
import java.time.Instant
import java.time.temporal.ChronoUnit

/** "On the whole shop" / "On section: X" / "On: a, b" - what a discount covers, in words. */
@Composable
fun discountScopeText(scope: String, section: DiscountSectionDto?, productNames: List<String>): String = when {
    scope == "SECTION" && section != null -> stringResource(R.string.disc_on_section, if (AppStrings.language == "en" && section.nameEn.isNotBlank()) section.nameEn else section.name)
    scope == "PRODUCTS" && productNames.isNotEmpty() -> stringResource(R.string.disc_on_products, productNames.joinToString(", "))
    else -> stringResource(R.string.disc_on_all)
}

private fun day(iso: String?): String = iso?.take(10).orEmpty()

@Composable
fun DiscountsScreen(factory: ViewModelFactory, onBack: () -> Unit) {
    val viewModel: DiscountsViewModel = viewModel(factory = factory)
    val state by viewModel.uiState.collectAsState()
    var form by remember { mutableStateOf<MyDiscountDto?>(null) }
    var creating by remember { mutableStateOf(false) }
    var confirm by remember { mutableStateOf<Pair<String, Boolean>?>(null) } // id to "delete?" (false = end now)

    if (creating || form != null) {
        DiscountForm(
            existing = form,
            state = state,
            onCancel = { creating = false; form = null; viewModel.clearError() },
            onSend = { input -> viewModel.save(form?.id, input) { creating = false; form = null } },
        )
        return
    }

    confirm?.let { (id, isDelete) ->
        AlertDialog(
            onDismissRequest = { confirm = null },
            text = { Text(stringResource(if (isDelete) R.string.disc_delete_confirm else R.string.disc_end_confirm)) },
            confirmButton = { TextButton(onClick = { if (isDelete) viewModel.delete(id) else viewModel.endNow(id); confirm = null }) { Text(stringResource(R.string.disc_confirm)) } },
            dismissButton = { TextButton(onClick = { confirm = null }) { Text(stringResource(R.string.disc_cancel)) } },
        )
    }

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
            Text(stringResource(R.string.disc_title), style = MaterialTheme.typography.headlineSmall, color = MaterialTheme.colorScheme.primary)
            TextButton(onClick = onBack) { Text(stringResource(R.string.disc_back)) }
        }
        Text(stringResource(R.string.disc_sub), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(12.dp))
        Button(onClick = { creating = true }, modifier = Modifier.fillMaxWidth().height(52.dp), shape = RoundedCornerShape(12.dp)) {
            Text("+  " + stringResource(R.string.disc_new), fontWeight = FontWeight.ExtraBold)
        }
        Spacer(Modifier.height(12.dp))
        state.error?.let { Text(it, color = MaterialTheme.colorScheme.error); Spacer(Modifier.height(8.dp)) }
        when {
            state.isLoading -> CircularProgressIndicator()
            state.items.isEmpty() -> Text(stringResource(R.string.disc_none), color = MaterialTheme.colorScheme.onSurfaceVariant)
            else -> state.items.forEach { d ->
                DiscountCard(
                    d,
                    onEdit = { form = d },
                    onToggle = { viewModel.setActive(d.id, !d.isActive) },
                    onEnd = { confirm = d.id to false },
                    onDelete = { confirm = d.id to true },
                )
            }
        }
    }
}

@Composable
private fun DiscountCard(d: MyDiscountDto, onEdit: () -> Unit, onToggle: () -> Unit, onEnd: () -> Unit, onDelete: () -> Unit) {
    val live = d.state == "LIVE" || d.state == "SCHEDULED" || d.state == "PAUSED"
    val stateLabel = when (d.state) {
        "PENDING" -> R.string.disc_st_pending
        "REJECTED" -> R.string.disc_st_rejected
        "PAUSED" -> R.string.disc_st_paused
        "SCHEDULED" -> R.string.disc_st_scheduled
        "LIVE" -> R.string.disc_st_live
        else -> R.string.disc_st_ended
    }
    val stateColor = when (d.state) {
        "LIVE" -> MaterialTheme.colorScheme.primary
        "REJECTED" -> MaterialTheme.colorScheme.error
        else -> MaterialTheme.colorScheme.onSurfaceVariant
    }
    Surface(
        shape = RoundedCornerShape(16.dp),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        modifier = Modifier.fillMaxWidth().padding(vertical = 5.dp),
    ) {
        Column(Modifier.padding(14.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Text("${d.percent}%  ${d.title}", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                Text(stringResource(stateLabel), color = stateColor, style = MaterialTheme.typography.labelLarge)
            }
            Spacer(Modifier.height(4.dp))
            Text(discountScopeText(d.scope, d.section, d.productNames), style = MaterialTheme.typography.bodyMedium)
            val dates = buildString {
                if (d.startDate != null) append(stringResource(R.string.disc_from, day(d.startDate)) + "  ")
                append(if (d.endDate != null) stringResource(R.string.disc_until, day(d.endDate)) else stringResource(R.string.disc_no_end))
            }
            Text(dates, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(
                (d.perCustomerLimit?.let { stringResource(R.string.disc_per_customer, it) } ?: stringResource(R.string.disc_per_customer_any)) + " - " +
                    (d.maxCustomers?.let { stringResource(R.string.disc_max_people, it) } ?: stringResource(R.string.disc_max_people_any)),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            if (!d.description.isNullOrBlank()) Text(d.description, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 4.dp))
            if (d.status == "REJECTED" && !d.rejectionReason.isNullOrBlank()) {
                Text(stringResource(R.string.disc_refused_because) + " " + d.rejectionReason, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 4.dp))
            }
            if (d.uses > 0) {
                Text(
                    stringResource(R.string.disc_stats, d.uses, d.customers) + "  -  " + formatCents(d.savedCents),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.padding(top = 4.dp),
                )
            }
            Row(Modifier.horizontalScroll(rememberScrollState()).padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                OutlinedButton(onClick = onEdit) { Text(stringResource(R.string.disc_edit)) }
                if (live && d.state != "ENDED") {
                    OutlinedButton(onClick = onToggle) { Text(stringResource(if (d.isActive) R.string.disc_pause else R.string.disc_resume)) }
                    OutlinedButton(onClick = onEnd) { Text(stringResource(R.string.disc_end_now)) }
                }
                OutlinedButton(onClick = onDelete) { Text(stringResource(R.string.disc_delete), color = MaterialTheme.colorScheme.error) }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DiscountForm(existing: MyDiscountDto?, state: DiscountsUiState, onCancel: () -> Unit, onSend: (DiscountInput) -> Unit) {
    var title by remember { mutableStateOf(existing?.title.orEmpty()) }
    var percent by remember { mutableStateOf(existing?.percent?.toString().orEmpty()) }
    var scope by remember { mutableStateOf(existing?.scope ?: "ALL") }
    var section by remember { mutableStateOf(existing?.scopeSection.orEmpty()) }
    var picked by remember { mutableStateOf(existing?.productIds.orEmpty().toSet()) }
    var start by remember { mutableStateOf<String?>(existing?.startDate) }
    var end by remember { mutableStateOf<String?>(existing?.endDate) }
    var perText by remember { mutableStateOf(existing?.perCustomerLimit?.toString().orEmpty()) }
    var maxText by remember { mutableStateOf(existing?.maxCustomers?.toString().orEmpty()) }
    var notes by remember { mutableStateOf(existing?.description.orEmpty()) }
    var problem by remember { mutableStateOf<String?>(null) }

    val needName = stringResource(R.string.disc_need_name)
    val needPercent = stringResource(R.string.disc_need_percent)
    val needSection = stringResource(R.string.disc_need_section)
    val needProducts = stringResource(R.string.disc_need_products)

    fun send() {
        val p = percent.toIntOrNull()
        problem = when {
            title.trim().length < 2 -> needName
            p == null || p !in 1..100 -> needPercent
            scope == "SECTION" && section.trim().length < 2 -> needSection
            scope == "PRODUCTS" && picked.isEmpty() -> needProducts
            else -> null
        }
        if (problem != null || p == null) return
        onSend(
            DiscountInput(
                title = title.trim(), percent = p, description = notes.trim().ifBlank { null }, scope = scope,
                scopeSection = if (scope == "SECTION") section.trim() else null,
                productIds = if (scope == "PRODUCTS") picked.toList() else emptyList(),
                startDate = start, endDate = end, maxCustomers = maxText.toIntOrNull()?.takeIf { it > 0 }, perCustomerLimit = perText.toIntOrNull()?.takeIf { it > 0 },
            ),
        )
    }

    fun endIn(days: Long?) {
        val from = start?.let { runCatching { Instant.parse(it) }.getOrNull() } ?: Instant.now()
        end = days?.let { from.plus(it, ChronoUnit.DAYS).toString() }
    }

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
            Text(stringResource(if (existing == null) R.string.disc_new else R.string.disc_edit_title), style = MaterialTheme.typography.headlineSmall, color = MaterialTheme.colorScheme.primary)
            TextButton(onClick = onCancel) { Text(stringResource(R.string.disc_back)) }
        }
        if (existing != null) Text(stringResource(R.string.disc_edit_note), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(10.dp))

        OutlinedTextField(value = title, onValueChange = { title = it }, label = { Text(stringResource(R.string.disc_name)) }, placeholder = { Text(stringResource(R.string.disc_name_ph)) }, singleLine = true, modifier = Modifier.fillMaxWidth())
        Spacer(Modifier.height(10.dp))
        Label(R.string.disc_percent)
        ChipRow {
            listOf(5, 10, 15, 20, 25, 30, 40, 50).forEach { v ->
                FilterChip(selected = percent == v.toString(), onClick = { percent = v.toString() }, label = { Text("$v%") })
            }
        }
        OutlinedTextField(
            value = percent, onValueChange = { percent = it.filter(Char::isDigit).take(3) }, singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), suffix = { Text("%") }, modifier = Modifier.fillMaxWidth(),
        )

        Spacer(Modifier.height(12.dp))
        Label(R.string.disc_scope)
        ChipRow {
            FilterChip(selected = scope == "ALL", onClick = { scope = "ALL" }, label = { Text(stringResource(R.string.disc_scope_all)) })
            FilterChip(selected = scope == "SECTION", onClick = { scope = "SECTION" }, label = { Text(stringResource(R.string.disc_scope_section)) })
            FilterChip(selected = scope == "PRODUCTS", onClick = { scope = "PRODUCTS" }, label = { Text(stringResource(R.string.disc_scope_products)) })
        }
        if (scope == "SECTION") {
            OutlinedTextField(
                value = section, onValueChange = { section = it.take(60) }, singleLine = true,
                placeholder = { Text(stringResource(R.string.disc_section_ph)) }, modifier = Modifier.fillMaxWidth(),
            )
        }
        if (scope == "PRODUCTS") {
            if (state.products.isEmpty()) Text(stringResource(R.string.disc_no_products), color = MaterialTheme.colorScheme.onSurfaceVariant)
            state.products.forEach { p ->
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(checked = p.id in picked, onCheckedChange = { picked = if (it) picked + p.id else picked - p.id })
                    Text(p.name, style = MaterialTheme.typography.bodyMedium)
                }
            }
        }

        Spacer(Modifier.height(12.dp))
        Label(R.string.disc_period)
        Text(if (start != null) stringResource(R.string.disc_from, day(start)) else stringResource(R.string.disc_starts_now), style = MaterialTheme.typography.bodySmall)
        ChipRow {
            FilterChip(selected = start == null, onClick = { start = null }, label = { Text(stringResource(R.string.disc_start_now)) })
            FilterChip(selected = false, onClick = { start = Instant.now().plus(1, ChronoUnit.DAYS).toString() }, label = { Text(stringResource(R.string.disc_start_tomorrow)) })
            FilterChip(selected = false, onClick = { start = Instant.now().plus(7, ChronoUnit.DAYS).toString() }, label = { Text(stringResource(R.string.disc_start_week)) })
        }
        DateButton(label = stringResource(R.string.disc_pick_date), onPicked = { start = it })
        Text(if (end != null) stringResource(R.string.disc_ends_at, day(end)) else stringResource(R.string.disc_no_end), style = MaterialTheme.typography.bodySmall)
        ChipRow {
            FilterChip(selected = end == null, onClick = { endIn(null) }, label = { Text(stringResource(R.string.disc_no_end)) })
            FilterChip(selected = false, onClick = { endIn(7) }, label = { Text(stringResource(R.string.disc_week)) })
            FilterChip(selected = false, onClick = { endIn(14) }, label = { Text(stringResource(R.string.disc_two_weeks)) })
            FilterChip(selected = false, onClick = { endIn(30) }, label = { Text(stringResource(R.string.disc_month)) })
            FilterChip(selected = false, onClick = { endIn(90) }, label = { Text(stringResource(R.string.disc_three_months)) })
        }
        DateButton(label = stringResource(R.string.disc_pick_date), endOfDay = true, onPicked = { end = it })

        Spacer(Modifier.height(12.dp))
        Label(R.string.disc_limits)
        Text(stringResource(R.string.disc_per_customer_label), style = MaterialTheme.typography.bodySmall)
        ChipRow {
            listOf<Int?>(null, 1, 2, 3, 5, 10).forEach { v ->
                FilterChip(selected = perText == (v?.toString() ?: ""), onClick = { perText = v?.toString().orEmpty() }, label = { Text(v?.toString() ?: stringResource(R.string.disc_no_limit)) })
            }
        }
        OutlinedTextField(
            value = perText, onValueChange = { perText = it.filter(Char::isDigit).take(4) }, singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), placeholder = { Text(stringResource(R.string.disc_or_type)) }, modifier = Modifier.fillMaxWidth(),
        )
        Text(stringResource(R.string.disc_max_people_label), style = MaterialTheme.typography.bodySmall)
        ChipRow {
            listOf<Int?>(null, 10, 25, 50, 100, 500).forEach { v ->
                FilterChip(selected = maxText == (v?.toString() ?: ""), onClick = { maxText = v?.toString().orEmpty() }, label = { Text(v?.toString() ?: stringResource(R.string.disc_no_limit)) })
            }
        }
        OutlinedTextField(
            value = maxText, onValueChange = { maxText = it.filter(Char::isDigit).take(7) }, singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), placeholder = { Text(stringResource(R.string.disc_or_type)) }, modifier = Modifier.fillMaxWidth(),
        )

        Spacer(Modifier.height(12.dp))
        OutlinedTextField(
            value = notes, onValueChange = { notes = it.take(500) }, label = { Text(stringResource(R.string.disc_notes)) },
            placeholder = { Text(stringResource(R.string.disc_notes_ph)) }, minLines = 3, modifier = Modifier.fillMaxWidth(),
        )
        Text(stringResource(R.string.disc_review_note), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 6.dp))

        (problem ?: state.error)?.let { Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(top = 8.dp)) }
        Spacer(Modifier.height(10.dp))
        Button(onClick = ::send, enabled = !state.isSaving, modifier = Modifier.fillMaxWidth().height(52.dp), shape = RoundedCornerShape(12.dp)) {
            Text(stringResource(if (state.isSaving) R.string.disc_sending else R.string.disc_send), fontWeight = FontWeight.ExtraBold)
        }
        Spacer(Modifier.height(24.dp))
    }
}

@Composable
private fun Label(res: Int) {
    Text(stringResource(res), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold, modifier = Modifier.padding(bottom = 2.dp))
}

@Composable
private fun ChipRow(content: @Composable () -> Unit) {
    Row(Modifier.horizontalScroll(rememberScrollState()).padding(vertical = 4.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) { content() }
}

/** A button that opens a calendar; the picked day comes back as an ISO time ([endOfDay]: the last minute of that day). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DateButton(label: String, endOfDay: Boolean = false, onPicked: (String) -> Unit) {
    var open by remember { mutableStateOf(false) }
    OutlinedButton(onClick = { open = true }, modifier = Modifier.padding(top = 2.dp)) { Text(label) }
    if (open) {
        val pickerState = androidx.compose.material3.rememberDatePickerState()
        androidx.compose.material3.DatePickerDialog(
            onDismissRequest = { open = false },
            confirmButton = {
                TextButton(onClick = {
                    pickerState.selectedDateMillis?.let { ms -> onPicked(Instant.ofEpochMilli(ms + if (endOfDay) 86_340_000L else 0L).toString()) }
                    open = false
                }) { Text(stringResource(R.string.disc_confirm)) }
            },
            dismissButton = { TextButton(onClick = { open = false }) { Text(stringResource(R.string.disc_cancel)) } },
        ) { androidx.compose.material3.DatePicker(state = pickerState) }
    }
}
