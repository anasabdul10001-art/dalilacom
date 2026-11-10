package com.dalilacom.app.ui.store

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
        TextButton(onClick = onBack) { Text(if (en) "← Back" else "← رجوع") }
        val current = details
        if (current == null) Text(if (en) "Loading store…" else "عم نحمل المتجر…") else {
            Text(current.store.name, style = MaterialTheme.typography.headlineSmall)
            current.store.description?.takeIf { it.isNotBlank() }?.let { Text(it, style = MaterialTheme.typography.bodyMedium) }
            Spacer(Modifier.height(12.dp))
            LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp), contentPadding = PaddingValues(bottom = 20.dp)) {
                items(current.listings, key = { it.id }) { product ->
                    Card(Modifier.fillMaxWidth()) { Column(Modifier.padding(14.dp)) {
                        product.imageUrl?.let { AsyncImage(model = it, contentDescription = product.title, modifier = Modifier.fillMaxWidth().heightIn(max = 220.dp)) }
                        Text(product.title, style = MaterialTheme.typography.titleMedium)
                        product.description?.takeIf { it.isNotBlank() }?.let { Text(it) }
                        Text(formatCents(product.priceCents) + " · " + if (product.condition == "USED") if (en) "Used" else "مستعمل" else if (en) "New" else "جديد", color = MaterialTheme.colorScheme.primary)
                        product.contactPhone?.let { Text((if (en) "Contact: " else "للتواصل: ") + it) }
                    } }
                }
                if (current.listings.isEmpty()) item { Text(if (en) "This store has no published items yet" else "ما في منتجات منشورة بهالمتجر حالياً") }
            }
        }
    }
}
