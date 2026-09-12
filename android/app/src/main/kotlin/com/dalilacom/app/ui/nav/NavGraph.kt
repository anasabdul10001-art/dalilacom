package com.dalilacom.app.ui.nav

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.dalilacom.app.data.AppContainer
import com.dalilacom.app.ui.ViewModelFactory
import com.dalilacom.app.ui.auth.LoginScreen
import com.dalilacom.app.ui.auth.RegisterScreen
import com.dalilacom.app.ui.auth.SplashScreen

@Composable
fun DalilacomNavGraph(container: AppContainer) {
    val navController = rememberNavController()
    val factory = remember { ViewModelFactory(container) }

    NavHost(navController = navController, startDestination = "splash") {
        composable("splash") {
            SplashScreen(
                authRepository = container.authRepository,
                onHasSession = { navController.navigate("home") { popUpTo(0) } },
                onNoSession = { navController.navigate("login") { popUpTo(0) } },
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
                onRegisterSuccess = { navController.navigate("home") { popUpTo(0) } },
                onNavigateToLogin = { navController.popBackStack() },
            )
        }
        composable("home") {
            HomeShell(rootNavController = navController, container = container)
        }
    }
}
