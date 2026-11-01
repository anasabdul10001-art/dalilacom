package com.dalilacom.app.ui.profile

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.dalilacom.app.data.AppContainer
import com.dalilacom.app.data.network.FitnessPlanBody
import com.dalilacom.app.data.network.FitnessProgressBody
import com.dalilacom.app.ui.common.DocumentPrinter
import kotlinx.coroutines.launch

@Composable
fun FitnessPlansScreen(container: AppContainer, onBack: () -> Unit) {
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val role by container.sessionStore.roleFlow.collectAsState(initial = null)
    val coachMode = role == "MERCHANT"
    var items by remember { mutableStateOf<List<com.dalilacom.app.data.network.FitnessPlanDto>>(emptyList()) }
    var email by remember { mutableStateOf("") }
    var title by remember { mutableStateOf("") }
    var details by remember { mutableStateOf("") }
    var notes by remember { mutableStateOf("") }
    var kind by remember { mutableStateOf("WORKOUT") }
    var weight by remember { mutableStateOf("") }
    var progressNote by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    fun refresh() {
        scope.launch {
            busy = true
            val result = if (coachMode) container.fitnessPlansRepository.coachPlans() else container.fitnessPlansRepository.myPlans()
            result.onSuccess { items = it }.onFailure { error = it.message }
            busy = false
        }
    }
    LaunchedEffect(coachMode) { refresh() }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).imePadding().padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        TextButton(onClick = onBack) { Text("رجوع") }
        Text(if (coachMode) "خطط المتدربين" else "خططي الرياضية والغذائية", style = MaterialTheme.typography.headlineSmall)
        Text("الخطط خاصة بين المدرب والمتدرب، ولا يراها الآخرون.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        if (busy && items.isEmpty()) CircularProgressIndicator()
        if (coachMode) {
            OutlinedTextField(email, { email = it }, Modifier.fillMaxWidth(), label = { Text("بريد المتدرب المسجل") }, singleLine = true)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChip(selected = kind == "WORKOUT", onClick = { kind = "WORKOUT" }, label = { Text("تمارين") })
                FilterChip(selected = kind == "NUTRITION", onClick = { kind = "NUTRITION" }, label = { Text("تغذية") })
            }
            OutlinedTextField(title, { title = it }, Modifier.fillMaxWidth(), label = { Text("اسم الخطة") }, singleLine = true)
            OutlinedTextField(details, { details = it }, Modifier.fillMaxWidth(), label = { Text("التفاصيل، كل تمرين أو وجبة بسطر") }, minLines = 5)
            OutlinedTextField(notes, { notes = it }, Modifier.fillMaxWidth(), label = { Text("ملاحظات") }, minLines = 2)
            Button(enabled = !busy && email.contains("@") && title.length >= 2 && details.isNotBlank(), onClick = {
                scope.launch {
                    busy = true
                    error = null
                    container.fitnessPlansRepository.create(FitnessPlanBody(email.trim(), kind, title.trim(), details.lines().map(String::trim).filter(String::isNotBlank), notes.trim().ifBlank { null }))
                        .onSuccess { email = ""; title = ""; details = ""; notes = ""; refresh() }
                        .onFailure { error = it.message }
                    busy = false
                }
            }, modifier = Modifier.fillMaxWidth()) { Text("إرسال الخطة") }
        }
        items.forEach { plan ->
            ElevatedCard(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(7.dp)) {
                    Text(plan.title, style = MaterialTheme.typography.titleMedium)
                    Text(if (plan.kind == "WORKOUT") "خطة تمارين" else "خطة غذائية", style = MaterialTheme.typography.labelMedium)
                    Text(if (coachMode) plan.trainee?.fullName.orEmpty() + " · " + plan.trainee?.email.orEmpty() else plan.coach?.fitnessProfile?.displayName ?: plan.coach?.businessName.orEmpty())
                    plan.details.forEach { Text("• " + it) }
                    plan.notes?.takeIf { it.isNotBlank() }?.let { Text(it, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                    OutlinedButton(onClick = { scope.launch { DocumentPrinter.export(context, container.tokenStore, "/fitness-plans/" + plan.id + "/print", "Dalilacom - " + plan.title) } }) { Text("📄 حفظ الخطة PDF") }
                    if (!coachMode) {
                        plan.progress.forEach { entry -> Text(entry.completedAt.take(10) + " · " + (entry.weightKg?.toString() ?: "") + " كغ · " + (entry.note ?: ""), style = MaterialTheme.typography.bodySmall) }
                        OutlinedTextField(weight, { weight = it.filter { c -> c.isDigit() || c == '.' } }, Modifier.fillMaxWidth(), label = { Text("الوزن بالكيلوغرام") }, singleLine = true)
                        OutlinedTextField(progressNote, { progressNote = it }, Modifier.fillMaxWidth(), label = { Text("ملاحظة عن التقدم") })
                        Button(onClick = {
                            scope.launch {
                                container.fitnessPlansRepository.progress(plan.id, FitnessProgressBody(weight.toDoubleOrNull(), progressNote.trim().ifBlank { null }))
                                    .onSuccess { weight = ""; progressNote = ""; refresh() }
                                    .onFailure { error = it.message }
                            }
                        }) { Text("تسجيل التقدم") }
                    } else if (plan.progress.isNotEmpty()) {
                        HorizontalDivider()
                        Text("متابعة المتدرب", style = MaterialTheme.typography.titleSmall)
                        plan.progress.forEach { entry -> Text(entry.completedAt.take(10) + " · " + (entry.weightKg?.toString() ?: "") + " كغ · " + (entry.note ?: ""), style = MaterialTheme.typography.bodySmall) }
                    }
                }
            }
        }
        if (!busy && items.isEmpty()) Text("ما في خطط لعرضها حاليًا.", color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
