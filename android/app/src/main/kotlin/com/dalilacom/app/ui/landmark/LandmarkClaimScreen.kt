package com.dalilacom.app.ui.landmark

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
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
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.text.KeyboardOptions
import com.dalilacom.app.R
import com.dalilacom.app.data.AppContainer
import com.dalilacom.app.data.network.ClaimStateDto
import com.dalilacom.app.data.network.LandmarkDto
import com.dalilacom.app.ui.common.Hint
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream

/** A photo from the gallery, shrunk to at most [maxSide] pixels and saved as JPEG (a proof photo is read, not printed). */
private fun shrunkJpeg(context: Context, uri: Uri, maxSide: Int = 1800): ByteArray? = runCatching {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    context.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
    var sample = 1
    while (maxOf(bounds.outWidth, bounds.outHeight) / sample > maxSide * 2) sample *= 2
    val bitmap = context.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample }) } ?: return@runCatching null
    val k = minOf(1f, maxSide.toFloat() / maxOf(bitmap.width, bitmap.height))
    val scaled = if (k < 1f) Bitmap.createScaledBitmap(bitmap, (bitmap.width * k).toInt(), (bitmap.height * k).toInt(), true) else bitmap
    ByteArrayOutputStream().also { scaled.compress(Bitmap.CompressFormat.JPEG, 85, it) }.toByteArray()
}.getOrNull()

/** "This place is mine": the form for a private place (a private hospital) with the photos of proof, and where the request stands. */
@Composable
fun LandmarkClaimScreen(container: AppContainer, landmarkId: String, onBack: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var place by remember { mutableStateOf<LandmarkDto?>(null) }
    var claim by remember { mutableStateOf<ClaimStateDto?>(null) }
    var loading by remember { mutableStateOf(true) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var role by remember { mutableStateOf("MANAGER") }
    var phone by remember { mutableStateOf("") }
    var note by remember { mutableStateOf("") }
    var photos by remember { mutableStateOf<List<Uri>>(emptyList()) }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.GetMultipleContents()) { uris -> photos = uris.take(5) }
    val needPhone = stringResource(R.string.lm_need_phone)
    val needPhoto = stringResource(R.string.lm_need_photo)
    val photoFailed = stringResource(R.string.lm_photo_failed)

    LaunchedEffect(landmarkId) {
        place = container.landmarkRepository.landmark(landmarkId)
        claim = container.landmarkRepository.myClaim(landmarkId)
        loading = false
    }

    /** Sends the photos one by one; returns an error text or null when all went. */
    suspend fun sendPhotos(claimId: String): String? {
        for ((i, uri) in photos.withIndex()) {
            val bytes = withContext(Dispatchers.IO) { shrunkJpeg(context, uri) } ?: return photoFailed
            container.landmarkRepository.upload(claimId, "proof-${i + 1}.jpg", bytes).onFailure { return it.message ?: photoFailed }
        }
        return null
    }

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        TextButton(onClick = onBack) { Text(stringResource(R.string.browse_close)) }
        Text(stringResource(R.string.lm_claim_title), style = MaterialTheme.typography.headlineSmall, color = MaterialTheme.colorScheme.primary)
        place?.let { Text(it.kind.icon + "  " + it.name, style = MaterialTheme.typography.titleMedium) }
        error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        when {
            loading -> CircularProgressIndicator()
            claim?.status == "PENDING" -> {
                Text("⏳ " + stringResource(R.string.lm_pending))
                OutlinedButton(onClick = { scope.launch { container.landmarkRepository.withdraw(claim!!.id).onSuccess { claim = null }.onFailure { error = it.message } } }) { Text(stringResource(R.string.lm_withdraw)) }
            }
            claim?.status == "APPROVED" -> Text("✅ " + stringResource(R.string.lm_approved))
            claim?.status == "NEEDS_INFO" -> {
                Text("❓ " + stringResource(R.string.lm_needs_info))
                Text(claim?.message.orEmpty(), style = MaterialTheme.typography.titleSmall)
                OutlinedButton(onClick = { picker.launch("image/*") }) { Text(stringResource(R.string.lm_add_photos) + if (photos.isNotEmpty()) " (${photos.size})" else "") }
                OutlinedTextField(note, { note = it }, label = { Text(stringResource(R.string.lm_note)) }, modifier = Modifier.fillMaxWidth(), placeholder = { Hint(stringResource(R.string.ph_note)) })
                Button(enabled = !busy, modifier = Modifier.fillMaxWidth(), onClick = {
                    scope.launch {
                        busy = true; error = null
                        val problem = sendPhotos(claim!!.id)
                        if (problem != null) error = problem
                        else container.landmarkRepository.resubmit(claim!!.id, note).onSuccess { claim = claim!!.copy(status = "PENDING") }.onFailure { error = it.message }
                        busy = false
                    }
                }) { Text(stringResource(R.string.lm_resend)) }
            }
            else -> {
                if (claim?.status == "REJECTED") Text(stringResource(R.string.lm_rejected) + " " + claim?.message.orEmpty(), color = MaterialTheme.colorScheme.error)
                Text(stringResource(R.string.lm_claim_intro), color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(stringResource(R.string.lm_role), style = MaterialTheme.typography.labelLarge)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilterChip(role == "MANAGER", { role = "MANAGER" }, label = { Text(stringResource(R.string.lm_role_manager)) })
                    FilterChip(role == "OWNER", { role = "OWNER" }, label = { Text(stringResource(R.string.lm_role_owner)) })
                    FilterChip(role == "AUTHORIZED", { role = "AUTHORIZED" }, label = { Text(stringResource(R.string.lm_role_authorized)) })
                }
                OutlinedTextField(phone, { phone = it }, label = { Text(stringResource(R.string.lm_phone)) }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone), modifier = Modifier.fillMaxWidth(), placeholder = { Hint(stringResource(R.string.ph_phone)) })
                OutlinedTextField(note, { note = it }, label = { Text(stringResource(R.string.lm_note)) }, modifier = Modifier.fillMaxWidth(), placeholder = { Hint(stringResource(R.string.ph_note)) })
                OutlinedButton(onClick = { picker.launch("image/*") }, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.lm_photos_btn) + if (photos.isNotEmpty()) " (${photos.size})" else "") }
                Spacer(Modifier.height(4.dp))
                Button(enabled = !busy, modifier = Modifier.fillMaxWidth(), onClick = {
                    if (phone.trim().length < 6) { error = needPhone; return@Button }
                    if (photos.isEmpty()) { error = needPhoto; return@Button }
                    scope.launch {
                        busy = true; error = null
                        container.landmarkRepository.submit(landmarkId, role, phone.trim(), note).onSuccess { id ->
                            val problem = sendPhotos(id)
                            if (problem != null) error = problem
                            claim = ClaimStateDto(id, "PENDING")
                        }.onFailure { error = it.message }
                        busy = false
                    }
                }) { Text(stringResource(R.string.lm_send)) }
                if (busy) CircularProgressIndicator()
            }
        }
    }
}
