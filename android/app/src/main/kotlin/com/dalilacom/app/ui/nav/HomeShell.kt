package com.dalilacom.app.ui.nav

import androidx.compose.foundation.background
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ListAlt
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.CreditCard
import androidx.compose.material.icons.filled.Map
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.annotation.StringRes
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import com.dalilacom.app.R
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import kotlinx.coroutines.launch
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.navigation.NavHostController
import com.dalilacom.app.data.AppContainer
import com.dalilacom.app.ui.ViewModelFactory
import com.dalilacom.app.ui.card.CardScreen
import com.dalilacom.app.ui.cart.CartScreen
import com.dalilacom.app.ui.discover.DiscoverScreen
import com.dalilacom.app.ui.orders.OrdersScreen
import com.dalilacom.app.ui.profile.ProfileScreen
import com.dalilacom.app.ui.theme.DeepRed
import com.dalilacom.app.ui.theme.PrimaryRed

private enum class HomeTab(@StringRes val labelRes: Int, val icon: ImageVector) {
    Discover(R.string.tab_map, Icons.Filled.Map),
    Card(R.string.tab_card, Icons.Filled.CreditCard),
    Cart(R.string.tab_cart, Icons.Filled.ShoppingCart),
    Orders(R.string.tab_orders, Icons.AutoMirrored.Filled.ListAlt),
    Profile(R.string.tab_account, Icons.Filled.Person),
}

@Composable
fun HomeShell(rootNavController: NavHostController, container: AppContainer) {
    var selectedTab by rememberSaveable { mutableStateOf(HomeTab.Discover) }
    val factory = remember { ViewModelFactory(container) }
    var isGuest by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { isGuest = !container.authRepository.hasStoredSession() }

    // Push notifications: ask Android 13+ for permission once signed in, then tell the server this phone's token.
    val context = androidx.compose.ui.platform.LocalContext.current
    val notificationPermission = androidx.activity.compose.rememberLauncherForActivityResult(androidx.activity.result.contract.ActivityResultContracts.RequestPermission()) { }
    LaunchedEffect(isGuest) {
        if (!container.authRepository.hasStoredSession()) return@LaunchedEffect
        if (android.os.Build.VERSION.SDK_INT >= 33 &&
            androidx.core.content.ContextCompat.checkSelfPermission(context, android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED
        ) {
            notificationPermission.launch(android.Manifest.permission.POST_NOTIFICATIONS)
        }
        container.notificationRepository.registerCurrentDevice()
    }
    val pendingRoute by container.pendingRoute.collectAsState()
    val scope = androidx.compose.runtime.rememberCoroutineScope()
    val isDark = MaterialTheme.colorScheme.surface.luminance() < 0.5f
    LaunchedEffect(pendingRoute) { if (pendingRoute != null) selectedTab = HomeTab.Discover }

    val goLogin = { rootNavController.navigate("login") }
    val goRegister = { rootNavController.navigate("register") }

    Scaffold(
        bottomBar = {
            NavigationBar(containerColor = MaterialTheme.colorScheme.surface, tonalElevation = 8.dp) {
                HomeTab.values().forEach { tab ->
                    NavigationBarItem(
                        selected = selectedTab == tab,
                        onClick = { selectedTab = tab },
                        icon = { Icon(tab.icon, contentDescription = stringResource(tab.labelRes)) },
                        label = { Text(stringResource(tab.labelRes), style = MaterialTheme.typography.labelSmall) },
                    )
                }
            }
        },
    ) { padding ->
        Column(Modifier.padding(padding).fillMaxSize()) {
            when (selectedTab) {
                HomeTab.Discover -> DiscoverScreen(
                    factory = factory,
                    isGuest = isGuest,
                    pendingRoute = container.pendingRoute,
                    isDark = isDark,
                    onSetLanguage = { code -> scope.launch { container.sessionStore.saveLanguage(code) } },
                    onToggleTheme = { scope.launch { container.sessionStore.saveTheme(if (isDark) "light" else "dark") } },
                    onLogin = { goLogin() },
                    onMerchantClick = { id -> rootNavController.navigate("merchant/$id") },
                )
                HomeTab.Card ->
                    if (isGuest) AccountPrompt(
                        icon = Icons.Filled.CreditCard,
                        title = stringResource(R.string.guest_card_title),
                        subtitle = stringResource(R.string.guest_card_sub),
                        perks = listOf(stringResource(R.string.guest_card_p1), stringResource(R.string.guest_card_p2), stringResource(R.string.guest_card_p3)),
                        onPricing = { rootNavController.navigate("pricing") },
                        onLogin = { goLogin() },
                        onRegister = { goRegister() },
                    ) else CardScreen(factory)
                HomeTab.Cart ->
                    if (isGuest) AccountPrompt(
                        icon = Icons.Filled.ShoppingCart,
                        title = stringResource(R.string.guest_cart_title),
                        subtitle = stringResource(R.string.guest_cart_sub),
                        perks = listOf(stringResource(R.string.guest_cart_p1), stringResource(R.string.guest_cart_p2)),
                        onLogin = { goLogin() },
                        onRegister = { goRegister() },
                    ) else CartScreen(factory, onCheckoutSuccess = { selectedTab = HomeTab.Orders })
                HomeTab.Orders ->
                    if (isGuest) AccountPrompt(
                        icon = Icons.AutoMirrored.Filled.ListAlt,
                        title = stringResource(R.string.guest_orders_title),
                        subtitle = stringResource(R.string.guest_orders_sub),
                        perks = listOf(stringResource(R.string.guest_orders_p1), stringResource(R.string.guest_orders_p2)),
                        onLogin = { goLogin() },
                        onRegister = { goRegister() },
                    ) else OrdersScreen(factory, onOrderClick = { id -> rootNavController.navigate("order/$id") })
                HomeTab.Profile ->
                    if (isGuest) AccountPrompt(
                        icon = Icons.Filled.Person,
                        title = stringResource(R.string.guest_profile_title),
                        subtitle = stringResource(R.string.guest_profile_sub),
                        perks = listOf(stringResource(R.string.guest_profile_p1), stringResource(R.string.guest_profile_p2), stringResource(R.string.guest_profile_p3)),
                        onPricing = { rootNavController.navigate("pricing") },
                        onLogin = { goLogin() },
                        onRegister = { goRegister() },
                    ) else ProfileScreen(
                        container = container,
                        onLoggedOut = { rootNavController.navigate("home") { popUpTo(0) } },
                        onRegisterMerchant = { rootNavController.navigate("merchantRegister") },
                        onOpenMerchantMode = { rootNavController.navigate("merchantMode") },
                        onEditProfile = { rootNavController.navigate("profileEdit") },
                        onOpenNotifications = { rootNavController.navigate("notifications") },
                        onOpenPricing = { rootNavController.navigate("pricing") },
                        onOpenFavorites = { rootNavController.navigate("favorites") },
                        onOpenResponder = { rootNavController.navigate("responder") },
                        onOpenWallet = { rootNavController.navigate("wallet") },
                    )
            }
        }
    }
}

@Composable
private fun AccountPrompt(
    icon: ImageVector,
    title: String,
    subtitle: String,
    perks: List<String>,
    onLogin: () -> Unit,
    onRegister: () -> Unit,
    onPricing: (() -> Unit)? = null,
) {
    Column(
        modifier = Modifier.fillMaxSize().padding(28.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Box(
            modifier = Modifier.size(84.dp).clip(CircleShape).background(Brush.linearGradient(listOf(DeepRed, PrimaryRed))),
            contentAlignment = Alignment.Center,
        ) { Icon(icon, contentDescription = null, tint = Color.White, modifier = Modifier.size(40.dp)) }
        Spacer(Modifier.height(20.dp))
        Text(title, style = MaterialTheme.typography.headlineSmall)
        Spacer(Modifier.height(8.dp))
        Text(subtitle, style = MaterialTheme.typography.bodyMedium, textAlign = TextAlign.Center, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(20.dp))
        perks.forEach { perk ->
            Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.CheckCircle, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(20.dp))
                Spacer(Modifier.width(10.dp))
                Text(perk, style = MaterialTheme.typography.bodyMedium)
            }
        }
        Spacer(Modifier.height(28.dp))
        Button(onClick = onLogin, shape = RoundedCornerShape(14.dp), modifier = Modifier.fillMaxWidth().height(52.dp)) { Text(stringResource(R.string.guest_login)) }
        Spacer(Modifier.height(10.dp))
        OutlinedButton(onClick = onRegister, shape = RoundedCornerShape(14.dp), modifier = Modifier.fillMaxWidth().height(52.dp)) { Text(stringResource(R.string.guest_register)) }
        if (onPricing != null) {
            TextButton(onClick = onPricing) { Text(stringResource(R.string.pricing_link)) }
        }
    }
}
