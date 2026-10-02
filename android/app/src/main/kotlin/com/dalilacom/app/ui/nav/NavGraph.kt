package com.dalilacom.app.ui.nav

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.dalilacom.app.data.AppContainer
import com.dalilacom.app.ui.ViewModelFactory
import com.dalilacom.app.ui.auth.LoginScreen
import com.dalilacom.app.ui.auth.RegisterScreen
import com.dalilacom.app.ui.auth.SplashScreen
import com.dalilacom.app.ui.merchant.MerchantDetailScreen
import com.dalilacom.app.ui.merchant.MerchantRegisterScreen
import com.dalilacom.app.ui.merchantmode.MerchantModeShell
import com.dalilacom.app.ui.merchantmode.ProductEditScreen
import com.dalilacom.app.ui.orders.OrderDetailScreen
import com.dalilacom.app.ui.product.ProductDetailScreen
import com.dalilacom.app.ui.responder.ResponderScreen
import com.dalilacom.app.ui.responder.WalletScreen

@Composable
fun DalilacomNavGraph(container: AppContainer) {
    val navController = rememberNavController()
    val factory = remember { ViewModelFactory(container) }

    NavHost(navController = navController, startDestination = "splash") {
        composable("splash") {
            SplashScreen(
                authRepository = container.authRepository,
                onHasSession = { navController.navigate("home") { popUpTo(0) } },
                onNoSession = { navController.navigate("home") { popUpTo(0) } }, // guests land on the map/directory
            )
        }
        composable("login") {
            LoginScreen(
                factory = factory,
                onLoginSuccess = { navController.navigate("home") { popUpTo(0) } },
                onNavigateToRegister = { navController.navigate("register") },
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
                onBack = { navController.popBackStack() },
            )
        }
        composable("product/{productId}") { backStackEntry ->
            val productId = backStackEntry.arguments?.getString("productId").orEmpty()
            ProductDetailScreen(
                container = container,
                productId = productId,
                onBack = { navController.popBackStack() },
                onGoToCart = { navController.popBackStack("home", inclusive = false) },
            )
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
        composable("responder") {
            ResponderScreen(factory = factory, onBack = { navController.popBackStack() }, onOpenWallet = { navController.navigate("wallet") })
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
