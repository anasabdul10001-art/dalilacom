package com.dalilacom.app.ui.discover

import android.content.Intent
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
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
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Directions
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
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
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import android.widget.Toast
import com.dalilacom.app.data.RouteTarget
import com.dalilacom.app.data.network.MerchantDto
import com.dalilacom.app.ui.ViewModelFactory
import com.dalilacom.app.ui.common.Avatar
import com.dalilacom.app.ui.common.OpenBadge
import com.dalilacom.app.ui.common.formatDistance
import com.dalilacom.app.ui.common.formatDuration
import kotlinx.coroutines.flow.MutableStateFlow
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
    pendingRoute: MutableStateFlow<RouteTarget?>,
    isDark: Boolean,
    onToggleTheme: () -> Unit,
    onLogin: () -> Unit,
    onMerchantClick: (String) -> Unit,
) {
    val viewModel: DiscoverViewModel = viewModel(factory = factory)
    val state by viewModel.uiState.collectAsState()
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var recenterTick by remember { mutableIntStateOf(0) }
    var radiusFitTick by remember { mutableIntStateOf(0) }

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

    // "Directions" from anywhere: we need the user's position first, then the server draws the road.
    var routeWanted by remember { mutableStateOf<Pair<RouteTarget, String>?>(null) }
    fun beginRoute(target: RouteTarget, mode: String) {
        routeWanted = target to mode
        if (state.userLocation == null) requestLocation()
    }
    LaunchedEffect(routeWanted, state.userLocation) {
        val wanted = routeWanted ?: return@LaunchedEffect
        val here = state.userLocation ?: return@LaunchedEffect
        routeWanted = null
        viewModel.startRoute(wanted.first, wanted.second, here)
    }
    LaunchedEffect(state.locationStatus) {
        if (routeWanted != null && (state.locationStatus == LocationStatus.Denied || state.locationStatus == LocationStatus.Unavailable)) {
            val target = routeWanted!!.first
            routeWanted = null
            Toast.makeText(context, "ما قدرنا نحدد موقعك لنرسم الطريق — فتحناه بخرائط جوجل", Toast.LENGTH_LONG).show()
            openDirections(context, target.latitude, target.longitude)
        }
    }
    val pending by pendingRoute.collectAsState()
    LaunchedEffect(pending) {
        pending?.let {
            pendingRoute.value = null
            beginRoute(it, "driving")
        }
    }

    // Ask for the user's position as soon as the map opens — once per app session, not on every tab switch.
    LaunchedEffect(Unit) {
        if (!state.locationRequested) requestLocation()
    }

    LaunchedEffect(state.message) {
        state.message?.let {
            Toast.makeText(context, it, Toast.LENGTH_SHORT).show()
            viewModel.clearMessage()
        }
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
                onDirections = { merchant ->
                    val lat = merchant.latitude
                    val lng = merchant.longitude
                    if (lat != null && lng != null) beginRoute(RouteTarget(merchant.id, merchant.businessName, lat, lng), "driving")
                },
                onToggleSaved = { id -> if (isGuest) onLogin() else viewModel.toggleFavorite(id) },
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
                onUserMoved = viewModel::onViewportMoved,
                recenterTick = recenterTick,
                route = state.route?.data?.geometry,
                routeWalking = state.route?.mode == "walking",
                radiusKm = state.radiusKm,
                radiusFitTick = radiusFitTick,
                modifier = Modifier.fillMaxSize(),
            )

            val route = state.route
            if (route != null) {
                RouteBar(
                    route = route,
                    onMode = { mode -> beginRoute(route.target, mode) },
                    onClose = viewModel::cancelRoute,
                    onOpenGoogle = { openDirections(context, route.target.latitude, route.target.longitude) },
                    modifier = Modifier.padding(top = 10.dp, start = 12.dp, end = 12.dp),
                )
            }
            Column(Modifier.fillMaxWidth().padding(top = 10.dp)) {
                if (route == null) Row(
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    SearchPill(
                        query = state.query,
                        onQueryChange = viewModel::onQueryChange,
                        onFocusChange = viewModel::onSearchFocus,
                        onSubmit = viewModel::submitSearch,
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
                if (route == null) SuggestionsPanel(
                    state = state,
                    onMerchant = { id -> viewModel.onSearchFocus(false); onMerchantClick(id) },
                    onCategory = viewModel::pickCategory,
                    onRecent = viewModel::pickRecent,
                )
                if (route == null) Spacer(Modifier.height(8.dp))
                if (route == null) LazyRow(
                    contentPadding = PaddingValues(horizontal = 12.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    item { MapChip("الكل", state.selectedCategoryId == null && !state.discountsOnly && !state.openNow) { viewModel.resetFilters() } }
                    item { MapChip("🕒 مفتوح الآن", state.openNow) { viewModel.onOpenNowChange(!state.openNow) } }
                    item { MapChip("🏷️ فيها حسم", state.discountsOnly) { viewModel.onDiscountsOnlyChange(!state.discountsOnly) } }
                    items(state.categories) { category ->
                        MapChip(category.name, state.selectedCategoryId == category.id) { viewModel.onCategorySelected(category.id) }
                    }
                }
                if (route == null && state.userLocation != null) {
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
                                ) { viewModel.onRadiusSelected(radius); radiusFitTick++ }
                            }
                        }
                    }
                }
                if (route == null && state.searchBounds != null) {
                    Spacer(Modifier.height(8.dp))
                    Row(Modifier.padding(horizontal = 12.dp)) { MapChip("✕ مسح حدود المنطقة", true) { viewModel.clearSearchArea() } }
                }
                LocationNotice(state.locationStatus, onRetry = { requestLocation() })
            }

            if (state.areaDirty) {
                Surface(
                    onClick = { viewModel.searchThisArea() },
                    shape = RoundedCornerShape(22.dp),
                    color = MaterialTheme.colorScheme.surface.copy(alpha = 0.78f),
                    contentColor = MaterialTheme.colorScheme.primary,
                    shadowElevation = 4.dp,
                    modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = innerPadding.calculateBottomPadding() + 16.dp),
                ) {
                    Text("🔍 ابحث بهالمنطقة", style = MaterialTheme.typography.labelLarge, modifier = Modifier.padding(horizontal = 18.dp, vertical = 10.dp))
                }
            }

            SmallFloatingActionButton(
                onClick = {
                    requestLocation()
                    recenterTick++
                },
                containerColor = MaterialTheme.colorScheme.surface.copy(alpha = 0.78f),
                contentColor = MaterialTheme.colorScheme.primary,
                modifier = Modifier.align(Alignment.BottomStart).padding(start = 16.dp, bottom = innerPadding.calculateBottomPadding() + 16.dp),
            ) { Icon(Icons.Filled.MyLocation, contentDescription = "موقعي") }

            SmallFloatingActionButton(
                onClick = onToggleTheme,
                containerColor = MaterialTheme.colorScheme.surface.copy(alpha = 0.78f),
                contentColor = MaterialTheme.colorScheme.primary,
                modifier = Modifier.align(Alignment.BottomStart).padding(start = 16.dp, bottom = innerPadding.calculateBottomPadding() + 72.dp),
            ) { Text(if (isDark) "☀️" else "🌙") }

            if (state.isLoading && state.allMerchants.isEmpty()) {
                CircularProgressIndicator(Modifier.align(Alignment.Center), color = MaterialTheme.colorScheme.primary)
            }
        }
    }
}

/** Hands over to Google Maps (or any maps app) for real turn-by-turn navigation. */
private fun openDirections(context: android.content.Context, lat: Double, lng: Double) {
    val uri = Uri.parse("https://www.google.com/maps/dir/?api=1&destination=$lat,$lng")
    runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, uri)) }
}

@Composable
private fun SearchPill(
    query: String,
    onQueryChange: (String) -> Unit,
    onFocusChange: (Boolean) -> Unit,
    onSubmit: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(modifier = modifier, shape = RoundedCornerShape(28.dp), shadowElevation = 4.dp, color = MaterialTheme.colorScheme.surface.copy(alpha = 0.78f)) {
        TextField(
            value = query,
            onValueChange = onQueryChange,
            placeholder = { Text("دوّر على محل أو خدمة...", color = MaterialTheme.colorScheme.onSurfaceVariant) },
            leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null, tint = MaterialTheme.colorScheme.primary) },
            trailingIcon = {
                if (query.isNotEmpty()) IconButton(onClick = { onQueryChange("") }) { Icon(Icons.Filled.Clear, contentDescription = "مسح") }
            },
            singleLine = true,
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
            keyboardActions = KeyboardActions(onSearch = { onSubmit() }),
            colors = TextFieldDefaults.colors(
                focusedContainerColor = Color.Transparent,
                unfocusedContainerColor = Color.Transparent,
                focusedIndicatorColor = Color.Transparent,
                unfocusedIndicatorColor = Color.Transparent,
            ),
            modifier = Modifier.fillMaxWidth().onFocusChanged { onFocusChange(it.isFocused) },
        )
    }
}

@Composable
private fun SuggestionsPanel(
    state: DiscoverUiState,
    onMerchant: (String) -> Unit,
    onCategory: (String) -> Unit,
    onRecent: (String) -> Unit,
) {
    if (!state.searchFocused) return
    val typing = state.query.isNotBlank()
    val rows: List<Triple<String, String, () -> Unit>> = if (typing) {
        state.suggestions.categories.map { Triple("🗂️", it.name) { onCategory(it.id) } } +
            state.suggestions.merchants.map { m ->
                Triple("🏪", listOfNotNull(m.businessName, m.category?.name).joinToString(" · ")) { onMerchant(m.id) }
            }
    } else {
        state.recentSearches.map { q -> Triple("🕘", q) { onRecent(q) } }
    }
    if (rows.isEmpty()) return
    Surface(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp).padding(top = 6.dp),
        shape = RoundedCornerShape(16.dp),
        shadowElevation = 10.dp,
        color = MaterialTheme.colorScheme.surface,
    ) {
        Column {
            if (!typing) Text("عمليات بحث سابقة", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(start = 14.dp, top = 10.dp, end = 14.dp))
            rows.forEach { (icon, label, action) ->
                Row(
                    modifier = Modifier.fillMaxWidth().clickable(onClick = action).padding(horizontal = 14.dp, vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(icon)
                    Spacer(Modifier.width(10.dp))
                    Text(label, style = MaterialTheme.typography.bodyMedium)
                }
            }
        }
    }
}

@Composable
private fun MapChip(label: String, selected: Boolean, onClick: () -> Unit) {
    Surface(
        onClick = onClick,
        shape = RoundedCornerShape(20.dp),
        shadowElevation = 2.dp,
        color = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surface.copy(alpha = 0.78f),
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
        shadowElevation = 2.dp,
        color = MaterialTheme.colorScheme.surface.copy(alpha = 0.78f),
    ) {
        Row(Modifier.padding(start = 14.dp, end = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(message, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(vertical = 10.dp))
            if (status != LocationStatus.Loading) TextButton(onClick = onRetry) { Text("تفعيل") }
        }
    }
}

@Composable
private fun DirectorySheet(
    state: DiscoverUiState,
    onMerchantClick: (String) -> Unit,
    onDirections: (MerchantDto) -> Unit,
    onToggleSaved: (String) -> Unit,
) {
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
                if (state.isLoading) "عم نحمّل المحلات..." else if (state.radiusKm != null) "ما في محلات ضمن ${state.radiusKm.toInt()} كم منك — جرّب مسافة أكبر" else "ما لقينا محلات بهالفلاتر — جرّب تغيّر البحث أو المسافة",
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
                        saved = merchant.id in state.favoriteIds,
                        onDetails = { onMerchantClick(merchant.id) },
                        onDirections = { onDirections(merchant) },
                        onToggleSaved = { onToggleSaved(merchant.id) },
                    )
                }
            }
        }
    }
}

@Composable
private fun MerchantCard(
    merchant: MerchantDto,
    selected: Boolean,
    saved: Boolean,
    onDetails: () -> Unit,
    onDirections: () -> Unit,
    onToggleSaved: () -> Unit,
) {
    Surface(
        shape = RoundedCornerShape(18.dp),
        color = MaterialTheme.colorScheme.surface,
        tonalElevation = 1.dp,
        border = BorderStroke(if (selected) 2.dp else 1.dp, if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant),
        modifier = Modifier.fillMaxWidth().clickable(onClick = onDetails),
    ) {
        Column(Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Avatar(merchant.businessName)
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
                IconButton(onClick = onToggleSaved) {
                    Icon(
                        if (saved) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder,
                        contentDescription = if (saved) "إزالة من المحفوظات" else "حفظ",
                        tint = if (saved) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            if (merchant.openStatus?.hasHours == true) {
                Spacer(Modifier.height(8.dp))
                OpenBadge(merchant.openStatus)
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

@Composable
private fun RouteBar(
    route: RouteUi,
    onMode: (String) -> Unit,
    onClose: () -> Unit,
    onOpenGoogle: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        shadowElevation = 6.dp,
        color = MaterialTheme.colorScheme.surface.copy(alpha = 0.82f),
    ) {
        Column(Modifier.padding(start = 16.dp, end = 8.dp, top = 8.dp, bottom = 10.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Text("إلى ${route.target.name}", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                IconButton(onClick = onClose) { Icon(Icons.Filled.Clear, contentDescription = "إلغاء المسار") }
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                val data = route.data
                when {
                    route.isLoading -> Text("عم نحسب الطريق...", style = MaterialTheme.typography.bodyMedium)
                    data != null -> Text(
                        "${if (route.mode == "walking") "🚶" else "🚗"} ${formatDuration(data.durationSeconds)} · ${formatDistance(data.distanceMeters)}",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                    )
                    else -> Text(route.error ?: "تعذّر حساب الطريق", color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium)
                }
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                    MapChip("🚗", route.mode == "driving") { if (route.mode != "driving") onMode("driving") }
                    MapChip("🚶", route.mode == "walking") { if (route.mode != "walking") onMode("walking") }
                }
            }
            TextButton(onClick = onOpenGoogle) { Text("افتح بخرائط جوجل للملاحة الصوتية") }
        }
    }
}
