package com.dalilacom.app.ui.profile

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.dalilacom.app.R
import com.dalilacom.app.data.AppContainer
import com.dalilacom.app.data.network.DoctorCareDto
import com.dalilacom.app.data.network.DoctorCareRecordBody
import com.dalilacom.app.data.network.DoctorCareRecordDto
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DoctorCareScreen(container: AppContainer, onBack: () -> Unit) {
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    var data by remember { mutableStateOf<DoctorCareDto?>(null) }
    var selected by remember { mutableStateOf<String?>(null) }
    var records by remember { mutableStateOf<List<DoctorCareRecordDto>>(emptyList()) }
    var email by remember { mutableStateOf("") }
    var title by remember { mutableStateOf("") }
    var body by remember { mutableStateOf("") }
    var kind by remember { mutableStateOf("DIAGNOSIS") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    fun refresh() { scope.launch { busy = true; container.doctorCareRepository.load().onSuccess { data = it }.onFailure { error = it.message }; busy = false } }
    LaunchedEffect(Unit) { refresh() }
    val doctorMode = data?.mode == "DOCTOR"
    val selectedConnection = if (doctorMode) data?.patients?.find { it.id == selected } else data?.doctors?.find { it.id == selected }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).imePadding().padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        TextButton(onClick = onBack) { Text(stringResource(R.string.care_back)) }
        Text(stringResource(R.string.care_title), style = MaterialTheme.typography.headlineSmall)
        Text(stringResource(R.string.care_privacy), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        if (busy && data == null) CircularProgressIndicator()
        data?.let { care ->
            if (doctorMode) {
                Text(stringResource(R.string.care_patients), style = MaterialTheme.typography.titleLarge)
                if (care.doctor?.approved != true) Text(stringResource(R.string.care_approval_needed), color = MaterialTheme.colorScheme.error)
                else {
                    OutlinedTextField(email, { email = it }, Modifier.fillMaxWidth(), label = { Text(stringResource(R.string.care_patient_email)) }, singleLine = true)
                    Button(enabled = email.contains('@') && !busy, onClick = { scope.launch { busy = true; container.doctorCareRepository.request(email.trim()).onSuccess { email = ""; refresh() }.onFailure { error = it.message }; busy = false } }, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.care_send_request)) }
                }
                care.patients.forEach { link ->
                    ElevatedCard(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Text(link.patient?.fullName.orEmpty(), style = MaterialTheme.typography.titleMedium)
                            Text(link.patient?.email.orEmpty() + " · " + statusText(context, link.status))
                            if (link.status == "ACTIVE") OutlinedButton(onClick = { selected = link.id; scope.launch { container.doctorCareRepository.records(link.id).onSuccess { records = it.items }.onFailure { error = it.message } } }) { Text(stringResource(R.string.care_open_record)) }
                        }
                    }
                }
            } else {
                Text(stringResource(R.string.care_requests), style = MaterialTheme.typography.titleLarge)
                care.requests.forEach { link ->
                    ElevatedCard(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Text(link.doctor?.businessName.orEmpty(), style = MaterialTheme.typography.titleMedium)
                            Text(stringResource(R.string.care_request_explain))
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Button(onClick = { scope.launch { container.doctorCareRepository.respond(link.id, true).onSuccess { refresh() }.onFailure { error = it.message } } }) { Text(stringResource(R.string.care_accept)) }
                                OutlinedButton(onClick = { scope.launch { container.doctorCareRepository.respond(link.id, false).onSuccess { refresh() }.onFailure { error = it.message } } }) { Text(stringResource(R.string.care_decline)) }
                            }
                        }
                    }
                }
                Text(stringResource(R.string.care_my_doctors), style = MaterialTheme.typography.titleLarge)
                care.doctors.forEach { link ->
                    ElevatedCard(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Text(link.doctor?.businessName.orEmpty(), style = MaterialTheme.typography.titleMedium)
                            Text(statusText(context, link.status))
                            if (link.status == "ACTIVE" || link.status == "REVOKED") OutlinedButton(onClick = { selected = link.id; scope.launch { container.doctorCareRepository.records(link.id).onSuccess { records = it.items }.onFailure { error = it.message } } }) { Text(stringResource(R.string.care_open_record)) }
                            if (link.status == "ACTIVE") TextButton(onClick = { scope.launch { container.doctorCareRepository.revoke(link.id).onSuccess { refresh() }.onFailure { error = it.message } } }) { Text(stringResource(R.string.care_revoke)) }
                        }
                    }
                }
            }
            if (selectedConnection != null) {
                HorizontalDivider()
                Text(stringResource(R.string.care_records), style = MaterialTheme.typography.titleLarge)
                records.forEach { record ->
                    ElevatedCard(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text(record.title, style = MaterialTheme.typography.titleMedium)
                            Text("${kindText(context, record.kind)} · ${record.createdAt}", style = MaterialTheme.typography.labelSmall)
                            Text(record.body)
                        }
                    }
                }
                if (doctorMode && selectedConnection.status == "ACTIVE") {
                    Text(stringResource(R.string.care_add_update), style = MaterialTheme.typography.titleMedium)
                    var expanded by remember { mutableStateOf(false) }
                    ExposedDropdownMenuBox(expanded = expanded, onExpandedChange = { expanded = it }) {
                        OutlinedTextField(kindText(context, kind), {}, Modifier.menuAnchor().fillMaxWidth(), readOnly = true, label = { Text(stringResource(R.string.care_type)) })
                        ExposedDropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                            listOf("VISIT", "DIAGNOSIS", "MEDICATION", "INSTRUCTIONS", "FOLLOW_UP").forEach { option -> DropdownMenuItem(text = { Text(kindText(context, option)) }, onClick = { kind = option; expanded = false }) }
                        }
                    }
                    OutlinedTextField(title, { title = it }, Modifier.fillMaxWidth(), label = { Text(stringResource(R.string.care_short_title)) }, singleLine = true)
                    OutlinedTextField(body, { body = it }, Modifier.fillMaxWidth().heightIn(min = 120.dp), label = { Text(stringResource(R.string.care_details)) }, minLines = 3)
                    Button(enabled = title.length >= 2 && body.length >= 2 && !busy, onClick = { scope.launch { busy = true; container.doctorCareRepository.add(selectedConnection.id, DoctorCareRecordBody(kind, title.trim(), body.trim())).onSuccess { records = listOf(it) + records; title = ""; body = "" }.onFailure { error = it.message }; busy = false } }, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.care_save)) }
                }
            }
        }
    }
}

private fun statusText(context: android.content.Context, status: String) = context.getString(when (status) { "ACTIVE" -> R.string.care_status_active; "PENDING" -> R.string.care_status_pending; "REVOKED" -> R.string.care_status_revoked; else -> R.string.care_status_declined })
private fun kindText(context: android.content.Context, kind: String) = context.getString(when (kind) { "VISIT" -> R.string.care_kind_visit; "MEDICATION" -> R.string.care_kind_medication; "INSTRUCTIONS" -> R.string.care_kind_instructions; "FOLLOW_UP" -> R.string.care_kind_followup; else -> R.string.care_kind_diagnosis })
