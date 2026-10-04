package com.dalilacom.app.ui.merchant

import android.content.Context
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
import com.dalilacom.app.data.AppContainer
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
) {
    val viewModel: MerchantDetailViewModel = viewModel(
        factory = viewModelFactory {
            initializer {
                MerchantDetailViewModel(container.discoverRepository, container.productRepository, container.placesRepository, merchantId)
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

    Column(modifier = Modifier.fillMaxSize()) {
        TextButton(onClick = onBack, modifier = Modifier.padding(horizontal = 8.dp)) { Text("‹ رجوع") }

        when {
            state.isLoading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            state.error != null -> Text(state.error!!, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(16.dp))
            else -> {
                val merchant = state.merchant!!
                LazyColumn(contentPadding = androidx.compose.foundation.layout.PaddingValues(start = 16.dp, end = 16.dp, bottom = 24.dp)) {
                    item { PlaceHeader(merchant) }
                    merchant.bio?.takeIf { it.isNotBlank() }?.let { bio ->
                        item { Spacer(Modifier.height(12.dp)); Text(bio, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                    }
                    item { Spacer(Modifier.height(14.dp)); ActionRow(context, merchant, state.saved, viewModel::toggleSaved, onDirections) }
                    merchant.address?.let { address ->
                        item { Spacer(Modifier.height(12.dp)); Text("📍 $address", style = MaterialTheme.typography.bodyMedium) }
                    }
                    if (merchant.discounts.isNotEmpty()) {
                        item { SectionTitle("الحسوم") }
                        items(merchant.discounts, key = { it.id }) { discount ->
                            Surface(shape = RoundedCornerShape(10.dp), color = MaterialTheme.colorScheme.primaryContainer, modifier = Modifier.padding(bottom = 6.dp)) {
                                Text(
                                    "🏷️ ${discount.title} — ${discount.percent}%",
                                    color = MaterialTheme.colorScheme.onPrimaryContainer,
                                    style = MaterialTheme.typography.bodyMedium,
                                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                                )
                            }
                        }
                    }
                    if (merchant.openStatus?.hasHours == true) item { HoursSection(merchant) }
                    item { SectionTitle("المنتجات") }
                    if (state.products.isEmpty()) {
                        item { Text("ما في منتجات بعد", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                    } else {
                        items(state.products, key = { it.id }) { product -> ProductRow(product, onClick = { onProductClick(product.id) }) }
                    }
                }
            }
        }
    }
}

@Composable
private fun PlaceHeader(merchant: MerchantDto) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Avatar(merchant.businessName, size = 64.dp, imageUrl = merchant.avatarUrl)
        Spacer(Modifier.width(14.dp))
        Column {
            Text(merchant.businessName, style = MaterialTheme.typography.headlineSmall)
            merchant.category?.let { Text(it.name, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            Spacer(Modifier.height(6.dp))
            OpenBadge(merchant.openStatus)
        }
    }
}

@Composable
private fun SectionTitle(text: String) {
    Spacer(Modifier.height(18.dp))
    Text(text, style = MaterialTheme.typography.titleMedium)
    Spacer(Modifier.height(8.dp))
}

@Composable
private fun ActionRow(context: Context, merchant: MerchantDto, saved: Boolean, onToggleSaved: () -> Unit, onDirections: (MerchantDto) -> Unit) {
    val phone = merchant.phone?.trim().orEmpty()
    val whatsapp = merchant.whatsapp.orEmpty().filter { it.isDigit() }
    val hasLocation = merchant.latitude != null && merchant.longitude != null
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
        if (phone.isNotEmpty()) PlaceAction(Icons.Filled.Call, "اتصال", Modifier.weight(1f)) { launch(context, Intent(Intent.ACTION_DIAL, Uri.parse("tel:$phone"))) }
        if (whatsapp.isNotEmpty()) PlaceAction(Icons.Filled.Chat, "واتساب", Modifier.weight(1f)) { launch(context, Intent(Intent.ACTION_VIEW, Uri.parse("https://wa.me/$whatsapp"))) }
        if (hasLocation) PlaceAction(Icons.Filled.Directions, "الاتجاهات", Modifier.weight(1f)) { onDirections(merchant) }
        PlaceAction(Icons.Filled.Share, "مشاركة", Modifier.weight(1f)) {
            val text = "${merchant.businessName} على دليلكم\n$SHARE_BASE${merchant.id}"
            launch(context, Intent.createChooser(Intent(Intent.ACTION_SEND).apply { type = "text/plain"; putExtra(Intent.EXTRA_TEXT, text) }, "مشاركة المحل"))
        }
        PlaceAction(if (saved) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder, if (saved) "محفوظ" else "حفظ", Modifier.weight(1f), highlighted = saved, onClick = onToggleSaved)
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
    SectionTitle("ساعات العمل")
    Surface(shape = RoundedCornerShape(16.dp), border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)) {
        Column(Modifier.padding(horizontal = 14.dp, vertical = 6.dp)) {
            DAY_ORDER.forEach { day ->
                val ranges = merchant.openingHours?.get(day).orEmpty()
                val text = if (ranges.isEmpty()) "مغلق" else ranges.joinToString("، ") { if (it.open == it.close) "24 ساعة" else "${formatClock(it.open)} – ${formatClock(it.close)}" }
                Row(Modifier.fillMaxWidth().padding(vertical = 7.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(DAY_LABEL[day].orEmpty(), fontWeight = if (day == today) FontWeight.Bold else FontWeight.Normal, color = if (day == today) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface)
                    Text(text, fontWeight = if (day == today) FontWeight.Bold else FontWeight.Normal, color = if (ranges.isEmpty()) MaterialTheme.colorScheme.onSurfaceVariant else if (day == today) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface)
                }
            }
        }
    }
}

@Composable
private fun ProductRow(product: ProductDto, onClick: () -> Unit) {
    Surface(
        shape = RoundedCornerShape(16.dp),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        modifier = Modifier.fillMaxWidth().padding(vertical = 5.dp).clickable(onClick = onClick),
    ) {
        Column(Modifier.padding(14.dp)) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(product.name, style = MaterialTheme.typography.titleMedium)
                if (!product.isActive || product.stock <= 0) {
                    Text("غير متوفر", color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                }
            }
            if (product.memberDiscountEnabled && product.memberPriceCents != null) {
                Text(
                    "${formatCents(product.priceCents)}  →  ${formatCents(product.memberPriceCents)} لأعضاء دليلكم",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.primary,
                )
            } else {
                Text(formatCents(product.priceCents), style = MaterialTheme.typography.bodyMedium)
            }
        }
    }
}
