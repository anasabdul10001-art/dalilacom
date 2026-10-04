package com.dalilacom.app.ui.merchantmode

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.automirrored.filled.ListAlt
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.unit.dp
import com.dalilacom.app.data.network.OnboardingDto
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.navigation.NavHostController
import com.dalilacom.app.data.AppContainer
import com.dalilacom.app.ui.ViewModelFactory
import com.dalilacom.app.ui.common.DocumentPrinter
import kotlinx.coroutines.launch

private enum class MerchantTab(val label: String, val icon: ImageVector) {
    Redeem("تأكيد حسم", Icons.Filled.QrCodeScanner),
    Orders("طلبات واردة", Icons.AutoMirrored.Filled.ListAlt),
    Catalog("الكتالوج", Icons.Filled.Inventory2),
}

@Composable
fun MerchantModeShell(rootNavController: NavHostController, container: AppContainer) {
    var selectedTab by rememberSaveable { mutableStateOf(MerchantTab.Redeem) }
    val factory = remember { ViewModelFactory(container) }
    val context = androidx.compose.ui.platform.LocalContext.current
    val scope = androidx.compose.runtime.rememberCoroutineScope()
    var onboarding by remember { mutableStateOf<OnboardingDto?>(null) }
    // Re-read when the tab changes (a discount or product may just have been added); coming back from the
    // hours/listing screens recomposes this shell, which reloads it too.
    LaunchedEffect(selectedTab) { onboarding = container.merchantRepository.getMerchantMe()?.onboarding ?: onboarding }

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
            onboarding?.takeUnless { it.complete }?.let { steps ->
                SetupChecklist(
                    steps = steps,
                    onLocation = { rootNavController.navigate("merchantProfile") },
                    onHours = { rootNavController.navigate("merchantHours") },
                    onCatalog = { selectedTab = MerchantTab.Catalog },
                )
            }
            when (selectedTab) {
                MerchantTab.Redeem -> RedeemScreen(factory, onExportReceipt = { ref ->
                    scope.launch { DocumentPrinter.export(context, container.tokenStore, "/invoices/discount/$ref", "إيصال حسم") }
                })
                MerchantTab.Orders -> MerchantOrdersScreen(factory)
                MerchantTab.Catalog -> CatalogScreen(
                    factory = factory,
                    onProductClick = { id -> rootNavController.navigate("merchantProduct?productId=$id") },
                    onAddProduct = { rootNavController.navigate("merchantProduct") },
                    onOpenHours = { rootNavController.navigate("merchantHours") },
                    onOpenProfile = { rootNavController.navigate("merchantProfile") },
                )
            }
        }
    }
}

/** What's left before the shop shows up for customers — each open item jumps to where it's done. */
@Composable
private fun SetupChecklist(steps: OnboardingDto, onLocation: () -> Unit, onHours: () -> Unit, onCatalog: () -> Unit) {
    Surface(
        shape = RoundedCornerShape(18.dp),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
    ) {
        Column(Modifier.padding(14.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("جهّز محلك ليظهر للزبائن", style = MaterialTheme.typography.titleSmall)
                Text("${steps.doneCount}/5", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
            }
            if (!steps.approved) {
                Text(
                    "⏳ طلبك بانتظار موافقة الإدارة — ما رح يظهر محلك على الخريطة قبلها.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 4.dp),
                )
            }
            Spacer(Modifier.height(6.dp))
            ChecklistItem(steps.location, "حدّد مكان محلك على الخريطة", onLocation)
            ChecklistItem(steps.hours, "حدّد ساعات العمل", onHours)
            ChecklistItem(steps.discount, "أضف حسم للأعضاء", onCatalog)
            ChecklistItem(steps.product, "أضف أول منتج", onCatalog)
            ChecklistItem(steps.approved, "موافقة الإدارة", null)
        }
    }
}

@Composable
private fun ChecklistItem(done: Boolean, label: String, onClick: (() -> Unit)?) {
    Row(
        modifier = Modifier.fillMaxWidth().let { if (!done && onClick != null) it.clickable(onClick = onClick) else it }.padding(vertical = 7.dp),
    ) {
        Text(if (done) "✅" else "⬜")
        Spacer(Modifier.padding(horizontal = 5.dp))
        Text(
            label,
            style = MaterialTheme.typography.bodyMedium,
            color = if (done) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface,
        )
    }
}
