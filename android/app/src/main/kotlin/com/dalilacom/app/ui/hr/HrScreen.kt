package com.dalilacom.app.ui.hr

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
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
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import androidx.compose.ui.Alignment
import com.dalilacom.app.ui.common.BusyButton
import com.dalilacom.app.ui.common.EmptyHint
import com.dalilacom.app.ui.common.FoldSection
import com.dalilacom.app.ui.common.MetricTile
import com.dalilacom.app.ui.common.PersonAvatar
import com.dalilacom.app.ui.common.SkeletonList
import com.dalilacom.app.ui.common.StatusChip
import com.dalilacom.app.ui.common.StepBar
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
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
    var deviceKey by remember { mutableStateOf<Pair<String, String>?>(null) }
    var note by remember { mutableStateOf("") }
    var tab by remember { mutableIntStateOf(0) }
    var salaryFor by remember { mutableStateOf<String?>(null) }
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
            else SkeletonList()
        }
        return
    }
    val manage = ov.o("manage")
    val canStart = (ov["canStart"] as? JsonPrimitive)?.booleanOrNull == true
    val jobs = ov.list("jobs")
    val invitations = ov.n("invitations") ?: 0.0
    val tabs = buildList {
        if (manage != null || canStart) add("people")
        if (manage != null) { add("attendance"); add("leave"); add("payroll") }
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
    val label = mapOf("people" to R.string.site_hr_tab_people, "attendance" to R.string.site_hr_tab_attendance, "leave" to R.string.site_hr_tab_leave, "payroll" to R.string.site_hr_tab_payroll, "job" to R.string.site_hr_tab_job)
    Column(Modifier.fillMaxSize()) {
        ScrollableTabRow(selectedTabIndex = tab, edgePadding = 12.dp, containerColor = androidx.compose.ui.graphics.Color.Transparent) {
            tabs.forEachIndexed { i, id -> Tab(selected = tab == i, onClick = { tab = i }, text = { Text(stringResource(label.getValue(id))) }) }
        }
        if (message.isNotBlank()) Text(message, modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp), color = MaterialTheme.colorScheme.primary)
        if (note.isNotBlank()) Text(note, modifier = Modifier.padding(horizontal = 16.dp, vertical = 2.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            when (tabs[tab]) {
                "people" -> PeopleTab(repo, manage, version, ::act, salaryFor, { salaryFor = it }) { codeShown = it }
                "attendance" -> AttendanceTab(repo, version, ::act, { deviceKey = it }, { note = it })
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
    deviceKey?.let { (name, key) ->
        val clipboard = LocalClipboardManager.current
        AlertDialog(
            onDismissRequest = { },
            confirmButton = { TextButton(onClick = { deviceKey = null }) { Text(stringResource(R.string.hr_dev_keyDone)) } },
            dismissButton = { TextButton(onClick = { clipboard.setText(AnnotatedString(key)) }) { Text(stringResource(R.string.hr_dev_copy)) } },
            title = { Text(stringResource(R.string.hr_dev_keyTitle, name)) },
            text = { Column(verticalArrangement = Arrangement.spacedBy(8.dp)) { Text(stringResource(R.string.hr_dev_keyNote)); SelectionContainer { Text(key, fontWeight = FontWeight.Bold) } } },
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
    if (d == null) SkeletonList(2) else content(d)
}

@Composable private fun Box(title: String, content: @Composable () -> Unit) {
    Card(Modifier.fillMaxWidth()) { Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) { Text(title, style = MaterialTheme.typography.titleMedium); content() } }
}
@Composable private fun Field(value: String, onChange: (String) -> Unit, label: String, modifier: Modifier = Modifier.fillMaxWidth()) =
    OutlinedTextField(value = value, onValueChange = onChange, label = { Text(label) }, singleLine = true, modifier = modifier)

/* ---- people ---- */
@Composable
private fun PeopleTab(repo: com.dalilacom.app.data.repository.HrRepository, manage: JsonObject?, version: Int, act: Act, salaryFor: String?, setSalaryFor: (String?) -> Unit, showCode: (String) -> Unit) {
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
    var deptId by remember { mutableStateOf("") }
    var deptName by remember { mutableStateOf("") }
    var renameDept by remember { mutableStateOf<JsonObject?>(null) }
    var renameValue by remember { mutableStateOf("") }
    var deleteDeptId by remember { mutableStateOf<String?>(null) }
    var codeFor by remember { mutableStateOf<JsonObject?>(null) }
    var codeValue by remember { mutableStateOf("") }
    var newCode by remember { mutableStateOf("") }
    var depts by remember(version) { mutableStateOf<List<JsonObject>>(emptyList()) }
    LaunchedEffect(version) { depts = repo.get("hr/departments").getOrNull().rows() }
    Load(repo, "hr/employees", version) { data ->
        val emps = data.rows()
        salaryFor?.let { id -> emps.firstOrNull { it.s("id") == id }?.let { SalaryBox(repo, it, cur, version, act) { setSalaryFor(null) } } }
        Box(manage.s("companyName").orEmpty()) {
            Text(stringResource(R.string.hr_people_count, emps.size), color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (emps.isEmpty()) EmptyHint("👥", stringResource(R.string.hr_people_empty))
            emps.forEach { e ->
                val name = fullName(e)
                val st = e.s("employmentStatus").orEmpty()
                val roleLabel = stringResource(when (e.s("role")) { "HR" -> R.string.hr_role_HR; "MANAGER" -> R.string.hr_role_MANAGER; else -> R.string.hr_role_EMPLOYEE })
                Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)).padding(12.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.Top) {
                    PersonAvatar(name)
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(name, fontWeight = FontWeight.ExtraBold)
                        Text(e.s("position") ?: roleLabel, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.5.sp)
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            StatusChip(roleLabel)
                            StatusChip(stringResource(when (st) { "ON_LEAVE" -> R.string.hr_status_ON_LEAVE; "TERMINATED" -> R.string.hr_status_TERMINATED; else -> R.string.hr_status_ACTIVE }), when (st) { "ACTIVE" -> "ok"; "ON_LEAVE" -> "warn"; else -> "bad" })
                            e.o("department")?.s("name")?.let { StatusChip(it) }
                            if (e.s("userId") != null) StatusChip(stringResource(R.string.hr_linked), "info")
                        }
                        FoldSection(stringResource(R.string.hr_details)) {
                            Text("${stringResource(R.string.hr_f_hire)}: ${day(e.s("hireDate"))}", fontSize = 13.sp)
                            e.s("email")?.let { Text("${stringResource(R.string.hr_f_email)}: $it", fontSize = 13.sp) }
                            Text(stringResource(if (e.s("userId") != null) R.string.hr_linked else R.string.hr_notLinked), fontSize = 13.sp)
                            e.s("deviceCode")?.let { Text("${stringResource(R.string.hr_f_deviceCode)}: $it", fontSize = 13.sp) }
                        }
                        OutlinedButton(shape = RoundedCornerShape(12.dp), onClick = { setSalaryFor(e.s("id")) }) { Text(stringResource(R.string.hr_sal_open)) }
                        OutlinedButton(shape = RoundedCornerShape(12.dp), onClick = { codeFor = e; codeValue = e.s("deviceCode").orEmpty() }) { Text(stringResource(R.string.hr_dev_setCode)) }
                        if (e.s("userId") == null && st != "TERMINATED") OutlinedButton(shape = RoundedCornerShape(12.dp), onClick = {
                            act(null, { repo.post("hr/employees/${e.s("id")}/invite") }) { r ->
                                val o = r as? JsonObject
                                if ((o?.get("emailed") as? JsonPrimitive)?.booleanOrNull != true) o?.s("code")?.let(showCode)
                            }
                        }) { Text(stringResource(R.string.hr_invite)) }
                    }
                    e.n("baseSalary")?.let { Text(money(it, cur), fontWeight = FontWeight.ExtraBold) }
                }
            }
        }
    }
    Box(stringResource(R.string.hr_dept_title)) {
        if (depts.isEmpty()) EmptyHint("🏷️", stringResource(R.string.hr_dept_empty))
        depts.forEach { d ->
            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)).padding(12.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                PersonAvatar(d.s("name").orEmpty())
                Column(Modifier.weight(1f)) {
                    Text(d.s("name").orEmpty(), fontWeight = FontWeight.ExtraBold)
                    Text(stringResource(R.string.hr_dept_count, d.o("_count")?.n("employees")?.toInt() ?: 0), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.5.sp)
                }
                TextButton(onClick = { renameDept = d; renameValue = d.s("name").orEmpty() }) { Text(stringResource(R.string.hr_dept_rename)) }
                TextButton(onClick = { deleteDeptId = d.s("id") }) { Text(stringResource(R.string.accounting_delete), color = MaterialTheme.colorScheme.error) }
            }
        }
        Field(deptName, { deptName = it }, stringResource(R.string.hr_dept_name))
        Button(onClick = { if (deptName.isNotBlank()) act(R.string.hr_dept_added, { repo.post("hr/departments", buildJsonObject { put("name", deptName.trim()) }) }, { deptName = "" }) }) { Text(stringResource(R.string.hr_dept_add)) }
    }
    renameDept?.let { d ->
        AlertDialog(
            onDismissRequest = { renameDept = null },
            title = { Text(stringResource(R.string.hr_dept_rename)) },
            text = { Field(renameValue, { renameValue = it }, stringResource(R.string.hr_dept_name)) },
            confirmButton = { TextButton(onClick = { renameDept = null; if (renameValue.isNotBlank()) act(R.string.hr_dept_renamed, { repo.patch("hr/departments/${d.s("id")}", buildJsonObject { put("name", renameValue.trim()) }) }, {}) }) { Text(stringResource(R.string.hr_sal_saveBase)) } },
            dismissButton = { TextButton(onClick = { renameDept = null }) { Text(stringResource(R.string.account_cancel)) } },
        )
    }
    codeFor?.let { e ->
        AlertDialog(
            onDismissRequest = { codeFor = null },
            title = { Text(stringResource(R.string.hr_dev_setCode)) },
            text = { Field(codeValue, { codeValue = it }, stringResource(R.string.hr_dev_codePrompt)) },
            confirmButton = { TextButton(onClick = { codeFor = null; act(R.string.hr_dev_codeSaved, { repo.patch("hr/employees/${e.s("id")}", buildJsonObject { if (codeValue.isBlank()) put("deviceCode", JsonNull) else put("deviceCode", codeValue.trim()) }) }, {}) }) { Text(stringResource(R.string.hr_sal_saveBase)) } },
            dismissButton = { TextButton(onClick = { codeFor = null }) { Text(stringResource(R.string.account_cancel)) } },
        )
    }
    deleteDeptId?.let { id ->
        AlertDialog(
            onDismissRequest = { deleteDeptId = null },
            title = { Text(stringResource(R.string.hr_dept_confirmDelete)) },
            confirmButton = { TextButton(onClick = { deleteDeptId = null; act(R.string.hr_dept_deleted, { repo.delete("hr/departments/$id") }, {}) }) { Text(stringResource(R.string.accounting_delete), color = MaterialTheme.colorScheme.error) } },
            dismissButton = { TextButton(onClick = { deleteDeptId = null }) { Text(stringResource(R.string.account_cancel)) } },
        )
    }
    Box(stringResource(R.string.hr_people_add)) {
        Field(first, { first = it }, stringResource(R.string.hr_f_first)); Field(last, { last = it }, stringResource(R.string.hr_f_last))
        Field(email, { email = it }, stringResource(R.string.hr_f_email)); Field(position, { position = it }, stringResource(R.string.hr_f_position))
        Field(hire, { hire = it }, stringResource(R.string.hr_f_hire)); Field(salary, { salary = it }, stringResource(R.string.hr_f_salary, cur))
        Field(newCode, { newCode = it }, stringResource(R.string.hr_f_deviceCode))
        PickList(listOf("" to stringResource(R.string.hr_dept_none)) + depts.map { (it.s("id") ?: "") to it.s("name").orEmpty() }, deptId, { deptId = it }, stringResource(R.string.hr_f_dept))
        Button(onClick = {
            val cents = salary.trim().takeIf { it.isNotEmpty() }?.toDoubleOrNull()?.let { Math.round(it * 100) }
            if (first.isNotBlank() && last.isNotBlank()) act(R.string.hr_people_added, {
                repo.post("hr/employees", buildJsonObject {
                    put("firstName", first.trim()); put("lastName", last.trim()); put("hireDate", hire)
                    if (position.isNotBlank()) put("position", position.trim()); if (email.isNotBlank()) put("email", email.trim())
                    if (cents != null) put("baseSalary", cents)
                    if (deptId.isNotBlank()) put("departmentId", deptId)
                    if (newCode.isNotBlank()) put("deviceCode", newCode.trim())
                })
            }, { first = ""; last = ""; email = ""; position = ""; salary = ""; newCode = "" })
        }) { Text(stringResource(R.string.hr_people_addBtn)) }
    }
}

/* ---- attendance: fingerprint / card readers, a file of punches, the latest records ---- */
@Composable
private fun kindLabel(k: String?): String = stringResource(when (k) { "CARD" -> R.string.hr_dev_kind_CARD; "FACE" -> R.string.hr_dev_kind_FACE; "OTHER" -> R.string.hr_dev_kind_OTHER; else -> R.string.hr_dev_kind_FINGERPRINT })

@Composable
private fun sourceLabel(k: String?): String = stringResource(when (k) { "MOBILE" -> R.string.hr_att_src_MOBILE; "MANUAL" -> R.string.hr_att_src_MANUAL; "DEVICE" -> R.string.hr_att_src_DEVICE; "IMPORT" -> R.string.hr_att_src_IMPORT; else -> R.string.hr_att_src_WEB })

private fun localTime(v: String?): String = runCatching {
    java.time.Instant.parse(v!!).atZone(java.time.ZoneId.systemDefault()).format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm"))
}.getOrDefault(v.orEmpty())

@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
private fun AttendanceTab(repo: com.dalilacom.app.data.repository.HrRepository, version: Int, act: Act, showKey: (Pair<String, String>) -> Unit, setNote: (String) -> Unit) {
    val context = androidx.compose.ui.platform.LocalContext.current
    var devName by remember { mutableStateOf("") }
    var kind by remember { mutableStateOf("FINGERPRINT") }
    var csv by remember { mutableStateOf("") }
    var rotateId by remember { mutableStateOf<String?>(null) }
    var deleteId by remember { mutableStateOf<String?>(null) }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) csv = runCatching { context.contentResolver.openInputStream(uri)?.bufferedReader()?.use { it.readText() } }.getOrNull().orEmpty()
    }
    val from = java.time.LocalDate.now().minusDays(7).toString()
    Box(stringResource(R.string.hr_dev_title)) {
        Text(stringResource(R.string.hr_dev_intro), color = MaterialTheme.colorScheme.onSurfaceVariant)
        Load(repo, "hr/devices", version) { data ->
            val devs = data.rows()
            if (devs.isEmpty()) EmptyHint("🖐️", stringResource(R.string.hr_dev_empty))
            devs.forEach { d ->
                val active = (d["active"] as? JsonPrimitive)?.booleanOrNull != false
                Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)).padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(d.s("name").orEmpty(), fontWeight = FontWeight.ExtraBold)
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        StatusChip(kindLabel(d.s("kind")))
                        StatusChip(stringResource(if (active) R.string.hr_dev_on else R.string.hr_dev_off), if (active) "ok" else "warn")
                        StatusChip("…" + d.s("keyHint").orEmpty(), "info")
                    }
                    Text("${stringResource(R.string.hr_dev_lastSeen)}: ${d.s("lastSeenAt")?.let { localTime(it) } ?: stringResource(R.string.hr_dev_never)}", fontSize = 12.5.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    androidx.compose.foundation.layout.FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedButton(shape = RoundedCornerShape(12.dp), onClick = { act(R.string.hr_dev_saved, { repo.patch("hr/devices/${d.s("id")}", buildJsonObject { put("active", !active) }) }, {}) }) { Text(stringResource(if (active) R.string.hr_dev_switchOff else R.string.hr_dev_switchOn)) }
                        OutlinedButton(shape = RoundedCornerShape(12.dp), onClick = { rotateId = d.s("id") }) { Text(stringResource(R.string.hr_dev_rotate)) }
                        TextButton(onClick = { deleteId = d.s("id") }) { Text(stringResource(R.string.accounting_delete), color = MaterialTheme.colorScheme.error) }
                    }
                }
            }
        }
        Field(devName, { devName = it }, stringResource(R.string.hr_dev_name))
        PickList(listOf("FINGERPRINT", "CARD", "FACE", "OTHER").map { it to kindLabel(it) }, kind, { kind = it }, stringResource(R.string.hr_dev_kind))
        Button(onClick = {
            if (devName.isNotBlank()) act(R.string.hr_dev_added, { repo.post("hr/devices", buildJsonObject { put("name", devName.trim()); put("kind", kind) }) }) { r ->
                (r as? JsonObject)?.let { showKey(it.s("name").orEmpty() to it.s("key").orEmpty()) }
                devName = ""
            }
        }) { Text(stringResource(R.string.hr_dev_add)) }
    }
    rotateId?.let { id ->
        AlertDialog(
            onDismissRequest = { rotateId = null },
            title = { Text(stringResource(R.string.hr_dev_rotateConfirm)) },
            confirmButton = { TextButton(onClick = { rotateId = null; act(R.string.hr_dev_saved, { repo.patch("hr/devices/$id", buildJsonObject { put("rotateKey", true) }) }) { r -> (r as? JsonObject)?.let { showKey(it.s("name").orEmpty() to it.s("key").orEmpty()) } } }) { Text(stringResource(R.string.hr_dev_rotate)) } },
            dismissButton = { TextButton(onClick = { rotateId = null }) { Text(stringResource(R.string.account_cancel)) } },
        )
    }
    deleteId?.let { id ->
        AlertDialog(
            onDismissRequest = { deleteId = null },
            title = { Text(stringResource(R.string.hr_dev_deleteConfirm)) },
            confirmButton = { TextButton(onClick = { deleteId = null; act(R.string.hr_dev_deleted, { repo.delete("hr/devices/$id") }, {}) }) { Text(stringResource(R.string.accounting_delete), color = MaterialTheme.colorScheme.error) } },
            dismissButton = { TextButton(onClick = { deleteId = null }) { Text(stringResource(R.string.account_cancel)) } },
        )
    }
    Box(stringResource(R.string.hr_imp_title)) {
        Text(stringResource(R.string.hr_imp_hint), color = MaterialTheme.colorScheme.onSurfaceVariant)
        OutlinedButton(shape = RoundedCornerShape(12.dp), onClick = { picker.launch("*/*") }) { Text(stringResource(R.string.hr_imp_pick)) }
        OutlinedTextField(value = csv, onValueChange = { csv = it }, label = { Text(stringResource(R.string.hr_imp_paste)) }, minLines = 4, maxLines = 8, modifier = Modifier.fillMaxWidth())
        Button(onClick = {
            val lines = csv.lines().filter { it.isNotBlank() }
            if (lines.isNotEmpty()) act(null, {
                var ok = 0; var dup = 0; var bad = 0; var failure: Throwable? = null
                for (chunk in lines.chunked(1500)) {
                    repo.post("hr/attendance/import", buildJsonObject { put("csv", chunk.joinToString("\n")) }).fold({ d ->
                        val o = d as? JsonObject; val sm = o?.o("summary")
                        val done = (sm?.n("CHECKED_IN") ?: 0.0) + (sm?.n("CHECKED_OUT") ?: 0.0); val rep = sm?.n("DUPLICATE") ?: 0.0
                        ok += done.toInt(); dup += rep.toInt(); bad += ((o?.n("lines") ?: 0.0) - done - rep + (o?.n("skipped") ?: 0.0)).toInt()
                    }, { failure = it })
                    if (failure != null) break
                }
                val f = failure
                if (f != null) Result.failure(f) else Result.success(buildJsonObject { put("ok", ok); put("dup", dup); put("bad", bad) })
            }) { r ->
                val o = r as? JsonObject
                setNote(context.getString(R.string.hr_imp_result, (o?.n("ok") ?: 0.0).toInt(), (o?.n("dup") ?: 0.0).toInt(), (o?.n("bad") ?: 0.0).toInt()))
                csv = ""
            }
        }) { Text(stringResource(R.string.hr_imp_run)) }
    }
    Box(stringResource(R.string.hr_att_recent)) {
        Load(repo, "hr/attendance?from=$from", version) { data ->
            val recs = data.rows()
            if (recs.isEmpty()) EmptyHint("🕒", stringResource(R.string.hr_att_empty))
            recs.take(40).forEach { r ->
                val name = fullName(r.o("employee"))
                Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)).padding(12.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    PersonAvatar(name)
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(name, fontWeight = FontWeight.ExtraBold)
                        Text("${localTime(r.s("checkIn"))} → ${r.s("checkOut")?.let { localTime(it) } ?: stringResource(R.string.hr_att_open)}", fontSize = 12.5.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        StatusChip(sourceLabel(r.s("source")), if (r.s("source") == "DEVICE") "info" else "")
                    }
                }
            }
        }
    }
}

/* ---- leave ---- */
@Composable
private fun LeaveTab(repo: com.dalilacom.app.data.repository.HrRepository, version: Int, act: Act) {
    var typeName by remember { mutableStateOf("") }; var typeDays by remember { mutableStateOf("14") }
    Load(repo, "hr/leave-requests", version) { data ->
        val open = data.rows().filter { it.s("status") == "PENDING_MANAGER" || it.s("status") == "PENDING_HR" }
        Box(stringResource(R.string.hr_leave_pending)) {
            if (open.isEmpty()) EmptyHint("🏖️", stringResource(R.string.hr_leave_none))
            open.forEach { r ->
                val emp = fullName(r.o("employee"))
                val nDays = runCatching { java.time.temporal.ChronoUnit.DAYS.between(java.time.LocalDate.parse(day(r.s("startDate"))), java.time.LocalDate.parse(day(r.s("endDate")))) + 1 }.getOrDefault(1L).toInt()
                Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)).padding(12.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.Top) {
                    PersonAvatar(emp)
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(emp, fontWeight = FontWeight.ExtraBold)
                        Text("${r.o("leaveType")?.s("name").orEmpty()} · ${day(r.s("startDate"))} → ${day(r.s("endDate"))}", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.5.sp)
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            StatusChip(stringResource(R.string.hr_leave_days, nDays), "info")
                            StatusChip(stringResource(if (r.s("status") == "PENDING_HR") R.string.hr_leave_waitHr else R.string.hr_leave_waitManager), "warn")
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Button(shape = RoundedCornerShape(12.dp), onClick = { act(R.string.hr_decided, { repo.post("hr/leave-requests/${r.s("id")}/decision", buildJsonObject { put("decision", "APPROVE") }) }, {}) }) { Text(stringResource(R.string.hr_approve)) }
                            OutlinedButton(shape = RoundedCornerShape(12.dp), onClick = { act(R.string.hr_decided, { repo.post("hr/leave-requests/${r.s("id")}/decision", buildJsonObject { put("decision", "REJECT") }) }, {}) }) { Text(stringResource(R.string.hr_reject)) }
                        }
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
            if (paidCost > 0) MetricTile(stringResource(R.string.hr_pay_paidTotalLabel), money(paidCost, cur), "payroll", Modifier.fillMaxWidth())
            if (owner) com.dalilacom.app.ui.common.UnifiedSummaryCard(repo, "hr/unified-summary", version)
            if (runs.isEmpty()) EmptyHint("💵", stringResource(R.string.hr_pay_none))
            runs.forEach { r ->
                val id = r.s("id").orEmpty(); val st = r.s("status").orEmpty()
                val steps = listOf(stringResource(R.string.hr_run_DRAFT), stringResource(R.string.hr_run_PROCESSED), stringResource(R.string.hr_run_PAID))
                Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)).padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                        Text("${day(r.s("periodStart"))} → ${day(r.s("periodEnd"))}", fontWeight = FontWeight.ExtraBold)
                        StatusChip(steps[if (st == "PAID") 2 else if (st == "PROCESSED") 1 else 0], if (st == "PAID") "ok" else if (st == "PROCESSED") "info" else "neutral")
                    }
                    StepBar(steps, if (st == "PAID") 2 else if (st == "PROCESSED") 1 else 0)
                    r.o("totals")?.takeIf { st != "DRAFT" }?.let { tt ->
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            MetricTile(stringResource(R.string.hr_pay_gross), money(tt.n("grossPay"), cur), "net", Modifier.weight(1f))
                            MetricTile(stringResource(R.string.hr_pay_deductions), money(tt.n("totalDeductions"), cur), "expense", Modifier.weight(1f))
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            MetricTile(stringResource(R.string.hr_pay_net), money(tt.n("netPay"), cur), "income", Modifier.weight(1f))
                            MetricTile(stringResource(R.string.hr_pay_cost), money(tt.n("cost"), cur), "payroll", Modifier.weight(1f))
                        }
                    }
                    when {
                        st == "DRAFT" -> Button(shape = RoundedCornerShape(14.dp), modifier = Modifier.fillMaxWidth().height(46.dp), onClick = { act(R.string.hr_pay_processed, { repo.post("hr/payroll-runs/$id/process") }, {}) }) { Text(stringResource(R.string.hr_pay_process), fontWeight = FontWeight.ExtraBold) }
                        st == "PROCESSED" -> Button(shape = RoundedCornerShape(14.dp), modifier = Modifier.fillMaxWidth().height(46.dp), onClick = { act(R.string.hr_pay_paidDone, { repo.post("hr/payroll-runs/$id/mark-paid") }, {}) }) { Text(stringResource(R.string.hr_pay_markPaid), fontWeight = FontWeight.ExtraBold) }
                        owner -> OutlinedButton(shape = RoundedCornerShape(14.dp), modifier = Modifier.fillMaxWidth().height(46.dp), onClick = { revertId = id }) { Text(stringResource(R.string.hr_pay_revert)) }
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

/** A small drop-down: the label of the chosen option, and a menu with the others. */
@Composable
private fun PickList(options: List<Pair<String, String>>, selected: String, onSelect: (String) -> Unit, label: String) {
    var open by remember { mutableStateOf(false) }
    Column {
        Text(label, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
        OutlinedButton(onClick = { open = true }, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(12.dp)) { Text(options.firstOrNull { it.first == selected }?.second ?: options.firstOrNull()?.second.orEmpty()) }
        androidx.compose.material3.DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            options.forEach { (value, text) -> androidx.compose.material3.DropdownMenuItem(text = { Text(text) }, onClick = { onSelect(value); open = false }) }
        }
    }
}

/* ---- the salary structure of one employee: base salary plus additions and deductions ---- */
@Composable
private fun SalaryBox(repo: com.dalilacom.app.data.repository.HrRepository, emp: JsonObject, cur: String, version: Int, act: Act, onClose: () -> Unit) {
    val id = emp.s("id").orEmpty()
    var base by remember(id, version) { mutableStateOf(emp.n("baseSalary")?.let { "%.2f".format(it / 100.0) } ?: "") }
    var comps by remember(version) { mutableStateOf<List<JsonObject>>(emptyList()) }
    var compId by remember { mutableStateOf("") }
    var value by remember { mutableStateOf("") }
    var newName by remember { mutableStateOf("") }
    var newType by remember { mutableStateOf("EARNING") }
    var newCalc by remember { mutableStateOf("FIXED") }
    LaunchedEffect(version) { comps = repo.get("hr/salary-components").getOrNull().rows() }
    Box(stringResource(R.string.hr_sal_title) + ": " + fullName(emp)) {
        Field(base, { base = it }, stringResource(R.string.hr_sal_base, cur))
        Button(onClick = {
            val c = base.replace(',', '.').toDoubleOrNull()?.let { Math.round(it * 100) }
            if (c != null && c >= 0) act(R.string.hr_sal_saved, { repo.put("hr/employees/$id/salary/base", buildJsonObject { put("baseSalary", c) }) }, {})
        }) { Text(stringResource(R.string.hr_sal_saveBase)) }
        Text(stringResource(R.string.hr_sal_items), style = MaterialTheme.typography.titleSmall)
        Load(repo, "hr/employees/$id/salary", version) { data ->
            val items = (data as? JsonObject)?.list("components").orEmpty()
            if (items.isEmpty()) Text(stringResource(R.string.hr_sal_empty), color = MaterialTheme.colorScheme.onSurfaceVariant)
            items.forEach { c ->
                val k = c.o("component")
                val deduction = k?.s("type") == "DEDUCTION"
                val shown = if (k?.s("calcType") == "FIXED") money(c.n("fixedAmount"), cur) else "${(c.n("percentage") ?: 0.0)}%"
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(k?.s("name").orEmpty(), fontWeight = FontWeight.ExtraBold)
                        StatusChip(stringResource(if (deduction) R.string.hr_sal_deduction else R.string.hr_sal_earning), if (deduction) "bad" else "ok")
                    }
                    Text(shown, fontWeight = FontWeight.ExtraBold)
                    TextButton(onClick = { act(R.string.hr_sal_removed, { repo.delete("hr/employees/$id/salary/components/${k?.s("id")}") }, {}) }) { Text(stringResource(R.string.hr_sal_remove), color = MaterialTheme.colorScheme.error) }
                }
            }
        }
        PickList(listOf("" to stringResource(R.string.hr_sal_pickComp)) + comps.map { (it.s("id") ?: "") to (it.s("name").orEmpty() + " · " + stringResource(if (it.s("calcType") == "FIXED") R.string.hr_sal_fixed else R.string.hr_sal_percent)) }, compId, { compId = it }, stringResource(R.string.hr_sal_comp))
        Field(value, { value = it }, stringResource(R.string.hr_sal_amount))
        Button(onClick = {
            val comp = comps.firstOrNull { it.s("id") == compId }
            val v = value.replace(',', '.').toDoubleOrNull()
            if (comp != null && v != null && v >= 0) act(R.string.hr_sal_itemAdded, {
                repo.put("hr/employees/$id/salary/components", buildJsonObject {
                    put("componentId", compId)
                    if (comp.s("calcType") == "FIXED") put("fixedAmount", Math.round(v * 100)) else put("percentage", v)
                })
            }, { value = "" })
        }) { Text(stringResource(R.string.hr_sal_addItem)) }
        FoldSection(stringResource(R.string.hr_sal_newComp)) {
            Field(newName, { newName = it }, stringResource(R.string.hr_sal_compName))
            PickList(listOf("EARNING" to stringResource(R.string.hr_sal_earning), "DEDUCTION" to stringResource(R.string.hr_sal_deduction)), newType, { newType = it }, stringResource(R.string.hr_sal_newComp))
            PickList(listOf("FIXED" to stringResource(R.string.hr_sal_fixed), "PERCENTAGE_OF_BASE" to stringResource(R.string.hr_sal_percent)), newCalc, { newCalc = it }, stringResource(R.string.hr_sal_amount))
            OutlinedButton(onClick = {
                if (newName.isNotBlank()) act(R.string.hr_sal_compCreated, { repo.post("hr/salary-components", buildJsonObject { put("name", newName.trim()); put("type", newType); put("calcType", newCalc) }) }, { newName = "" })
            }) { Text(stringResource(R.string.hr_sal_createComp)) }
        }
        OutlinedButton(onClick = onClose) { Text(stringResource(R.string.hr_sal_close)) }
    }
}
