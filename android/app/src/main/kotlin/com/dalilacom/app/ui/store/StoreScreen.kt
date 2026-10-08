package com.dalilacom.app.ui.store

import android.Manifest
import android.widget.Toast
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.isSystemInDarkTheme
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
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.outlined.ShoppingBag
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.text.TextStyle
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
import kotlinx.coroutines.launch

/** The store's own palette: black bars, white cards on a light-grey page, orange sale prices. */
val StoreSale = Color(0xFFFA6338)
val StoreTag = Color(0xFF7B4FD6)
private val StoreBar = Color(0xFF000000)

@Composable
private fun storePage(): Color = if (isSystemInDarkTheme()) Color(0xFF0E0A0A) else Color(0xFFF5F5F5)

fun StoreSectionDto.label(): String = if (AppStrings.language == "ar") name else nameEn.ifBlank { name }

/** The percentage off when the member price applies (0 when there is none). */
fun StoreProductDto.offPercent(): Int =
    if (memberDiscountEnabled && memberPriceCents != null && priceCents > 0) Math.round((1 - memberPriceCents.toDouble() / priceCents) * 100).toInt() else 0

private fun countLabel(n: Int): String = if (n >= 1000) "%.1fk+".format(java.util.Locale.US, n / 1000.0).replace(".0k", "k") else n.toString()

/** The product picture: its photo when it has one, otherwise a soft tile with its icon (the shops' own photos replace it). */
@Composable
fun StorePic(product: StoreProductDto, modifier: Modifier = Modifier, emojiSize: TextUnit = 56.sp) {
    val hue = product.hue.toFloat()
    Box(
        modifier = modifier.background(Brush.verticalGradient(listOf(Color.hsl(hue, 0.30f, 0.97f), Color.hsl(hue, 0.24f, 0.89f)))),
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
        Text("★".repeat(full) + "☆".repeat(5 - full), color = Color(0xFFE6A100), fontSize = 14.sp)
        Text("  %.1f".format(product.rating), fontWeight = FontWeight.Bold, fontSize = 13.sp)
        Text("  " + stringResource(R.string.store_sold_short, countLabel(product.soldCount)), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp)
    }
}

@Composable
fun StorePrice(product: StoreProductDto, big: Boolean = false) {
    val size = if (big) 28.sp else 16.sp
    if (product.memberDiscountEnabled && product.memberPriceCents != null) {
        Column {
            Row(verticalAlignment = Alignment.Bottom) {
                Text(formatCents(product.memberPriceCents), fontWeight = FontWeight.ExtraBold, fontSize = size, color = StoreSale)
                Spacer(Modifier.width(7.dp))
                Text(formatCents(product.priceCents), textDecoration = TextDecoration.LineThrough, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = if (big) 15.sp else 12.sp)
            }
            Text(stringResource(R.string.store_off_label, product.offPercent()), color = StoreSale, fontSize = if (big) 14.sp else 12.sp)
        }
    } else Text(formatCents(product.priceCents), fontWeight = FontWeight.ExtraBold, fontSize = size)
}

@Composable
fun StoreProductCard(product: StoreProductDto, added: Boolean, onOpen: () -> Unit, onAdd: () -> Unit, modifier: Modifier = Modifier) {
    Column(modifier.clickable(onClick = onOpen)) {
        Box(Modifier.fillMaxWidth().aspectRatio(1f).clip(RoundedCornerShape(4.dp))) {
            StorePic(product, Modifier.fillMaxSize(), emojiSize = 64.sp)
            if (product.soldCount >= 8000) Text(
                stringResource(R.string.store_best),
                color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.Bold,
                modifier = Modifier.align(Alignment.TopStart).padding(8.dp).background(Color.Black, RoundedCornerShape(3.dp)).padding(horizontal = 7.dp, vertical = 3.dp),
            )
            Surface(
                onClick = onAdd,
                shape = CircleShape,
                color = if (added) Color(0xFF1E8A3A) else Color.White,
                contentColor = if (added) Color.White else Color(0xFF111111),
                shadowElevation = 3.dp,
                modifier = Modifier.align(Alignment.BottomEnd).padding(8.dp).size(36.dp),
            ) {
                Box(contentAlignment = Alignment.Center) {
                    if (added) Text("✓", fontWeight = FontWeight.ExtraBold) else Icon(Icons.Outlined.ShoppingBag, contentDescription = stringResource(R.string.store_add), modifier = Modifier.size(20.dp))
                }
            }
        }
        Column(Modifier.padding(top = 8.dp, start = 2.dp, end = 2.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(product.name, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            StorePrice(product)
            product.section?.let { Text("#" + it.label(), color = StoreTag, fontSize = 12.sp) }
            if (product.ratingCount > 0) Row {
                Text("★ %.1f".format(product.rating), color = Color(0xFFE6A100), fontSize = 11.5.sp)
                Spacer(Modifier.width(10.dp))
                Text(stringResource(R.string.store_sold_short, countLabel(product.soldCount)), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.5.sp)
            }
        }
    }
}

/** Products two to a row. */
@Composable
private fun ProductGrid(items: List<StoreProductDto>, justAdded: String?, onOpen: (String) -> Unit, onAdd: (String) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        items.chunked(2).forEach { pair ->
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                pair.forEach { p -> StoreProductCard(p, p.id == justAdded, { onOpen(p.id) }, { onAdd(p.id) }, Modifier.weight(1f)) }
                if (pair.size == 1) Spacer(Modifier.weight(1f))
            }
        }
    }
}

@Composable
fun StoreProductRow(title: String, items: List<StoreProductDto>, justAdded: String?, onOpen: (String) -> Unit, onAdd: (String) -> Unit) {
    if (items.isEmpty()) return
    StoreCard {
        Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.ExtraBold)
        Spacer(Modifier.height(12.dp))
        ProductGrid(items.take(6), justAdded, onOpen, onAdd)
    }
}

@Composable
private fun StoreCard(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    Surface(modifier = modifier.fillMaxWidth().padding(horizontal = 10.dp), shape = RoundedCornerShape(8.dp), color = MaterialTheme.colorScheme.surface) {
        Column(Modifier.padding(14.dp)) { content() }
    }
}

private val SORTS = listOf(
    "popular" to R.string.store_sort_popular,
    "new" to R.string.store_sort_new,
    "rating" to R.string.store_sort_rating,
    "price_asc" to R.string.store_sort_price_asc,
    "price_desc" to R.string.store_sort_price_desc,
)

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
    var whereOpen by remember { mutableStateOf(false) }

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

    Column(Modifier.fillMaxSize().background(storePage())) {
        // the black top: back, name, a white search pill, the bag
        Row(Modifier.fillMaxWidth().background(StoreBar).padding(horizontal = 4.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = { goBack() }) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null, tint = Color.White) }
            Text(stringResource(R.string.tab_store), color = Color.White, fontWeight = FontWeight.Black, fontSize = 19.sp)
            Spacer(Modifier.width(10.dp))
            Row(
                Modifier.weight(1f).height(40.dp).clip(RoundedCornerShape(20.dp)).background(Color.White).padding(start = 16.dp, end = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(Modifier.weight(1f)) {
                    if (query.isEmpty()) Text(stringResource(R.string.store_search), color = Color(0xFF8A8A8A), fontSize = 14.sp, maxLines = 1)
                    BasicTextField(
                        value = query,
                        onValueChange = { query = it },
                        singleLine = true,
                        textStyle = TextStyle(color = Color(0xFF111111), fontSize = 14.sp),
                        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                        keyboardActions = KeyboardActions(onSearch = { vm.search(query) }),
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
                IconButton(onClick = { vm.search(query) }, modifier = Modifier.size(36.dp)) { Icon(Icons.Filled.Search, contentDescription = null, tint = Color(0xFF111111), modifier = Modifier.size(20.dp)) }
            }
            Box {
                IconButton(onClick = onOpenCart) { Icon(Icons.Outlined.ShoppingBag, contentDescription = null, tint = Color.White) }
                if (ui.cartCount > 0) Box(
                    Modifier.align(Alignment.TopEnd).padding(top = 4.dp, end = 2.dp).size(18.dp).clip(CircleShape).background(StoreSale),
                    contentAlignment = Alignment.Center,
                ) { Text("${ui.cartCount}", color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.Bold) }
            }
        }
        // the departments as a black strip with an underline on the chosen one
        LazyRow(Modifier.fillMaxWidth().background(StoreBar), contentPadding = PaddingValues(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(20.dp)) {
            item { StoreTab(stringResource(R.string.store_all), ui.section.isBlank() && !ui.dealsOnly) { vm.pickSection("") } }
            items(ui.sections, key = { it.id }) { s -> StoreTab(s.label(), ui.section == s.id) { vm.pickSection(s.id) } }
        }

        LazyColumn(contentPadding = PaddingValues(top = 10.dp, bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxSize()) {
            // where: the whole country, one city, or around me
            item {
                val where = when (ui.scope) {
                    "city" -> (ui.countryName.ifBlank { stringResource(R.string.store_country) }) + " · " + (ui.cities.firstOrNull { it.id == ui.cityId }?.title() ?: ui.regions.firstOrNull { it.id == ui.regionId }?.title() ?: stringResource(R.string.store_city_scope))
                    "radius" -> stringResource(R.string.store_around_me) + " · " + stringResource(R.string.store_km, ui.radiusKm)
                    else -> ui.countryName.ifBlank { stringResource(R.string.store_country) }
                }
                Column(Modifier.padding(horizontal = 10.dp)) {
                    Surface(onClick = { whereOpen = !whereOpen }, shape = RoundedCornerShape(20.dp), border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant), color = MaterialTheme.colorScheme.surface) {
                        Text("📍 $where  " + if (whereOpen) "▴" else "▾", fontSize = 12.5.sp, modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp))
                    }
                    if (whereOpen) Surface(Modifier.padding(top = 8.dp).fillMaxWidth(), shape = RoundedCornerShape(8.dp), color = MaterialTheme.colorScheme.surface) {
                        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                item { FilterChip(selected = ui.scope == "country", onClick = { vm.setScope("country") }, label = { Text("🌍 " + ui.countryName.ifBlank { stringResource(R.string.store_country) }) }) }
                                item { FilterChip(selected = ui.scope == "city", onClick = { vm.setScope("city") }, label = { Text("🏙️ " + stringResource(R.string.store_city_scope)) }) }
                                item { FilterChip(selected = ui.scope == "radius", onClick = { chooseAroundMe() }, label = { Text("📡 " + stringResource(R.string.store_around_me)) }) }
                            }
                            if (ui.scope == "city") Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                if (ui.regions.isNotEmpty()) UnitPicker(stringResource(R.string.store_all_governorates), ui.regions.map { it.id to it.title() }, ui.regionId, vm::pickRegion, Modifier.weight(1f))
                                if (ui.cities.isNotEmpty()) UnitPicker(stringResource(R.string.store_all_cities), ui.cities.map { it.id to it.title() }, ui.cityId, vm::pickCity, Modifier.weight(1f))
                            }
                            if (ui.scope == "radius") {
                                LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    items(listOf(5, 10, 25, 50, 100)) { km -> FilterChip(selected = ui.radiusKm == km, onClick = { vm.setRadius(km) }, label = { Text(stringResource(R.string.store_km, km)) }) }
                                }
                                if (ui.needLocation) Text(stringResource(R.string.store_need_location), color = MaterialTheme.colorScheme.error, fontSize = 12.sp)
                            }
                        }
                    }
                }
            }

            if (ui.loading) item { Box(Modifier.fillMaxWidth().padding(60.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator() } }
            else if (ui.filtering) {
                item {
                    StoreCard {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            val title = when {
                                ui.query.isNotBlank() -> stringResource(R.string.store_results_for, ui.query)
                                ui.dealsOnly -> stringResource(R.string.store_deals)
                                else -> ui.sections.firstOrNull { it.id == ui.section }?.label().orEmpty()
                            }
                            Text(title + if (ui.total > 0) "  ${ui.total}" else "", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.ExtraBold, modifier = Modifier.weight(1f))
                            Box {
                                OutlinedButton(onClick = { sortOpen = true }, shape = RoundedCornerShape(6.dp)) { Text(stringResource(SORTS.first { it.first == ui.sort }.second), fontSize = 12.sp) }
                                DropdownMenu(expanded = sortOpen, onDismissRequest = { sortOpen = false }) {
                                    SORTS.forEach { (key, res) -> DropdownMenuItem(text = { Text(stringResource(res)) }, onClick = { vm.setSort(key); sortOpen = false }) }
                                }
                            }
                        }
                        Spacer(Modifier.height(12.dp))
                        if (ui.busy && ui.items.isEmpty()) Box(Modifier.fillMaxWidth().padding(40.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
                        else if (ui.items.isEmpty()) Text(stringResource(R.string.store_no_results), color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.fillMaxWidth().padding(40.dp))
                        else ProductGrid(ui.items, ui.justAdded, onOpenProduct, vm::addToCart)
                        if (ui.items.isNotEmpty() && ui.items.size < ui.total) {
                            Spacer(Modifier.height(16.dp))
                            OutlinedButton(onClick = vm::loadMore, enabled = !ui.busy, shape = RoundedCornerShape(4.dp), modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.store_more)) }
                        }
                    }
                }
            } else {
                // the coral banner
                item {
                    val up = ui.deals.maxOfOrNull { it.offPercent() } ?: 0
                    Box(
                        Modifier.fillMaxWidth().padding(horizontal = 10.dp).clip(RoundedCornerShape(8.dp))
                            .background(Brush.linearGradient(listOf(Color(0xFFFF7A59), Color(0xFFFF4D6D), Color(0xFFE8336D))))
                            .clickable { vm.seeAll("deals") }.padding(22.dp),
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text(stringResource(R.string.store_hero_big), color = Color.White, fontWeight = FontWeight.Black, fontSize = 28.sp, lineHeight = 32.sp)
                                Spacer(Modifier.height(4.dp))
                                Text(stringResource(R.string.store_hero_up_to, up), color = Color.White, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                                Spacer(Modifier.height(12.dp))
                                Text(stringResource(R.string.store_shop_now), color = Color.White, fontWeight = FontWeight.Bold, fontSize = 13.sp, modifier = Modifier.background(Color.Black, RoundedCornerShape(3.dp)).padding(horizontal = 20.dp, vertical = 8.dp))
                            }
                            Text("🛍️", fontSize = 76.sp)
                        }
                    }
                }
                // departments as rounded tiles
                if (ui.sections.isNotEmpty()) item {
                    StoreCard {
                        LazyRow(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                            items(ui.sections, key = { it.id }) { s ->
                                Column(Modifier.width(72.dp).clickable { vm.pickSection(s.id) }, horizontalAlignment = Alignment.CenterHorizontally) {
                                    Box(Modifier.size(66.dp).clip(RoundedCornerShape(22.dp)).background(MaterialTheme.colorScheme.onSurface.copy(alpha = 0.06f)), contentAlignment = Alignment.Center) { Text(s.icon, fontSize = 30.sp) }
                                    Spacer(Modifier.height(6.dp))
                                    Text(s.label(), fontSize = 12.sp, maxLines = 2, lineHeight = 14.sp, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
                                }
                            }
                        }
                    }
                }
                if (ui.bestSellers.isEmpty() && ui.newest.isEmpty()) item { Text(stringResource(R.string.store_no_results), color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.fillMaxWidth().padding(40.dp)) }
                item { HomeSection(stringResource(R.string.store_best), "best", ui.bestSellers, ui.justAdded, onOpenProduct, vm::addToCart, vm::seeAll) }
                item { HomeSection(stringResource(R.string.store_deals), "deals", ui.deals, ui.justAdded, onOpenProduct, vm::addToCart, vm::seeAll) }
                item { HomeSection(stringResource(R.string.store_newest), "new", ui.newest, ui.justAdded, onOpenProduct, vm::addToCart, vm::seeAll) }
            }
        }
    }
}

@Composable
private fun HomeSection(title: String, kind: String, items: List<StoreProductDto>, justAdded: String?, onOpen: (String) -> Unit, onAdd: (String) -> Unit, onSeeAll: (String) -> Unit) {
    if (items.isEmpty()) return
    StoreCard {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.ExtraBold, modifier = Modifier.weight(1f))
            Text(stringResource(R.string.store_see_all) + " ›", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp, modifier = Modifier.clickable { onSeeAll(kind) })
        }
        Spacer(Modifier.height(12.dp))
        ProductGrid(items.take(6), justAdded, onOpen, onAdd)
    }
}

@Composable
private fun StoreTab(label: String, selected: Boolean, onClick: () -> Unit) {
    Column(Modifier.clickable(onClick = onClick).padding(top = 12.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Text(label, color = if (selected) Color.White else Color.White.copy(alpha = 0.75f), fontWeight = if (selected) FontWeight.ExtraBold else FontWeight.SemiBold, fontSize = 14.sp, maxLines = 1)
        Spacer(Modifier.height(9.dp))
        Box(Modifier.height(2.dp).fillMaxWidth().background(if (selected) Color.White else Color.Transparent))
    }
}

/** A drop-down of places with an "all" first entry. */
@Composable
private fun UnitPicker(allLabel: String, options: List<Pair<String, String>>, selectedId: String?, onSelect: (String?) -> Unit, modifier: Modifier = Modifier) {
    var open by remember { mutableStateOf(false) }
    Box(modifier) {
        OutlinedButton(onClick = { open = true }, shape = RoundedCornerShape(8.dp), modifier = Modifier.fillMaxWidth()) {
            Text(options.firstOrNull { it.first == selectedId }?.second ?: allLabel, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            DropdownMenuItem(text = { Text(allLabel) }, onClick = { onSelect(null); open = false })
            options.forEach { (id, name) -> DropdownMenuItem(text = { Text(name) }, onClick = { onSelect(id); open = false }) }
        }
    }
}
