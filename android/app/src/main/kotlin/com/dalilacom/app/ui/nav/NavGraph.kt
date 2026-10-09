package com.dalilacom.app.ui.nav

import android.content.Intent
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import kotlinx.coroutines.flow.first
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
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

    // A push tapped in the tray: wait until the app has reached its home screen, then open what the notification is
    // about. Orders are private, so they need a signed-in account; products, shops and prices are open to everyone.
    LaunchedEffect(notificationRoute) {
        val route = notificationRoute ?: return@LaunchedEffect
        navController.currentBackStackEntryFlow.first { it.destination.route == "home" }
        val needsAccount = route.startsWith("order/") || route == "merchantMode" || route == "responder" || route == "adminReview" || route == NotificationRoutes.INBOX
        if (route != "home" && (!needsAccount || container.tokenStore.getToken() != null)) navController.navigate(route)
        onNotificationRouteConsumed()
    }

    // Back from a Google/Facebook sign-in: once home is up, trade the ticket for a session.
    LaunchedEffect(socialReturn) {
        val back = socialReturn ?: return@LaunchedEffect
        navController.currentBackStackEntryFlow.first { it.destination.route == "home" }
        navController.navigate("socialReturn?ticket=${android.net.Uri.encode(back.ticket.orEmpty())}&error=${android.net.Uri.encode(back.error.orEmpty())}&pending=${android.net.Uri.encode(back.pending.orEmpty())}")
        onSocialReturnConsumed()
    }

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
            ProductWizardScreen(container = container, onBack = { navController.popBackStack() }, onManual = { navController.navigate("merchantProduct") }, onOpenProduct = { id -> navController.navigate("product/$id") })
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
        composable("merchantRegister") {
            MerchantRegisterScreen(
                factory = factory,
                onRegistered = { navController.popBackStack() },
                onBack = { navController.popBackStack() },
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
            AccountSettingsScreen(factory = factory, onBack = { navController.popBackStack() })
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
        composable(
            "merchantProduct?productId={productId}",
            arguments = listOf(navArgument("productId") { type = NavType.StringType; nullable = true; defaultValue = null }),
        ) { backStackEntry ->
            ProductEditScreen(
                container = container,
                productId = backStackEntry.arguments?.getString("productId"),
                onSaved = { navController.popBackStack() },
                onBack = { navController.popBackStack() },
            )
        }
    }
}
