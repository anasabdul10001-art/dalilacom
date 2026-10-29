package com.dalilacom.app.ui.nav

import android.content.Intent
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.compose.runtime.getValue
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.dalilacom.app.ui.common.FloatingButtons
import androidx.compose.runtime.collectAsState
import androidx.navigation.navArgument
import androidx.navigation.navDeepLink
import com.dalilacom.app.data.AppContainer
import com.dalilacom.app.ui.ViewModelFactory
import com.dalilacom.app.ui.account.AccountSettingsScreen
import com.dalilacom.app.ui.admin.ReviewScreen
import com.dalilacom.app.ui.auth.LoginScreen
import com.dalilacom.app.ui.auth.RegisterScreen
import com.dalilacom.app.ui.auth.SocialReturnScreen
import com.dalilacom.app.ui.auth.SplashScreen
import com.dalilacom.app.data.RouteTarget
import com.dalilacom.app.ui.merchant.MerchantDetailScreen
import com.dalilacom.app.ui.merchant.MerchantProfileScreen
import com.dalilacom.app.ui.merchant.MerchantRegisterScreen
import com.dalilacom.app.ui.merchantmode.DiscountsScreen
import com.dalilacom.app.ui.merchantmode.MerchantModeShell
import com.dalilacom.app.ui.merchantmode.ProductEditScreen
import com.dalilacom.app.ui.notifications.NotificationsScreen
import com.dalilacom.app.ui.orders.OrderDetailScreen
import com.dalilacom.app.ui.places.FavoritesScreen
import com.dalilacom.app.ui.places.HoursScreen
import com.dalilacom.app.ui.pricing.PricingScreen
import com.dalilacom.app.ui.store.StoreProductScreen
import com.dalilacom.app.ui.store.AdBookScreen
import com.dalilacom.app.ui.store.ProductWizardScreen
import com.dalilacom.app.ui.store.MyAdsScreen
import com.dalilacom.app.ui.store.StoreScreen
import com.dalilacom.app.ui.profile.ProfileEditScreen
import com.dalilacom.app.ui.responder.ResponderScreen
import com.dalilacom.app.ui.responder.WalletScreen

@Composable
fun DalilacomNavGraph(
    container: AppContainer,
    deepLinkIntent: Intent? = null,
    notificationRoute: String? = null,
    onNotificationRouteConsumed: () -> Unit = {},
    socialReturn: SocialReturn? = null,
    onSocialReturnConsumed: () -> Unit = {},
) {
    val navController = rememberNavController()
    val factory = remember { ViewModelFactory(container) }

    // Back from the Facebook login browser (dalilacom://responder/meta...). Only useful once the
    // merchant is signed in — on a cold start from the browser there is no session yet, so we skip it
    // and let the normal splash flow run; the connection itself is already saved on the server.
    LaunchedEffect(deepLinkIntent) {
        val incoming = deepLinkIntent ?: return@LaunchedEffect
        if (container.tokenStore.getToken() != null) navController.handleDeepLink(incoming)
    }

    // A push tapped in the tray: wait only until the start-up screen is gone (the app may be resting on any other page, which used
    // to leave the tap without effect), then open what the notification is about. Orders are private, so they need a signed-in
    // account; products, shops and prices are open to everyone.
    LaunchedEffect(notificationRoute) {
        val route = notificationRoute ?: return@LaunchedEffect
        navController.currentBackStackEntryFlow.first { it.destination.route != null && it.destination.route != "splash" }
        val needsAccount = route.startsWith("order/") || route == "merchantMode" || route == "responder" || route == "adminReview" || route == NotificationRoutes.INBOX
        if (route != "home" && (!needsAccount || container.tokenStore.getToken() != null)) navController.navigate(route)
        onNotificationRouteConsumed()
    }

    // Back from a Google/Facebook sign-in: trade the ticket for a session as soon as the start-up screen is gone, wherever the
    // person was (the login page included): waiting for the map left him on the login page until he walked back to it by hand.
    LaunchedEffect(socialReturn) {
        val back = socialReturn ?: return@LaunchedEffect
        navController.currentBackStackEntryFlow.first { it.destination.route != null && it.destination.route != "splash" }
        navController.navigate("socialReturn?ticket=${android.net.Uri.encode(back.ticket.orEmpty())}&error=${android.net.Uri.encode(back.error.orEmpty())}&pending=${android.net.Uri.encode(back.pending.orEmpty())}")
        onSocialReturnConsumed()
    }

    // The server stopped accepting this session (signed out elsewhere, password changed...): say so and go back to the start.
    val expiredContext = androidx.compose.ui.platform.LocalContext.current
    LaunchedEffect(Unit) {
        container.sessionExpired.collect {
            android.widget.Toast.makeText(expiredContext, com.dalilacom.app.ui.i18n.AppStrings.get(com.dalilacom.app.R.string.session_expired), android.widget.Toast.LENGTH_LONG).show()
            navController.navigate("home") { popUpTo(0) }
        }
    }

    val currentRoute = navController.currentBackStackEntryAsState().value?.destination?.route
    val isMerchant = container.sessionStore.roleFlow.collectAsState(initial = null).value == "MERCHANT"
    // Android 15+ draws edge to edge and ignores "adjustResize": the whole app lifts above the keyboard here, so the field being typed in is always in sight
    Box(Modifier.fillMaxSize().imePadding()) {
    NavHost(navController = navController, startDestination = "splash") {
        composable("splash") {
            SplashScreen(
                authRepository = container.authRepository,
                onHasSession = { navController.navigate("home") { popUpTo(0) } },
                onNoSession = { navController.navigate("home") { popUpTo(0) } }, // guests land on the map/directory
            )
        }
        composable(
            "socialReturn?ticket={ticket}&error={error}&pending={pending}",
            arguments = listOf(
                navArgument("ticket") { type = NavType.StringType; defaultValue = "" },
                navArgument("error") { type = NavType.StringType; defaultValue = "" },
                navArgument("pending") { type = NavType.StringType; defaultValue = "" },
            ),
        ) { entry ->
            SocialReturnScreen(
                factory = factory,
                ticket = entry.arguments?.getString("ticket")?.takeIf { it.isNotBlank() },
                error = entry.arguments?.getString("error")?.takeIf { it.isNotBlank() },
                pending = entry.arguments?.getString("pending")?.takeIf { it.isNotBlank() },
                onSignedIn = { navController.navigate("home") { popUpTo(0) } },
                onBack = { navController.navigate("login") { popUpTo(0) } },
            )
        }
        composable("login") {
            LoginScreen(
                factory = factory,
                onLoginSuccess = { navController.navigate("home") { popUpTo(0) } },
                onNavigateToRegister = { navController.navigate("register") },
                onBrowseAsGuest = { navController.navigate("home") { popUpTo(0) } },
            )
        }
        composable("register") {
            RegisterScreen(
                factory = factory,
                onRegisterSuccess = { registeringAsMerchant ->
                    navController.navigate("home") { popUpTo(0) }
                    // New merchant accounts go straight into the merchant-profile form instead
                    // of making them hunt for "سجّل كتاجر" in their profile afterward — "home"
                    // stays underneath on the back stack so its own back button works normally.
                    if (registeringAsMerchant) {
                        navController.navigate("merchantRegister")
                    }
                },
                onNavigateToLogin = { navController.popBackStack() },
            )
        }
        composable("card") {
            CardRoute(rootNavController = navController, container = container)
        }
        composable("home") {
            HomeShell(rootNavController = navController, container = container)
        }
        composable("merchant/{merchantId}") { backStackEntry ->
            val merchantId = backStackEntry.arguments?.getString("merchantId").orEmpty()
            MerchantDetailScreen(
                container = container,
                merchantId = merchantId,
                onProductClick = { productId -> navController.navigate("product/$productId") },
                onDirections = { m ->
                    // Hand the destination to the map screen, which draws the route in-app.
                    val lat = m.latitude
                    val lng = m.longitude
                    if (lat != null && lng != null) {
                        container.pendingRoute.value = RouteTarget(m.id, m.businessName, lat, lng)
                        navController.popBackStack("home", inclusive = false)
                    }
                },
                onBack = { navController.popBackStack() },
                onLogin = { navController.navigate("login") },
            )
        }
        composable("merchant/{merchantId}/offers") { backStackEntry ->
            val merchantId = backStackEntry.arguments?.getString("merchantId").orEmpty()
            MerchantDetailScreen(
                container = container,
                merchantId = merchantId,
                initialTab = "offers",
                onProductClick = { productId -> navController.navigate("product/$productId") },
                onDirections = { m ->
                    val lat = m.latitude
                    val lng = m.longitude
                    if (lat != null && lng != null) {
                        container.pendingRoute.value = RouteTarget(m.id, m.businessName, lat, lng)
                        navController.popBackStack("home", inclusive = false)
                    }
                },
                onBack = { navController.popBackStack() },
                onLogin = { navController.navigate("login") },
            )
        }
        composable("merchant/{merchantId}/offers/{discountId}") { backStackEntry ->
            val merchantId = backStackEntry.arguments?.getString("merchantId").orEmpty()
            MerchantDetailScreen(
                container = container,
                merchantId = merchantId,
                initialTab = "offers",
                targetDiscountId = backStackEntry.arguments?.getString("discountId"),
                onProductClick = { productId -> navController.navigate("product/$productId") },
                onDirections = { m ->
                    val lat = m.latitude
                    val lng = m.longitude
                    if (lat != null && lng != null) {
                        container.pendingRoute.value = RouteTarget(m.id, m.businessName, lat, lng)
                        navController.popBackStack("home", inclusive = false)
                    }
                },
                onBack = { navController.popBackStack() },
                onLogin = { navController.navigate("login") },
            )
        }
        composable("product/{productId}") { backStackEntry ->
            val productId = backStackEntry.arguments?.getString("productId").orEmpty()
            StoreProductScreen(
                container = container,
                productId = productId,
                onBack = { navController.popBackStack() },
                onGoToCart = { navController.popBackStack("home", inclusive = false) },
                onOpenProduct = { id -> navController.navigate("product/$id") },
                onOpenMerchant = { id -> navController.navigate("merchant/$id") },
                onLogin = { navController.navigate("login") },
            )
        }
        composable("aiPlans") {
            com.dalilacom.app.ui.store.AiPlansScreen(container = container, onBack = { navController.popBackStack() }, onWallet = { navController.navigate("wallet") })
        }
        composable("discountHistory/{mode}") { backStackEntry ->
            com.dalilacom.app.ui.profile.DiscountHistoryScreen(container = container, shop = backStackEntry.arguments?.getString("mode") == "shop", onBack = { navController.popBackStack() })
        }
        composable("marketing") {
            com.dalilacom.app.ui.profile.MarketingScreen(container = container, onBack = { navController.popBackStack() })
        }
        composable("storePlans") {
            com.dalilacom.app.ui.merchantmode.StorePlansScreen(
                container = container,
                onBack = { navController.popBackStack() },
                onOpenStore = { navController.navigate("merchantMode") { popUpTo("home") } },
            )
        }
        composable("branches") {
            com.dalilacom.app.ui.merchantmode.BranchesScreen(container = container, onBack = { navController.popBackStack() })
        }
        composable("shipping") {
            com.dalilacom.app.ui.merchantmode.ShippingScreen(container = container, onBack = { navController.popBackStack() })
        }
        composable("discounts") {
            DiscountsScreen(factory = ViewModelFactory(container), onBack = { navController.popBackStack() })
        }
        composable("store") {
            StoreScreen(
                container = container,
                onBack = { navController.popBackStack() },
                onOpenProduct = { id -> navController.navigate("product/$id") },
                onOpenCart = { navController.popBackStack("home", inclusive = false) },
                onLogin = { navController.navigate("login") },
                onOpenMerchant = { id -> navController.navigate("merchant/$id") },
                onBookAd = { kind -> navController.navigate("adBook?kind=$kind") },
            )
        }
        composable("productWizard") {
            ProductWizardScreen(container = container, onBack = { navController.popBackStack() }, onManual = { navController.navigate("merchantProduct") }, onOpenProduct = { id -> navController.navigate("product/$id") }, onOpenShipping = { navController.navigate("shipping") }, onOpenAiPlans = { navController.navigate("aiPlans") }, onBackToShop = { navController.popBackStack("merchantMode", inclusive = false) }, onBackToAccount = { navController.popBackStack("home", inclusive = false) })
        }
        composable("adBook?kind={kind}", arguments = listOf(androidx.navigation.navArgument("kind") { defaultValue = "space" })) { entry ->
            AdBookScreen(container = container, kind = entry.arguments?.getString("kind") ?: "space", onBack = { navController.popBackStack() }, onWallet = { navController.navigate("wallet") }, onMyAds = { navController.navigate("myAds") })
        }
        composable("myAds") {
            MyAdsScreen(container = container, onBack = { navController.popBackStack() }, onBook = { navController.navigate("adBook") })
        }
        composable("order/{orderId}") { backStackEntry ->
            val orderId = backStackEntry.arguments?.getString("orderId").orEmpty()
            OrderDetailScreen(
                container = container,
                orderId = orderId,
                onBack = { navController.popBackStack() },
            )
        }
        composable("landmarkClaim/{id}") { backStackEntry ->
            com.dalilacom.app.ui.landmark.LandmarkClaimScreen(
                container = container,
                landmarkId = backStackEntry.arguments?.getString("id").orEmpty(),
                onBack = { navController.popBackStack() },
            )
        }
        composable("merchantRegister") {
            MerchantRegisterScreen(
                factory = factory,
                onRegistered = { navController.popBackStack() },
                onBack = { navController.popBackStack() },
                onClaimLandmark = { id -> navController.navigate("landmarkClaim/$id") },
            )
        }
        composable("favorites") {
            FavoritesScreen(factory = factory, onBack = { navController.popBackStack() }, onMerchantClick = { id -> navController.navigate("merchant/$id") })
        }
        composable(
            "notifications",
            deepLinks = listOf(navDeepLink { uriPattern = "dalilacom://app/notifications" }),
        ) {
            NotificationsScreen(factory = factory, onBack = { navController.popBackStack() }, onOpen = { navController.navigate(it) })
        }
        composable("pricing") {
            PricingScreen(
                factory = factory,
                isSignedIn = { container.authRepository.hasStoredSession() },
                onLogin = { navController.navigate("login") },
                onBack = { navController.popBackStack() },
            )
        }
        composable("adminReview") {
            ReviewScreen(factory = factory, onBack = { navController.popBackStack() })
        }
        composable("accountSettings") {
            val savedTheme by container.sessionStore.themeFlow.collectAsState(initial = null)
            val dark = when (savedTheme) { "dark" -> true; "light" -> false; else -> androidx.compose.foundation.isSystemInDarkTheme() }
            val settingsScope = androidx.compose.runtime.rememberCoroutineScope()
            AccountSettingsScreen(
                factory = factory,
                onBack = { navController.popBackStack() },
                isDark = dark,
                onToggleTheme = { settingsScope.launch { container.sessionStore.saveTheme(if (dark) "light" else "dark") } },
                onSetLanguage = { code -> settingsScope.launch { container.sessionStore.saveLanguage(code) } },
                isShop = isMerchant,
                tipsOn = !container.sessionStore.fabTipsOffFlow.collectAsState(initial = false).value,
                onToggleTips = { on -> settingsScope.launch { container.sessionStore.saveFabTipsOff(!on) } },
            )
        }
        composable("profileEdit") {
            ProfileEditScreen(factory = factory, onBack = { navController.popBackStack() })
        }
        composable("merchantProfile") {
            MerchantProfileScreen(factory = factory, onBack = { navController.popBackStack() })
        }
        composable("merchantHours") {
            HoursScreen(factory = factory, onBack = { navController.popBackStack() })
        }
        composable(
            "responder",
            // Three shapes, matching exactly what the server's appDeepLink() can send: a connected
            // Page, a failure, or a session for the in-app picker. Listed separately so a missing
            // query parameter never stops the link from matching.
            deepLinks = listOf(
                navDeepLink { uriPattern = "dalilacom://responder/meta?ok={ok}&connectionId={connectionId}" },
                navDeepLink { uriPattern = "dalilacom://responder/meta?ok={ok}" },
                navDeepLink { uriPattern = "dalilacom://responder/meta?session={session}" },
            ),
            arguments = listOf(
                navArgument("ok") { type = NavType.StringType; nullable = true; defaultValue = null },
                navArgument("connectionId") { type = NavType.StringType; nullable = true; defaultValue = null },
                navArgument("session") { type = NavType.StringType; nullable = true; defaultValue = null },
            ),
        ) { entry ->
            if (com.dalilacom.app.ui.common.ComingSoon.RESPONDER) {
                androidx.compose.foundation.layout.Box(androidx.compose.ui.Modifier.fillMaxSize().padding(24.dp), contentAlignment = androidx.compose.ui.Alignment.Center) {
                    androidx.compose.material3.Text(androidx.compose.ui.res.stringResource(com.dalilacom.app.R.string.soon_responder), textAlign = androidx.compose.ui.text.style.TextAlign.Center)
                }
                return@composable
            }
            ResponderScreen(
                factory = factory,
                onBack = { navController.popBackStack() },
                onOpenWallet = { navController.navigate("wallet") },
                metaOk = entry.arguments?.getString("ok")?.let { it == "1" },
                metaConnectionId = entry.arguments?.getString("connectionId"),
                metaSessionId = entry.arguments?.getString("session"),
            )
        }
        composable("wallet") {
            WalletScreen(factory = factory, onBack = { navController.popBackStack() })
        }
        composable("merchantMode") {
            MerchantModeShell(rootNavController = navController, container = container)
        }
        composable("merchantMode/redeem") {
            MerchantModeShell(rootNavController = navController, container = container, startOnRedeem = true)
        }
        composable(
            "merchantProduct?productId={productId}",
            arguments = listOf(navArgument("productId") { type = NavType.StringType; nullable = true; defaultValue = null }),
        ) { backStackEntry ->
            ProductEditScreen(
                container = container,
                productId = backStackEntry.arguments?.getString("productId"),
                onSaved = { navController.popBackStack() },
                onBack = { navController.popBackStack() },
                onOpenShipping = { navController.navigate("shipping") },
                onOpenAiPlans = { navController.navigate("aiPlans") },
            )
        }
    }
    val tipsOff by container.sessionStore.fabTipsOffFlow.collectAsState(initial = false)
    val tipsScope = androidx.compose.runtime.rememberCoroutineScope()
    FloatingButtons(
        route = currentRoute,
        merchant = isMerchant,
        tipsOff = tipsOff,
        onTipsOff = { tipsScope.launch { container.sessionStore.saveFabTipsOff(true) } },
        onCard = { navController.navigate("card") },
        onAddDiscount = { navController.navigate("discounts") },
        onGiveDiscount = { navController.navigate("merchantMode/redeem") }, // opens on the tab where a member's code is scanned
    )
    }
}
