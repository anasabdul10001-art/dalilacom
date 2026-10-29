package com.dalilacom.app.ui.merchantmode

import com.dalilacom.app.R
import com.dalilacom.app.ui.i18n.AppStrings
import androidx.compose.foundation.clickable
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
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.res.stringResource
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.dalilacom.app.data.network.ProductDto
import com.dalilacom.app.ui.ViewModelFactory
import com.dalilacom.app.ui.common.ownPrice

@Composable
fun CatalogScreen(factory: ViewModelFactory, onProductClick: (String) -> Unit, onAddProduct: () -> Unit, onOpenHours: () -> Unit, onOpenProfile: () -> Unit, onAddByPhoto: () -> Unit = {}, onOpenDiscounts: () -> Unit = {}, onOpenShipping: () -> Unit = {}, onOpenAiPlans: () -> Unit = {}, onOpenBranches: () -> Unit = {}, onOpenStore: () -> Unit = {}) {
    val viewModel: CatalogViewModel = viewModel(factory = factory)
    val state by viewModel.uiState.collectAsState()

    LaunchedEffect(Unit) { viewModel.refresh() }

    Column(modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
        Text(AppStrings.get(R.string.s_d766cb06), style = MaterialTheme.typography.headlineSmall, color = MaterialTheme.colorScheme.primary)
        Spacer(Modifier.height(16.dp))
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
            Text(stringResource(R.string.catalog_my_products, state.products.size), style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.primary)
            if (!state.storeClosed) Button(onClick = onAddProduct) { Text(AppStrings.get(R.string.s_261429f0)) }
        }
        Text(stringResource(R.string.catalog_edit_hint), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 3.dp, bottom = 8.dp))
        when {
            state.isLoading -> CircularProgressIndicator()
            state.products.isEmpty() -> Text(AppStrings.get(R.string.s_69bbe90d), style = MaterialTheme.typography.bodyMedium)
            else -> state.products.forEach { product ->
                CatalogProductRow(product, state.priceCurrency, onClick = { onProductClick(product.id) })
            }
        }
        Spacer(Modifier.height(12.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            androidx.compose.material3.OutlinedButton(onClick = onOpenProfile, modifier = Modifier.weight(1f)) { Text(AppStrings.get(R.string.s_8008e7e0)) }
            androidx.compose.material3.OutlinedButton(onClick = onOpenHours, modifier = Modifier.weight(1f)) { Text(AppStrings.get(R.string.s_4a3ccec5)) }
        }
        Spacer(Modifier.height(12.dp))
        androidx.compose.material3.OutlinedButton(onClick = onOpenBranches, modifier = Modifier.fillMaxWidth()) { Text("🏬  " + stringResource(R.string.br_title)) }
        Spacer(Modifier.height(8.dp))
        androidx.compose.material3.OutlinedButton(onClick = onOpenShipping, modifier = Modifier.fillMaxWidth()) { Text("🚚  " + stringResource(R.string.ship_title)) }
        Spacer(Modifier.height(8.dp))
        androidx.compose.material3.OutlinedButton(onClick = onOpenAiPlans, modifier = Modifier.fillMaxWidth()) { Text("✨  " + stringResource(R.string.ai_plans_title)) }
        Spacer(Modifier.height(12.dp))

        if (state.storeClosed) {
            androidx.compose.material3.Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(14.dp)) {
                    Text(stringResource(R.string.sp_closed_title), style = MaterialTheme.typography.titleMedium)
                    Text(stringResource(R.string.sp_closed_sub), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(Modifier.height(8.dp))
                    Button(onClick = onOpenStore, modifier = Modifier.fillMaxWidth()) { Text("🛍️  " + stringResource(R.string.sp_choose_btn)) }
                }
            }
        } else {
            Button(onClick = onAddByPhoto, shape = androidx.compose.foundation.shape.RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth().height(56.dp)) {
                Text("📷  " + stringResource(R.string.wiz_start), fontWeight = androidx.compose.ui.text.font.FontWeight.ExtraBold)
            }
            Text(stringResource(R.string.wiz_start_sub), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 4.dp))
        }
        Spacer(Modifier.height(12.dp))

        Button(onClick = onOpenDiscounts, shape = androidx.compose.foundation.shape.RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth().height(52.dp)) {
            Text("🏷️  " + stringResource(R.string.disc_open), fontWeight = androidx.compose.ui.text.font.FontWeight.ExtraBold)
        }
        if (state.discounts.isNotEmpty()) {
            Text(
                state.discounts.joinToString("  ·  ") { "${it.title} ${it.percent}%" },
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.primary,
                modifier = Modifier.padding(top = 4.dp),
            )
        }

        Spacer(Modifier.height(12.dp))
        com.dalilacom.app.ui.common.PricingCard(state.priceCurrency, state.usdRateSyp, state.showBothCurrencies) { currency, rate, both -> viewModel.savePricing(currency, rate, both) }

        Spacer(Modifier.height(20.dp))
        state.error?.let {
            Spacer(Modifier.height(8.dp))
            Text(it, color = MaterialTheme.colorScheme.error)
        }
    }
}

@Composable
private fun CatalogProductRow(product: ProductDto, shopMoney: String?, onClick: () -> Unit) {
    Card(modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp).clickable(onClick = onClick)) {
        Column(Modifier.padding(16.dp)) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(product.name, style = MaterialTheme.typography.titleMedium)
                Column(horizontalAlignment = Alignment.End) {
                    Text(if (product.isActive) AppStrings.get(R.string.s_41b05461) else AppStrings.get(R.string.s_cbc18737), color = if (product.isActive) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                    Text(stringResource(R.string.catalog_edit_product), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
                }
            }
            if (product.moderation == "PENDING") Text("⏳ " + androidx.compose.ui.res.stringResource(R.string.rev_pending), color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.bodySmall)
            if (product.moderation == "REJECTED") Text("⚠️ " + androidx.compose.ui.res.stringResource(R.string.rev_rejected, product.moderationNote.orEmpty()), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            Text(AppStrings.get(R.string.fmt_price_stock, ownPrice(product, shopMoney), product.stock), style = MaterialTheme.typography.bodySmall)
        }
    }
}
