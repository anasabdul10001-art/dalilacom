package com.dalilacom.app.ui.hr

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.ScrollableTabRow
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.dalilacom.app.R
import com.dalilacom.app.data.AppContainer
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.put

/* Human resources inside DALILACOM (the same server routes as the website). A tab shows only when a real record makes it
   relevant: the owner's tabs need the owner's plan or company, "my job" needs an employee record linked to this account. */

private fun JsonElement?.rows(): List<JsonObject> =
    (this as? JsonArray ?: (this as? JsonObject)?.get("items") as? JsonArray)?.mapNotNull { it as? JsonObject }.orEmpty()
private fun JsonObject.s(k: String): String? = (this[k] as? JsonPrimitive)?.contentOrNull
private fun JsonObject.n(k: String): Double? = (this[k] as? JsonPrimitive)?.doubleOrNull
private fun JsonObject.o(k: String): JsonObject? = this[k] as? JsonObject
private fun JsonObject.list(k: String): List<JsonObject> = (this[k] as? JsonArray)?.mapNotNull { it as? JsonObject }.orEmpty()
private fun day(v: String?) = v?.take(10).orEmpty()
private fun money(minor: Double?, cur: String) = "%.2f %s".format((minor ?: 0.0) / 100.0, cur)
private fun fullName(o: JsonObject?) = listOfNotNull(o?.s("firstName"), o?.s("lastName")).joinToString(" ")

@Composable
fun HrScreen(container: AppContainer, onOpenPlans: () -> Unit) {
    val repo = container.hrRepository
    val scope = rememberCoroutineScope()
    var version by remember { mutableIntStateOf(0) }
    var overview by remember { mutableStateOf<JsonObject?>(null) }
    var failed by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf("") }
    var codeShown by remember { mutableStateOf<String?>(null) }
    var tab by remember { mutableIntStateOf(0) }
    val errorFallback = stringResource(R.string.hr_error)
    val context = androidx.compose.ui.platform.LocalContext.current

    LaunchedEffect(version) {
        repo.get("hr/overview").fold({ overview = it as? JsonObject; failed = false }, { failed = true })
    }
    /** Run one change; on success say so and reload everything, on failure show the server's own message. */
    fun act(done: Int?, call: suspend () -> Result<JsonElement>, after: (JsonElement) -> Unit = {}) {
        scope.launch {
            call().fold({ data ->
                after(data)
                // a payroll run that costs nothing books no expense: say so instead of claiming one was added
                val booked = ((data as? JsonObject)?.get("expenseBooked") as? JsonPrimitive)?.booleanOrNull
                val accountingActive = ((data as? JsonObject)?.get("accountingActive") as? JsonPrimitive)?.booleanOrNull
                val key = if (done == R.string.hr_pay_paidDone) (if (booked == false) R.string.hr_pay_paidNoExpense else if (accountingActive == false) R.string.hr_pay_paidNoAccounting else done) else done
                message = key?.let { context.getString(it) }.orEmpty(); overview = null; version++
            }, { message = it.message ?: errorFallback })
        }
    }

    val ov = overview
    if (ov == null) {
        Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.Center) {
            if (failed) { Text(errorFallback, color = MaterialTheme.colorScheme.error); OutlinedButton(onClick = { failed = false; version++ }) { Text(stringResource(R.string.hr_retry)) } }
            else CircularProgressIndicator()
        }
        return
    }
    val manage = ov.o("manage")
    val canStart = (ov["canStart"] as? JsonPrimitive)?.booleanOrNull == true
    val jobs = ov.list("jobs")
    val invitations = ov.n("invitations") ?: 0.0
    val tabs = buildList {
        if (manage != null || canStart) add("people")
        if (manage != null) { add("leave"); add("payroll") }
        if (jobs.isNotEmpty() || invitations > 0) add("job")
    }
    if (tabs.isEmpty()) {
        // nothing makes a section relevant yet: the only step is the plan that opens the owner's side
        Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(stringResource(R.string.hr_company_createHint), color = MaterialTheme.colorScheme.onSurfaceVariant)
            Button(onClick = onOpenPlans) { Text(stringResource(R.string.hr_getPlan)) }
        }
        return
    }
    if (tab >= tabs.size) tab = 0
    val label = mapOf("people" to R.string.site_hr_tab_people, "leave" to R.string.site_hr_tab_leave, "payroll" to R.string.site_hr_tab_payroll, "job" to R.string.site_hr_tab_job)
    Column(Modifier.fillMaxSize()) {
        ScrollableTabRow(selectedTabIndex = tab, edgePadding = 12.dp, containerColor = androidx.compose.ui.graphics.Color.Transparent) {
            tabs.forEachIndexed { i, id -> Tab(selected = tab == i, onClick = { tab = i }, text = { Text(stringResource(label.getValue(id))) }) }
        }
        if (message.isNotBlank()) Text(message, modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp), color = MaterialTheme.colorScheme.primary)
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            when (tabs[tab]) {
                "people" -> PeopleTab(repo, manage, version, ::act) { codeShown = it }
                "leave" -> LeaveTab(repo, version, ::act)
                "payroll" -> PayrollTab(repo, manage?.s("currency").orEmpty(), manage?.s("role") == "OWNER", version, ::act)
                else -> JobTab(repo, ov, jobs, version, ::act)
            }
        }
    }
    codeShown?.let { code ->
        AlertDialog(
            onDismissRequest = { codeShown = null },
            confirmButton = { TextButton(onClick = { codeShown = null }) { Text(stringResource(R.string.hr_ok)) } },
            title = { Text(stringResource(R.string.hr_invite)) },
            text = { Text(stringResource(R.string.hr_invite_code) + "\n\n" + code) },
        )
    }
}

private typealias Act = (Int?, suspend () -> Result<JsonElement>, (JsonElement) -> Unit) -> Unit

/** Loads one list once per reload; shows a spinner until it arrives. */
@Composable
private fun Load(repo: com.dalilacom.app.data.repository.HrRepository, path: String, version: Int, content: @Composable (JsonElement) -> Unit) {
    var data by remember(path, version) { mutableStateOf<JsonElement?>(null) }
    LaunchedEffect(path, version) { data = repo.get(path).getOrNull() ?: JsonArray(emptyList()) }
    val d = data
    if (d == null) CircularProgressIndicator() else content(d)
}

@Composable private fun Box(title: String, content: @Composable () -> Unit) {
    Card(Modifier.fillMaxWidth()) { Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) { Text(title, style = MaterialTheme.typography.titleMedium); content() } }
}
@Composable private fun Field(value: String, onChange: (String) -> Unit, label: String, modifier: Modifier = Modifier.fillMaxWidth()) =
    OutlinedTextField(value = value, onValueChange = onChange, label = { Text(label) }, singleLine = true, modifier = modifier)

/* ---- people ---- */
@Composable
private fun PeopleTab(repo: com.dalilacom.app.data.repository.HrRepository, manage: JsonObject?, version: Int, act: Act, showCode: (String) -> Unit) {
    var coName by remember { mutableStateOf("") }
    if (manage == null) {
        Box(stringResource(R.string.hr_company_create)) {
            Text(stringResource(R.string.hr_company_createHint), color = MaterialTheme.colorScheme.onSurfaceVariant)
            Field(coName, { coName = it }, stringResource(R.string.hr_company_name))
            Button(onClick = { if (coName.trim().length >= 2) act(R.string.hr_company_done, { repo.post("hr/company", buildJsonObject { put("name", coName.trim()) }) }, {}) }) { Text(stringResource(R.string.hr_company_createBtn)) }
        }
        return
    }
    val cur = manage.s("currency").orEmpty()
    var first by remember { mutableStateOf("") }; var last by remember { mutableStateOf("") }; var email by remember { mutableStateOf("") }
    var position by remember { mutableStateOf("") }; var hire by remember { mutableStateOf(java.time.LocalDate.now().toString()) }; var salary by remember { mutableStateOf("") }
    Load(repo, "hr/employees", version) { data ->
        val emps = data.rows()
        Box(manage.s("companyName").orEmpty()) {
            Text(stringResource(R.string.hr_people_count, emps.size), color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (emps.isEmpty()) Text(stringResource(R.string.hr_people_empty))
            emps.forEach { e ->
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(fullName(e), style = MaterialTheme.typography.titleSmall)
                        Text(listOfNotNull(e.s("position"), e.n("baseSalary")?.let { money(it, cur) }).joinToString(" · "), color = MaterialTheme.colorScheme.onSurfaceVariant)
                        if (e.s("userId") == null && e.s("employmentStatus") != "TERMINATED") OutlinedButton(onClick = {
                            act(null, { repo.post("hr/employees/${e.s("id")}/invite") }) { r ->
                                val o = r as? JsonObject
                                if ((o?.get("emailed") as? JsonPrimitive)?.booleanOrNull != true) o?.s("code")?.let(showCode)
                            }
                        }) { Text(stringResource(R.string.hr_invite)) }
                    }
                }
            }
        }
    }
    Box(stringResource(R.string.hr_people_add)) {
        Field(first, { first = it }, stringResource(R.string.hr_f_first)); Field(last, { last = it }, stringResource(R.string.hr_f_last))
        Field(email, { email = it }, stringResource(R.string.hr_f_email)); Field(position, { position = it }, stringResource(R.string.hr_f_position))
        Field(hire, { hire = it }, stringResource(R.string.hr_f_hire)); Field(salary, { salary = it }, stringResource(R.string.hr_f_salary, cur))
        Button(onClick = {
            val cents = salary.trim().takeIf { it.isNotEmpty() }?.toDoubleOrNull()?.let { Math.round(it * 100) }
            if (first.isNotBlank() && last.isNotBlank()) act(R.string.hr_people_added, {
                repo.post("hr/employees", buildJsonObject {
                    put("firstName", first.trim()); put("lastName", last.trim()); put("hireDate", hire)
                    if (position.isNotBlank()) put("position", position.trim()); if (email.isNotBlank()) put("email", email.trim())
                    if (cents != null) put("baseSalary", cents)
                })
            }, { first = ""; last = ""; email = ""; position = ""; salary = "" })
        }) { Text(stringResource(R.string.hr_people_addBtn)) }
    }
}

/* ---- leave ---- */
@Composable
private fun LeaveTab(repo: com.dalilacom.app.data.repository.HrRepository, version: Int, act: Act) {
    var typeName by remember { mutableStateOf("") }; var typeDays by remember { mutableStateOf("14") }
    Load(repo, "hr/leave-requests", version) { data ->
        val open = data.rows().filter { it.s("status") == "PENDING_MANAGER" || it.s("status") == "PENDING_HR" }
        Box(stringResource(R.string.hr_leave_pending)) {
            if (open.isEmpty()) Text(stringResource(R.string.hr_leave_none))
            open.forEach { r ->
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(fullName(r.o("employee")), style = MaterialTheme.typography.titleSmall)
                    Text("${r.o("leaveType")?.s("name").orEmpty()} · ${day(r.s("startDate"))} → ${day(r.s("endDate"))}", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(onClick = { act(R.string.hr_decided, { repo.post("hr/leave-requests/${r.s("id")}/decision", buildJsonObject { put("decision", "APPROVE") }) }, {}) }) { Text(stringResource(R.string.hr_approve)) }
                        OutlinedButton(onClick = { act(R.string.hr_decided, { repo.post("hr/leave-requests/${r.s("id")}/decision", buildJsonObject { put("decision", "REJECT") }) }, {}) }) { Text(stringResource(R.string.hr_reject)) }
                    }
                }
            }
        }
    }
    Load(repo, "hr/leave-types", version) { data ->
        val types = data.rows()
        Box(stringResource(R.string.hr_leave_types)) {
            if (types.isEmpty()) Text(stringResource(R.string.hr_leave_noTypes), color = MaterialTheme.colorScheme.onSurfaceVariant)
            types.forEach { Text("${it.s("name").orEmpty()} · ${stringResource(R.string.hr_leave_days, (it.n("defaultBalance") ?: 0.0).toInt())}") }
            Field(typeName, { typeName = it }, stringResource(R.string.hr_leave_typeName)); Field(typeDays, { typeDays = it }, stringResource(R.string.hr_leave_typeDays))
            Button(onClick = {
                val d = typeDays.toIntOrNull()
                if (typeName.isNotBlank() && d != null && d >= 0) act(R.string.hr_leave_typeAdded, { repo.post("hr/leave-types", buildJsonObject { put("name", typeName.trim()); put("defaultBalance", d); put("isPaid", true) }) }, { typeName = "" })
            }) { Text(stringResource(R.string.hr_leave_addType)) }
        }
    }
}

/* ---- payroll: paying a run books an expense in this owner's accounting ---- */
@Composable
private fun PayrollTab(repo: com.dalilacom.app.data.repository.HrRepository, cur: String, owner: Boolean, version: Int, act: Act) {
    var from by remember { mutableStateOf("") }; var to by remember { mutableStateOf("") }
    var revertId by remember { mutableStateOf<String?>(null) }
    Load(repo, "hr/payroll-runs", version) { data ->
        val runs = data.rows()
        Box(stringResource(R.string.hr_pay_runs)) {
            Text(stringResource(R.string.hr_pay_note), color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(stringResource(R.string.hr_pay_attNote), color = MaterialTheme.colorScheme.onSurfaceVariant)
            val paidCost = runs.filter { it.s("status") == "PAID" }.sumOf { it.o("totals")?.n("cost") ?: 0.0 }
            if (paidCost > 0) Text(stringResource(R.string.hr_pay_paidTotal, money(paidCost, cur)), style = MaterialTheme.typography.titleSmall)
            if (runs.isEmpty()) Text(stringResource(R.string.hr_pay_none))
            runs.forEach { r ->
                val id = r.s("id").orEmpty(); val st = r.s("status").orEmpty()
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text("${day(r.s("periodStart"))} → ${day(r.s("periodEnd"))}", style = MaterialTheme.typography.titleSmall)
                    Text(stringResource(when (st) { "PAID" -> R.string.hr_run_PAID; "PROCESSED" -> R.string.hr_run_PROCESSED; else -> R.string.hr_run_DRAFT }), color = MaterialTheme.colorScheme.primary)
                    r.o("totals")?.takeIf { st != "DRAFT" }?.let { tt ->
                        Text("${stringResource(R.string.hr_pay_gross)}: ${money(tt.n("grossPay"), cur)} · ${stringResource(R.string.hr_pay_deductions)}: ${money(tt.n("totalDeductions"), cur)} · ${stringResource(R.string.hr_pay_net)}: ${money(tt.n("netPay"), cur)}", color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text("${stringResource(R.string.hr_pay_cost)}: ${money(tt.n("cost"), cur)}", style = MaterialTheme.typography.titleSmall)
                    }
                    when {
                        st == "DRAFT" -> Button(onClick = { act(R.string.hr_pay_processed, { repo.post("hr/payroll-runs/$id/process") }, {}) }) { Text(stringResource(R.string.hr_pay_process)) }
                        st == "PROCESSED" -> Button(onClick = { act(R.string.hr_pay_paidDone, { repo.post("hr/payroll-runs/$id/mark-paid") }, {}) }) { Text(stringResource(R.string.hr_pay_markPaid)) }
                        owner -> OutlinedButton(onClick = { revertId = id }) { Text(stringResource(R.string.hr_pay_revert)) }
                    }
                }
            }
            Field(from, { from = it }, stringResource(R.string.hr_pay_from)); Field(to, { to = it }, stringResource(R.string.hr_pay_to))
            Button(onClick = { if (from.isNotBlank() && to.isNotBlank()) act(R.string.hr_pay_created, { repo.post("hr/payroll-runs", buildJsonObject { put("periodStart", from.trim()); put("periodEnd", to.trim()) }) }, {}) }) { Text(stringResource(R.string.hr_pay_create)) }
        }
    }
    Load(repo, "hr/advances", version) { data ->
        val pending = data.rows().filter { it.s("status") == "PENDING_MANAGER" || it.s("status") == "PENDING_HR" }
        if (pending.isNotEmpty()) Box(stringResource(R.string.hr_adv_pending)) {
            pending.forEach { a ->
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(fullName(a.o("employee")), style = MaterialTheme.typography.titleSmall)
                    Text("${money(a.n("amount"), cur)} · ${stringResource(R.string.hr_adv_installments, (a.n("installmentsCount") ?: 0.0).toInt())}", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(onClick = { act(R.string.hr_decided, { repo.post("hr/advances/${a.s("id")}/decision", buildJsonObject { put("decision", "APPROVE") }) }, {}) }) { Text(stringResource(R.string.hr_approve)) }
                        OutlinedButton(onClick = { act(R.string.hr_decided, { repo.post("hr/advances/${a.s("id")}/decision", buildJsonObject { put("decision", "REJECT") }) }, {}) }) { Text(stringResource(R.string.hr_reject)) }
                    }
                }
            }
        }
    }
    revertId?.let { id ->
        AlertDialog(
            onDismissRequest = { revertId = null },
            confirmButton = { TextButton(onClick = { revertId = null; act(R.string.hr_pay_reverted, { repo.post("hr/payroll-runs/$id/revert-paid") }, {}) }) { Text(stringResource(R.string.hr_pay_revert)) } },
            dismissButton = { TextButton(onClick = { revertId = null }) { Text(stringResource(R.string.hr_cancel)) } },
            text = { Text(stringResource(R.string.hr_pay_revertAsk)) },
        )
    }
}

/* ---- my job: only for an account linked to an employee record, or holding an invitation ---- */
@Composable
private fun JobTab(repo: com.dalilacom.app.data.repository.HrRepository, ov: JsonObject, jobs: List<JsonObject>, version: Int, act: Act) {
    var code by remember { mutableStateOf("") }
    if ((ov.n("invitations") ?: 0.0) > 0) Load(repo, "hr/me/invitations", version) { data ->
        Box(stringResource(R.string.hr_job_invites)) {
            data.rows().forEach { i ->
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("${i.s("companyName").orEmpty()} ${i.s("position").orEmpty()}")
                    Button(onClick = { act(R.string.hr_job_accepted, { repo.post("hr/me/invitations/${i.s("id")}/accept") }, {}) }) { Text(stringResource(R.string.hr_job_accept)) }
                }
            }
        }
    }
    if (jobs.isEmpty()) {
        Box(stringResource(R.string.hr_job_haveCode)) {
            Field(code, { code = it }, stringResource(R.string.hr_job_haveCode))
            Button(onClick = { if (code.trim().length >= 10) act(R.string.hr_job_accepted, { repo.post("hr/me/accept", buildJsonObject { put("code", code.trim()) }) }, {}) }) { Text(stringResource(R.string.hr_job_accept)) }
        }
        return
    }
    val job = jobs.first(); val cur = job.s("currency").orEmpty()
    Load(repo, "hr/me/attendance", version) { data ->
        val open = data.rows().firstOrNull { it["checkOut"] == null || it["checkOut"] is kotlinx.serialization.json.JsonNull }
        Box(job.s("companyName").orEmpty()) {
            Text(job.s("position").orEmpty(), color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (open != null) {
                Text(stringResource(R.string.hr_job_in, open.s("checkIn").orEmpty().drop(11).take(5)))
                Button(onClick = { act(R.string.hr_job_outDone, { repo.post("hr/me/check-out") }, {}) }) { Text(stringResource(R.string.hr_job_out)) }
            } else Button(onClick = { act(R.string.hr_job_inDone, { repo.post("hr/me/check-in") }, {}) }) { Text(stringResource(R.string.hr_job_inBtn)) }
        }
    }
    var typeId by remember { mutableStateOf("") }; var from by remember { mutableStateOf("") }; var to by remember { mutableStateOf("") }
    Load(repo, "hr/me/leave-balances", version) { data ->
        val bal = data.rows()
        Box(stringResource(R.string.hr_job_leave)) {
            if (bal.isEmpty()) Text(stringResource(R.string.hr_job_noBalances), color = MaterialTheme.colorScheme.onSurfaceVariant)
            bal.forEach { b ->
                val id = b.s("leaveTypeId") ?: b.o("leaveType")?.s("id").orEmpty()
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    TextButton(onClick = { typeId = id }) { Text((if (typeId == id) "● " else "○ ") + b.o("leaveType")?.s("name").orEmpty()) }
                    Text(stringResource(R.string.hr_leave_days, (b.n("balanceDays") ?: 0.0).toInt()))
                }
            }
            if (bal.isNotEmpty()) {
                Field(from, { from = it }, stringResource(R.string.hr_pay_from)); Field(to, { to = it }, stringResource(R.string.hr_pay_to))
                Button(onClick = {
                    val id = typeId.ifBlank { bal.first().s("leaveTypeId") ?: bal.first().o("leaveType")?.s("id").orEmpty() }
                    if (id.isNotBlank() && from.isNotBlank() && to.isNotBlank()) act(R.string.hr_job_requested, { repo.post("hr/me/leave-requests", buildJsonObject { put("leaveTypeId", id); put("startDate", from.trim()); put("endDate", to.trim()) }) }, {})
                }) { Text(stringResource(R.string.hr_job_request)) }
            }
        }
    }
    Load(repo, "hr/me/payslips", version) { data ->
        val slips = data.rows()
        Box(stringResource(R.string.hr_job_slips)) {
            if (slips.isEmpty()) Text(stringResource(R.string.hr_job_noSlips), color = MaterialTheme.colorScheme.onSurfaceVariant)
            slips.forEach { s -> Text("${day(s.o("run")?.s("periodStart"))} → ${day(s.o("run")?.s("periodEnd"))}   ${money(s.n("netPay"), cur)}") }
        }
    }
}
