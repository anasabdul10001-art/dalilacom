package com.dalilacom.app.ui.nav

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CreditCard
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.automirrored.filled.ListAlt
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.navigation.NavHostController
import com.dalilacom.app.data.AppContainer
import com.dalilacom.app.ui.ViewModelFactory
import com.dalilacom.app.ui.card.CardScreen
import com.dalilacom.app.ui.cart.CartScreen
import com.dalilacom.app.ui.discover.DiscoverScreen
import com.dalilacom.app.ui.orders.OrdersScreen
import com.dalilacom.app.ui.profile.ProfileScreen

private enum class HomeTab(val label: String, val icon: androidx.compose.ui.graphics.vector.ImageVector) {
    Home("الرئيسية", Icons.Filled.Home),
    Card("بطاقتي", Icons.Filled.CreditCard),
    Discover("اكتشف", Icons.Filled.Search),
    Cart("السلة", Icons.Filled.ShoppingCart),
    Orders("طلباتي", Icons.AutoMirrored.Filled.ListAlt),
    Profile("حسابي", Icons.Filled.Person),
}

@Composable
fun HomeShell(rootNavController: NavHostController, container: AppContainer) {
    var selectedTab by rememberSaveable { mutableStateOf(HomeTab.Home) }
    val factory = remember { ViewModelFactory(container) }

    Scaffold(
        bottomBar = {
            NavigationBar {
                HomeTab.values().forEach { tab ->
                    NavigationBarItem(
                        selected = selectedTab == tab,
                        onClick = { selectedTab = tab },
                        icon = { Icon(tab.icon, contentDescription = tab.label) },
                        label = { Text(tab.label) },
                    )
                }
            }
        },
    ) { padding ->
        Column(Modifier.padding(padding).fillMaxSize()) {
            when (selectedTab) {
                HomeTab.Home -> WelcomeTab(onGoToCard = { selectedTab = HomeTab.Card }, onGoToDiscover = { selectedTab = HomeTab.Discover })
                HomeTab.Card -> CardScreen(factory)
                HomeTab.Discover -> DiscoverScreen(factory, onMerchantClick = { id -> rootNavController.navigate("merchant/$id") })
                HomeTab.Cart -> CartScreen(factory, onCheckoutSuccess = { selectedTab = HomeTab.Orders })
                HomeTab.Orders -> OrdersScreen(factory, onOrderClick = { id -> rootNavController.navigate("order/$id") })
                HomeTab.Profile -> ProfileScreen(
                    container = container,
                    onLoggedOut = { rootNavController.navigate("login") { popUpTo(0) } },
                    onRegisterMerchant = { rootNavController.navigate("merchantRegister") },
                    onOpenMerchantMode = { rootNavController.navigate("merchantMode") },
                )
            }
        }
    }
}

@Composable
private fun WelcomeTab(onGoToCard: () -> Unit, onGoToDiscover: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text("أهلًا فيك بدليلكم 👋", style = MaterialTheme.typography.headlineSmall, color = MaterialTheme.colorScheme.primary)
        Spacer(Modifier.height(8.dp))
        Text("شوف بطاقتك، أو دور على تجار عندهم حسم قريبين منك.", style = MaterialTheme.typography.bodyMedium)
        Spacer(Modifier.height(16.dp))
        Button(onClick = onGoToCard) { Text("بطاقتي") }
        Spacer(Modifier.height(8.dp))
        OutlinedButton(onClick = onGoToDiscover) { Text("اكتشف التجار") }
    }
}
