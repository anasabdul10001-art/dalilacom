package com.dalilacom.app.ui.merchant

import android.content.Context
import com.dalilacom.app.ui.store.StoreProductGrid
import androidx.compose.ui.unit.sp
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.draw.clip
import androidx.compose.runtime.setValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.mutableStateOf
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.IconButton
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.DropdownMenu
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.background
import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.Chat
import androidx.compose.material.icons.filled.Directions
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import androidx.compose.ui.res.stringResource
import com.dalilacom.app.R
import com.dalilacom.app.data.AppContainer
import com.dalilacom.app.ui.i18n.AppStrings
import com.dalilacom.app.data.network.MerchantDto
import com.dalilacom.app.data.network.ProductDto
import com.dalilacom.app.ui.common.Avatar
import com.dalilacom.app.ui.common.DAY_LABEL
import com.dalilacom.app.ui.common.DAY_ORDER
import com.dalilacom.app.ui.common.OpenBadge
import com.dalilacom.app.ui.common.formatCents
import com.dalilacom.app.ui.common.formatClock
import java.time.DayOfWeek
import java.time.ZoneId
import java.time.ZonedDateTime

private const val SHARE_BASE = "https://dalilacom-api.onrender.com/app/?merchant="

@Composable
fun MerchantDetailScreen(
    container: AppContainer,
    merchantId: String,
    onProductClick: (String) -> Unit,
    onDirections: (MerchantDto) -> Unit,
    onBack: () -> Unit,
    onLogin: () -> Unit = {},
) {
    val viewModel: MerchantDetailViewModel = viewModel(
        factory = viewModelFactory {
            initializer {
                MerchantDetailViewModel(container.discoverRepository, container.storeRepository, container.cartRepository, container.authRepository, container.placesRepository, merchantId)
            }
        },
    )
    val state by viewModel.uiState.collectAsState()
    val context = LocalContext.current

    LaunchedEffect(state.message) {
        state.message?.let {
            Toast.makeText(context, it, Toast.LENGTH_SHORT).show()
            viewModel.clearMessage()
        }
    }
    LaunchedEffect(state.needLogin) {
        if (state.needLogin) {
            Toast.makeText(context, context.getString(R.string.store_login_needed), Toast.LENGTH_SHORT).show()
            viewModel.consumeNeedLogin()
            onLogin()
        }
    }

    val page = if (isSystemInDarkTheme()) Color(0xFF0E0A0A) else Color(0xFFF5F5F5)
    Column(modifier = Modifier.fillMaxSize().background(page)) {
        // the black top, like the store's
        Row(Modifier.fillMaxWidth().background(Color.Black).padding(horizontal = 4.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null, tint = Color.White) }
            Text(state.merchant?.businessName ?: stringResource(R.string.tab_store), color = Color.White, fontWeight = FontWeight.Black, fontSize = 17.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }

        when {
            state.isLoading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            state.error != null -> Text(state.error!!, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(16.dp))
            else -> {
                val merchant = state.merchant!!
                val products = state.products
                val rated = products.filter { it.ratingCount > 0 }
                val votes = rated.sumOf { it.ratingCount }
                val avg = if (votes > 0) rated.sumOf { it.rating * it.ratingCount } / votes else 0.0
                val sold = products.sumOf { it.soldCount }
                val hue = merchant.id.fold(0) { h, c -> (h * 31 + c.code) % 360 }.toFloat()
                val sorted = when (state.sort) {
                    "rating" -> products.sortedByDescending { it.rating }
                    "price_asc" -> products.sortedBy { it.priceCents }
                    "price_desc" -> products.sortedByDescending { it.priceCents }
                    else -> products.sortedByDescending { it.soldCount }
                }
                LazyColumn(contentPadding = androidx.compose.foundation.layout.PaddingValues(bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    // the cover: logo, name, figures and the follow button
                    item {
                        Box(
                            Modifier.fillMaxWidth().padding(horizontal = 10.dp, vertical = 0.dp).clip(RoundedCornerShape(8.dp))
                                .background(Brush.linearGradient(listOf(Color.hsl(hue, 0.55f, 0.22f), Color.hsl((hue + 40f) % 360f, 0.65f, 0.42f)))).padding(16.dp),
                        ) {
                            Column {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Avatar(merchant.businessName, size = 68.dp, imageUrl = merchant.avatarUrl)
                                    Spacer(Modifier.width(12.dp))
                                    Column(Modifier.weight(1f)) {
                                        Row(verticalAlignment = Alignment.CenterVertically) {
                                            Text(merchant.businessName, color = Color.White, fontWeight = FontWeight.ExtraBold, fontSize = 20.sp, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                                            Spacer(Modifier.width(6.dp))
                                            Box(Modifier.size(18.dp).clip(CircleShape).background(Color(0xFF1E8AFF)), contentAlignment = Alignment.Center) { Text("✓", color = Color.White, fontSize = 11.sp) }
                                        }
                                        val sub = listOfNotNull(merchant.category?.name, merchant.distanceKm?.let { "%.1f ".format(java.util.Locale.US, it) + AppStrings.get(R.string.unit_km_short) }).joinToString(" · ")
                                        if (sub.isNotBlank()) Text(sub, color = Color.White.copy(alpha = 0.9f), fontSize = 13.sp)
                                    }
                                }
                                Spacer(Modifier.height(10.dp))
                                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                                    if (avg > 0) Text("★ %.1f (%d)".format(java.util.Locale.US, avg, votes), color = Color(0xFFFFD04A), fontWeight = FontWeight.Bold, fontSize = 12.5.sp)
                                    Text("${products.size} " + stringResource(R.string.shop_products), color = Color.White, fontSize = 12.5.sp)
                                    if (sold > 0) Text(stringResource(R.string.store_sold_short, if (sold >= 1000) "%.1fk+".format(java.util.Locale.US, sold / 1000.0) else sold.toString()), color = Color.White, fontSize = 12.5.sp)
                                    Spacer(Modifier.weight(1f))
                                    Surface(
                                        onClick = viewModel::toggleSaved,
                                        shape = RoundedCornerShape(4.dp),
                                        color = if (state.saved) Color.White else Color.Transparent,
                                        contentColor = if (state.saved) Color(0xFF111111) else Color.White,
                                        border = BorderStroke(1.5.dp, Color.White),
                                    ) {
                                        Text((if (state.saved) "✓ " + stringResource(R.string.place_saved) else "+ " + stringResource(R.string.shop_follow)), fontWeight = FontWeight.ExtraBold, fontSize = 13.sp, modifier = Modifier.padding(horizontal = 16.dp, vertical = 7.dp))
                                    }
                                }
                                Spacer(Modifier.height(6.dp))
                                OpenBadge(merchant.openStatus)
                            }
                        }
                    }
                    item { Box(Modifier.padding(horizontal = 10.dp)) { ActionRow(context, merchant, onDirections) } }
                    // tabs
                    item {
                        Row(Modifier.fillMaxWidth().background(Color.Black).padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(22.dp)) {
                            listOf("home" to R.string.shop_tab_home, "all" to R.string.shop_tab_all, "about" to R.string.shop_tab_about).forEach { (id, label) ->
                                Column(Modifier.clickable { viewModel.setTab(id) }.padding(top = 12.dp)) {
                                    Text(stringResource(label), color = if (state.tab == id) Color.White else Color.White.copy(alpha = 0.75f), fontWeight = if (state.tab == id) FontWeight.ExtraBold else FontWeight.SemiBold, fontSize = 14.sp)
                                    Spacer(Modifier.height(9.dp))
                                    Box(Modifier.height(2.dp).fillMaxWidth().background(if (state.tab == id) Color.White else Color.Transparent))
                                }
                            }
                        }
                    }
                    when (state.tab) {
                        "about" -> item {
                            ShopCard {
                                merchant.bio?.takeIf { it.isNotBlank() }?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant); Spacer(Modifier.height(10.dp)) }
                                merchant.address?.let { Text("📍 $it", style = MaterialTheme.typography.bodyMedium) }
                                merchant.phone?.takeIf { it.isNotBlank() }?.let { Spacer(Modifier.height(6.dp)); Text("📞 $it", style = MaterialTheme.typography.bodyMedium) }
                                if (merchant.discounts.isNotEmpty()) {
                                    SectionTitle(stringResource(R.string.place_discounts))
                                    merchant.discounts.forEach { discount ->
                                        Surface(shape = RoundedCornerShape(10.dp), color = MaterialTheme.colorScheme.primaryContainer, modifier = Modifier.padding(bottom = 6.dp)) {
                                            Text("🏷️ ${discount.title} — ${discount.percent}%", color = MaterialTheme.colorScheme.onPrimaryContainer, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp))
                                        }
                                    }
                                }
                                if (merchant.openStatus?.hasHours == true) HoursSection(merchant)
                            }
                        }
                        "all" -> item {
                            ShopCard {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text(stringResource(R.string.shop_all_products) + "  ${sorted.size}", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.ExtraBold, modifier = Modifier.weight(1f))
                                    var open by remember { mutableStateOf(false) }
                                    Box {
                                        OutlinedButton(onClick = { open = true }, shape = RoundedCornerShape(6.dp)) {
                                            Text(stringResource(when (state.sort) { "rating" -> R.string.store_sort_rating; "price_asc" -> R.string.store_sort_price_asc; "price_desc" -> R.string.store_sort_price_desc; else -> R.string.store_sort_popular }), fontSize = 12.sp)
                                        }
                                        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
                                            listOf("popular" to R.string.store_sort_popular, "rating" to R.string.store_sort_rating, "price_asc" to R.string.store_sort_price_asc, "price_desc" to R.string.store_sort_price_desc).forEach { (k, r) ->
                                                DropdownMenuItem(text = { Text(stringResource(r)) }, onClick = { viewModel.setSort(k); open = false })
                                            }
                                        }
                                    }
                                }
                                Spacer(Modifier.height(12.dp))
                                if (sorted.isEmpty()) Text(stringResource(R.string.place_no_products), color = MaterialTheme.colorScheme.onSurfaceVariant)
                                else StoreProductGrid(sorted, state.justAdded, onProductClick, viewModel::addToCart)
                            }
                        }
                        else -> {
                            if (products.isEmpty()) item { ShopCard { Text(stringResource(R.string.place_no_products), color = MaterialTheme.colorScheme.onSurfaceVariant) } }
                            else {
                                val deals = products.filter { it.memberDiscountEnabled }
                                if (deals.isNotEmpty()) item {
                                    ShopCard {
                                        Text(stringResource(R.string.store_deals), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.ExtraBold)
                                        Spacer(Modifier.height(12.dp))
                                        StoreProductGrid(deals.take(4), state.justAdded, onProductClick, viewModel::addToCart)
                                    }
                                }
                                item {
                                    ShopCard {
                                        Row(verticalAlignment = Alignment.CenterVertically) {
                                            Text(stringResource(R.string.shop_best_in_shop), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.ExtraBold, modifier = Modifier.weight(1f))
                                            Text(stringResource(R.string.store_see_all) + " ›", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp, modifier = Modifier.clickable { viewModel.setTab("all") })
                                        }
                                        Spacer(Modifier.height(12.dp))
                                        StoreProductGrid(products.sortedByDescending { it.soldCount }.take(6), state.justAdded, onProductClick, viewModel::addToCart)
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ShopCard(content: @Composable () -> Unit) {
    Surface(modifier = Modifier.fillMaxWidth().padding(horizontal = 10.dp), shape = RoundedCornerShape(8.dp), color = MaterialTheme.colorScheme.surface) {
        Column(Modifier.padding(14.dp)) { content() }
    }
}

@Composable
private fun SectionTitle(text: String) {
    Spacer(Modifier.height(18.dp))
    Text(text, style = MaterialTheme.typography.titleMedium)
    Spacer(Modifier.height(8.dp))
}

@Composable
private fun ActionRow(context: Context, merchant: MerchantDto, onDirections: (MerchantDto) -> Unit) {
    val phone = merchant.phone?.trim().orEmpty()
    val whatsapp = merchant.whatsapp.orEmpty().filter { it.isDigit() }
    val hasLocation = merchant.latitude != null && merchant.longitude != null
    val shareText = stringResource(R.string.place_share_text, merchant.businessName, "$SHARE_BASE${merchant.id}")
    val shareChooser = stringResource(R.string.place_share_chooser)
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
        if (phone.isNotEmpty()) PlaceAction(Icons.Filled.Call, stringResource(R.string.place_call), Modifier.weight(1f)) { launch(context, Intent(Intent.ACTION_DIAL, Uri.parse("tel:$phone"))) }
        if (whatsapp.isNotEmpty()) PlaceAction(Icons.Filled.Chat, stringResource(R.string.place_whatsapp), Modifier.weight(1f)) { launch(context, Intent(Intent.ACTION_VIEW, Uri.parse("https://wa.me/$whatsapp"))) }
        if (hasLocation) PlaceAction(Icons.Filled.Directions, stringResource(R.string.place_directions), Modifier.weight(1f)) { onDirections(merchant) }
        PlaceAction(Icons.Filled.Share, stringResource(R.string.place_share), Modifier.weight(1f)) {
            val text = shareText
            launch(context, Intent.createChooser(Intent(Intent.ACTION_SEND).apply { type = "text/plain"; putExtra(Intent.EXTRA_TEXT, text) }, shareChooser))
        }
    }
}

private fun launch(context: Context, intent: Intent) {
    runCatching { context.startActivity(intent) }
}

@Composable
private fun PlaceAction(icon: ImageVector, label: String, modifier: Modifier, highlighted: Boolean = false, onClick: () -> Unit) {
    Surface(
        onClick = onClick,
        modifier = modifier,
        shape = RoundedCornerShape(14.dp),
        color = if (highlighted) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surface,
        contentColor = if (highlighted) Color.White else MaterialTheme.colorScheme.primary,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
    ) {
        Column(Modifier.padding(vertical = 10.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Icon(icon, contentDescription = label, modifier = Modifier.size(22.dp))
            Spacer(Modifier.height(2.dp))
            Text(label, style = MaterialTheme.typography.labelSmall)
        }
    }
}

@Composable
private fun HoursSection(merchant: MerchantDto) {
    // "Today" is the platform's day (Damascus) — the same clock the server uses for open/closed.
    val today = when (ZonedDateTime.now(ZoneId.of("Asia/Damascus")).dayOfWeek) {
        DayOfWeek.SATURDAY -> "sat"
        DayOfWeek.SUNDAY -> "sun"
        DayOfWeek.MONDAY -> "mon"
        DayOfWeek.TUESDAY -> "tue"
        DayOfWeek.WEDNESDAY -> "wed"
        DayOfWeek.THURSDAY -> "thu"
        else -> "fri"
    }
    SectionTitle(stringResource(R.string.hours_title))
    Surface(shape = RoundedCornerShape(16.dp), border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)) {
        Column(Modifier.padding(horizontal = 14.dp, vertical = 6.dp)) {
            DAY_ORDER.forEach { day ->
                val ranges = merchant.openingHours?.get(day).orEmpty()
                val text = if (ranges.isEmpty()) AppStrings.get(R.string.hours_closed) else ranges.joinToString(AppStrings.get(R.string.hours_separator)) { if (it.open == it.close) AppStrings.get(R.string.hours_all_day) else "${formatClock(it.open)} – ${formatClock(it.close)}" }
                Row(Modifier.fillMaxWidth().padding(vertical = 7.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(DAY_LABEL[day].orEmpty(), fontWeight = if (day == today) FontWeight.Bold else FontWeight.Normal, color = if (day == today) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface)
                    Text(text, fontWeight = if (day == today) FontWeight.Bold else FontWeight.Normal, color = if (ranges.isEmpty()) MaterialTheme.colorScheme.onSurfaceVariant else if (day == today) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface)
                }
            }
        }
    }
}
