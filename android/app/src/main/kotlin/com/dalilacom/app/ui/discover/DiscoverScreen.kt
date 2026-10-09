package com.dalilacom.app.ui.discover

import android.content.Intent
import android.speech.tts.TextToSpeech
import androidx.compose.runtime.DisposableEffect
import androidx.compose.ui.platform.LocalView
import com.dalilacom.app.data.network.RouteDto
import com.dalilacom.app.ui.i18n.AppStrings
import com.dalilacom.app.ui.common.formatDistance
import com.dalilacom.app.ui.common.formatDuration
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items as gridItems
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.ui.res.stringResource
import com.dalilacom.app.R
import com.dalilacom.app.data.network.CategoryDto
import com.dalilacom.app.ui.common.indexCategories
import com.dalilacom.app.ui.i18n.AppLanguages
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
    onSetLanguage: (String) -> Unit,
    onLogin: () -> Unit,
    onMerchantClick: (String) -> Unit,
    /** The deals tab: the same map, but only shops with a running discount, with its own filters (and a way to the card). */
    dealsMode: Boolean = false,
    onOpenCard: () -> Unit = {},
) {
    val viewModel: DiscoverViewModel = viewModel(key = if (dealsMode) "deals" else null, factory = factory)
    if (dealsMode) LaunchedEffect(Unit) { viewModel.onDiscountsOnlyChange(true) }
    val state by viewModel.uiState.collectAsState()
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val navigating = state.route?.navigating == true

    // The trip: the voice, the live position, and a screen that stays on.
    val speaker = remember { TripVoice(context) }
    DisposableEffect(Unit) { onDispose { speaker.shutdown() } }
    LaunchedEffect(Unit) { viewModel.speech.collect { speaker.say(it) } }
    LaunchedEffect(navigating) {
        if (!navigating) return@LaunchedEffect
        if (!LocationHelper.hasPermission(context)) {
            Toast.makeText(context, context.getString(R.string.nav_no_gps), Toast.LENGTH_LONG).show()
            viewModel.endNavigation()
            return@LaunchedEffect
        }
        LocationHelper.updates(context).collect { fix -> viewModel.onNavLocation(fix.latitude, fix.longitude, fix.accuracy, fix.bearing) }
    }
    val hostView = LocalView.current
    DisposableEffect(navigating) {
        hostView.keepScreenOn = navigating
        onDispose { hostView.keepScreenOn = false }
    }
    var recenterTick by remember { mutableIntStateOf(0) }
    var radiusFitTick by remember { mutableIntStateOf(0) }
    var languageMenuOpen by remember { mutableStateOf(false) }
    val categoryIndex = remember(state.categories) { indexCategories(state.categories) }

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
            Toast.makeText(context, context.getString(R.string.loc_route_failed), Toast.LENGTH_LONG).show()
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

    Box(Modifier.fillMaxSize()) {
    BottomSheetScaffold(
        scaffoldState = scaffoldState,
        sheetPeekHeight = if (navigating) 0.dp else 210.dp,
        sheetSwipeEnabled = !navigating,
        sheetShape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp),
        sheetContainerColor = MaterialTheme.colorScheme.surface,
        sheetShadowElevation = 16.dp,
        sheetContent = {
            DirectorySheet(
                state = state,
                dealsMode = dealsMode,
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
                userLocation = state.route?.nav?.position ?: state.userLocation,
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
                navigating = navigating,
                followUser = state.route?.nav?.follow == true,
                userBearing = state.route?.nav?.heading,
                onUserPanned = viewModel::onNavPanned,
                modifier = Modifier.fillMaxSize(),
            )

            val route = state.route
            if (route != null && !route.navigating) {
                RouteBar(
                    route = route,
                    onMode = viewModel::setRouteMode,
                    onStart = viewModel::startNavigation,
                    onClose = viewModel::cancelRoute,
                    onOpenGoogle = { openDirections(context, route.target.latitude, route.target.longitude) },
                    modifier = Modifier.padding(top = 10.dp, start = 12.dp, end = 12.dp),
                )
            }
            val trip = route?.nav
            if (route != null && route.navigating && trip != null) {
                NavBanner(route = route, nav = trip, onFinish = viewModel::finishNavigation, modifier = Modifier.padding(top = 10.dp, start = 12.dp, end = 12.dp))
                NavBottomBar(
                    nav = trip,
                    onRecenter = viewModel::recenterNav,
                    onVoice = viewModel::toggleNavVoice,
                    onEnd = viewModel::endNavigation,
                    modifier = Modifier.align(Alignment.BottomCenter).padding(start = 12.dp, end = 12.dp, bottom = 16.dp),
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
                                stringResource(R.string.login_pill),
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
                    if (dealsMode) item { MapChip("💳 " + stringResource(R.string.deals_my_card), false) { onOpenCard() } }
                    item { MapChip(stringResource(R.string.filter_all), state.selectedCategoryId == null && (dealsMode || !state.discountsOnly) && !state.openNow) { viewModel.resetFilters(keepDiscounts = dealsMode) } }
                    item { MapChip(stringResource(R.string.filter_open_now), state.openNow) { viewModel.onOpenNowChange(!state.openNow) } }
                    if (!dealsMode) item { MapChip(stringResource(R.string.filter_discounts), state.discountsOnly) { viewModel.onDiscountsOnlyChange(!state.discountsOnly) } }
                    item { MapChip(stringResource(R.string.filter_sections), false) { viewModel.openBrowse() } }
                    state.selectedCategoryId?.let { picked ->
                        categoryIndex[picked]?.let { node -> item { MapChip("${node.icon.orEmpty()} ${node.name} ✕", true) { viewModel.onCategorySelected(null) } } }
                    }
                    items(state.categories.filter { it.id != state.selectedCategoryId }) { category ->
                        MapChip("${category.icon.orEmpty()} ${category.name}".trim(), state.selectedCategoryId == category.id) { viewModel.onCategorySelected(category.id) }
                    }
                }
                if (route == null && dealsMode && state.userLocation == null) {
                    Spacer(Modifier.height(8.dp))
                    Row(Modifier.padding(horizontal = 12.dp)) { MapChip("📍 " + stringResource(R.string.deals_locate), false) { requestLocation() } }
                }
                if (route == null && state.userLocation != null) {
                    Spacer(Modifier.height(8.dp))
                    LazyRow(
                        contentPadding = PaddingValues(horizontal = 12.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        (if (dealsMode) listOf<Double?>(null, 1.0, 3.0, 5.0, 10.0, 25.0) else listOf<Double?>(null, 2.0, 5.0, 10.0, 25.0)).forEach { radius ->
                            item {
                                MapChip(
                                    if (radius == null) stringResource(R.string.radius_any) else stringResource(R.string.radius_km, radius.toInt()),
                                    state.radiusKm == radius,
                                ) { viewModel.onRadiusSelected(radius); radiusFitTick++ }
                            }
                        }
                    }
                }
                if (route == null && state.searchBounds != null) {
                    Spacer(Modifier.height(8.dp))
                    Row(Modifier.padding(horizontal = 12.dp)) { MapChip(stringResource(R.string.area_clear), true) { viewModel.clearSearchArea() } }
                }
                LocationNotice(state.locationStatus, onRetry = { requestLocation() })
            }

            if (state.areaDirty && !navigating) {
                Surface(
                    onClick = { viewModel.searchThisArea() },
                    shape = RoundedCornerShape(22.dp),
                    color = MaterialTheme.colorScheme.surface.copy(alpha = 0.78f),
                    contentColor = MaterialTheme.colorScheme.primary,
                    shadowElevation = 4.dp,
                    modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = innerPadding.calculateBottomPadding() + 16.dp),
                ) {
                    Text(stringResource(R.string.area_search), style = MaterialTheme.typography.labelLarge, modifier = Modifier.padding(horizontal = 18.dp, vertical = 10.dp))
                }
            }

            if (!navigating) SmallFloatingActionButton(
                onClick = {
                    requestLocation()
                    recenterTick++
                },
                containerColor = MaterialTheme.colorScheme.surface.copy(alpha = 0.78f),
                contentColor = MaterialTheme.colorScheme.primary,
                modifier = Modifier.align(Alignment.BottomStart).padding(start = 16.dp, bottom = innerPadding.calculateBottomPadding() + 16.dp),
            ) { Icon(Icons.Filled.MyLocation, contentDescription = stringResource(R.string.fab_my_location)) }

            if (!navigating) SmallFloatingActionButton(
                onClick = onToggleTheme,
                containerColor = MaterialTheme.colorScheme.surface.copy(alpha = 0.78f),
                contentColor = MaterialTheme.colorScheme.primary,
                modifier = Modifier.align(Alignment.BottomStart).padding(start = 16.dp, bottom = innerPadding.calculateBottomPadding() + 72.dp),
            ) { Text(if (isDark) "☀️" else "🌙") }

            if (!navigating) Box(Modifier.align(Alignment.BottomStart).padding(start = 16.dp, bottom = innerPadding.calculateBottomPadding() + 128.dp)) {
                SmallFloatingActionButton(
                    onClick = { languageMenuOpen = true },
                    containerColor = MaterialTheme.colorScheme.surface.copy(alpha = 0.78f),
                    contentColor = MaterialTheme.colorScheme.primary,
                ) { Text("🌐") }
                DropdownMenu(expanded = languageMenuOpen, onDismissRequest = { languageMenuOpen = false }) {
                    AppLanguages.all.forEach { language ->
                        DropdownMenuItem(text = { Text(language.nativeName) }, onClick = { languageMenuOpen = false; onSetLanguage(language.code) })
                    }
                }
            }

            if (state.isLoading && state.allMerchants.isEmpty()) {
                CircularProgressIndicator(Modifier.align(Alignment.Center), color = MaterialTheme.colorScheme.primary)
            }
        }
    }

    state.browseTrail?.let { trail ->
        BrowseOverlay(
            tree = state.categories,
            trail = trail,
            onInto = viewModel::browseInto,
            onBack = viewModel::browseBack,
            onClose = viewModel::closeBrowse,
            onPick = viewModel::pickCategory,
        )
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
            placeholder = { Text(stringResource(R.string.search_placeholder), color = MaterialTheme.colorScheme.onSurfaceVariant) },
            leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null, tint = MaterialTheme.colorScheme.primary) },
            trailingIcon = {
                if (query.isNotEmpty()) IconButton(onClick = { onQueryChange("") }) { Icon(Icons.Filled.Clear, contentDescription = stringResource(R.string.search_clear)) }
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
        state.suggestions.categories.map { Triple(it.icon ?: "🗂️", it.path ?: it.name) { onCategory(it.id) } } +
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
            if (!typing) Text(stringResource(R.string.search_recent), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(start = 14.dp, top = 10.dp, end = 14.dp))
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
        LocationStatus.Loading -> stringResource(R.string.loc_loading)
        LocationStatus.Denied -> stringResource(R.string.loc_denied)
        LocationStatus.Unavailable -> stringResource(R.string.loc_unavailable)
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
            if (status != LocationStatus.Loading) TextButton(onClick = onRetry) { Text(stringResource(R.string.loc_enable)) }
        }
    }
}

@Composable
private fun DirectorySheet(
    state: DiscoverUiState,
    dealsMode: Boolean,
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
                stringResource(if (dealsMode) R.string.deals_sheet_title else if (state.userLocation != null) R.string.sheet_nearby else R.string.sheet_directory),
                style = MaterialTheme.typography.titleMedium,
            )
            Surface(shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.primaryContainer) {
                Text(
                    stringResource(R.string.sheet_count, state.merchants.size),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onPrimaryContainer,
                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                )
            }
        }
        if (state.merchants.isEmpty()) {
            Text(
                if (state.isLoading) stringResource(R.string.sheet_loading) else if (state.radiusKm != null) stringResource(R.string.sheet_empty_radius, state.radiusKm.toInt()) else stringResource(if (dealsMode) R.string.deals_empty else R.string.sheet_empty),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(20.dp),
            )
        } else {
            val ordered = state.merchants.sortedBy { if (it.id == state.selectedMerchantId) 0 else 1 }
            val categoryNames = remember(state.categories) { indexCategories(state.categories).mapValues { it.value.name } }
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
                        categoryName = categoryNames[merchant.category?.id],
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
    categoryName: String?,
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
                Avatar(merchant.businessName, imageUrl = merchant.avatarUrl)
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text(merchant.businessName, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    val subtitle = listOfNotNull(categoryName ?: merchant.category?.name, merchant.address).joinToString(" • ")
                    if (subtitle.isNotBlank()) {
                        Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
                merchant.distanceKm?.let { distance ->
                    Surface(shape = RoundedCornerShape(10.dp), color = MaterialTheme.colorScheme.surfaceVariant) {
                        Text(
                            if (distance < 1) stringResource(R.string.unit_m, (distance * 1000).toInt()) else stringResource(R.string.unit_km, distance),
                            style = MaterialTheme.typography.labelMedium,
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp),
                        )
                    }
                }
                IconButton(onClick = onToggleSaved) {
                    Icon(
                        if (saved) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder,
                        contentDescription = stringResource(if (saved) R.string.card_unsave else R.string.card_save),
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
                                "🏷️ ${discount.title} −${discount.percent}%" + (discount.peopleLeft?.let { " · " + stringResource(R.string.disc_places_left_short, it) } ?: ""),
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
                Button(onClick = onDetails, shape = RoundedCornerShape(12.dp), modifier = Modifier.weight(1f)) { Text(stringResource(R.string.card_details)) }
                if (merchant.latitude != null && merchant.longitude != null) {
                    OutlinedButton(onClick = onDirections, shape = RoundedCornerShape(12.dp), modifier = Modifier.weight(1f)) {
                        Icon(Icons.Filled.Directions, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(6.dp))
                        Text(stringResource(R.string.card_directions))
                    }
                }
            }
        }
    }
}

/** Directions: the two ways side by side (time and distance), pick one, then "Start trip". */
@Composable
private fun RouteBar(
    route: RouteUi,
    onMode: (String) -> Unit,
    onStart: () -> Unit,
    onClose: () -> Unit,
    onOpenGoogle: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        shadowElevation = 6.dp,
        color = MaterialTheme.colorScheme.surface.copy(alpha = 0.94f),
    ) {
        Column(Modifier.padding(start = 16.dp, end = 8.dp, top = 8.dp, bottom = 10.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Text(stringResource(R.string.route_to, route.target.name), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                IconButton(onClick = onClose) { Icon(Icons.Filled.Clear, contentDescription = stringResource(R.string.route_cancel)) }
            }
            Column(Modifier.padding(end = 8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                RouteOption("🚗", stringResource(R.string.nav_drive), route.options["driving"], route.isLoading, route.mode == "driving") { onMode("driving") }
                RouteOption("🚶", stringResource(R.string.nav_walk), route.options["walking"], route.isLoading, route.mode == "walking") { onMode("walking") }
                if (route.isLoading) Text(stringResource(R.string.route_calculating), style = MaterialTheme.typography.bodyMedium)
                else if (route.data == null) Text(route.error ?: stringResource(R.string.route_failed), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium)
                Button(onClick = onStart, enabled = route.data != null, modifier = Modifier.fillMaxWidth().height(48.dp)) {
                    Text("▶  " + stringResource(R.string.nav_start), fontWeight = FontWeight.Bold)
                }
            }
            TextButton(onClick = onOpenGoogle) { Text(stringResource(R.string.route_google)) }
        }
    }
}

@Composable
private fun RouteOption(icon: String, label: String, data: RouteDto?, loading: Boolean, selected: Boolean, onClick: () -> Unit) {
    Surface(
        onClick = onClick,
        shape = RoundedCornerShape(14.dp),
        border = BorderStroke(2.dp, if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant),
        color = if (selected) MaterialTheme.colorScheme.primary.copy(alpha = 0.08f) else MaterialTheme.colorScheme.surface,
    ) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(icon, style = MaterialTheme.typography.titleLarge)
            Text(label, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
            if (data != null) {
                Column(horizontalAlignment = Alignment.End) {
                    Text(formatDuration(data.durationSeconds), fontWeight = FontWeight.Bold)
                    Text(formatDistance(data.distanceMeters), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            } else Text(if (loading) "…" else "—")
        }
    }
}

/** The top of the screen during a trip: the next manoeuvre, how far, and where. */
@Composable
private fun NavBanner(route: RouteUi, nav: NavUi, onFinish: () -> Unit, modifier: Modifier = Modifier) {
    val step = route.data?.steps?.getOrNull(nav.idx)
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp),
        shadowElevation = 8.dp,
        color = if (nav.arrived) Color(0xFF2E7D32) else MaterialTheme.colorScheme.primary,
        contentColor = Color.White,
    ) {
        Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            Surface(shape = RoundedCornerShape(14.dp), color = Color.White.copy(alpha = 0.16f), contentColor = Color.White) {
                Box(Modifier.size(54.dp), contentAlignment = Alignment.Center) { Text(if (nav.arrived) "📍" else NavText.arrow(step), style = MaterialTheme.typography.headlineMedium) }
            }
            Column(Modifier.weight(1f)) {
                if (nav.arrived) {
                    Text(stringResource(R.string.nav_arrive), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                    Text(route.target.name, style = MaterialTheme.typography.bodyMedium)
                } else {
                    Text(
                        when {
                            nav.rerouting -> stringResource(R.string.nav_rerouting)
                            nav.distToNext == null -> stringResource(R.string.nav_wait_gps)
                            else -> formatDistance(nav.distToNext.toInt())
                        },
                        style = MaterialTheme.typography.headlineSmall,
                        fontWeight = FontWeight.Bold,
                    )
                    Text(NavText.instruction(step), style = MaterialTheme.typography.bodyLarge)
                }
            }
            if (nav.arrived) {
                Surface(onClick = onFinish, shape = RoundedCornerShape(20.dp), color = Color.White, contentColor = Color(0xFF2E7D32)) {
                    Text(stringResource(R.string.nav_done), fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp))
                }
            }
        }
    }
}

/** The bottom of the screen during a trip: arrival time and what is left, the voice and the end button. */
@Composable
private fun NavBottomBar(nav: NavUi, onRecenter: () -> Unit, onVoice: () -> Unit, onEnd: () -> Unit, modifier: Modifier = Modifier) {
    if (nav.arrived) return
    val eta = remember(nav.remainingSeconds) {
        java.text.SimpleDateFormat("hh:mm a", java.util.Locale(AppStrings.language)).format(java.util.Date(System.currentTimeMillis() + nav.remainingSeconds * 1000L))
    }
    Surface(modifier = modifier.fillMaxWidth(), shape = RoundedCornerShape(20.dp), shadowElevation = 10.dp, color = MaterialTheme.colorScheme.surface) {
        Row(Modifier.padding(horizontal = 16.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(stringResource(R.string.nav_eta, eta), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = Color(0xFF2E7D32))
                Text("${formatDuration(nav.remainingSeconds)} · ${formatDistance(nav.remainingMeters)}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            if (!nav.follow) MapChip("🎯", false, onRecenter)
            Spacer(Modifier.width(8.dp))
            MapChip(if (nav.voice) "🔊" else "🔇", false, onVoice)
            Spacer(Modifier.width(8.dp))
            Surface(onClick = onEnd, shape = RoundedCornerShape(20.dp), color = MaterialTheme.colorScheme.error, contentColor = Color.White) {
                Text(stringResource(R.string.nav_end), fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp))
            }
        }
    }
}

/** Reads the guidance aloud in the language on screen (the phone's own text-to-speech; silent if it has no voice for it). */
private class TripVoice(context: android.content.Context) {
    private var ready = false
    private val engine: TextToSpeech = TextToSpeech(context.applicationContext) { status ->
        ready = status == TextToSpeech.SUCCESS
        applyLanguage()
    }

    private fun applyLanguage() {
        if (ready) engine.language = java.util.Locale(AppStrings.language)
    }

    fun say(text: String) {
        if (!ready || text.isBlank()) return
        applyLanguage()
        engine.speak(text, TextToSpeech.QUEUE_FLUSH, null, "trip")
    }

    fun shutdown() {
        runCatching { engine.stop(); engine.shutdown() }
    }
}

/** Sections > professions > specialties as big tiles with counts; a leaf (or "All ...") picks the filter. */
@Composable
private fun BrowseOverlay(
    tree: List<CategoryDto>,
    trail: List<String>,
    onInto: (String) -> Unit,
    onBack: () -> Unit,
    onClose: () -> Unit,
    onPick: (String) -> Unit,
) {
    val index = remember(tree) { indexCategories(tree) }
    val current = trail.lastOrNull()?.let { index[it] }
    val nodes = current?.children ?: tree
    val title = if (trail.isEmpty()) stringResource(R.string.browse_title) else trail.mapNotNull { index[it]?.name }.joinToString(" › ")

    Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Column(Modifier.fillMaxSize()) {
            Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                TextButton(onClick = onBack) { Text(stringResource(R.string.back)) }
                Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
                IconButton(onClick = onClose) { Icon(Icons.Filled.Clear, contentDescription = stringResource(R.string.browse_close)) }
            }
            if (current != null) {
                OutlinedButton(
                    onClick = { onPick(current.id) },
                    shape = RoundedCornerShape(14.dp),
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp),
                ) { Text("${current.icon.orEmpty()} ${stringResource(R.string.browse_all, current.name)} · ${stringResource(R.string.browse_count, current.merchantCount)}") }
                Spacer(Modifier.height(10.dp))
            }
            LazyVerticalGrid(
                columns = GridCells.Fixed(2),
                contentPadding = PaddingValues(start = 12.dp, end = 12.dp, bottom = 24.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                gridItems(nodes, key = { it.id }) { node ->
                    val hasChildren = node.children.isNotEmpty()
                    Surface(
                        onClick = { if (hasChildren) onInto(node.id) else onPick(node.id) },
                        shape = RoundedCornerShape(18.dp),
                        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                        color = MaterialTheme.colorScheme.surface,
                        modifier = Modifier.fillMaxWidth().heightIn(min = 104.dp),
                    ) {
                        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text(node.icon ?: "📍", fontSize = androidx.compose.ui.unit.TextUnit(28f, androidx.compose.ui.unit.TextUnitType.Sp))
                            Text(node.name, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                            Text(
                                (if (node.merchantCount > 0) stringResource(R.string.browse_count, node.merchantCount) else stringResource(R.string.browse_soon)) + if (hasChildren) " ›" else "",
                                style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
            }
        }
    }
}
