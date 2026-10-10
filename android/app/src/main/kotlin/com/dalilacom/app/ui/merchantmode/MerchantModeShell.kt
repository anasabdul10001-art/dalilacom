package com.dalilacom.app.ui.merchantmode

import com.dalilacom.app.R
import com.dalilacom.app.ui.i18n.AppStrings
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
import androidx.compose.material.icons.filled.Campaign
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
import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Box
import androidx.compose.material3.FloatingActionButton
import androidx.compose.ui.Alignment
import androidx.core.content.ContextCompat
import androidx.lifecycle.viewmodel.compose.viewModel
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions
import kotlinx.coroutines.launch

private enum class MerchantTab(@androidx.annotation.StringRes val labelRes: Int, val icon: ImageVector) {
    Redeem(R.string.s_d9724d06, Icons.Filled.QrCodeScanner),
    Orders(R.string.s_c5ffc332, Icons.AutoMirrored.Filled.ListAlt),
    Catalog(R.string.s_d766cb06, Icons.Filled.Inventory2),
    Promo(R.string.promo_tab, Icons.Filled.Campaign),
}

@Composable
fun MerchantModeShell(rootNavController: NavHostController, container: AppContainer) {
    var selectedTab by rememberSaveable { mutableStateOf(MerchantTab.Redeem) }
    val factory = remember { ViewModelFactory(container) }
    val context = androidx.compose.ui.platform.LocalContext.current
    val scope = androidx.compose.runtime.rememberCoroutineScope()
    var onboarding by remember { mutableStateOf<OnboardingDto?>(null) }
    var me by remember { mutableStateOf<com.dalilacom.app.data.network.MerchantMeDto?>(null) }
    var meLoaded by remember { mutableStateOf(false) }
    var meTick by remember { mutableStateOf(0) }
    // Re-read when the tab changes (a discount or product may just have been added); coming back from the
    // hours/listing screens recomposes this shell, which reloads it too.
    LaunchedEffect(selectedTab, meTick) {
        val m = container.merchantRepository.getMerchantMe()
        if (m != null) me = m
        onboarding = m?.onboarding ?: onboarding
        meLoaded = true
    }

    // The camera button floats over every tab: a scanned member code lands in the Redeem tab, already checked.
    val redeemViewModel: RedeemViewModel = viewModel(factory = factory)
    val scanLauncher = rememberLauncherForActivityResult(ScanContract()) { result ->
        result.contents?.let { text ->
            selectedTab = MerchantTab.Redeem
            redeemViewModel.scanAndVerify(text)
        }
    }
    val cameraPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) scanLauncher.launch(ScanOptions().setBeepEnabled(true).setOrientationLocked(false))
    }
    fun openScanner() {
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
            scanLauncher.launch(ScanOptions().setBeepEnabled(true).setOrientationLocked(false))
        } else {
            cameraPermission.launch(Manifest.permission.CAMERA)
        }
    }

    // merchant mode opens only once the admin has approved the shop
    if (!meLoaded) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { androidx.compose.material3.CircularProgressIndicator() }
        return
    }
    if (me?.approvalStatus != "APPROVED") {
        PendingApproval(refused = me?.approvalStatus == "REJECTED", reason = me?.rejectionReason, onRefresh = { meLoaded = false; meTick++ }, onBack = { rootNavController.popBackStack() })
        return
    }

    Scaffold(
        bottomBar = {
            NavigationBar {
                MerchantTab.values().forEach { tab ->
                    NavigationBarItem(
                        selected = selectedTab == tab,
                        onClick = { selectedTab = tab },
                        icon = { Icon(tab.icon, contentDescription = androidx.compose.ui.res.stringResource(tab.labelRes)) },
                        label = { Text(androidx.compose.ui.res.stringResource(tab.labelRes)) },
                    )
                }
            }
        },
    ) { padding ->
      Box(Modifier.padding(padding).fillMaxSize()) {
        Column(Modifier.fillMaxSize()) {
            TextButton(onClick = { rootNavController.popBackStack() }) { Text(AppStrings.get(R.string.s_a24110f8)) }
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
                    scope.launch { DocumentPrinter.export(context, container.tokenStore, "/invoices/discount/$ref", AppStrings.get(R.string.s_153612e1)) }
                })
                MerchantTab.Orders -> MerchantOrdersScreen(factory)
                MerchantTab.Promo -> PromoScreen(factory)
                MerchantTab.Catalog -> CatalogScreen(
                    factory = factory,
                    onProductClick = { id -> rootNavController.navigate("merchantProduct?productId=$id") },
                    onAddProduct = { rootNavController.navigate("merchantProduct") },
                    onAddByPhoto = { rootNavController.navigate("productWizard") },
                    onOpenHours = { rootNavController.navigate("merchantHours") },
                    onOpenProfile = { rootNavController.navigate("merchantProfile") },
                    onOpenDiscounts = { rootNavController.navigate("discounts") },
                    onOpenShipping = { rootNavController.navigate("shipping") },
                    onOpenAiPlans = { rootNavController.navigate("aiPlans") },
                )
            }
        }
        if (selectedTab != MerchantTab.Redeem) {
            FloatingActionButton(
                onClick = ::openScanner,
                containerColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.72f),
                contentColor = MaterialTheme.colorScheme.onPrimary,
                modifier = Modifier.align(Alignment.BottomEnd).padding(16.dp),
            ) { Icon(Icons.Filled.QrCodeScanner, contentDescription = androidx.compose.ui.res.stringResource(R.string.scan_fab_desc)) }
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
                Text(AppStrings.get(R.string.s_0c6c1d53), style = MaterialTheme.typography.titleSmall)
                Text("${steps.doneCount}/5", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
            }
            if (!steps.approved) {
                Text(
                    AppStrings.get(R.string.s_79e32d1f),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 4.dp),
                )
            }
            Spacer(Modifier.height(6.dp))
            ChecklistItem(steps.location, AppStrings.get(R.string.s_04c5e56f), onLocation)
            ChecklistItem(steps.hours, AppStrings.get(R.string.s_004f489c), onHours)
            ChecklistItem(steps.discount, AppStrings.get(R.string.s_9855a904), onCatalog)
            ChecklistItem(steps.product, AppStrings.get(R.string.s_47352f90), onCatalog)
            ChecklistItem(steps.approved, AppStrings.get(R.string.s_ab03953f), null)
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


/** What a shop owner sees until the admin approves the shop: merchant mode stays closed. */
@Composable
private fun PendingApproval(refused: Boolean, reason: String?, onRefresh: () -> Unit, onBack: () -> Unit) {
    Column(Modifier.fillMaxSize().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        androidx.compose.material3.Text(if (refused) "⛔" else "⏳", style = MaterialTheme.typography.displayMedium)
        Spacer(Modifier.height(12.dp))
        androidx.compose.material3.Text(androidx.compose.ui.res.stringResource(if (refused) R.string.shop_refused_title else R.string.shop_pending_title), style = MaterialTheme.typography.headlineSmall, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
        Spacer(Modifier.height(8.dp))
        androidx.compose.material3.Text(androidx.compose.ui.res.stringResource(if (refused) R.string.shop_refused_sub else R.string.shop_pending_sub), color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
        if (refused && !reason.isNullOrBlank()) {
            Spacer(Modifier.height(8.dp))
            androidx.compose.material3.Text(reason, color = MaterialTheme.colorScheme.error, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
        }
        Spacer(Modifier.height(20.dp))
        androidx.compose.material3.Button(onClick = onRefresh, modifier = Modifier.fillMaxWidth()) { androidx.compose.material3.Text(androidx.compose.ui.res.stringResource(R.string.shop_refresh)) }
        Spacer(Modifier.height(8.dp))
        androidx.compose.material3.OutlinedButton(onClick = onBack, modifier = Modifier.fillMaxWidth()) { androidx.compose.material3.Text(androidx.compose.ui.res.stringResource(R.string.shop_back_to_account)) }
    }
}
