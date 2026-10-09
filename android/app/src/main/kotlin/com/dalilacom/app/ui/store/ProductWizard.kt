package com.dalilacom.app.ui.store

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.speech.RecognizerIntent
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.dalilacom.app.R
import com.dalilacom.app.data.AppContainer
import com.dalilacom.app.data.network.CreateProductRequest
import com.dalilacom.app.data.network.SpecDto
import com.dalilacom.app.data.network.StoreSectionDto
import com.dalilacom.app.data.repository.ProductRepository
import com.dalilacom.app.data.repository.StoreRepository
import com.dalilacom.app.ui.common.ImageUtil
import com.dalilacom.app.ui.common.formatCents
import com.dalilacom.app.ui.common.rememberPhotoPicker
import com.dalilacom.app.ui.i18n.AppStrings
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import android.graphics.BitmapFactory

/** One photo that was uploaded: where it lives on the server and the bytes to show it now. */
data class WizPhoto(val url: String, val id: String, val bytes: ByteArray, val enhanced: Boolean = false)

data class WizardUi(
    val step: String = "photos", // photos | analyzing | form | done
    val photos: List<WizPhoto> = emptyList(),
    val uploading: Boolean = false,
    val sections: List<StoreSectionDto> = emptyList(),
    val aiAvailable: Boolean? = null,
    val name: String = "",
    val alternatives: List<String> = emptyList(),
    val section: String = "",
    val condition: String = "NEW",
    val description: String = "",
    val specs: List<SpecDto> = emptyList(),
    val price: String = "",
    val stock: String = "",
    val enhancing: Int? = null,
    val needShipping: Boolean = false,
    val hintMin: Int? = null,
    val hintMax: Int? = null,
    val busy: Boolean = false,
    val error: String? = null,
    val createdId: String? = null,
)

class ProductWizardViewModel(private val store: StoreRepository, private val products: ProductRepository, private val merchant: com.dalilacom.app.data.repository.MerchantRepository) : ViewModel() {
    private val _ui = MutableStateFlow(WizardUi())
    val ui: StateFlow<WizardUi> = _ui.asStateFlow()

    init {
        viewModelScope.launch { _ui.update { it.copy(sections = store.allSections()) } }
    }

    fun reset() = _ui.update { WizardUi(sections = it.sections) }

    fun addPhoto(bytes: ByteArray?) {
        if (bytes == null) { _ui.update { it.copy(error = AppStrings.get(R.string.photo_failed)) }; return }
        _ui.update { it.copy(uploading = true, error = null) }
        viewModelScope.launch {
            store.uploadProductPhoto(bytes)
                .onSuccess { p -> _ui.update { it.copy(uploading = false, photos = it.photos + WizPhoto(p.url, p.id, bytes)) } }
                .onFailure { e -> _ui.update { it.copy(uploading = false, error = e.message) } }
        }
    }

    /** A cleaned-up copy of the photo (white square, centred, even light) that suits Google and the image-reading algorithms. */
    fun enhance(i: Int) {
        val p = _ui.value.photos.getOrNull(i) ?: return
        if (p.enhanced || _ui.value.enhancing != null) return
        _ui.update { it.copy(enhancing = i, error = null) }
        viewModelScope.launch {
            store.enhancePhoto(p.id)
                .onSuccess { better -> _ui.update { s -> s.copy(enhancing = null, photos = s.photos.mapIndexed { k, x -> if (k == i) WizPhoto(better.url, better.id, x.bytes, enhanced = true) else x }) } }
                .onFailure { e -> _ui.update { it.copy(enhancing = null, error = e.message) } }
        }
    }

    fun enhanceAll() {
        viewModelScope.launch {
            for (i in _ui.value.photos.indices) {
                val p = _ui.value.photos.getOrNull(i) ?: continue
                if (p.enhanced) continue
                _ui.update { it.copy(enhancing = i, error = null) }
                store.enhancePhoto(p.id)
                    .onSuccess { better -> _ui.update { s -> s.copy(photos = s.photos.mapIndexed { k, x -> if (k == i) WizPhoto(better.url, better.id, x.bytes, enhanced = true) else x }) } }
                    .onFailure { e -> _ui.update { it.copy(error = e.message) } }
            }
            _ui.update { it.copy(enhancing = null) }
        }
    }

    fun removePhoto(i: Int) = _ui.update { it.copy(photos = it.photos.filterIndexed { k, _ -> k != i }) }

    fun analyze() {
        val first = _ui.value.photos.firstOrNull() ?: return
        _ui.update { it.copy(step = "analyzing", error = null) }
        viewModelScope.launch {
            val r = store.aiDraft(first.id)
            val d = r?.draft
            _ui.update {
                it.copy(
                    step = "form",
                    aiAvailable = r?.available ?: false,
                    hintMin = r?.priceHint?.min, hintMax = r?.priceHint?.max,
                    name = d?.name ?: it.name,
                    alternatives = d?.alternatives ?: emptyList(),
                    description = d?.description ?: it.description,
                    specs = d?.specs ?: it.specs,
                    section = d?.section ?: it.section,
                    condition = d?.condition ?: it.condition,
                    error = if (r?.available == true && d == null) AppStrings.get(R.string.wiz_ai_miss) else null,
                )
            }
        }
    }

    fun setName(v: String) = _ui.update { it.copy(name = v) }
    fun setDescription(v: String) = _ui.update { it.copy(description = v) }
    fun setPrice(v: String) = _ui.update { it.copy(price = v) }
    fun setSection(v: String) = _ui.update { it.copy(section = v) }
    fun setCondition(v: String) = _ui.update { it.copy(condition = v) }
    fun setStock(v: String) = _ui.update { it.copy(stock = v.filter(Char::isDigit).take(6)) }
    fun addSpec() = _ui.update { it.copy(specs = it.specs + SpecDto("", "")) }
    fun setSpec(i: Int, label: String?, value: String?) = _ui.update { s -> s.copy(specs = s.specs.mapIndexed { k, x -> if (k == i) SpecDto(label ?: x.label, value ?: x.value) else x }) }
    fun removeSpec(i: Int) = _ui.update { s -> s.copy(specs = s.specs.filterIndexed { k, _ -> k != i }) }

    /** No AI needed: a plain sentence from what was chosen, for a shop that would rather not write. */
    fun autoDescription() {
        val s = _ui.value
        if (s.name.isBlank()) { _ui.update { it.copy(error = AppStrings.get(R.string.wiz_need_name)) }; return }
        val cond = AppStrings.get(if (s.condition == "USED") R.string.wiz_cond_used else R.string.wiz_cond_new)
        val parts = mutableListOf(AppStrings.get(R.string.wiz_auto_line, s.name, cond))
        s.specs.filter { it.label.isNotBlank() && it.value.isNotBlank() }.forEach { parts += "${it.label}: ${it.value}." }
        _ui.update { it.copy(description = parts.joinToString(" "), error = null) }
    }

    fun publish() {
        val s = _ui.value
        val price = s.price.replace(",", ".").toDoubleOrNull()
        when {
            s.name.isBlank() -> { _ui.update { it.copy(error = AppStrings.get(R.string.wiz_need_name)) }; return }
            s.section.isBlank() -> { _ui.update { it.copy(error = AppStrings.get(R.string.wiz_need_section)) }; return }
            price == null || price <= 0 -> { _ui.update { it.copy(error = AppStrings.get(R.string.wiz_need_price)) }; return }
            (s.stock.toIntOrNull() ?: 0) < 1 -> { _ui.update { it.copy(error = AppStrings.get(R.string.wiz_need_stock)) }; return }
        }
        _ui.update { it.copy(busy = true, error = null, needShipping = false) }
        viewModelScope.launch {
            // the shop's shipping methods come first
            if (merchant.shippingMethods().isEmpty()) {
                _ui.update { it.copy(busy = false, needShipping = true, error = AppStrings.get(R.string.ship_need)) }
                return@launch
            }
            val request = CreateProductRequest(
                name = s.name.trim(),
                description = s.description.trim().ifBlank { null },
                priceCents = Math.round(price!! * 100).toInt(),
                stock = s.stock.toInt(),
                storeSection = s.section,
                condition = s.condition,
                images = s.photos.map { it.url },
                specs = s.specs.filter { it.label.isNotBlank() && it.value.isNotBlank() }.map { SpecDto(it.label.trim(), it.value.trim()) },
            )
            products.createProduct(request)
                .onSuccess { p -> _ui.update { it.copy(busy = false, step = "done", createdId = p.id) } }
                .onFailure { e -> _ui.update { it.copy(busy = false, error = e.message) } }
        }
    }
}

@Composable
fun ProductWizardScreen(container: AppContainer, onBack: () -> Unit, onManual: () -> Unit, onOpenProduct: (String) -> Unit, onOpenShipping: () -> Unit = {}, onBackToShop: () -> Unit = {}, onBackToAccount: () -> Unit = {}) {
    val vm: ProductWizardViewModel = viewModel(factory = viewModelFactory { initializer { ProductWizardViewModel(container.storeRepository, container.productRepository, container.merchantRepository) } })
    val ui by vm.ui.collectAsState()
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    val picker = rememberPhotoPicker { uri: Uri -> scope.launch { vm.addPhoto(withContext(Dispatchers.Default) { ImageUtil.maxJpeg(context, uri) }) } }

    // speaking a field instead of typing it
    var voiceField by androidx.compose.runtime.remember { androidx.compose.runtime.mutableStateOf("") }
    val speech = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        if (result.resultCode == Activity.RESULT_OK) {
            val said = result.data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)?.firstOrNull().orEmpty()
            if (said.isNotBlank()) when (voiceField) {
                "name" -> vm.setName((ui.name + " " + said).trim())
                "description" -> vm.setDescription((ui.description + " " + said).trim())
            }
        }
    }
    fun listen(field: String) {
        voiceField = field
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, if (AppStrings.language == "ar") "ar-SY" else "en-US")
        }
        runCatching { speech.launch(intent) }.onFailure { Toast.makeText(context, context.getString(R.string.wiz_no_voice), Toast.LENGTH_SHORT).show() }
    }

    val stepNo = when (ui.step) { "photos" -> 1; "analyzing" -> 2; else -> 3 }
    Column(Modifier.fillMaxSize()) {
        TextButton(onClick = onBack, modifier = Modifier.padding(start = 8.dp, top = 8.dp)) { Text("‹  " + stringResource(R.string.store_back)) }
        Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            repeat(3) { n -> Box(Modifier.weight(1f).height(5.dp).clip(RoundedCornerShape(3.dp)).background(if (n < stepNo) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant)) }
        }
        when (ui.step) {
            "photos" -> PhotosStep(ui, vm, picker.openCamera, picker.openGallery, onManual)
            "analyzing" -> Column(Modifier.fillMaxSize().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                CircularProgressIndicator()
                Spacer(Modifier.height(16.dp))
                Text(stringResource(R.string.wiz_analyzing), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                Text(stringResource(R.string.wiz_analyzing_sub), color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            "done" -> Column(Modifier.fillMaxSize().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                Text("🎉", fontSize = 72.sp)
                Text(stringResource(R.string.wiz_done_title), style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.ExtraBold)
                Text(stringResource(R.string.wiz_done_sub), color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.height(20.dp))
                Button(onClick = vm::reset, shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth().height(52.dp)) { Text("📷  " + stringResource(R.string.wiz_another)) }
                Spacer(Modifier.height(10.dp))
                OutlinedButton(onClick = { ui.createdId?.let(onOpenProduct) }, shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth().height(52.dp)) { Text(stringResource(R.string.wiz_view_it)) }
                Spacer(Modifier.height(10.dp))
                OutlinedButton(onClick = onBackToShop, shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth().height(52.dp)) { Text("🏪  " + stringResource(R.string.wiz_back_to_shop)) }
                Spacer(Modifier.height(10.dp))
                TextButton(onClick = onBackToAccount, modifier = Modifier.fillMaxWidth().height(48.dp)) { Text("👤  " + stringResource(R.string.wiz_back_to_account)) }
            }
            else -> FormStep(ui, vm, ::listen, onOpenShipping)
        }
    }
}

@Composable
private fun PhotosStep(ui: WizardUi, vm: ProductWizardViewModel, camera: () -> Unit, gallery: () -> Unit, onManual: () -> Unit) {
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(stringResource(R.string.wiz_photo_title), style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.ExtraBold)
        Text(stringResource(R.string.wiz_photo_sub), color = MaterialTheme.colorScheme.onSurfaceVariant)
        val tiles = ui.photos.mapIndexed { i, p -> i to p }
        tiles.chunked(2).forEach { pair ->
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                pair.forEach { (i, p) ->
                    Box(Modifier.weight(1f).aspectRatio(1f).clip(RoundedCornerShape(14.dp))) {
                        val bmp = androidx.compose.runtime.remember(p.id) { BitmapFactory.decodeByteArray(p.bytes, 0, p.bytes.size)?.asImageBitmap() }
                        if (p.enhanced) coil.compose.AsyncImage(model = com.dalilacom.app.data.network.absoluteUrl(p.url), contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
                        else if (bmp != null) androidx.compose.foundation.Image(bitmap = bmp, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
                        Surface(
                            onClick = { vm.enhance(i) }, enabled = !p.enhanced && ui.enhancing == null, shape = RoundedCornerShape(8.dp), color = Color(0xB3000000), contentColor = Color.White,
                            modifier = Modifier.align(Alignment.BottomEnd).padding(6.dp),
                        ) {
                            Text(
                                if (ui.enhancing == i) "…" else if (p.enhanced) "✓ " + stringResource(R.string.wiz_enhanced) else "✨ " + stringResource(R.string.wiz_enhance),
                                fontSize = 11.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                            )
                        }
                        Surface(onClick = { vm.removePhoto(i) }, shape = CircleShape, color = Color(0x99000000), contentColor = Color.White, modifier = Modifier.align(Alignment.TopEnd).padding(6.dp).size(30.dp)) { Box(contentAlignment = Alignment.Center) { Text("✕") } }
                        if (i == 0) Text(stringResource(R.string.wiz_main_photo), color = Color.White, fontSize = 11.sp, modifier = Modifier.align(Alignment.BottomStart).padding(6.dp).background(Color(0xA6000000), RoundedCornerShape(6.dp)).padding(horizontal = 8.dp, vertical = 2.dp))
                    }
                }
                if (pair.size == 1) Spacer(Modifier.weight(1f))
            }
        }
        if (ui.photos.size < 4) Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            AddPhotoTile("📷", stringResource(R.string.wiz_take_photo), true, camera, Modifier.weight(1f))
            AddPhotoTile("🖼️", stringResource(R.string.wiz_pick_photo), false, gallery, Modifier.weight(1f))
        }
        if (ui.photos.size > 1) TextButton(onClick = vm::enhanceAll, enabled = ui.enhancing == null, modifier = Modifier.align(Alignment.CenterHorizontally)) { Text("✨  " + stringResource(R.string.wiz_enhance_all)) }
        if (ui.photos.isNotEmpty()) Text(stringResource(R.string.wiz_enhance_note), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
        if (ui.uploading) Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) { CircularProgressIndicator(Modifier.size(22.dp)); Spacer(Modifier.width(10.dp)); Text(stringResource(R.string.wiz_uploading)) }
        ui.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        Button(onClick = vm::analyze, enabled = ui.photos.isNotEmpty() && !ui.uploading, shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth().height(54.dp)) { Text(stringResource(R.string.wiz_next) + "  ›", fontSize = 17.sp, fontWeight = FontWeight.Bold) }
        TextButton(onClick = onManual, modifier = Modifier.align(Alignment.CenterHorizontally)) { Text(stringResource(R.string.wiz_manual)) }
    }
}

@Composable
private fun AddPhotoTile(icon: String, label: String, primary: Boolean, onClick: () -> Unit, modifier: Modifier) {
    val color = if (primary) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
    Surface(onClick = onClick, modifier = modifier.aspectRatio(1f), shape = RoundedCornerShape(14.dp), border = BorderStroke(2.5.dp, if (primary) color else MaterialTheme.colorScheme.outlineVariant), color = MaterialTheme.colorScheme.surface) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
            Text(icon, fontSize = 40.sp)
            Text(label, color = color, fontWeight = FontWeight.ExtraBold, fontSize = 14.sp)
        }
    }
}

@Composable
private fun FormStep(ui: WizardUi, vm: ProductWizardViewModel, listen: (String) -> Unit, onOpenShipping: () -> Unit) {
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Text(stringResource(R.string.wiz_review_title), style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.ExtraBold)
        Text(stringResource(if (ui.aiAvailable == false) R.string.wiz_no_ai else R.string.wiz_review_sub), color = if (ui.aiAvailable == false) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant)
        LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            items(ui.photos, key = { it.id }) { p ->
                val bmp = androidx.compose.runtime.remember(p.id) { BitmapFactory.decodeByteArray(p.bytes, 0, p.bytes.size)?.asImageBitmap() }
                if (bmp != null) androidx.compose.foundation.Image(bitmap = bmp, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.size(64.dp).clip(RoundedCornerShape(10.dp)))
            }
        }

        FieldLabel(stringResource(R.string.wiz_name))
        Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(value = ui.name, onValueChange = vm::setName, placeholder = { Text(stringResource(R.string.wiz_name_ph)) }, singleLine = true, shape = RoundedCornerShape(12.dp), modifier = Modifier.weight(1f))
            MicButton { listen("name") }
        }
        if (ui.alternatives.isNotEmpty()) LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            items(ui.alternatives) { n -> Surface(onClick = { vm.setName(n) }, shape = RoundedCornerShape(20.dp), border = BorderStroke(1.5.dp, MaterialTheme.colorScheme.outlineVariant)) { Text(n, modifier = Modifier.padding(horizontal = 14.dp, vertical = 7.dp), fontSize = 13.5.sp) } }
        }

        FieldLabel(stringResource(R.string.wiz_section))
        ui.sections.chunked(2).forEach { pair ->
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                pair.forEach { s ->
                    val on = ui.section == s.id
                    Surface(
                        onClick = { vm.setSection(s.id) },
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(12.dp),
                        border = BorderStroke(2.dp, if (on) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant),
                        color = if (on) MaterialTheme.colorScheme.primary.copy(alpha = 0.09f) else MaterialTheme.colorScheme.surface,
                    ) { Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        if (s.image.isNotBlank()) coil.compose.AsyncImage(model = com.dalilacom.app.data.network.absoluteUrl(s.image), contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.size(40.dp).clip(CircleShape)) else Text(s.icon, fontSize = 22.sp)
                        Text(s.label(), fontWeight = FontWeight.Bold, fontSize = 14.sp)
                    } }
                }
                if (pair.size == 1) Spacer(Modifier.weight(1f))
            }
        }

        FieldLabel(stringResource(R.string.wiz_condition))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf("NEW" to R.string.wiz_cond_new, "USED" to R.string.wiz_cond_used).forEach { (id, label) ->
                val on = ui.condition == id
                Surface(onClick = { vm.setCondition(id) }, modifier = Modifier.weight(1f), shape = RoundedCornerShape(12.dp), border = BorderStroke(2.dp, if (on) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant), color = if (on) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surface, contentColor = if (on) Color.White else MaterialTheme.colorScheme.onSurface) {
                    Box(Modifier.padding(vertical = 13.dp), contentAlignment = Alignment.Center) { Text(stringResource(label), fontWeight = FontWeight.ExtraBold) }
                }
            }
        }

        FieldLabel(stringResource(R.string.wiz_description))
        Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(value = ui.description, onValueChange = vm::setDescription, placeholder = { Text(stringResource(R.string.wiz_desc_ph)) }, minLines = 3, shape = RoundedCornerShape(12.dp), modifier = Modifier.weight(1f))
            MicButton { listen("description") }
        }
        TextButton(onClick = vm::autoDescription) { Text("✨  " + stringResource(R.string.wiz_auto_desc)) }

        FieldLabel(stringResource(R.string.wiz_specs))
        ui.specs.forEachIndexed { i, x ->
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(value = x.label, onValueChange = { vm.setSpec(i, it, null) }, placeholder = { Text(stringResource(R.string.wiz_spec_label)) }, singleLine = true, shape = RoundedCornerShape(10.dp), modifier = Modifier.weight(1f))
                OutlinedTextField(value = x.value, onValueChange = { vm.setSpec(i, null, it) }, placeholder = { Text(stringResource(R.string.wiz_spec_value)) }, singleLine = true, shape = RoundedCornerShape(10.dp), modifier = Modifier.weight(1f))
                TextButton(onClick = { vm.removeSpec(i) }) { Text("✕") }
            }
        }
        TextButton(onClick = vm::addSpec) { Text("+  " + stringResource(R.string.wiz_add_spec)) }

        FieldLabel(stringResource(R.string.wiz_price))
        OutlinedTextField(value = ui.price, onValueChange = vm::setPrice, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), textStyle = androidx.compose.ui.text.TextStyle(fontSize = 24.sp, fontWeight = FontWeight.ExtraBold, textAlign = androidx.compose.ui.text.style.TextAlign.Center), placeholder = { Text("0.00", modifier = Modifier.fillMaxWidth(), textAlign = androidx.compose.ui.text.style.TextAlign.Center) }, shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth())
        if (ui.hintMin != null && ui.hintMax != null) Text("💡 " + stringResource(R.string.wiz_price_hint, formatCents(ui.hintMin), formatCents(ui.hintMax)), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp)

        FieldLabel(stringResource(R.string.wiz_stock))
        OutlinedTextField(value = ui.stock, onValueChange = vm::setStock, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), placeholder = { Text(stringResource(R.string.stock_ph)) }, shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth())

        ui.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        if (ui.needShipping) OutlinedButton(onClick = onOpenShipping, shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth().height(48.dp)) { Text("🚚  " + stringResource(R.string.ship_add_methods)) }
        Button(onClick = vm::publish, enabled = !ui.busy, shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth().height(56.dp)) {
            Text("✅  " + stringResource(if (ui.busy) R.string.wiz_publishing else R.string.wiz_publish), fontSize = 17.sp, fontWeight = FontWeight.ExtraBold)
        }
        Spacer(Modifier.height(24.dp))
    }
}

@Composable
private fun FieldLabel(text: String) = Text(text, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurfaceVariant)

@Composable
private fun MicButton(onClick: () -> Unit) {
    IconButton(onClick = onClick, modifier = Modifier.size(52.dp).background(MaterialTheme.colorScheme.primary, CircleShape)) { Icon(Icons.Filled.Mic, contentDescription = null, tint = Color.White) }
}
