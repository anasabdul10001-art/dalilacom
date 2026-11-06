package com.dalilacom.app.ui.profile

import androidx.compose.ui.res.stringResource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.dalilacom.app.R
import com.dalilacom.app.data.AppContainer
import com.dalilacom.app.data.network.FitnessPlanBody
import com.dalilacom.app.data.network.FitnessPlanUpdateBody
import com.dalilacom.app.data.network.FitnessProgressBody
import com.dalilacom.app.data.network.FitnessEnrollmentDto
import com.dalilacom.app.ui.common.DocumentPrinter
import kotlinx.coroutines.launch

@Composable
fun FitnessPlansScreen(container: AppContainer, onBack: () -> Unit) {
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val role by container.sessionStore.roleFlow.collectAsState(initial = null)
    val coachMode = role == "MERCHANT"
    var items by remember { mutableStateOf<List<com.dalilacom.app.data.network.FitnessPlanDto>>(emptyList()) }
    var trainees by remember { mutableStateOf<List<com.dalilacom.app.data.network.FitnessTraineeSummaryDto>>(emptyList()) }
    var email by remember { mutableStateOf("") }
    var title by remember { mutableStateOf("") }
    var details by remember { mutableStateOf("") }
    var notes by remember { mutableStateOf("") }
    var startsAt by remember { mutableStateOf("") }
    var endsAt by remember { mutableStateOf("") }
    var weeklySchedule by remember { mutableStateOf<Map<String, String>>(emptyMap()) }
    var enrollments by remember { mutableStateOf<List<FitnessEnrollmentDto>>(emptyList()) }
    var kind by remember { mutableStateOf("WORKOUT") }
    var weight by remember { mutableStateOf("") }
    var progressNote by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    var editingPlanId by remember { mutableStateOf<String?>(null) }
    var selectedTraineeId by remember { mutableStateOf<String?>(null) }
    fun refresh() {
        scope.launch {
            busy = true
            val result = if (coachMode) container.fitnessPlansRepository.coachPlans() else container.fitnessPlansRepository.myPlans()
            result.onSuccess { items = it }.onFailure { error = it.message }
            if (coachMode) container.fitnessPlansRepository.coachTrainees().onSuccess { trainees = it }.onFailure { error = it.message }
            if (coachMode) container.fitnessPlansRepository.coachEnrollments().onSuccess { enrollments = it }.onFailure { error = it.message }
            else container.fitnessPlansRepository.myEnrollments().onSuccess { enrollments = it }.onFailure { error = it.message }
            busy = false
        }
    }
    LaunchedEffect(coachMode) { refresh() }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).imePadding().padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        TextButton(onClick = onBack) { Text(stringResource(R.string.fit_auto_11e83767)) }
        Text(if (coachMode) stringResource(R.string.fit_auto_f7175997) else stringResource(R.string.fit_auto_cd78b295), style = MaterialTheme.typography.headlineSmall)
        Text(stringResource(R.string.fit_auto_ec4ef902), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        if (busy && items.isEmpty()) CircularProgressIndicator()
        if (coachMode) {
            if (editingPlanId != null) {
                Text(stringResource(R.string.fit_auto_0d1a0f67, items.firstOrNull { it.id == editingPlanId }?.trainee?.fullName.orEmpty()), style = MaterialTheme.typography.titleSmall)
            } else {
                OutlinedTextField(email, { email = it }, Modifier.fillMaxWidth(), label = { Text(stringResource(R.string.fit_auto_7ce78f07)) }, singleLine = true)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChip(selected = kind == "WORKOUT", onClick = { kind = "WORKOUT" }, label = { Text(stringResource(R.string.fit_auto_5e657e68)) })
                FilterChip(selected = kind == "NUTRITION", onClick = { kind = "NUTRITION" }, label = { Text(stringResource(R.string.fit_auto_2a48b04e)) })
            }
            OutlinedTextField(title, { title = it }, Modifier.fillMaxWidth(), label = { Text(stringResource(R.string.fit_auto_384df087)) }, singleLine = true)
            OutlinedTextField(details, { details = it }, Modifier.fillMaxWidth(), label = { Text(stringResource(R.string.fit_auto_6a2e4995)) }, minLines = 5)
            OutlinedTextField(notes, { notes = it }, Modifier.fillMaxWidth(), label = { Text(stringResource(R.string.fit_auto_3c4208fe)) }, minLines = 2)
            OutlinedTextField(startsAt, { startsAt = it.filter { c -> c.isDigit() || c == '-' }.take(10) }, Modifier.fillMaxWidth(), label = { Text(stringResource(R.string.fit_auto_7625f9c4)) }, singleLine = true)
            OutlinedTextField(endsAt, { endsAt = it.filter { c -> c.isDigit() || c == '-' }.take(10) }, Modifier.fillMaxWidth(), label = { Text(stringResource(R.string.fit_auto_44a5a9a7)) }, singleLine = true)
            Text(stringResource(R.string.fit_auto_61ec5484), style = MaterialTheme.typography.titleSmall)
            listOf("MONDAY" to stringResource(R.string.fit_auto_70cbbabf), "TUESDAY" to stringResource(R.string.fit_auto_b38d7fc2), "WEDNESDAY" to stringResource(R.string.fit_auto_2e5bdec0), "THURSDAY" to stringResource(R.string.fit_auto_a6828d5b), "FRIDAY" to stringResource(R.string.fit_auto_66e535ba), "SATURDAY" to stringResource(R.string.fit_auto_3cf0f7a6), "SUNDAY" to stringResource(R.string.fit_auto_86aad79c)).forEach { (key, label) ->
                OutlinedTextField(weeklySchedule[key].orEmpty(), { weeklySchedule = weeklySchedule + (key to it) }, Modifier.fillMaxWidth(), label = { Text(label + stringResource(R.string.fit_auto_715af372)) }, minLines = 2)
            }
            Button(enabled = !busy && (editingPlanId != null || email.contains("@")) && title.length >= 2 && (details.isNotBlank() || weeklySchedule.values.any { it.isNotBlank() }) && (startsAt.isBlank() || startsAt.length == 10) && (endsAt.isBlank() || endsAt.length == 10) && (startsAt.isBlank() || endsAt.isBlank() || endsAt >= startsAt), onClick = {
                scope.launch {
                    busy = true
                    error = null
                    val cleanDetails = details.lines().map(String::trim).filter(String::isNotBlank)
                    val startIso = startsAt.takeIf { it.isNotBlank() }?.let { "${it}T12:00:00.000Z" }
                    val endIso = endsAt.takeIf { it.isNotBlank() }?.let { "${it}T12:00:00.000Z" }
                    val week = weeklySchedule.mapValues { (_, text) -> text.lines().map(String::trim).filter(String::isNotBlank) }.filterValues { it.isNotEmpty() }
                    val result = editingPlanId?.let { id ->
                        container.fitnessPlansRepository.update(id, FitnessPlanUpdateBody(kind, title.trim(), cleanDetails, notes.trim().ifBlank { null }, startIso, endIso, week))
                    } ?: container.fitnessPlansRepository.create(FitnessPlanBody(email.trim(), kind, title.trim(), cleanDetails, notes.trim().ifBlank { null }, startIso, endIso, week))
                    result.onSuccess {
                        email = ""; title = ""; details = ""; notes = ""; startsAt = ""; endsAt = ""; weeklySchedule = emptyMap(); editingPlanId = null; refresh()
                    }.onFailure { error = it.message }
                    busy = false
                }
            }, modifier = Modifier.fillMaxWidth()) { Text(if (busy) stringResource(R.string.fit_auto_0da9f8a8) else if (editingPlanId != null) stringResource(R.string.fit_auto_ea76b8bc) else stringResource(R.string.fit_auto_e1b96d0a)) }
            if (editingPlanId != null) TextButton(enabled = !busy, onClick = { editingPlanId = null; email = ""; title = ""; details = ""; notes = ""; startsAt = ""; endsAt = ""; weeklySchedule = emptyMap() }) { Text(stringResource(R.string.fit_auto_c5f60175)) }
            Text(stringResource(R.string.fit_auto_c66cd2de, trainees.size), style = MaterialTheme.typography.titleMedium)
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChip(selected = selectedTraineeId == null, onClick = { selectedTraineeId = null }, label = { Text(stringResource(R.string.fit_auto_6d08f196)) })
                trainees.forEach { summary ->
                    FilterChip(selected = selectedTraineeId == summary.trainee.id, onClick = { selectedTraineeId = summary.trainee.id }, label = { Text(summary.trainee.fullName + " · " + summary.planCount) })
                }
            }
        }
        items.filter { !coachMode || selectedTraineeId == null || it.trainee?.id == selectedTraineeId }.forEach { plan ->
            ElevatedCard(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(7.dp)) {
                    Text(plan.title, style = MaterialTheme.typography.titleMedium)
                    Text(if (plan.kind == "WORKOUT") stringResource(R.string.fit_auto_eec3db7f) else stringResource(R.string.fit_auto_ed87a68b), style = MaterialTheme.typography.labelMedium)
                    plan.startsAt?.take(10)?.let { Text(stringResource(R.string.fit_auto_49215294, it), style = MaterialTheme.typography.bodySmall) }
                    plan.endsAt?.take(10)?.let { Text(stringResource(R.string.fit_auto_bf43e2f7, it), style = MaterialTheme.typography.bodySmall) }
                    Text(if (coachMode) plan.trainee?.fullName.orEmpty() + " · " + plan.trainee?.email.orEmpty() else plan.coach?.fitnessProfile?.displayName ?: plan.coach?.businessName.orEmpty())
                    if (plan.weeklySchedule.isNullOrEmpty()) plan.details.forEach { Text("• " + it) } else {
                        listOf("MONDAY" to stringResource(R.string.fit_auto_70cbbabf), "TUESDAY" to stringResource(R.string.fit_auto_b38d7fc2), "WEDNESDAY" to stringResource(R.string.fit_auto_2e5bdec0), "THURSDAY" to stringResource(R.string.fit_auto_a6828d5b), "FRIDAY" to stringResource(R.string.fit_auto_66e535ba), "SATURDAY" to stringResource(R.string.fit_auto_3cf0f7a6), "SUNDAY" to stringResource(R.string.fit_auto_86aad79c)).forEach { (key, label) ->
                            plan.weeklySchedule[key]?.takeIf { it.isNotEmpty() }?.let { items -> Text(label, style = MaterialTheme.typography.titleSmall); items.forEach { Text("• $it") } }
                        }
                    }
                    plan.notes?.takeIf { it.isNotBlank() }?.let { Text(it, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                    if (coachMode) Text("${plan.trainee?.fullName.orEmpty()} · ${plan.trainee?.email.orEmpty()}", style = MaterialTheme.typography.bodySmall)
                    OutlinedButton(onClick = { scope.launch { DocumentPrinter.export(context, container.tokenStore, "/fitness-plans/" + plan.id + "/print", "Dalilacom - " + plan.title) } }) { Text(stringResource(R.string.fit_auto_6b100af3)) }
                    if (coachMode) OutlinedButton(enabled = !busy, onClick = {
                        editingPlanId = plan.id; email = plan.trainee?.email.orEmpty(); kind = plan.kind; title = plan.title; details = plan.details.joinToString("\n"); notes = plan.notes.orEmpty(); startsAt = plan.startsAt?.take(10).orEmpty(); endsAt = plan.endsAt?.take(10).orEmpty(); weeklySchedule = plan.weeklySchedule.orEmpty().mapValues { it.value.joinToString("\n") }; error = null
                    }) { Text(stringResource(R.string.fit_auto_4eb10593)) }
                    if (!coachMode) {
                        plan.progress.forEach { entry -> Text(entry.completedAt.take(10) + " · " + (entry.weightKg?.toString() ?: "") + stringResource(R.string.fit_auto_df38da5b) + (entry.note ?: ""), style = MaterialTheme.typography.bodySmall) }
                        OutlinedTextField(weight, { weight = it.filter { c -> c.isDigit() || c == '.' } }, Modifier.fillMaxWidth(), label = { Text(stringResource(R.string.fit_auto_943bdb85)) }, singleLine = true)
                        OutlinedTextField(progressNote, { progressNote = it }, Modifier.fillMaxWidth(), label = { Text(stringResource(R.string.fit_auto_1d47217e)) })
                        Button(onClick = {
                            scope.launch {
                                container.fitnessPlansRepository.progress(plan.id, FitnessProgressBody(weight.toDoubleOrNull(), progressNote.trim().ifBlank { null }))
                                    .onSuccess { weight = ""; progressNote = ""; refresh() }
                                    .onFailure { error = it.message }
                            }
                        }) { Text(stringResource(R.string.fit_auto_6a2fcb7c)) }
                    } else if (plan.progress.isNotEmpty()) {
                        HorizontalDivider()
                        Text(stringResource(R.string.fit_auto_35db8764), style = MaterialTheme.typography.titleSmall)
                        plan.progress.forEach { entry -> Text(entry.completedAt.take(10) + " · " + (entry.weightKg?.toString() ?: "") + stringResource(R.string.fit_auto_df38da5b) + (entry.note ?: ""), style = MaterialTheme.typography.bodySmall) }
                    }
                }
            }
        }
        if (!busy && items.isEmpty()) Text(stringResource(R.string.fit_auto_d7644cdb), color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(if (coachMode) stringResource(R.string.fit_auto_80861134) else stringResource(R.string.fit_auto_458c9253), style = MaterialTheme.typography.titleLarge)
        if (enrollments.isEmpty()) Text(stringResource(R.string.fit_auto_dff8acbb), color = MaterialTheme.colorScheme.onSurfaceVariant)
        enrollments.forEach { enrollment ->
            ElevatedCard(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(enrollment.offer?.title.orEmpty(), style = MaterialTheme.typography.titleMedium)
                    Text(if (coachMode) enrollment.user?.fullName.orEmpty() + " · " + enrollment.user?.email.orEmpty() else enrollment.merchant?.fitnessProfile?.displayName ?: enrollment.merchant?.businessName.orEmpty())
                    Text(stringResource(R.string.fit_auto_4f4865b2) + when (enrollment.status) { "REQUESTED" -> stringResource(R.string.fit_auto_0c38fd67); "ACCEPTED" -> stringResource(R.string.fit_auto_19837e3e); "REJECTED" -> stringResource(R.string.fit_auto_ab579793); "CANCELLED" -> stringResource(R.string.fit_auto_f5eb0776); else -> stringResource(R.string.fit_auto_28cbdf83) })
                    if (enrollment.status == "ACCEPTED") Text(stringResource(R.string.fit_auto_c5a1a374, enrollment.startsAt?.take(10).orEmpty(), enrollment.endsAt?.take(10).orEmpty()), style = MaterialTheme.typography.bodySmall)
                    if (coachMode && enrollment.status == "REQUESTED") Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(enabled = !busy, onClick = { scope.launch { busy = true; container.fitnessPlansRepository.updateEnrollment(enrollment.id, "ACCEPTED").onSuccess { refresh() }.onFailure { error = it.message }; busy = false } }) { Text(stringResource(R.string.fit_auto_d7e02c92)) }
                        TextButton(enabled = !busy, onClick = { scope.launch { busy = true; container.fitnessPlansRepository.updateEnrollment(enrollment.id, "REJECTED").onSuccess { refresh() }.onFailure { error = it.message }; busy = false } }) { Text(stringResource(R.string.fit_auto_b7dee974)) }
                    }
                    if (coachMode && enrollment.status == "ACCEPTED") TextButton(enabled = !busy, onClick = { scope.launch { busy = true; container.fitnessPlansRepository.updateEnrollment(enrollment.id, "COMPLETED").onSuccess { refresh() }.onFailure { error = it.message }; busy = false } }) { Text(stringResource(R.string.fit_auto_dfdf1a42)) }
                    if (!coachMode && enrollment.status == "REQUESTED") {
                        Text(stringResource(R.string.fit_auto_514b56ff), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        TextButton(enabled = !busy, onClick = { scope.launch { busy = true; container.fitnessPlansRepository.cancelEnrollment(enrollment.id).onSuccess { refresh() }.onFailure { error = it.message }; busy = false } }) { Text(stringResource(R.string.fit_auto_e06a23ff)) }
                    }
                }
            }
        }
    }
}
