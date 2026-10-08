package com.dalilacom.app.ui.store

import android.Manifest
import android.widget.Toast
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.compose.AsyncImage
import com.dalilacom.app.R
import com.dalilacom.app.data.AppContainer
import com.dalilacom.app.data.network.StoreProductDto
import com.dalilacom.app.data.network.StoreSectionDto
import com.dalilacom.app.data.network.absoluteUrl
import com.dalilacom.app.ui.ViewModelFactory
import com.dalilacom.app.ui.common.formatCents
import com.dalilacom.app.ui.common.title
import com.dalilacom.app.ui.discover.LocationHelper
import com.dalilacom.app.ui.i18n.AppStrings
import com.dalilacom.app.ui.theme.DeepRed
import com.dalilacom.app.ui.theme.PrimaryRed
import kotlinx.coroutines.launch

fun StoreSectionDto.label(): String = if (AppStrings.language == "ar") name else nameEn.ifBlank { name }

/** The product picture: its photo when it has one, otherwise a coloured tile with its icon. */
@Composable
fun StorePic(product: StoreProductDto, modifier: Modifier = Modifier, emojiSize: TextUnit = 56.sp) {
    val hue = product.hue.toFloat()
    Box(
        modifier = modifier.background(Brush.linearGradient(listOf(Color.hsl(hue, 0.78f, 0.91f), Color.hsl((hue + 38f) % 360f, 0.72f, 0.78f)))),
        contentAlignment = Alignment.Center,
    ) {
        val photo = product.imageUrl
        if (photo != null) AsyncImage(
            model = if (photo.startsWith("/")) absoluteUrl(photo) else photo,
            contentDescription = product.name,
            contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxSize(),
        ) else Text(product.icon, fontSize = emojiSize)
    }
}

@Composable
fun StoreStars(product: StoreProductDto) {
    if (product.ratingCount == 0) return
    val full = Math.round(product.rating).toInt().coerceIn(0, 5)
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text("★".repeat(full) + "☆".repeat(5 - full), color = Color(0xFFF0A30A), fontSize = 13.sp)
        Text("  %.1f".format(product.rating), fontWeight = FontWeight.Bold, fontSize = 12.sp)
        Text(" (${product.ratingCount})", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
    }
}

@Composable
fun StorePrice(product: StoreProductDto, big: Boolean = false) {
    val size = if (big) 26.sp else 17.sp
    if (product.memberDiscountEnabled && product.memberPriceCents != null) {
        Column {
            Row(verticalAlignment = Alignment.Bottom) {
                Text(formatCents(product.memberPriceCents), fontWeight = FontWeight.ExtraBold, fontSize = size)
                Spacer(Modifier.width(6.dp))
                Text(formatCents(product.priceCents), textDecoration = TextDecoration.LineThrough, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
            }
            Surface(shape = RoundedCornerShape(8.dp), color = MaterialTheme.colorScheme.primary.copy(alpha = 0.12f)) {
                Text("⭐ " + stringResource(R.string.store_member_price), color = MaterialTheme.colorScheme.primary, fontSize = 11.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp))
            }
        }
    } else Text(formatCents(product.priceCents), fontWeight = FontWeight.ExtraBold, fontSize = size)
}

@Composable
fun StoreProductCard(product: StoreProductDto, added: Boolean, onOpen: () -> Unit, onAdd: () -> Unit, modifier: Modifier = Modifier) {
    Card(
        onClick = onOpen,
        modifier = modifier,
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
    ) {
        Column {
            StorePic(product, Modifier.fillMaxWidth().aspectRatio(1f))
            Column(Modifier.padding(horizontal = 10.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(product.name, fontWeight = FontWeight.Bold, fontSize = 13.sp, maxLines = 2, overflow = TextOverflow.Ellipsis, minLines = 2)
                StoreStars(product)
                StorePrice(product)
                Text(product.merchant.name, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Spacer(Modifier.height(2.dp))
                Button(
                    onClick = onAdd,
                    modifier = Modifier.fillMaxWidth().height(38.dp),
                    contentPadding = PaddingValues(0.dp),
                    colors = if (added) ButtonDefaults.buttonColors(containerColor = Color(0xFF2E7D32)) else ButtonDefaults.buttonColors(),
                ) { Text(if (added) "✓ " + stringResource(R.string.store_added) else stringResource(R.string.store_add), fontSize = 13.sp) }
            }
        }
    }
}

@Composable
fun StoreProductRow(title: String, items: List<StoreProductDto>, justAdded: String?, onOpen: (String) -> Unit, onAdd: (String) -> Unit) {
    if (items.isEmpty()) return
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 16.dp))
        LazyRow(contentPadding = PaddingValues(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            items(items, key = { it.id }) { p -> StoreProductCard(p, p.id == justAdded, { onOpen(p.id) }, { onAdd(p.id) }, Modifier.width(168.dp)) }
        }
    }
}

private val SORTS = listOf(
    "popular" to R.string.store_sort_popular,
    "new" to R.string.store_sort_new,
    "rating" to R.string.store_sort_rating,
    "price_asc" to R.string.store_sort_price_asc,
    "price_desc" to R.string.store_sort_price_desc,
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StoreScreen(
    container: AppContainer,
    onBack: () -> Unit,
    onOpenProduct: (String) -> Unit,
    onOpenCart: () -> Unit,
    onLogin: () -> Unit,
) {
    val vm: StoreViewModel = viewModel(factory = ViewModelFactory(container))
    val ui by vm.ui.collectAsState()
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var query by rememberSaveable { mutableStateOf("") }
    var sortOpen by remember { mutableStateOf(false) }

    fun locate() {
        scope.launch { vm.setPosition(LocationHelper.current(context)) }
    }
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { granted ->
        if (granted.values.any { it }) locate() else vm.setPosition(null)
    }
    fun chooseAroundMe() {
        vm.setScope("radius")
        if (LocationHelper.hasPermission(context)) locate()
        else permission.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION))
    }
    fun goBack() {
        if (vm.clearFilters()) query = "" else onBack()
    }

    BackHandler { goBack() }
    LaunchedEffect(ui.needLogin) {
        if (ui.needLogin) {
            Toast.makeText(context, context.getString(R.string.store_login_needed), Toast.LENGTH_SHORT).show()
            vm.consumeNeedLogin()
            onLogin()
        }
    }

    Column(Modifier.fillMaxSize()) {
        // search + cart
        Row(Modifier.fillMaxWidth().padding(start = 4.dp, end = 12.dp, top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = { goBack() }) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null) }
            OutlinedTextField(
                value = query,
                onValueChange = { query = it },
                singleLine = true,
                placeholder = { Text(stringResource(R.string.store_search)) },
                trailingIcon = { IconButton(onClick = { vm.search(query) }) { Icon(Icons.Filled.Search, contentDescription = null) } },
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                keyboardActions = KeyboardActions(onSearch = { vm.search(query) }),
                shape = RoundedCornerShape(14.dp),
                modifier = Modifier.weight(1f),
            )
            Spacer(Modifier.width(8.dp))
            Box {
                IconButton(onClick = onOpenCart) { Icon(Icons.Filled.ShoppingCart, contentDescription = null) }
                if (ui.cartCount > 0) Box(
                    Modifier.align(Alignment.TopEnd).size(20.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primary),
                    contentAlignment = Alignment.Center,
                ) { Text("${ui.cartCount}", color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.Bold) }
            }
        }

        // where: the whole country, one city, or around me
        LazyRow(contentPadding = PaddingValues(horizontal = 16.dp, vertical = 4.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            item { FilterChip(selected = ui.scope == "country", onClick = { vm.setScope("country") }, label = { Text("🌍 " + ui.countryName.ifBlank { stringResource(R.string.store_country) }) }) }
            item { FilterChip(selected = ui.scope == "city", onClick = { vm.setScope("city") }, label = { Text("🏙️ " + stringResource(R.string.store_city_scope)) }) }
            item { FilterChip(selected = ui.scope == "radius", onClick = { chooseAroundMe() }, label = { Text("📡 " + stringResource(R.string.store_around_me)) }) }
        }
        if (ui.scope == "city") Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            if (ui.regions.isNotEmpty()) UnitPicker(stringResource(R.string.store_all_governorates), ui.regions.map { it.id to it.title() }, ui.regionId, vm::pickRegion, Modifier.weight(1f))
            if (ui.cities.isNotEmpty()) UnitPicker(stringResource(R.string.store_all_cities), ui.cities.map { it.id to it.title() }, ui.cityId, vm::pickCity, Modifier.weight(1f))
        }
        if (ui.scope == "radius") {
            LazyRow(contentPadding = PaddingValues(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                items(listOf(5, 10, 25, 50, 100)) { km ->
                    FilterChip(selected = ui.radiusKm == km, onClick = { vm.setRadius(km) }, label = { Text(stringResource(R.string.store_km, km)) })
                }
            }
            if (ui.needLocation) Text(stringResource(R.string.store_need_location), color = MaterialTheme.colorScheme.error, fontSize = 12.sp, modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp))
        }

        // departments
        LazyRow(contentPadding = PaddingValues(horizontal = 16.dp, vertical = 4.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            item { FilterChip(selected = ui.section.isBlank(), onClick = { vm.pickSection("") }, label = { Text(stringResource(R.string.store_all)) }) }
            items(ui.sections, key = { it.id }) { s ->
                FilterChip(selected = ui.section == s.id, onClick = { vm.pickSection(s.id) }, label = { Text("${s.icon} ${s.label()}") })
            }
        }

        if (ui.loading) Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        else LazyColumn(contentPadding = PaddingValues(bottom = 24.dp, top = 6.dp), verticalArrangement = Arrangement.spacedBy(14.dp), modifier = Modifier.fillMaxSize()) {
            if (ui.filtering) {
                item {
                    Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
                        val title = if (ui.query.isNotBlank()) stringResource(R.string.store_results_for, ui.query) else ui.sections.firstOrNull { it.id == ui.section }?.label().orEmpty()
                        Text(title + if (ui.total > 0) " · ${ui.total}" else "", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                        Box {
                            OutlinedButton(onClick = { sortOpen = true }, shape = RoundedCornerShape(10.dp)) { Text(stringResource(SORTS.first { it.first == ui.sort }.second), fontSize = 12.sp) }
                            DropdownMenu(expanded = sortOpen, onDismissRequest = { sortOpen = false }) {
                                SORTS.forEach { (key, res) -> DropdownMenuItem(text = { Text(stringResource(res)) }, onClick = { vm.setSort(key); sortOpen = false }) }
                            }
                        }
                    }
                }
                if (ui.busy && ui.items.isEmpty()) item { Box(Modifier.fillMaxWidth().padding(40.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator() } }
                else if (ui.items.isEmpty()) item { Text(stringResource(R.string.store_no_results), color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.fillMaxWidth().padding(40.dp)) }
                items(ui.items.chunked(2), key = { row -> row.first().id }) { pair ->
                    Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        pair.forEach { p -> StoreProductCard(p, p.id == ui.justAdded, { onOpenProduct(p.id) }, { vm.addToCart(p.id) }, Modifier.weight(1f)) }
                        if (pair.size == 1) Spacer(Modifier.weight(1f))
                    }
                }
                if (ui.items.size < ui.total) item {
                    OutlinedButton(onClick = vm::loadMore, enabled = !ui.busy, modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp)) { Text(stringResource(R.string.store_more)) }
                }
            } else {
                item {
                    Box(
                        Modifier.fillMaxWidth().padding(horizontal = 16.dp).clip(RoundedCornerShape(22.dp)).background(Brush.linearGradient(listOf(DeepRed, PrimaryRed, Color(0xFFE0643F)))).padding(22.dp),
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text(stringResource(R.string.store_hero_title), color = Color.White, fontWeight = FontWeight.ExtraBold, fontSize = 22.sp, lineHeight = 28.sp)
                                Spacer(Modifier.height(6.dp))
                                Text(stringResource(R.string.store_hero_sub), color = Color.White.copy(alpha = 0.9f), fontSize = 13.sp)
                            }
                            Text("🛍️", fontSize = 56.sp)
                        }
                    }
                }
                if (ui.bestSellers.isEmpty() && ui.newest.isEmpty()) item { Text(stringResource(R.string.store_no_results), color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.fillMaxWidth().padding(40.dp)) }
                item { StoreProductRow(stringResource(R.string.store_deals), ui.deals, ui.justAdded, onOpenProduct, vm::addToCart) }
                item { StoreProductRow(stringResource(R.string.store_best), ui.bestSellers, ui.justAdded, onOpenProduct, vm::addToCart) }
                item { StoreProductRow(stringResource(R.string.store_newest), ui.newest, ui.justAdded, onOpenProduct, vm::addToCart) }
            }
        }
    }
}

/** A drop-down of places with an "all" first entry. */
@Composable
private fun UnitPicker(allLabel: String, options: List<Pair<String, String>>, selectedId: String?, onSelect: (String?) -> Unit, modifier: Modifier = Modifier) {
    var open by remember { mutableStateOf(false) }
    Box(modifier) {
        OutlinedButton(onClick = { open = true }, shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth()) {
            Text(options.firstOrNull { it.first == selectedId }?.second ?: allLabel, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            DropdownMenuItem(text = { Text(allLabel) }, onClick = { onSelect(null); open = false })
            options.forEach { (id, name) -> DropdownMenuItem(text = { Text(name) }, onClick = { onSelect(id); open = false }) }
        }
    }
}
