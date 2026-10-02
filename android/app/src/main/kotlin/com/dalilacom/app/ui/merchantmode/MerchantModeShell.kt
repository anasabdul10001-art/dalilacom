package com.dalilacom.app.ui.merchantmode

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.automirrored.filled.ListAlt
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.navigation.NavHostController
import com.dalilacom.app.data.AppContainer
import com.dalilacom.app.ui.ViewModelFactory

private enum class MerchantTab(val label: String, val icon: ImageVector) {
    Redeem("تأكيد حسم", Icons.Filled.QrCodeScanner),
    Orders("طلبات واردة", Icons.AutoMirrored.Filled.ListAlt),
    Catalog("الكتالوج", Icons.Filled.Inventory2),
}

@Composable
fun MerchantModeShell(rootNavController: NavHostController, container: AppContainer) {
    var selectedTab by rememberSaveable { mutableStateOf(MerchantTab.Redeem) }
    val factory = remember { ViewModelFactory(container) }

    Scaffold(
        bottomBar = {
            NavigationBar {
                MerchantTab.values().forEach { tab ->
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
            TextButton(onClick = { rootNavController.popBackStack() }) { Text("‹ رجوع لحساب الزبون") }
            when (selectedTab) {
                MerchantTab.Redeem -> RedeemScreen(factory)
                MerchantTab.Orders -> MerchantOrdersScreen(factory)
                MerchantTab.Catalog -> CatalogScreen(
                    factory = factory,
                    onProductClick = { id -> rootNavController.navigate("merchantProduct?productId=$id") },
                    onAddProduct = { rootNavController.navigate("merchantProduct") },
                )
            }
        }
    }
}
