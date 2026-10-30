package com.dalilacom.app.ui.merchantmode

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
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
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.compose.AsyncImage
import com.dalilacom.app.R
import com.dalilacom.app.data.network.ProductDto
import com.dalilacom.app.data.network.absoluteUrl
import com.dalilacom.app.ui.ViewModelFactory
import com.dalilacom.app.ui.common.ownPrice
import com.dalilacom.app.ui.i18n.AppStrings

@Composable
fun CatalogScreen(
    factory: ViewModelFactory,
    onProductClick: (String) -> Unit,
    onAddProduct: () -> Unit,
    onOpenHours: () -> Unit,
    onOpenProfile: () -> Unit,
    onAddByPhoto: () -> Unit = {},
    onOpenDiscounts: () -> Unit = {},
    onOpenShipping: () -> Unit = {},
    onOpenAiPlans: () -> Unit = {},
    onOpenBranches: () -> Unit = {},
    onOpenStore: () -> Unit = {},
) {
    val viewModel: CatalogViewModel = viewModel(factory = factory)
    val state by viewModel.uiState.collectAsState()
    var showPricing by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) { viewModel.refresh() }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 14.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item {
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(24.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer),
            ) {
                Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("🏪  ${AppStrings.get(R.string.merchant_manage_tab)}", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
                    Text(stringResource(R.string.merchant_manage_title), style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.ExtraBold)
                    Text(stringResource(R.string.merchant_manage_intro), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }

        if (state.storeClosed) {
            item {
                Card(shape = RoundedCornerShape(18.dp), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerHigh)) {
                    Column(Modifier.padding(16.dp)) {
                        Text(stringResource(R.string.sp_closed_title), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                        Text(stringResource(R.string.sp_closed_sub), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Spacer(Modifier.height(10.dp))
                        Button(onClick = onOpenStore, modifier = Modifier.fillMaxWidth()) { Text("🛍️  ${stringResource(R.string.sp_choose_btn)}") }
                    }
                }
            }
        } else {
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                    ActionTile(
                        emoji = "📷",
                        title = stringResource(R.string.merchant_manage_add_photo),
                        subtitle = stringResource(R.string.wiz_start_sub),
                        modifier = Modifier.weight(1f),
                        prominent = true,
                        onClick = onAddByPhoto,
                    )
                    ActionTile(
                        emoji = "✍️",
                        title = stringResource(R.string.merchant_manage_add_manual),
                        subtitle = stringResource(R.string.merchant_manage_products_hint),
                        modifier = Modifier.weight(1f),
                        prominent = false,
                        onClick = onAddProduct,
                    )
                }
            }
        }

        item {
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                Text(stringResource(R.string.merchant_manage_products, state.products.size), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                if (!state.storeClosed) Text("${state.products.count { it.isActive }} ${AppStrings.get(R.string.s_41b05461)}", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
            }
        }
        item { Text(stringResource(R.string.merchant_manage_products_hint), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }

        when {
            state.isLoading -> item { Box(Modifier.fillMaxWidth().padding(28.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator() } }
            state.products.isEmpty() -> item {
                Surface(shape = RoundedCornerShape(20.dp), color = MaterialTheme.colorScheme.surfaceContainerLow, modifier = Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(22.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("🛍️", style = MaterialTheme.typography.displaySmall)
                        Text(stringResource(R.string.merchant_manage_empty_title), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                        Text(stringResource(R.string.merchant_manage_empty_sub), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
            else -> items(state.products, key = { it.id }) { product ->
                CatalogProductRow(product, state.priceCurrency, onClick = { onProductClick(product.id) })
            }
        }

        item { Text(stringResource(R.string.merchant_manage_tools), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 4.dp)) }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                ActionTile("🚚", stringResource(R.string.merchant_manage_shipping), stringResource(R.string.ship_sub), Modifier.weight(1f), false, onOpenShipping)
                ActionTile("✨", stringResource(R.string.merchant_manage_ai), stringResource(R.string.ai_plans_sub), Modifier.weight(1f), false, onOpenAiPlans)
            }
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                ActionTile("🏷️", stringResource(R.string.merchant_manage_discounts), stringResource(R.string.disc_title), Modifier.weight(1f), false, onOpenDiscounts)
                ActionTile("🏬", stringResource(R.string.merchant_manage_branches), stringResource(R.string.merchant_manage_details), Modifier.weight(1f), false, onOpenBranches)
            }
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                ActionTile("📍", stringResource(R.string.merchant_manage_details), stringResource(R.string.merchant_manage_location_hint), Modifier.weight(1f), false, onOpenProfile)
                ActionTile("🕒", stringResource(R.string.merchant_manage_hours), stringResource(R.string.merchant_manage_hours_hint), Modifier.weight(1f), false, onOpenHours)
            }
        }
        item {
            OutlinedButton(onClick = { showPricing = !showPricing }, modifier = Modifier.fillMaxWidth()) {
                Text("💰  ${stringResource(R.string.merchant_manage_pricing)}  ${if (showPricing) "⌃" else "⌄"}")
            }
        }
        if (showPricing) item {
            Card(shape = RoundedCornerShape(18.dp), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow)) {
                Column(Modifier.padding(14.dp)) {
                    Text(stringResource(R.string.merchant_manage_pricing), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(10.dp))
                    com.dalilacom.app.ui.common.PricingCard(state.priceCurrency, state.usdRateSyp, state.showBothCurrencies) { currency, rate, both -> viewModel.savePricing(currency, rate, both) }
                }
            }
        }
        state.error?.let { message -> item { Text(message, color = MaterialTheme.colorScheme.error) } }
        item { Spacer(Modifier.height(10.dp)) }
    }
}

@Composable
private fun ActionTile(emoji: String, title: String, subtitle: String, modifier: Modifier = Modifier, prominent: Boolean, onClick: () -> Unit) {
    Card(
        modifier = modifier.height(132.dp).clickable(onClick = onClick),
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = if (prominent) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceContainerHigh),
    ) {
        Column(Modifier.fillMaxSize().padding(14.dp), verticalArrangement = Arrangement.SpaceBetween) {
            Text(emoji, style = MaterialTheme.typography.headlineSmall)
            Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold, color = if (prominent) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Text(subtitle, style = MaterialTheme.typography.labelSmall, color = if (prominent) MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.82f) else MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
        }
    }
}

@Composable
private fun CatalogProductRow(product: ProductDto, shopMoney: String?, onClick: () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick),
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow),
    ) {
        Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            val photo = product.images.firstOrNull() ?: product.imageUrl
            Box(Modifier.size(76.dp).clip(RoundedCornerShape(14.dp)).background(MaterialTheme.colorScheme.secondaryContainer), contentAlignment = Alignment.Center) {
                if (!photo.isNullOrBlank()) AsyncImage(
                    model = if (photo.startsWith("/")) absoluteUrl(photo) else photo,
                    contentDescription = product.name,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxSize(),
                ) else Text("🛍️", style = MaterialTheme.typography.headlineMedium)
            }
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(product.name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Text(AppStrings.get(R.string.fmt_price_stock, ownPrice(product, shopMoney), product.stock), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                    ProductStateChip(product.isActive)
                    when (product.moderation) {
                        "PENDING" -> Text("⏳ " + stringResource(R.string.rev_pending), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.tertiary, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        "REJECTED" -> Text("⚠️ " + stringResource(R.string.rev_rejected, product.moderationNote.orEmpty()), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.error, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
            }
            Text("✏️", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.primary)
        }
    }
}

@Composable
private fun ProductStateChip(active: Boolean) {
    val label = if (active) AppStrings.get(R.string.s_41b05461) else AppStrings.get(R.string.s_cbc18737)
    val tint = if (active) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outline
    Surface(shape = RoundedCornerShape(50), color = tint.copy(alpha = 0.10f)) {
        Text(label, Modifier.padding(horizontal = 9.dp, vertical = 4.dp), style = MaterialTheme.typography.labelSmall, color = tint, fontWeight = FontWeight.SemiBold)
    }
}
