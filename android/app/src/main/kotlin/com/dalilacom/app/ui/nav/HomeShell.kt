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
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
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

private enum class HomeTab(val label: String, val icon: ImageVector) {
    Discover("الخريطة", Icons.Filled.Map),
    Card("بطاقتي", Icons.Filled.CreditCard),
    Cart("السلة", Icons.Filled.ShoppingCart),
    Orders("طلباتي", Icons.AutoMirrored.Filled.ListAlt),
    Profile("حسابي", Icons.Filled.Person),
}

@Composable
fun HomeShell(rootNavController: NavHostController, container: AppContainer) {
    var selectedTab by rememberSaveable { mutableStateOf(HomeTab.Discover) }
    val factory = remember { ViewModelFactory(container) }
    var isGuest by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { isGuest = !container.authRepository.hasStoredSession() }

    val goLogin = { rootNavController.navigate("login") }
    val goRegister = { rootNavController.navigate("register") }

    Scaffold(
        bottomBar = {
            NavigationBar(containerColor = MaterialTheme.colorScheme.surface, tonalElevation = 8.dp) {
                HomeTab.values().forEach { tab ->
                    NavigationBarItem(
                        selected = selectedTab == tab,
                        onClick = { selectedTab = tab },
                        icon = { Icon(tab.icon, contentDescription = tab.label) },
                        label = { Text(tab.label, style = MaterialTheme.typography.labelSmall) },
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
                    onLogin = { goLogin() },
                    onMerchantClick = { id -> rootNavController.navigate("merchant/$id") },
                )
                HomeTab.Card ->
                    if (isGuest) AccountPrompt(
                        icon = Icons.Filled.CreditCard,
                        title = "بطاقة دليلكم",
                        subtitle = "افتح حساب لتحصل على بطاقة الحسم الرقمية وتوفّر بكل محل على الخريطة.",
                        perks = listOf("حسم فوري عند أي تاجر مشترك", "كود QR يتجدّد لحمايتك", "سجل بكل حسوماتك"),
                        onLogin = { goLogin() },
                        onRegister = { goRegister() },
                    ) else CardScreen(factory)
                HomeTab.Cart ->
                    if (isGuest) AccountPrompt(
                        icon = Icons.Filled.ShoppingCart,
                        title = "سلة مشترياتك",
                        subtitle = "سجّل دخولك لتضيف منتجات وتكمل طلبك.",
                        perks = listOf("اطلب من عدة محلات بسلة وحدة", "أسعار خاصة للأعضاء"),
                        onLogin = { goLogin() },
                        onRegister = { goRegister() },
                    ) else CartScreen(factory, onCheckoutSuccess = { selectedTab = HomeTab.Orders })
                HomeTab.Orders ->
                    if (isGuest) AccountPrompt(
                        icon = Icons.AutoMirrored.Filled.ListAlt,
                        title = "طلباتك",
                        subtitle = "سجّل دخولك لتتابع طلباتك وحالتها.",
                        perks = listOf("تتبّع كل طلب خطوة بخطوة", "إلغاء الطلب قبل الشحن"),
                        onLogin = { goLogin() },
                        onRegister = { goRegister() },
                    ) else OrdersScreen(factory, onOrderClick = { id -> rootNavController.navigate("order/$id") })
                HomeTab.Profile ->
                    if (isGuest) AccountPrompt(
                        icon = Icons.Filled.Person,
                        title = "افتح حسابك",
                        subtitle = "الخريطة ودليل المحلات مفتوحين للكل. الحساب بتحتاجه إذا بدك بطاقة حسم أو تسجّل محلك كتاجر.",
                        perks = listOf("احصل على بطاقة الحسم", "سجّل محلك كتاجر وأضف منتجاتك وعروضك", "فعّل المجيب الآلي لمحادثات زبائنك"),
                        onLogin = { goLogin() },
                        onRegister = { goRegister() },
                    ) else ProfileScreen(
                        container = container,
                        onLoggedOut = { rootNavController.navigate("home") { popUpTo(0) } },
                        onRegisterMerchant = { rootNavController.navigate("merchantRegister") },
                        onOpenMerchantMode = { rootNavController.navigate("merchantMode") },
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
        Button(onClick = onLogin, shape = RoundedCornerShape(14.dp), modifier = Modifier.fillMaxWidth().height(52.dp)) { Text("تسجيل الدخول") }
        Spacer(Modifier.height(10.dp))
        OutlinedButton(onClick = onRegister, shape = RoundedCornerShape(14.dp), modifier = Modifier.fillMaxWidth().height(52.dp)) { Text("إنشاء حساب جديد") }
    }
}
