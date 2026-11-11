package com.dalilacom.app.ui.store

import com.dalilacom.app.R
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.dalilacom.app.data.AppContainer
import com.dalilacom.app.data.network.CreateMarketplaceListingRequest
import com.dalilacom.app.data.network.MarketplaceListingDto
import com.dalilacom.app.data.network.MarketplaceStoreDto
import com.dalilacom.app.ui.common.formatCents
import com.dalilacom.app.ui.i18n.AppStrings
import coil.compose.AsyncImage
import kotlinx.coroutines.launch
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import java.io.ByteArrayOutputStream

@Composable
fun MarketplaceScreen(container: AppContainer, onBack: () -> Unit, onLogin: () -> Unit, onOpenStore: (String) -> Unit) {
    val en = AppStrings.language == "en"
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var items by remember { mutableStateOf<List<MarketplaceListingDto>>(emptyList()) }
    var mine by remember { mutableStateOf<List<MarketplaceListingDto>>(emptyList()) }
    var quota by remember { mutableStateOf<com.dalilacom.app.data.network.MarketplaceQuotaDto?>(null) }
    var plans by remember { mutableStateOf<List<com.dalilacom.app.data.network.MarketplacePlanDto>>(emptyList()) }
    var store by remember { mutableStateOf<MarketplaceStoreDto?>(null) }
    var storeName by remember { mutableStateOf("") }; var storeDescription by remember { mutableStateOf("") }
    var allowNew by remember { mutableStateOf(false) }; var signedIn by remember { mutableStateOf<Boolean?>(null) }
    var title by remember { mutableStateOf("") }; var description by remember { mutableStateOf("") }
    var price by remember { mutableStateOf("") }; var phone by remember { mutableStateOf("") }
    var photoUrl by remember { mutableStateOf<String?>(null) }
    var condition by remember { mutableStateOf("USED") }; var busy by remember { mutableStateOf(false) }; var message by remember { mutableStateOf("") }
    val photoPicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) scope.launch {
            busy = true
            val url = runCatching {
                val input = context.contentResolver.openInputStream(uri) ?: error("image")
                val original = input.use { BitmapFactory.decodeStream(it) } ?: error("image")
                val scale = minOf(1.0, 1280.0 / maxOf(original.width, original.height))
                val image = if (scale < 1) Bitmap.createScaledBitmap(original, (original.width * scale).toInt(), (original.height * scale).toInt(), true) else original
                val output = ByteArrayOutputStream(); image.compress(Bitmap.CompressFormat.JPEG, 85, output)
                container.marketplaceRepository.uploadPhoto(output.toByteArray())
            }.getOrNull()
            photoUrl = url; busy = false
            message = if (url != null) AppStrings.get(R.string.s_29c83806) else AppStrings.get(R.string.s_4810cb93)
        }
    }
    LaunchedEffect(Unit) {
        signedIn = container.tokenStore.getToken() != null
        container.marketplaceRepository.listings()?.let { items = it.listings }
        if (signedIn == true) container.marketplaceRepository.mine()?.let { mine = it.listings; quota = it.quota; plans = it.plans; store = it.store; storeName = it.store?.name.orEmpty(); storeDescription = it.store?.description.orEmpty() }
        container.marketplaceRepository.settings()?.let { allowNew = it.allowNewProducts }
    }
    Column(Modifier.fillMaxSize().padding(horizontal = 16.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            TextButton(onClick = onBack) { Text(AppStrings.get(R.string.s_fa9309cd)) }
            Text(AppStrings.get(R.string.s_e4b4c234), style = MaterialTheme.typography.titleLarge)
            Spacer(Modifier.width(48.dp))
        }
        LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp), contentPadding = PaddingValues(bottom = 20.dp)) {
            if (signedIn == true) {
                item {
                    if (store == null) {
                        Card(Modifier.fillMaxWidth()) { Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text(AppStrings.get(R.string.s_ac6aac42), style = MaterialTheme.typography.titleMedium)
                            Text(AppStrings.get(R.string.s_d4d43912))
                            OutlinedTextField(storeName, { storeName = it }, Modifier.fillMaxWidth(), label = { Text(AppStrings.get(R.string.s_e72dca5d)) }, singleLine = true)
                            OutlinedTextField(storeDescription, { storeDescription = it }, Modifier.fillMaxWidth(), label = { Text(AppStrings.get(R.string.s_886333f5)) }, minLines = 2)
                            Button(enabled = storeName.trim().length >= 2 && !busy, onClick = { busy = true; scope.launch { store = container.marketplaceRepository.saveStore(storeName.trim(), storeDescription.trim().ifBlank { null }); busy = false; message = if (store != null) AppStrings.get(R.string.s_2203e3d9) else AppStrings.get(R.string.s_01b266ff) } }, modifier = Modifier.fillMaxWidth()) { Text(AppStrings.get(R.string.s_13adebab)) }
                            if (message.isNotBlank()) Text(message, color = MaterialTheme.colorScheme.primary)
                        } }
                        return@item
                    }
                    Card(Modifier.fillMaxWidth()) { Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) { Text(store?.name.orEmpty(), style = MaterialTheme.typography.titleMedium); TextButton(onClick = { store?.id?.let(onOpenStore) }) { Text(AppStrings.get(R.string.s_d7e8f7da)) } }
                        Text(AppStrings.get(R.string.s_0ee0b71f), style = MaterialTheme.typography.titleMedium)
                        val q = quota
                        if (q != null) Text(AppStrings.get(R.string.s_23a79f17, q.remaining, q.freeLimit))
                        OutlinedTextField(title, { title = it }, Modifier.fillMaxWidth(), label = { Text(AppStrings.get(R.string.s_df644ae1)) }, singleLine = true)
                        OutlinedTextField(description, { description = it }, Modifier.fillMaxWidth(), label = { Text(AppStrings.get(R.string.s_b5a7adde)) }, minLines = 2)
                        OutlinedTextField(price, { price = it }, Modifier.fillMaxWidth(), label = { Text(AppStrings.get(R.string.s_3601146c)) }, singleLine = true)
                        OutlinedTextField(phone, { phone = it }, Modifier.fillMaxWidth(), label = { Text(AppStrings.get(R.string.s_5e7ac625)) }, singleLine = true)
                        OutlinedButton(onClick = { photoPicker.launch("image/*") }, enabled = !busy, modifier = Modifier.fillMaxWidth()) { Text(if (photoUrl != null) AppStrings.get(R.string.s_fe3ac683) else AppStrings.get(R.string.s_c5cd4e00)) }
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            FilterChip(selected = condition == "USED", onClick = { condition = "USED" }, label = { Text(AppStrings.get(R.string.s_019d1ca7)) })
                            if (allowNew || q?.paid == true) FilterChip(selected = condition == "NEW", onClick = { condition = "NEW" }, label = { Text(AppStrings.get(R.string.s_03c2e7e4)) })
                        }
                        if (q != null && q.remaining == 0 && !q.paid) {
                            Text(AppStrings.get(R.string.s_9cd5d5cd))
                            plans.forEach { plan -> OutlinedButton(onClick = { busy = true; scope.launch { val r = container.marketplaceRepository.subscribe(plan.id); busy = false; message = r.exceptionOrNull()?.message ?: AppStrings.get(R.string.s_a1272e5c); container.marketplaceRepository.mine()?.let { quota = it.quota; plans = it.plans } } }, modifier = Modifier.fillMaxWidth()) { Text("${plan.name} · ${plan.priceCredits ?: "—"} ${AppStrings.get(R.string.s_928735d6)}") } }
                        }
                        Button(enabled = !busy && title.trim().length >= 2 && (price.toDoubleOrNull() ?: 0.0) > 0, onClick = {
                            busy = true; message = ""
                            scope.launch {
                                val amount = ((price.toDoubleOrNull() ?: 0.0) * 100).toInt()
                                val result = container.marketplaceRepository.create(CreateMarketplaceListingRequest(title.trim(), description.trim().ifBlank { null }, amount, com.dalilacom.app.ui.common.Market.currency, condition, contactPhone = phone.trim().ifBlank { null }, imageUrl = photoUrl))
                                busy = false; message = result.exceptionOrNull()?.message ?: AppStrings.get(R.string.s_43b0c75a)
                                if (result.isSuccess) { title = ""; description = ""; price = ""; phone = ""; photoUrl = null; container.marketplaceRepository.mine()?.let { mine = it.listings; quota = it.quota; plans = it.plans } }
                            }
                        }, modifier = Modifier.fillMaxWidth()) { Text(if (busy) "…" else AppStrings.get(R.string.s_0b9aa735)) }
                        if (message.isNotBlank()) Text(message, color = MaterialTheme.colorScheme.primary)
                    } }
                }
                if (mine.isNotEmpty()) item { Text(AppStrings.get(R.string.s_985b09fd), style = MaterialTheme.typography.titleMedium) }
                items(mine, key = { "mine-${it.id}" }) { listing ->
                    Card(Modifier.fillMaxWidth()) { Row(Modifier.padding(12.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                        Column(Modifier.weight(1f)) {
                            Text(listing.title, style = MaterialTheme.typography.titleSmall)
                            Text(when (listing.status) { "PENDING_REVIEW" -> AppStrings.get(R.string.s_92e97e03); "REJECTED" -> AppStrings.get(R.string.s_bae1ccce); "ACTIVE" -> AppStrings.get(R.string.s_9b9d8a97); "SOLD" -> AppStrings.get(R.string.s_d85a8a38); else -> listing.status })
                            listing.reviewNote?.let { Text((AppStrings.get(R.string.s_94f37dcd)) + it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error) }
                        }
                        if (listing.status == "ACTIVE") TextButton(onClick = { scope.launch { if (container.marketplaceRepository.markSold(listing.id)) container.marketplaceRepository.mine()?.let { mine = it.listings } } }) { Text(AppStrings.get(R.string.s_d85a8a38)) }
                    } }
                }
            } else if (signedIn == false) item { Card(Modifier.fillMaxWidth()) { Column(Modifier.padding(14.dp)) { Text(AppStrings.get(R.string.s_9a7d8a0f)); Button(onClick = onLogin) { Text(AppStrings.get(R.string.s_b6d4223e)) } } } }
            item { Text(AppStrings.get(R.string.s_318421e6), style = MaterialTheme.typography.titleMedium) }
            items(items, key = { it.id }) { listing ->
                Card(Modifier.fillMaxWidth()) { Column(Modifier.padding(14.dp)) {
                    listing.imageUrl?.let { AsyncImage(model = it, contentDescription = listing.title, modifier = Modifier.fillMaxWidth().heightIn(max = 220.dp)) }
                    Text(listing.title, style = MaterialTheme.typography.titleMedium)
                    listing.description?.takeIf { it.isNotBlank() }?.let { Text(it) }
                    Text(formatCents(listing.priceCents) + " · " + if (listing.condition == "USED") AppStrings.get(R.string.s_019d1ca7) else AppStrings.get(R.string.s_03c2e7e4), color = MaterialTheme.colorScheme.primary)
                    listing.storeId?.let { storeId -> TextButton(onClick = { onOpenStore(storeId) }) { Text((AppStrings.get(R.string.s_72608e10)) + (listing.sellerName ?: "")) } }
                    listing.contactPhone?.let { Text((AppStrings.get(R.string.s_698d3436)) + it, style = MaterialTheme.typography.bodySmall) }
                } }
            }
            if (items.isEmpty()) item { Text(AppStrings.get(R.string.s_1bf1c6ab)) }
        }
    }
}
