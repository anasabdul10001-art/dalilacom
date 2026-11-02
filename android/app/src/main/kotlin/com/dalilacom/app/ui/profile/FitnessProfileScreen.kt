package com.dalilacom.app.ui.profile

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.dalilacom.app.R
import com.dalilacom.app.data.AppContainer
import com.dalilacom.app.data.network.FitnessProfileBody
import com.dalilacom.app.data.network.FitnessProfileDto
import kotlinx.coroutines.launch

@Composable
fun FitnessProfileScreen(container: AppContainer, onBack: () -> Unit) {
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    var profile by remember { mutableStateOf<FitnessProfileDto?>(null) }
    var loading by remember { mutableStateOf(true) }
    var saving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var displayName by remember { mutableStateOf("") }
    var headline by remember { mutableStateOf("") }
    var years by remember { mutableStateOf("") }
    var specialties by remember { mutableStateOf("") }
    var achievements by remember { mutableStateOf("") }
    var certifications by remember { mutableStateOf("") }
    var certificatePhotoIds by remember { mutableStateOf<List<String>>(emptyList()) }
    var paymentAccountName by remember { mutableStateOf("") }
    var syriatelCash by remember { mutableStateOf("") }
    var mtnCash by remember { mutableStateOf("") }
    var shamCash by remember { mutableStateOf("") }
    var offers by remember { mutableStateOf<List<com.dalilacom.app.data.network.FitnessOfferDto>>(emptyList()) }
    var offerTitle by remember { mutableStateOf("") }
    var offerDescription by remember { mutableStateOf("") }
    var offerMonths by remember { mutableStateOf("1") }
    var offerPrice by remember { mutableStateOf("") }
    var offerCurrency by remember { mutableStateOf("USD") }
    val picker = com.dalilacom.app.ui.common.rememberPhotoPicker { uri ->
        scope.launch {
            val bytes = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.Default) { com.dalilacom.app.ui.common.ImageUtil.maxJpeg(context, uri) } ?: return@launch
            container.merchantRepository.uploadFitnessCertificate(bytes).onSuccess { photo ->
                if (certificatePhotoIds.size < 12) certificatePhotoIds = certificatePhotoIds + photo.id
                else android.widget.Toast.makeText(context, "الحد الأعلى 12 صورة", android.widget.Toast.LENGTH_SHORT).show()
            }.onFailure { error = it.message }
        }
    }

    LaunchedEffect(Unit) {
        container.merchantRepository.fitnessOffers().onSuccess { offers = it }
        container.merchantRepository.getFitnessProfile().onSuccess { result ->
            profile = result
            displayName = result.displayName.orEmpty()
            headline = result.headline.orEmpty()
            years = result.yearsExperience?.toString().orEmpty()
            specialties = result.specialties.joinToString("\n")
            achievements = result.achievements.joinToString("\n")
            certifications = result.certifications.joinToString("\n")
            certificatePhotoIds = result.certificationPhotoIds
            paymentAccountName = result.paymentAccountName.orEmpty()
            syriatelCash = result.syriatelCash.orEmpty()
            mtnCash = result.mtnCash.orEmpty()
            shamCash = result.shamCash.orEmpty()
        }.onFailure { error = it.message }
        loading = false
    }

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        TextButton(onClick = onBack) { Text(stringResource(R.string.care_back)) }
        Text(stringResource(R.string.fitness_profile), style = MaterialTheme.typography.headlineSmall)
        Text(stringResource(R.string.fitness_profile_subtitle), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (loading) CircularProgressIndicator()
        error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        if (!loading && profile != null) {
            OutlinedTextField(displayName, { displayName = it.take(80) }, label = { Text(stringResource(R.string.fitness_display_name)) }, modifier = Modifier.fillMaxWidth(), singleLine = true)
            OutlinedTextField(headline, { headline = it.take(160) }, label = { Text(stringResource(R.string.fitness_headline)) }, modifier = Modifier.fillMaxWidth(), minLines = 2)
            OutlinedTextField(years, { years = it.filter(Char::isDigit).take(2) }, label = { Text(stringResource(R.string.fitness_years)) }, modifier = Modifier.fillMaxWidth(), singleLine = true)
            OutlinedTextField(specialties, { specialties = it }, label = { Text(stringResource(R.string.fitness_specialties)) }, supportingText = { Text(stringResource(R.string.fitness_list_help)) }, modifier = Modifier.fillMaxWidth(), minLines = 3)
            OutlinedTextField(achievements, { achievements = it }, label = { Text(stringResource(R.string.fitness_achievements)) }, supportingText = { Text(stringResource(R.string.fitness_list_help)) }, modifier = Modifier.fillMaxWidth(), minLines = 3)
            OutlinedTextField(certifications, { certifications = it }, label = { Text(stringResource(R.string.fitness_certifications)) }, supportingText = { Text(stringResource(R.string.fitness_certification_note)) }, modifier = Modifier.fillMaxWidth(), minLines = 3)
            Text("صور الشهادات والإنجازات", style = MaterialTheme.typography.titleSmall)
            Text("تظهر هذه الصور للزوار، لكنها لا تعني أن دليلكم تحقق من صحة الشهادة.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            OutlinedButton(onClick = picker.openGallery, enabled = certificatePhotoIds.size < 12, modifier = Modifier.fillMaxWidth()) { Text("📷 إضافة صورة شهادة أو إنجاز") }
            certificatePhotoIds.forEachIndexed { index, id ->
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("📜 صورة رقم " + (index + 1))
                    TextButton(onClick = { certificatePhotoIds = certificatePhotoIds.filterNot { it == id } }) { Text("حذف") }
                }
            }
            HorizontalDivider(Modifier.padding(vertical = 8.dp))
            Text("طرق الدفع واستلام الأجور", style = MaterialTheme.typography.titleLarge)
            Text("أضف حساباتك ليستطيع المتدرب تحويل الأجرة لك. ستظهر هذه البيانات للزوار في صفحة المدرب، والتحويل يتم خارج التطبيق.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            OutlinedTextField(paymentAccountName, { paymentAccountName = it.take(100) }, Modifier.fillMaxWidth(), label = { Text("اسم صاحب الحساب") }, singleLine = true)
            OutlinedTextField(syriatelCash, { syriatelCash = it.take(80) }, Modifier.fillMaxWidth(), label = { Text("رقم سيرياتل كاش") }, singleLine = true)
            OutlinedTextField(mtnCash, { mtnCash = it.take(80) }, Modifier.fillMaxWidth(), label = { Text("رقم MTN كاش") }, singleLine = true)
            OutlinedTextField(shamCash, { shamCash = it.take(80) }, Modifier.fillMaxWidth(), label = { Text("حساب شام كاش") }, singleLine = true)
            Button(enabled = !saving, onClick = {
                val body = FitnessProfileBody(displayName.trim().ifBlank { null }, headline.trim().ifBlank { null }, years.toIntOrNull()?.coerceAtMost(70), specialties.lines().map(String::trim).filter(String::isNotBlank).distinct().take(15), achievements.lines().map(String::trim).filter(String::isNotBlank).distinct().take(15), certifications.lines().map(String::trim).filter(String::isNotBlank).distinct().take(15), certificatePhotoIds, paymentAccountName.trim().ifBlank { null }, syriatelCash.trim().ifBlank { null }, mtnCash.trim().ifBlank { null }, shamCash.trim().ifBlank { null })
                scope.launch {
                    saving = true; error = null
                    container.merchantRepository.saveFitnessProfile(body).onSuccess { profile = it; android.widget.Toast.makeText(context, context.getString(R.string.fitness_saved), android.widget.Toast.LENGTH_SHORT).show() }.onFailure { error = it.message }
                    saving = false
                }
            }, modifier = Modifier.fillMaxWidth()) { Text(stringResource(if (saving) R.string.fitness_saving else R.string.fitness_save)) }
            HorizontalDivider(Modifier.padding(vertical = 12.dp))
            Text("باقات التدريب الشهرية", style = MaterialTheme.typography.titleLarge)
            Text("أضف سعرًا ومدة واضحة ليشاهد الزوار الباقات في ملفك.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            offers.forEach { offer ->
                ElevatedCard(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(12.dp)) {
                        Text(offer.title, style = MaterialTheme.typography.titleMedium)
                        Text(offer.durationMonths.toString() + " شهر · " + String.format("%,.2f", offer.priceCents / 100.0) + " " + offer.currency)
                        offer.description?.let { Text(it) }
                        TextButton(onClick = {
                            scope.launch { container.merchantRepository.deleteFitnessOffer(offer.id).onSuccess { offers = offers.filterNot { it.id == offer.id } }.onFailure { error = it.message } }
                        }) { Text("حذف الباقة") }
                    }
                }
            }
            OutlinedTextField(offerTitle, { offerTitle = it.take(100) }, Modifier.fillMaxWidth(), label = { Text("اسم الباقة") }, singleLine = true)
            OutlinedTextField(offerDescription, { offerDescription = it.take(1000) }, Modifier.fillMaxWidth(), label = { Text("ماذا تتضمن؟") }, minLines = 2)
            OutlinedTextField(offerMonths, { offerMonths = it.filter(Char::isDigit).take(2) }, Modifier.fillMaxWidth(), label = { Text("المدة بالأشهر") }, singleLine = true)
            OutlinedTextField(offerPrice, { offerPrice = it.filter { c -> c.isDigit() || c == '.' } }, Modifier.fillMaxWidth(), label = { Text("السعر") }, singleLine = true)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("USD", "SYP", "EUR", "TRY").forEach { code -> FilterChip(selected = offerCurrency == code, onClick = { offerCurrency = code }, label = { Text(code) }) }
            }
            Button(enabled = offerTitle.length >= 2 && !saving && (offerMonths.toIntOrNull()?.let { it in 1..24 } == true), onClick = {
                scope.launch {
                    saving = true
                    container.merchantRepository.createFitnessOffer(com.dalilacom.app.data.network.FitnessOfferBody(offerTitle.trim(), offerDescription.trim().ifBlank { null }, offerMonths.toInt(), ((offerPrice.toDoubleOrNull() ?: 0.0) * 100).toInt(), offerCurrency))
                        .onSuccess { offers = listOf(it) + offers; offerTitle = ""; offerDescription = ""; offerPrice = "" }
                        .onFailure { error = it.message }
                    saving = false
                }
            }, modifier = Modifier.fillMaxWidth()) { Text("إضافة الباقة") }
        }
    }
}
