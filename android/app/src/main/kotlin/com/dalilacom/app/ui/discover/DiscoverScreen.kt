package com.dalilacom.app.ui.discover

import android.content.Intent
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
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
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Directions
import androidx.compose.material.icons.filled.MyLocation
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Button
import androidx.compose.material3.BottomSheetScaffold
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.SheetValue
import androidx.compose.material3.SmallFloatingActionButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material3.rememberBottomSheetScaffoldState
import androidx.compose.material3.rememberStandardBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.dalilacom.app.data.network.MerchantDto
import com.dalilacom.app.ui.ViewModelFactory
import com.dalilacom.app.ui.theme.DeepRed
import com.dalilacom.app.ui.theme.PrimaryRed
import kotlinx.coroutines.launch

/**
 * The app's landing screen: a full-screen map anyone can use without an account, with a floating
 * search + filters on top and the nearby-merchants directory in a draggable sheet below.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DiscoverScreen(
    factory: ViewModelFactory,
    isGuest: Boolean,
    onLogin: () -> Unit,
    onMerchantClick: (String) -> Unit,
) {
    val viewModel: DiscoverViewModel = viewModel(factory = factory)
    val state by viewModel.uiState.collectAsState()
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var recenterTick by remember { mutableIntStateOf(0) }

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

    // Ask for the user's position as soon as the map opens — once per app session, not on every tab switch.
    LaunchedEffect(Unit) {
        if (!state.locationRequested) requestLocation()
    }

    val sheetState = rememberStandardBottomSheetState(initialValue = SheetValue.PartiallyExpanded, skipHiddenState = true)
    val scaffoldState = rememberBottomSheetScaffoldState(bottomSheetState = sheetState)

    BottomSheetScaffold(
        scaffoldState = scaffoldState,
        sheetPeekHeight = 210.dp,
        sheetShape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp),
        sheetContainerColor = MaterialTheme.colorScheme.surface,
        sheetShadowElevation = 16.dp,
        sheetContent = {
            DirectorySheet(
                state = state,
                onMerchantClick = onMerchantClick,
                onDirections = { merchant -> openDirections(context, merchant) },
            )
        },
    ) { innerPadding ->
        Box(Modifier.fillMaxSize()) {
            MerchantsMap(
                merchants = state.merchants,
                userLocation = state.userLocation,
                selectedId = state.selectedMerchantId,
                onSelect = { id ->
                    viewModel.selectMerchant(id)
                    scope.launch { sheetState.partialExpand() }
                },
                recenterTick = recenterTick,
                modifier = Modifier.fillMaxSize(),
            )

            Column(Modifier.fillMaxWidth().padding(top = 10.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    SearchPill(
                        query = state.query,
                        onQueryChange = viewModel::onQueryChange,
                        modifier = Modifier.weight(1f),
                    )
                    if (isGuest) {
                        Spacer(Modifier.width(8.dp))
                        Surface(
                            onClick = onLogin,
                            shape = RoundedCornerShape(26.dp),
                            color = MaterialTheme.colorScheme.primary,
                            shadowElevation = 6.dp,
                        ) {
                            Text(
                                "دخول",
                                color = Color.White,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.padding(horizontal = 18.dp, vertical = 14.dp),
                            )
                        }
                    }
                }
                Spacer(Modifier.height(8.dp))
                LazyRow(
                    contentPadding = PaddingValues(horizontal = 12.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    item { MapChip("الكل", state.selectedCategoryId == null && !state.discountsOnly) {
                        viewModel.onCategorySelected(null)
                        if (state.discountsOnly) viewModel.onDiscountsOnlyChange(false)
                    } }
                    item { MapChip("🏷️ فيها حسم", state.discountsOnly) { viewModel.onDiscountsOnlyChange(!state.discountsOnly) } }
                    items(state.categories) { category ->
                        MapChip(category.name, state.selectedCategoryId == category.id) { viewModel.onCategorySelected(category.id) }
                    }
                }
                if (state.userLocation != null) {
                    Spacer(Modifier.height(8.dp))
                    LazyRow(
                        contentPadding = PaddingValues(horizontal = 12.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        listOf<Double?>(null, 2.0, 5.0, 10.0, 25.0).forEach { radius ->
                            item {
                                MapChip(
                                    if (radius == null) "أي مسافة" else "${radius.toInt()} كم",
                                    state.radiusKm == radius,
                                ) { viewModel.onRadiusSelected(radius) }
                            }
                        }
                    }
                }
                LocationNotice(state.locationStatus, onRetry = { requestLocation() })
            }

            SmallFloatingActionButton(
                onClick = {
                    requestLocation()
                    recenterTick++
                },
                containerColor = MaterialTheme.colorScheme.surface,
                contentColor = MaterialTheme.colorScheme.primary,
                modifier = Modifier.align(Alignment.BottomStart).padding(start = 16.dp, bottom = innerPadding.calculateBottomPadding() + 16.dp),
            ) { Icon(Icons.Filled.MyLocation, contentDescription = "موقعي") }

            if (state.isLoading && state.allMerchants.isEmpty()) {
                CircularProgressIndicator(Modifier.align(Alignment.Center), color = MaterialTheme.colorScheme.primary)
            }
        }
    }
}

private fun openDirections(context: android.content.Context, merchant: MerchantDto) {
    val lat = merchant.latitude ?: return
    val lng = merchant.longitude ?: return
    val uri = Uri.parse("https://www.google.com/maps/dir/?api=1&destination=$lat,$lng")
    runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, uri)) }
}

@Composable
private fun SearchPill(query: String, onQueryChange: (String) -> Unit, modifier: Modifier = Modifier) {
    Surface(modifier = modifier, shape = RoundedCornerShape(28.dp), shadowElevation = 8.dp, color = MaterialTheme.colorScheme.surface) {
        TextField(
            value = query,
            onValueChange = onQueryChange,
            placeholder = { Text("دوّر على محل أو خدمة...", color = MaterialTheme.colorScheme.onSurfaceVariant) },
            leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null, tint = MaterialTheme.colorScheme.primary) },
            trailingIcon = {
                if (query.isNotEmpty()) IconButton(onClick = { onQueryChange("") }) { Icon(Icons.Filled.Clear, contentDescription = "مسح") }
            },
            singleLine = true,
            colors = TextFieldDefaults.colors(
                focusedContainerColor = Color.Transparent,
                unfocusedContainerColor = Color.Transparent,
                focusedIndicatorColor = Color.Transparent,
                unfocusedIndicatorColor = Color.Transparent,
            ),
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

@Composable
private fun MapChip(label: String, selected: Boolean, onClick: () -> Unit) {
    Surface(
        onClick = onClick,
        shape = RoundedCornerShape(20.dp),
        shadowElevation = 4.dp,
        color = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surface,
        contentColor = if (selected) Color.White else MaterialTheme.colorScheme.onSurface,
    ) {
        Text(label, style = MaterialTheme.typography.labelLarge, modifier = Modifier.padding(horizontal = 14.dp, vertical = 8.dp))
    }
}

@Composable
private fun LocationNotice(status: LocationStatus, onRetry: () -> Unit) {
    val message = when (status) {
        LocationStatus.Loading -> "عم نحدد موقعك..."
        LocationStatus.Denied -> "فعّل إذن الموقع لنعرض لك الأقرب إلك"
        LocationStatus.Unavailable -> "ما قدرنا نحدد موقعك — تأكد إن الـGPS شغّال"
        else -> return
    }
    Spacer(Modifier.height(8.dp))
    Surface(
        modifier = Modifier.padding(horizontal = 12.dp),
        shape = RoundedCornerShape(14.dp),
        shadowElevation = 4.dp,
        color = MaterialTheme.colorScheme.surface,
    ) {
        Row(Modifier.padding(start = 14.dp, end = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(message, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(vertical = 10.dp))
            if (status != LocationStatus.Loading) TextButton(onClick = onRetry) { Text("تفعيل") }
        }
    }
}

@Composable
private fun DirectorySheet(state: DiscoverUiState, onMerchantClick: (String) -> Unit, onDirections: (MerchantDto) -> Unit) {
    Column(Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 4.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                if (state.userLocation != null) "المحلات القريبة منك" else "دليل المحلات",
                style = MaterialTheme.typography.titleMedium,
            )
            Surface(shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.primaryContainer) {
                Text(
                    "${state.merchants.size} محل",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onPrimaryContainer,
                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                )
            }
        }
        if (state.merchants.isEmpty()) {
            Text(
                if (state.isLoading) "عم نحمّل المحلات..." else "ما لقينا محلات بهالفلاتر — جرّب تغيّر البحث أو المسافة",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(20.dp),
            )
        } else {
            val ordered = state.merchants.sortedBy { if (it.id == state.selectedMerchantId) 0 else 1 }
            LazyColumn(
                modifier = Modifier.fillMaxWidth().heightIn(max = 520.dp),
                contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 6.dp, bottom = 24.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                items(ordered, key = { it.id }) { merchant ->
                    MerchantCard(
                        merchant = merchant,
                        selected = merchant.id == state.selectedMerchantId,
                        onDetails = { onMerchantClick(merchant.id) },
                        onDirections = { onDirections(merchant) },
                    )
                }
            }
        }
    }
}

@Composable
private fun MerchantCard(merchant: MerchantDto, selected: Boolean, onDetails: () -> Unit, onDirections: () -> Unit) {
    Surface(
        shape = RoundedCornerShape(18.dp),
        color = MaterialTheme.colorScheme.surface,
        tonalElevation = 1.dp,
        border = BorderStroke(if (selected) 2.dp else 1.dp, if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant),
        modifier = Modifier.fillMaxWidth().clickable(onClick = onDetails),
    ) {
        Column(Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier.size(48.dp).clip(CircleShape).background(Brush.linearGradient(listOf(DeepRed, PrimaryRed))),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(merchant.businessName.take(1), color = Color.White, fontSize = 20.sp, fontWeight = FontWeight.Bold)
                }
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text(merchant.businessName, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    val subtitle = listOfNotNull(merchant.category?.name, merchant.address).joinToString(" • ")
                    if (subtitle.isNotBlank()) {
                        Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
                merchant.distanceKm?.let { distance ->
                    Surface(shape = RoundedCornerShape(10.dp), color = MaterialTheme.colorScheme.surfaceVariant) {
                        Text(
                            if (distance < 1) "%.0f م".format(distance * 1000) else "%.1f كم".format(distance),
                            style = MaterialTheme.typography.labelMedium,
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp),
                        )
                    }
                }
            }
            if (merchant.discounts.isNotEmpty()) {
                Spacer(Modifier.height(10.dp))
                LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    items(merchant.discounts) { discount ->
                        Surface(shape = RoundedCornerShape(10.dp), color = MaterialTheme.colorScheme.primaryContainer) {
                            Text(
                                "🏷️ ${discount.title} −${discount.percent}%",
                                style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.onPrimaryContainer,
                                modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp),
                            )
                        }
                    }
                }
            }
            Spacer(Modifier.height(12.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = onDetails, shape = RoundedCornerShape(12.dp), modifier = Modifier.weight(1f)) { Text("التفاصيل") }
                if (merchant.latitude != null && merchant.longitude != null) {
                    OutlinedButton(onClick = onDirections, shape = RoundedCornerShape(12.dp), modifier = Modifier.weight(1f)) {
                        Icon(Icons.Filled.Directions, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(6.dp))
                        Text("الاتجاهات")
                    }
                }
            }
        }
    }
}
