package com.dalilacom.app.ui.discover

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Map
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.dalilacom.app.R
import com.dalilacom.app.data.AppContainer
import com.dalilacom.app.data.network.MerchantDto
import com.dalilacom.app.data.network.StoreProductDto
import com.dalilacom.app.data.network.absoluteUrl
import com.dalilacom.app.data.repository.StoreScope
import com.dalilacom.app.ui.i18n.AppStrings
import com.dalilacom.app.ui.store.StorePrice
import kotlinx.coroutines.launch
import coil.compose.AsyncImage
import kotlin.math.*

private data class DealRow(val merchant: MerchantDto, val product: StoreProductDto? = null, val title: String, val subtitle: String, val percent: Int, val distance: Double?)

@Composable
fun DealsScreen(container: AppContainer, onMap: () -> Unit, onMerchant: (String) -> Unit, onProduct: (String) -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var merchants by remember { mutableStateOf<List<MerchantDto>>(emptyList()) }
    var products by remember { mutableStateOf<List<StoreProductDto>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var location by remember { mutableStateOf<Pair<Double, Double>?>(null) }
    var query by remember { mutableStateOf("") }
    var shopQuery by remember { mutableStateOf("") }
    var productQuery by remember { mutableStateOf("") }
    var areaQuery by remember { mutableStateOf("") }
    var profession by remember { mutableStateOf("") }
    var category by remember { mutableStateOf("") }
    var kind by remember { mutableStateOf("all") }
    var sort by remember { mutableStateOf("near") }
    var filtersOpen by remember { mutableStateOf(false) }
    var showProfessionMenu by remember { mutableStateOf(false) }
    var showCategoryMenu by remember { mutableStateOf(false) }
    var showSortMenu by remember { mutableStateOf(false) }
    val locationLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
        scope.launch { location = LocationHelper.current(context) }
    }
    LaunchedEffect(Unit) {
        loading = true
        val merchantJob = scope.launch { merchants = container.discoverRepository.searchMerchants() }
        val allProducts = mutableListOf<StoreProductDto>()
        var offset = 0
        var total = Int.MAX_VALUE
        while (offset < total) {
            val page = container.storeRepository.products(null, null, true, "new", offset, StoreScope(scope = "country"), limit = 60) ?: break
            allProducts += page.items
            total = page.total
            offset += page.items.size
            if (page.items.isEmpty()) break
        }
        products = allProducts
        merchantJob.join()
        loading = false
        if (LocationHelper.hasPermission(context)) location = LocationHelper.current(context)
    }
    val categories = merchants.mapNotNull { it.category }.distinctBy { it.id }.sortedBy { it.name }
    val productCategories = products.mapNotNull { it.section }.distinctBy { it.id }.sortedBy { it.name }
    val merchantById = merchants.associateBy { it.id }
    val rows = buildList {
        merchants.forEach { merchant ->
                merchant.discounts.forEach { discount ->
                add(DealRow(merchant, title = discount.title, subtitle = discount.description ?: discount.scope, percent = discount.percent,
                    distance = merchant.distanceFrom(location)))
            }
        }
        products.forEach { product ->
            val merchant = merchantById[product.merchant.id] ?: MerchantDto(product.merchant.id, product.merchant.name)
            val pct = if (product.priceCents > 0) (((product.priceCents - (product.memberPriceCents ?: product.priceCents)) * 100.0) / product.priceCents).roundToInt() else 0
            add(DealRow(merchant, product, product.name, product.section?.name ?: product.merchant.name, pct, merchant.distanceFrom(location)))
        }
    }.filter { row ->
        val m = row.merchant
        val p = row.product
        (kind == "all" || (kind == "shop" && p == null) || (kind == "product" && p != null)) &&
            (query.isBlank() || listOf(m.businessName, row.title, row.subtitle).any { it.contains(query, true) }) &&
            (shopQuery.isBlank() || m.businessName.contains(shopQuery, true)) &&
            (productQuery.isBlank() || (p?.name ?: row.title).contains(productQuery, true)) &&
            (areaQuery.isBlank() || (m.address.orEmpty() + " " + m.branches.joinToString(" ") { "${it.city.orEmpty()} ${it.address.orEmpty()}" }).contains(areaQuery, true)) &&
            (profession.isBlank() || m.category?.id == profession) &&
            (category.isBlank() || p?.section?.id == category)
    }.sortedWith(if (sort == "discount") compareByDescending<DealRow> { it.percent }.thenBy { it.distance ?: Double.MAX_VALUE } else compareBy<DealRow> { it.distance ?: Double.MAX_VALUE }.thenByDescending { it.percent })

    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            Surface(shape = RoundedCornerShape(24.dp), color = MaterialTheme.colorScheme.primaryContainer, modifier = Modifier.fillMaxWidth()) {
                Row(Modifier.padding(20.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(AppStrings.get(R.string.deals_hero_kicker), style = MaterialTheme.typography.labelLarge)
                        Text(AppStrings.get(R.string.deals_hero_title), style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                        Text(AppStrings.get(R.string.deals_hero_sub), style = MaterialTheme.typography.bodyMedium)
                    }
                    Text("🎁", style = MaterialTheme.typography.headlineLarge)
                }
            }
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("all" to R.string.deals_all, "shop" to R.string.deals_shops, "product" to R.string.deals_products).forEach { (key, label) ->
                    FilterChip(kind == key, { kind = key }, label = { Text(AppStrings.get(label)) })
                }
            }
        }
        item {
            OutlinedTextField(query, { query = it }, Modifier.fillMaxWidth(), singleLine = true, leadingIcon = { Icon(Icons.Filled.Search, null) }, label = { Text(AppStrings.get(R.string.deals_search)) })
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                TextButton(onClick = { filtersOpen = !filtersOpen }) { Text("☷  ${AppStrings.get(R.string.deals_filters)}${if (filtersOpen) "  ▲" else "  ▼"}") }
                Spacer(Modifier.weight(1f))
                TextButton(onClick = { if (LocationHelper.hasPermission(context)) scope.launch { location = LocationHelper.current(context) } else locationLauncher.launch(LocationHelper.PERMISSIONS) }) { Icon(Icons.Filled.LocationOn, null); Text(AppStrings.get(R.string.deals_nearest)) }
                TextButton(onClick = onMap) { Icon(Icons.Filled.Map, null); Text(AppStrings.get(R.string.deals_map)) }
            }
        }
        if (filtersOpen) item {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(shopQuery, { shopQuery = it }, Modifier.fillMaxWidth(), singleLine = true, label = { Text(AppStrings.get(R.string.deals_shop_name)) })
                OutlinedTextField(productQuery, { productQuery = it }, Modifier.fillMaxWidth(), singleLine = true, label = { Text(AppStrings.get(R.string.deals_product_name)) })
                OutlinedTextField(areaQuery, { areaQuery = it }, Modifier.fillMaxWidth(), singleLine = true, label = { Text(AppStrings.get(R.string.deals_area)) })
                Box { OutlinedButton(onClick = { showProfessionMenu = true }, modifier = Modifier.fillMaxWidth()) { Text(categories.firstOrNull { it.id == profession }?.name ?: AppStrings.get(R.string.deals_all_professions)) }
                    DropdownMenu(showProfessionMenu, { showProfessionMenu = false }) { DropdownMenuItem(text = { Text(AppStrings.get(R.string.deals_all_professions)) }, onClick = { profession = ""; showProfessionMenu = false }); categories.forEach { c -> DropdownMenuItem(text = { Text(c.name) }, onClick = { profession = c.id; showProfessionMenu = false }) } }
                }
                Box { OutlinedButton(onClick = { showCategoryMenu = true }, modifier = Modifier.fillMaxWidth()) { Text(productCategories.firstOrNull { it.id == category }?.name ?: AppStrings.get(R.string.deals_all_categories)) }
                    DropdownMenu(showCategoryMenu, { showCategoryMenu = false }) { DropdownMenuItem(text = { Text(AppStrings.get(R.string.deals_all_categories)) }, onClick = { category = ""; showCategoryMenu = false }); productCategories.forEach { c -> DropdownMenuItem(text = { Text(c.name) }, onClick = { category = c.id; showCategoryMenu = false }) } }
                }
                Box { OutlinedButton(onClick = { showSortMenu = true }, modifier = Modifier.fillMaxWidth()) { Text(AppStrings.get(if (sort == "near") R.string.deals_nearest else R.string.deals_biggest)) }
                    DropdownMenu(showSortMenu, { showSortMenu = false }) { DropdownMenuItem(text = { Text(AppStrings.get(R.string.deals_nearest)) }, onClick = { sort = "near"; showSortMenu = false }); DropdownMenuItem(text = { Text(AppStrings.get(R.string.deals_biggest)) }, onClick = { sort = "discount"; showSortMenu = false }) }
                }
                TextButton(onClick = { query = ""; shopQuery = ""; productQuery = ""; areaQuery = ""; profession = ""; category = ""; sort = "near" }) { Text(AppStrings.get(R.string.deals_clear)) }
            }
        }
        item { Text(if (loading) AppStrings.get(R.string.deals_loading) else AppStrings.get(R.string.deals_count, rows.size), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold) }
        if (loading) item { Box(Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator() } }
        if (!loading && rows.isEmpty()) item { Text(AppStrings.get(R.string.deals_filter_empty), Modifier.padding(24.dp), color = MaterialTheme.colorScheme.onSurfaceVariant) }
        items(rows) { row ->
            Surface(Modifier.fillMaxWidth().clickable { if (row.product != null) onProduct(row.product.id) else onMerchant(row.merchant.id) }, shape = RoundedCornerShape(18.dp), tonalElevation = 2.dp) {
                Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(64.dp).clip(RoundedCornerShape(14.dp)).background(MaterialTheme.colorScheme.secondaryContainer), contentAlignment = Alignment.Center) {
                        val image = row.product?.imageUrl ?: row.merchant.avatarUrl
                        if (!image.isNullOrBlank()) AsyncImage(model = if (image.startsWith("/")) absoluteUrl(image) else image, contentDescription = row.title, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
                        else Text(if (row.product == null) "🏪" else "🛍️", style = MaterialTheme.typography.headlineSmall)
                    }
                    Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
                        Text(row.merchant.businessName, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
                        Text(row.title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                        Text(row.subtitle, style = MaterialTheme.typography.bodySmall, maxLines = 2)
                        row.product?.let { StorePrice(it) }
                        Text(row.distance?.let { "📍 ${AppStrings.get(R.string.unit_km, it)}" } ?: row.merchant.address.orEmpty(), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Surface(shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.primary) { Text("-${row.percent}%", Modifier.padding(horizontal = 9.dp, vertical = 7.dp), color = MaterialTheme.colorScheme.onPrimary, fontWeight = FontWeight.Bold) }
                }
            }
        }
        item { Text(AppStrings.get(R.string.deals_all_distances), Modifier.padding(vertical = 8.dp), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
    }
}

private fun km(aLat: Double, aLng: Double, bLat: Double, bLng: Double): Double {
    val dLat = Math.toRadians(bLat - aLat); val dLng = Math.toRadians(bLng - aLng)
    val h = sin(dLat / 2).pow(2) + cos(Math.toRadians(aLat)) * cos(Math.toRadians(bLat)) * sin(dLng / 2).pow(2)
    return 6371.0 * 2 * asin(sqrt(h.coerceIn(0.0, 1.0)))
}

private fun MerchantDto.distanceFrom(location: Pair<Double, Double>?): Double? {
    if (location == null) return null
    val points = buildList {
        if (latitude != null && longitude != null) add(latitude to longitude)
        locations.forEach { add(it.latitude to it.longitude) }
        branches.forEach { add(it.latitude to it.longitude) }
    }
    return points.minOfOrNull { km(location.first, location.second, it.first, it.second) }
}
