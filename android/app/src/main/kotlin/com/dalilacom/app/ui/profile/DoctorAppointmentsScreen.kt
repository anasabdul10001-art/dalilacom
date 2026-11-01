package com.dalilacom.app.ui.profile

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.layout.ExperimentalLayoutApi
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
import com.dalilacom.app.data.network.DoctorAppointmentSettingsBody
import kotlinx.coroutines.launch

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun DoctorAppointmentsScreen(
    container: AppContainer,
    doctorId: String? = null,
    onBack: () -> Unit,
    onLogin: () -> Unit,
    onManageHours: () -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var schedule by remember { mutableStateOf<com.dalilacom.app.data.network.DoctorAppointmentScheduleDto?>(null) }
    var selectedDay by remember { mutableStateOf<String?>(null) }
    var selectedSlot by remember { mutableStateOf<String?>(null) }
    var myBookings by remember { mutableStateOf(emptyList<com.dalilacom.app.data.network.DoctorAppointmentDto>()) }
    var clinicBookings by remember { mutableStateOf(emptyList<com.dalilacom.app.data.network.DoctorAppointmentDto>()) }
    var doctorMode by remember { mutableStateOf(false) }
    var fitnessMode by remember { mutableStateOf(false) }
    var approvedDoctor by remember { mutableStateOf(false) }
    var settings by remember { mutableStateOf<com.dalilacom.app.data.network.DoctorAppointmentSettingsDto?>(null) }
    var enabled by remember { mutableStateOf(false) }
    var duration by remember { mutableIntStateOf(30) }
    var advance by remember { mutableIntStateOf(30) }
    var appointmentKind by remember { mutableStateOf("VISIT") }
    var shareMedicalFile by remember { mutableStateOf(false) }
    var visitReason by remember { mutableStateOf("") }

    fun load() {
        scope.launch {
            loading = true; error = null
            if (doctorId != null) {
                container.doctorCareRepository.appointmentSlots(doctorId).onSuccess { schedule = it; selectedDay = selectedDay ?: it.days.firstOrNull { day -> day.slots.isNotEmpty() }?.date }.onFailure { error = it.message }
            } else {
                container.doctorCareRepository.myAppointments().onSuccess { myBookings = it.items }.onFailure { error = it.message }
                val merchantProfile = container.merchantRepository.getMerchantMe()
                container.doctorCareRepository.load().onSuccess { care ->
                    val medicalDoctor = care.mode == "DOCTOR"
                    val fitnessCoach = merchantProfile?.isFitnessProvider == true
                    doctorMode = medicalDoctor || fitnessCoach
                    fitnessMode = fitnessCoach
                    approvedDoctor = (medicalDoctor && care.doctor?.approved == true) || (fitnessCoach && merchantProfile?.approvalStatus == "APPROVED")
                    if (approvedDoctor) {
                        container.doctorCareRepository.appointmentSettings().onSuccess { settings = it; enabled = it.enabled; duration = it.slotMinutes; advance = it.advanceDays }.onFailure { error = it.message }
                        container.doctorCareRepository.clinicAppointments().onSuccess { clinicBookings = it.items }.onFailure { error = it.message }
                    }
                }
            }
            loading = false
        }
    }
    LaunchedEffect(doctorId) { load() }

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).imePadding().padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        TextButton(onClick = onBack) { Text(stringResource(R.string.care_back)) }
        Text(stringResource(if (doctorId != null) R.string.appointment_book else R.string.appointment_my_title), style = MaterialTheme.typography.headlineSmall)
        error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        if (loading) CircularProgressIndicator()
        if (doctorId != null) {
            schedule?.let { result ->
                Text(result.doctor.name, style = MaterialTheme.typography.titleLarge)
                result.doctor.address?.let { Text("📍 $it") }
                Text(stringResource(R.string.appointment_duration, result.slotMinutes), color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(stringResource(R.string.appointment_kind), style = MaterialTheme.typography.titleMedium)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilterChip(selected = appointmentKind == "VISIT", onClick = { appointmentKind = "VISIT" }, label = { Text(stringResource(R.string.appointment_visit)) })
                    FilterChip(selected = appointmentKind == "FOLLOW_UP", onClick = { appointmentKind = "FOLLOW_UP" }, label = { Text(stringResource(R.string.appointment_follow_up)) })
                }
                Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                    Checkbox(checked = shareMedicalFile, onCheckedChange = { shareMedicalFile = it })
                    Text(stringResource(R.string.appointment_share_medical), style = MaterialTheme.typography.bodySmall)
                }
                Text(stringResource(R.string.appointment_share_medical_help), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                OutlinedTextField(value = visitReason, onValueChange = { if (it.length <= 1000) visitReason = it }, label = { Text(stringResource(R.string.appointment_visit_reason)) }, modifier = Modifier.fillMaxWidth(), minLines = 2)
                Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    result.days.forEach { day ->
                        FilterChip(selected = selectedDay == day.date, onClick = { selectedDay = day.date; selectedSlot = null }, label = { Text("${day.date} · ${day.slots.size}") })
                    }
                }
                val slots = result.days.find { it.date == selectedDay }?.slots.orEmpty()
                if (slots.isEmpty()) Text(stringResource(R.string.appointment_no_slots), color = MaterialTheme.colorScheme.onSurfaceVariant)
                else {
                    Text(stringResource(R.string.appointment_choose_time), style = MaterialTheme.typography.titleMedium)
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        slots.forEach { slot -> FilterChip(selected = selectedSlot == slot.startsAt, onClick = { selectedSlot = slot.startsAt }, label = { Text(slot.time) }) }
                    }
                    Button(enabled = selectedSlot != null, onClick = {
                        scope.launch {
                            if (!container.authRepository.hasStoredSession()) { container.pendingDoctorBooking.value = doctorId; onLogin(); return@launch }
                            val id = doctorId
                            val startsAt = selectedSlot ?: return@launch
                            container.doctorCareRepository.bookAppointment(id, startsAt, appointmentKind, shareMedicalFile, visitReason).onSuccess {
                                android.widget.Toast.makeText(context, context.getString(R.string.appointment_booked), android.widget.Toast.LENGTH_SHORT).show()
                                selectedSlot = null; visitReason = ""; shareMedicalFile = false; load()
                            }.onFailure { error = it.message; load() }
                        }
                    }, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.appointment_confirm_booking)) }
                }
                Text(stringResource(R.string.appointment_no_record_needed), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(stringResource(R.string.appointment_share_info), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        } else {
            Text(stringResource(R.string.appointment_my_bookings), style = MaterialTheme.typography.titleLarge)
            if (myBookings.isEmpty()) Text(stringResource(R.string.appointment_empty))
            myBookings.forEach { item -> AppointmentCard(item.doctor?.businessName ?: item.doctor?.name.orEmpty(), item.startsAt, item.status, item.status == "CONFIRMED" && isFuture(item.startsAt)) {
                scope.launch { container.doctorCareRepository.cancelAppointment(item.id).onSuccess { load() }.onFailure { error = it.message } }
            } }
            if (doctorMode) {
                HorizontalDivider()
                Text(stringResource(if (fitnessMode) R.string.appointment_trainer_bookings else R.string.appointment_clinic_bookings), style = MaterialTheme.typography.titleLarge)
                if (!approvedDoctor) Text(stringResource(R.string.care_approval_needed), color = MaterialTheme.colorScheme.error)
                else {
                    if (settings?.hasHours == false) {
                        Text(stringResource(R.string.appointment_hours_required), color = MaterialTheme.colorScheme.error)
                        OutlinedButton(onClick = onManageHours) { Text(stringResource(R.string.appointment_set_hours)) }
                    }
                    Text(stringResource(R.string.appointment_enable_help), style = MaterialTheme.typography.bodySmall)
                    Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                        Text(stringResource(R.string.appointment_enable), modifier = Modifier.weight(1f))
                        Switch(checked = enabled, onCheckedChange = { enabled = it })
                    }
                    Text(stringResource(R.string.appointment_slot_length), style = MaterialTheme.typography.labelLarge)
                    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        listOf(10, 15, 20, 30, 45, 60).forEach { minutes -> FilterChip(selected = duration == minutes, onClick = { duration = minutes }, label = { Text("$minutes") }) }
                    }
                    Text(stringResource(R.string.appointment_advance_label, advance))
                    Slider(value = advance.toFloat(), onValueChange = { advance = it.toInt() }, valueRange = 7f..90f, steps = 82)
                    Button(enabled = settings != null, onClick = {
                        scope.launch { container.doctorCareRepository.saveAppointmentSettings(DoctorAppointmentSettingsBody(enabled, duration, advance)).onSuccess { settings = it; android.widget.Toast.makeText(context, context.getString(R.string.appointment_settings_saved), android.widget.Toast.LENGTH_SHORT).show() }.onFailure { error = it.message } }
                    }, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.appointment_save_settings)) }
                    if (clinicBookings.isEmpty()) Text(stringResource(R.string.appointment_empty))
                    clinicBookings.forEach { item -> AppointmentCard(item.patient?.fullName.orEmpty(), item.startsAt, item.status, item.status == "CONFIRMED" && isFuture(item.startsAt), (item.patient?.email.orEmpty() + if (item.patient?.phone.isNullOrBlank()) "" else " · ${item.patient?.phone}"), item.kind, if (item.medicalFileShared) listOfNotNull(item.visitReason?.let { "${context.getString(R.string.appointment_visit_reason)}: $it" }, item.latestDiagnosis?.let { "${context.getString(R.string.appointment_diagnosis)}: ${it.title.orEmpty()}\n${it.body.orEmpty()}" }).joinToString("\n\n").ifBlank { context.getString(R.string.appointment_no_diagnosis) } else null, item.medicalFileShared) {
                        scope.launch { container.doctorCareRepository.cancelAppointment(item.id).onSuccess { load() }.onFailure { error = it.message } }
                    } }
                }
            }
        }
    }
}

private fun isFuture(value: String) = runCatching { java.time.Instant.parse(value).isAfter(java.time.Instant.now()) }.getOrDefault(false)

@Composable
private fun AppointmentCard(name: String, startsAt: String, status: String, cancellable: Boolean, detail: String = "", kind: String = "VISIT", diagnosis: String? = null, medicalFileShared: Boolean = false, onCancel: () -> Unit) {
    ElevatedCard(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
            Text(name, style = MaterialTheme.typography.titleMedium)
            Text(stringResource(if (kind == "FOLLOW_UP") R.string.appointment_follow_up else R.string.appointment_visit), style = MaterialTheme.typography.labelMedium)
            val localDate = runCatching { java.time.Instant.parse(startsAt).atZone(java.time.ZoneId.systemDefault()).format(java.time.format.DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm")) }.getOrDefault(startsAt)
            Text(localDate + " · " + stringResource(when (status) { "CONFIRMED" -> R.string.appointment_status_confirmed; "CANCELLED" -> R.string.appointment_status_cancelled; "COMPLETED" -> R.string.appointment_status_completed; else -> R.string.appointment_status_no_show }))
            if (detail.isNotBlank()) Text(detail, style = MaterialTheme.typography.bodySmall)
            if (medicalFileShared) {
                Text(stringResource(R.string.appointment_diagnosis), style = MaterialTheme.typography.labelLarge)
                Text(diagnosis.orEmpty(), style = MaterialTheme.typography.bodySmall)
            } else if (detail.isNotBlank()) Text(stringResource(R.string.appointment_no_medical_share), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (cancellable) TextButton(onClick = onCancel) { Text(stringResource(R.string.appointment_cancel)) }
        }
    }
}
