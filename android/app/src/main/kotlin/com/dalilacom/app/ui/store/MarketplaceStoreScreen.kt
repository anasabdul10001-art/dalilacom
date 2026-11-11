package com.dalilacom.app.ui.store

import com.dalilacom.app.R
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.dalilacom.app.data.AppContainer
import com.dalilacom.app.data.network.MarketplaceStoreDetailDto
import com.dalilacom.app.ui.common.formatCents
import com.dalilacom.app.ui.i18n.AppStrings

@Composable
fun MarketplaceStoreScreen(container: AppContainer, storeId: String, onBack: () -> Unit) {
    var details by remember(storeId) { mutableStateOf<MarketplaceStoreDetailDto?>(null) }
    val en = AppStrings.language == "en"
    LaunchedEffect(storeId) { details = container.marketplaceRepository.store(storeId) }
    Column(Modifier.fillMaxSize().padding(horizontal = 16.dp)) {
        TextButton(onClick = onBack) { Text(AppStrings.get(R.string.s_fa9309cd)) }
        val current = details
        if (current == null) Text(AppStrings.get(R.string.s_e767f75b)) else {
            Text(current.store.name, style = MaterialTheme.typography.headlineSmall)
            current.store.description?.takeIf { it.isNotBlank() }?.let { Text(it, style = MaterialTheme.typography.bodyMedium) }
            Spacer(Modifier.height(12.dp))
            LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp), contentPadding = PaddingValues(bottom = 20.dp)) {
                items(current.listings, key = { it.id }) { product ->
                    Card(Modifier.fillMaxWidth()) { Column(Modifier.padding(14.dp)) {
                        product.imageUrl?.let { AsyncImage(model = it, contentDescription = product.title, modifier = Modifier.fillMaxWidth().heightIn(max = 220.dp)) }
                        Text(product.title, style = MaterialTheme.typography.titleMedium)
                        product.description?.takeIf { it.isNotBlank() }?.let { Text(it) }
                        Text(formatCents(product.priceCents) + " · " + if (product.condition == "USED") AppStrings.get(R.string.s_019d1ca7) else AppStrings.get(R.string.s_03c2e7e4), color = MaterialTheme.colorScheme.primary)
                        product.contactPhone?.let { Text((AppStrings.get(R.string.s_698d3436)) + it) }
                    } }
                }
                if (current.listings.isEmpty()) item { Text(AppStrings.get(R.string.s_9aba83cd)) }
            }
        }
    }
}
