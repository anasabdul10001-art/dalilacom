package com.dalilacom.app.ui.discover

import android.content.Intent
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.dalilacom.app.data.network.MerchantDto
import com.dalilacom.app.ui.ViewModelFactory
import kotlinx.coroutines.launch

@Composable
fun DiscoverScreen(factory: ViewModelFactory, onMerchantClick: (String) -> Unit) {
    val viewModel: DiscoverViewModel = viewModel(factory = factory)
    val state by viewModel.uiState.collectAsState()
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    fun fetchLocation() {
        viewModel.markLocationRequested()
        scope.launch {
            val location = LocationHelper.current(context)
            if (location != null) viewModel.onLocation(location) else viewModel.onLocationUnavailable()
        }
    }

    val permissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { grants ->
        if (grants.values.any { it }) fetchLocation() else viewModel.onLocationDenied()
    }

    fun requestLocation() {
        if (LocationHelper.hasPermission(context)) fetchLocation() else permissionLauncher.launch(LocationHelper.PERMISSIONS)
    }

    // The map opens already asking for the user's position — once per app session, not on every tab switch.
    LaunchedEffect(Unit) {
        if (!state.locationRequested) requestLocation()
    }

    Column(modifier = Modifier.fillMaxSize().padding(horizontal = 12.dp, vertical = 8.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Text("دليلكم — حواليك", style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.primary)
            TextButton(onClick = { requestLocation() }) { Text("📍 موقعي") }
        }

        when (state.locationStatus) {
            LocationStatus.Loading -> Text("عم نحدد موقعك...", style = MaterialTheme.typography.bodySmall)
            LocationStatus.Denied -> Text("ما أعطيت إذن الموقع — اضغط «موقعي» للسماح وشوف الأقرب إلك", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
            LocationStatus.Unavailable -> Text("ما قدرنا نحدد موقعك — تأكد إن الـGPS شغّال", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
            else -> Unit
        }

        OutlinedTextField(
            value = state.query,
            onValueChange = viewModel::onQueryChange,
            label = { Text("دور على اسم محل...") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
        )
        Spacer(Modifier.height(6.dp))
        LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            item {
                FilterChip(selected = state.selectedCategoryId == null, onClick = { viewModel.onCategorySelected(null) }, label = { Text("الكل") })
            }
            items(state.categories) { category ->
                FilterChip(
                    selected = state.selectedCategoryId == category.id,
                    onClick = { viewModel.onCategorySelected(category.id) },
                    label = { Text(category.name) },
                )
            }
        }
        LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            item {
                FilterChip(selected = state.discountsOnly, onClick = { viewModel.onDiscountsOnlyChange(!state.discountsOnly) }, label = { Text("🏷️ فيها حسم") })
            }
            if (state.userLocation != null) {
                listOf<Double?>(null, 2.0, 5.0, 10.0, 25.0).forEach { radius ->
                    item {
                        FilterChip(
                            selected = state.radiusKm == radius,
                            onClick = { viewModel.onRadiusSelected(radius) },
                            label = { Text(if (radius == null) "أي مسافة" else "${radius.toInt()} كم") },
                        )
                    }
                }
            }
        }
        Spacer(Modifier.height(6.dp))

        MerchantsMap(
            merchants = state.merchants,
            userLocation = state.userLocation,
            selectedId = state.selectedMerchantId,
            onSelect = viewModel::selectMerchant,
            modifier = Modifier.fillMaxWidth().weight(1f),
        )
        Spacer(Modifier.height(6.dp))

        Box(Modifier.fillMaxWidth().weight(1f)) {
            when {
                state.isLoading && state.allMerchants.isEmpty() -> CircularProgressIndicator(Modifier.align(Alignment.Center))
                state.merchants.isEmpty() -> Text("ما في نتائج", style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(8.dp))
                else -> {
                    val ordered = state.merchants.sortedBy { if (it.id == state.selectedMerchantId) 0 else 1 }
                    LazyColumn {
                        items(ordered, key = { it.id }) { merchant ->
                            MerchantRow(
                                merchant = merchant,
                                selected = merchant.id == state.selectedMerchantId,
                                onClick = { onMerchantClick(merchant.id) },
                                onDirections = {
                                    val lat = merchant.latitude
                                    val lng = merchant.longitude
                                    if (lat != null && lng != null) {
                                        val uri = Uri.parse("https://www.google.com/maps/dir/?api=1&destination=$lat,$lng")
                                        runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, uri)) }
                                    }
                                },
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun MerchantRow(merchant: MerchantDto, selected: Boolean, onClick: () -> Unit, onDirections: () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp).clickable(onClick = onClick),
        colors = if (selected) CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer) else CardDefaults.cardColors(),
    ) {
        Column(Modifier.padding(12.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(merchant.businessName, style = MaterialTheme.typography.titleMedium)
                merchant.distanceKm?.let {
                    Text(if (it < 1) "%.0f م".format(it * 1000) else "%.1f كم".format(it), style = MaterialTheme.typography.bodySmall)
                }
            }
            merchant.category?.let { Text(it.name, style = MaterialTheme.typography.bodySmall) }
            merchant.address?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
            merchant.discounts.forEach { discount ->
                Text("🏷️ ${discount.title} — ${discount.percent}%", color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.bodySmall)
            }
            if (merchant.latitude != null && merchant.longitude != null) {
                OutlinedButton(onClick = onDirections, modifier = Modifier.padding(top = 4.dp)) { Text("🧭 كيف بروح لعنده") }
            }
        }
    }
}
