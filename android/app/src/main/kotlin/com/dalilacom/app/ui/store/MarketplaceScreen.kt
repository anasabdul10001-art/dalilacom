package com.dalilacom.app.ui.store

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
            message = if (url != null) if (en) "Photo attached" else "تم إرفاق الصورة" else if (en) "Could not upload photo" else "تعذّر رفع الصورة"
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
            TextButton(onClick = onBack) { Text(if (en) "← Back" else "← رجوع") }
            Text(if (en) "Community market" else "سوق المستخدمين", style = MaterialTheme.typography.titleLarge)
            Spacer(Modifier.width(48.dp))
        }
        LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp), contentPadding = PaddingValues(bottom = 20.dp)) {
            if (signedIn == true) {
                item {
                    if (store == null) {
                        Card(Modifier.fillMaxWidth()) { Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text(if (en) "Open your own store" else "افتح متجرك الخاص", style = MaterialTheme.typography.titleMedium)
                            Text(if (en) "Choose a name, then add your products and share your store page." else "اختر اسماً لمتجرك، وبعدها أضف منتجاتك وشارك صفحته مع الناس.")
                            OutlinedTextField(storeName, { storeName = it }, Modifier.fillMaxWidth(), label = { Text(if (en) "Store name" else "اسم المتجر") }, singleLine = true)
                            OutlinedTextField(storeDescription, { storeDescription = it }, Modifier.fillMaxWidth(), label = { Text(if (en) "About the store (optional)" else "وصف المتجر (اختياري)") }, minLines = 2)
                            Button(enabled = storeName.trim().length >= 2 && !busy, onClick = { busy = true; scope.launch { store = container.marketplaceRepository.saveStore(storeName.trim(), storeDescription.trim().ifBlank { null }); busy = false; message = if (store != null) if (en) "Your store is open" else "تم إنشاء متجرك" else if (en) "Could not create store" else "تعذّر إنشاء المتجر" } }, modifier = Modifier.fillMaxWidth()) { Text(if (en) "Open store" else "إنشاء المتجر") }
                            if (message.isNotBlank()) Text(message, color = MaterialTheme.colorScheme.primary)
                        } }
                        return@item
                    }
                    Card(Modifier.fillMaxWidth()) { Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) { Text(store?.name.orEmpty(), style = MaterialTheme.typography.titleMedium); TextButton(onClick = { store?.id?.let(onOpenStore) }) { Text(if (en) "View my store" else "عرض متجري") } }
                        Text(if (en) "Post an item" else "أضف منتج للبيع", style = MaterialTheme.typography.titleMedium)
                        val q = quota
                        if (q != null) Text(if (en) "Free ads left this month: ${q.remaining} / ${q.freeLimit}" else "الإعلانات المجانية المتبقية هذا الشهر: ${q.remaining} من ${q.freeLimit}")
                        OutlinedTextField(title, { title = it }, Modifier.fillMaxWidth(), label = { Text(if (en) "Product name" else "اسم المنتج") }, singleLine = true)
                        OutlinedTextField(description, { description = it }, Modifier.fillMaxWidth(), label = { Text(if (en) "Description" else "وصف المنتج") }, minLines = 2)
                        OutlinedTextField(price, { price = it }, Modifier.fillMaxWidth(), label = { Text(if (en) "Price" else "السعر") }, singleLine = true)
                        OutlinedTextField(phone, { phone = it }, Modifier.fillMaxWidth(), label = { Text(if (en) "Contact phone (optional)" else "رقم للتواصل (اختياري)") }, singleLine = true)
                        OutlinedButton(onClick = { photoPicker.launch("image/*") }, enabled = !busy, modifier = Modifier.fillMaxWidth()) { Text(if (photoUrl != null) if (en) "Photo attached ✓" else "الصورة مرفقة ✓" else if (en) "Add product photo" else "إضافة صورة للمنتج") }
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            FilterChip(selected = condition == "USED", onClick = { condition = "USED" }, label = { Text(if (en) "Used" else "مستعمل") })
                            if (allowNew || q?.paid == true) FilterChip(selected = condition == "NEW", onClick = { condition = "NEW" }, label = { Text(if (en) "New" else "جديد") })
                        }
                        if (q != null && q.remaining == 0 && !q.paid) {
                            Text(if (en) "Choose an existing store package to continue." else "وصلت للحد المجاني. اختر باقة من باقات المتجر للمتابعة.")
                            plans.forEach { plan -> OutlinedButton(onClick = { busy = true; scope.launch { val r = container.marketplaceRepository.subscribe(plan.id); busy = false; message = r.exceptionOrNull()?.message ?: if (en) "Package activated" else "تم تفعيل الباقة"; container.marketplaceRepository.mine()?.let { quota = it.quota; plans = it.plans } } }, modifier = Modifier.fillMaxWidth()) { Text("${plan.name} · ${plan.priceCredits ?: "—"} ${if (en) "credits" else "رصيد"}") } }
                        }
                        Button(enabled = !busy && title.trim().length >= 2 && (price.toDoubleOrNull() ?: 0.0) > 0, onClick = {
                            busy = true; message = ""
                            scope.launch {
                                val amount = ((price.toDoubleOrNull() ?: 0.0) * 100).toInt()
                                val result = container.marketplaceRepository.create(CreateMarketplaceListingRequest(title.trim(), description.trim().ifBlank { null }, amount, com.dalilacom.app.ui.common.Market.currency, condition, contactPhone = phone.trim().ifBlank { null }, imageUrl = photoUrl))
                                busy = false; message = result.exceptionOrNull()?.message ?: if (en) "Sent for review" else "تم إرسال إعلانك للمراجعة"
                                if (result.isSuccess) { title = ""; description = ""; price = ""; phone = ""; photoUrl = null; container.marketplaceRepository.mine()?.let { mine = it.listings; quota = it.quota; plans = it.plans } }
                            }
                        }, modifier = Modifier.fillMaxWidth()) { Text(if (busy) "…" else if (en) "Send for review" else "إرسال للمراجعة") }
                        if (message.isNotBlank()) Text(message, color = MaterialTheme.colorScheme.primary)
                    } }
                }
                if (mine.isNotEmpty()) item { Text(if (en) "My ads" else "إعلاناتي", style = MaterialTheme.typography.titleMedium) }
                items(mine, key = { "mine-${it.id}" }) { listing ->
                    Card(Modifier.fillMaxWidth()) { Row(Modifier.padding(12.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                        Column(Modifier.weight(1f)) {
                            Text(listing.title, style = MaterialTheme.typography.titleSmall)
                            Text(when (listing.status) { "PENDING_REVIEW" -> if (en) "Waiting for review" else "بانتظار المراجعة"; "REJECTED" -> if (en) "Rejected by AI" else "مرفوض بعد مراجعة الذكاء الاصطناعي"; "ACTIVE" -> if (en) "Published" else "منشور"; "SOLD" -> if (en) "Sold" else "مباع"; else -> listing.status })
                            listing.reviewNote?.let { Text((if (en) "Reason: " else "السبب: ") + it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error) }
                        }
                        if (listing.status == "ACTIVE") TextButton(onClick = { scope.launch { if (container.marketplaceRepository.markSold(listing.id)) container.marketplaceRepository.mine()?.let { mine = it.listings } } }) { Text(if (en) "Sold" else "تم البيع") }
                    } }
                }
            } else if (signedIn == false) item { Card(Modifier.fillMaxWidth()) { Column(Modifier.padding(14.dp)) { Text(if (en) "Sign in to post an item" else "سجّل دخولك لتضيف إعلاناً"); Button(onClick = onLogin) { Text(if (en) "Sign in" else "تسجيل الدخول") } } } }
            item { Text(if (en) "Latest items" else "أحدث المنتجات", style = MaterialTheme.typography.titleMedium) }
            items(items, key = { it.id }) { listing ->
                Card(Modifier.fillMaxWidth()) { Column(Modifier.padding(14.dp)) {
                    listing.imageUrl?.let { AsyncImage(model = it, contentDescription = listing.title, modifier = Modifier.fillMaxWidth().heightIn(max = 220.dp)) }
                    Text(listing.title, style = MaterialTheme.typography.titleMedium)
                    listing.description?.takeIf { it.isNotBlank() }?.let { Text(it) }
                    Text(formatCents(listing.priceCents) + " · " + if (listing.condition == "USED") if (en) "Used" else "مستعمل" else if (en) "New" else "جديد", color = MaterialTheme.colorScheme.primary)
                    listing.storeId?.let { storeId -> TextButton(onClick = { onOpenStore(storeId) }) { Text((if (en) "Store: " else "المتجر: ") + (listing.sellerName ?: "")) } }
                    listing.contactPhone?.let { Text((if (en) "Contact: " else "للتواصل: ") + it, style = MaterialTheme.typography.bodySmall) }
                } }
            }
            if (items.isEmpty()) item { Text(if (en) "No listings yet" else "ما في إعلانات منشورة حالياً") }
        }
    }
}
