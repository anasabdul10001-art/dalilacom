package com.dalilacom.app.ui.profile

import com.dalilacom.app.ui.i18n.AppStrings
import android.widget.Toast
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.TextButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import com.dalilacom.app.R
import androidx.compose.ui.unit.sp
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.draw.clip
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.clickable
import androidx.compose.foundation.border
import androidx.compose.foundation.background
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.graphics.Color
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import com.dalilacom.app.data.network.MeResponse
import com.dalilacom.app.data.network.ProfileDto
import com.dalilacom.app.ui.common.Avatar
import androidx.compose.ui.unit.dp
import com.dalilacom.app.data.AppContainer
import kotlinx.coroutines.launch
import androidx.compose.foundation.layout.Row
import androidx.compose.runtime.collectAsState
import androidx.compose.material3.Switch
import androidx.compose.material3.OutlinedTextField

@Composable
fun ProfileScreen(
    container: AppContainer,
    onLoggedOut: () -> Unit,
    onEditProfile: () -> Unit,
    onOpenAccount: () -> Unit,
    onOpenReview: () -> Unit,
    onOpenNotifications: () -> Unit,
    onRegisterMerchant: () -> Unit,
    onOpenOnlineStore: () -> Unit = {},
    onOpenMapListing: () -> Unit = {},
    onOpenMarketingTeam: () -> Unit = {},
    onOpenMerchantMode: () -> Unit,
    onOpenStore: () -> Unit = {},
    onOpenMyAds: () -> Unit = {},
    onOpenWallet: () -> Unit,
    onOpenFavorites: () -> Unit = {},
    onOpenOrders: () -> Unit = {},
    onOpenCart: () -> Unit = {},
    onOpenMarketing: () -> Unit = {},
    onOpenHistory: () -> Unit = {},
    onOpenMarketplace: () -> Unit = {},
onOpenDoctorCare: () -> Unit = {},
    onOpenAppointments: () -> Unit = {},
    onOpenFitnessProfile: () -> Unit = {},
    onOpenFitnessPlans: () -> Unit = {},

) {
    val scope = rememberCoroutineScope()
    val role by container.sessionStore.roleFlow.collectAsState(initial = null)
    var account by remember { mutableStateOf<MeResponse?>(null) }
    var profile by remember { mutableStateOf<ProfileDto?>(container.profileRepository.cached) }
    var unread by remember { mutableStateOf(0) }
    val payoutEnabled = remember { androidx.compose.runtime.mutableStateMapOf<String, Boolean>() }
    val payoutNames = remember { androidx.compose.runtime.mutableStateMapOf<String, String>() }
    val payoutAccounts = remember { androidx.compose.runtime.mutableStateMapOf<String, String>() }
    var payoutSaving by remember { mutableStateOf(false) }
var fitnessProvider by remember { mutableStateOf(false) }
    var doctorProvider by remember { mutableStateOf(false) }
    var hasDoctorConnection by remember { mutableStateOf(false) }
    var hasDoctorAppointment by remember { mutableStateOf(false) }
    var hasFitnessPlan by remember { mutableStateOf(false) }

    val context = LocalContext.current

    LaunchedEffect(role) {
        // all four at once, the name and photo first on screen: they used to arrive one request after the other
        kotlinx.coroutines.coroutineScope {
            launch { container.profileRepository.me()?.let { profile = it } }
            launch { account = container.authRepository.me() }
            launch { unread = container.notificationRepository.unreadCount() }
            launch {
                container.profileRepository.sellerPaymentMethods().forEach { method ->
                    payoutEnabled[method.provider] = method.isEnabled
                    payoutNames[method.provider] = method.recipientName
                    payoutAccounts[method.provider] = method.accountNumber
                }
            }
if (role == "CUSTOMER") {
                launch { container.doctorCareRepository.load().onSuccess { care -> hasDoctorConnection = care.requests.isNotEmpty() || care.doctors.isNotEmpty() } }
                launch { container.doctorCareRepository.myAppointments().onSuccess { appointments -> hasDoctorAppointment = appointments.items.isNotEmpty() } }
                launch {
                    val plans = container.fitnessPlansRepository.myPlans().getOrDefault(emptyList())
                    val enrollments = container.fitnessPlansRepository.myEnrollments().getOrDefault(emptyList())
                    hasFitnessPlan = plans.isNotEmpty() || enrollments.isNotEmpty()
                }
            }
            if (role == "MERCHANT") {
                launch { fitnessProvider = container.merchantRepository.getMerchantMe()?.isFitnessProvider == true }
                launch { container.doctorCareRepository.load().onSuccess { care -> doctorProvider = care.mode == "DOCTOR" } }
            }

        }
    }

    // the sections open one at a time; the quick tiles and the header stay on top
    var openSection by androidx.compose.runtime.saveable.rememberSaveable { mutableStateOf<String?>(null) }
    fun toggle(id: String) { openSection = if (openSection == id) null else id }

    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        // header
        Column(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(28.dp))
                .background(Brush.verticalGradient(listOf(MaterialTheme.colorScheme.surface, MaterialTheme.colorScheme.surfaceVariant)))
                .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(28.dp))
                .padding(horizontal = 16.dp, vertical = 20.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Avatar(profile?.fullName ?: AppStrings.get(R.string.s_d14862b0), size = 96.dp, imageUrl = profile?.avatarUrl)
            Spacer(Modifier.height(10.dp))
            Text(profile?.fullName ?: stringResource(R.string.profile_title), style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.ExtraBold)
            profile?.bio?.takeIf { it.isNotBlank() }?.let {
                Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
            }
            Spacer(Modifier.height(8.dp))
            OutlinedButton(onClick = onEditProfile, shape = RoundedCornerShape(999.dp)) { Text("✎  " + plainLabel(stringResource(R.string.profile_edit))) }
        }
        // quick tiles
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            ProfileTile("🛒", plainLabel(stringResource(R.string.profile_my_cart)), onOpenCart, Modifier.weight(1f))
            ProfileTile("📦", plainLabel(stringResource(R.string.tab_orders)), onOpenOrders, Modifier.weight(1f))
            ProfileTile("👛", plainLabel(stringResource(R.string.profile_wallet)), { toggle("wallet") }, Modifier.weight(1f))
        }
        // Only nag about verifying when the server can actually deliver the email.
        account?.takeIf { !it.user.emailVerified && it.emailDeliveryEnabled }?.let { me ->
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp)) {
                    Text(stringResource(R.string.verify_title), style = MaterialTheme.typography.titleSmall)
                    Text(stringResource(R.string.verify_sub), style = MaterialTheme.typography.bodySmall)
                    TextButton(onClick = {
                        scope.launch {
                            val sent = container.authRepository.resendVerification(me.user.email)
                            Toast.makeText(context, if (sent) context.getString(R.string.verify_sent) else context.getString(R.string.verify_failed), Toast.LENGTH_SHORT).show()
                        }
                    }) { Text(stringResource(R.string.verify_resend)) }
                }
            }
        }


        // purchases
        ProfileSection("🛒", stringResource(R.string.prof_sec_buy), stringResource(R.string.prof_sec_buy_sub), openSection == "buy", { toggle("buy") }) {
            ProfileRow("🛒", stringResource(R.string.profile_my_cart), onClick = onOpenCart)
            ProfileRow("📦", stringResource(R.string.tab_orders), onClick = onOpenOrders)
            ProfileRow("♥", stringResource(R.string.profile_favorites), onClick = onOpenFavorites)
            ProfileRow("🧾", stringResource(R.string.dh_title_mine), onClick = onOpenHistory)
            ProfileRow("🛍️", AppStrings.get(R.string.s_e4b4c234), onClick = onOpenMarketplace)
        }
        // wallet: the balance, and how the person gets paid for what they sell
        ProfileSection("👛", stringResource(R.string.prof_sec_wallet), stringResource(R.string.prof_sec_wallet_sub), openSection == "wallet", { toggle("wallet") }) {
            ProfileRow("👛", stringResource(R.string.profile_wallet), onClick = onOpenWallet)
        Card(modifier = Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp)) {
                Text(AppStrings.get(R.string.s_b179bf25), style = MaterialTheme.typography.titleMedium)
                Text(AppStrings.get(R.string.s_2ace6138), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                listOf("BANK_ALSHAM" to AppStrings.get(R.string.s_20f44d7f), "SYRIATEL" to AppStrings.get(R.string.fit_auto_31d9b741), "MTN" to AppStrings.get(R.string.fit_auto_d79941c7)).forEach { (provider, label) ->
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        Text(label, Modifier.weight(1f))
                        Switch(checked = payoutEnabled[provider] ?: false, onCheckedChange = { payoutEnabled[provider] = it })
                    }
                    OutlinedTextField(value = payoutNames[provider].orEmpty(), onValueChange = { payoutNames[provider] = it }, label = { Text(AppStrings.get(R.string.s_01a85ddc)) }, modifier = Modifier.fillMaxWidth(), singleLine = true)
                    OutlinedTextField(value = payoutAccounts[provider].orEmpty(), onValueChange = { payoutAccounts[provider] = it }, label = { Text(AppStrings.get(R.string.s_54744a3d)) }, modifier = Modifier.fillMaxWidth(), singleLine = true)
                }
                Spacer(Modifier.height(8.dp))
                Button(enabled = !payoutSaving, onClick = {
                    scope.launch {
                        payoutSaving = true
                        val methods = listOf("BANK_ALSHAM", "SYRIATEL", "MTN").filter { payoutEnabled[it] == true }.map { provider ->
                            com.dalilacom.app.data.network.SellerPaymentMethodDto(provider = provider, recipientName = payoutNames[provider].orEmpty(), accountNumber = payoutAccounts[provider].orEmpty(), isEnabled = true)
                        }
                        container.profileRepository.saveSellerPaymentMethods(methods)
                            .onFailure { Toast.makeText(context, it.message ?: AppStrings.get(R.string.ship_failed), Toast.LENGTH_LONG).show() }
                            .onSuccess { Toast.makeText(context, AppStrings.get(R.string.s_4816f255), Toast.LENGTH_SHORT).show() }
                        payoutSaving = false
                    }
                }, modifier = Modifier.fillMaxWidth()) { Text(if (payoutSaving) AppStrings.get(R.string.affiliate_team_saving) else AppStrings.get(R.string.s_40c2c372)) }
            }
        }
        }
        // the person's business (a shop) or the way to start one
        if (role == "MERCHANT" || role == "CUSTOMER") ProfileSection("🏪", stringResource(R.string.prof_sec_business), stringResource(R.string.prof_sec_business_sub), openSection == "business", { toggle("business") }) {
            if (role == "MERCHANT") {
                ProfileRow("🏪", stringResource(R.string.profile_merchant_mode), onClick = onOpenMerchantMode)
                ProfileRow("🛍️", stringResource(R.string.sp_title), onClick = onOpenStore)
                ProfileRow("📍", stringResource(R.string.profile_map_listing), onClick = onOpenMapListing)
                ProfileRow("📢", stringResource(R.string.profile_my_ads), onClick = onOpenMyAds)
                ProfileRow("🤝", stringResource(R.string.profile_marketing_team), onClick = onOpenMarketingTeam)
            } else {
                ProfileRow("📍", stringResource(R.string.profile_register_merchant), stringResource(R.string.profile_map_activity_sub), onRegisterMerchant)
                ProfileRow("🛍️", stringResource(R.string.profile_open_online_store), stringResource(R.string.profile_start_selling_sub), onOpenOnlineStore)
            }
        }
        ProfileSection("📣", stringResource(R.string.prof_sec_marketing), stringResource(R.string.prof_sec_marketing_sub), openSection == "marketing", { toggle("marketing") }) {
            ProfileRow("📣", stringResource(R.string.ref_title), onClick = onOpenMarketing)
        }
        // services that exist only when the person has a real relation to them (a doctor, a trainer, a plan)
        val hasDoctorCare = (role == "CUSTOMER" && (hasDoctorConnection || hasDoctorAppointment)) || (role == "MERCHANT" && doctorProvider)
        val hasServices = hasDoctorCare || (role == "MERCHANT" && fitnessProvider) || (role == "CUSTOMER" && hasFitnessPlan)
        if (hasServices) ProfileSection("🩺", stringResource(R.string.prof_sec_services), stringResource(R.string.prof_sec_services_sub), openSection == "services", { toggle("services") }) {
            if (hasDoctorCare) {
                ProfileRow("🩺", stringResource(R.string.care_title), onClick = onOpenDoctorCare)
                ProfileRow("📅", stringResource(R.string.appointment_my_title), onClick = onOpenAppointments)
            }
            if (role == "MERCHANT" && fitnessProvider) {
                ProfileRow("🏋️", stringResource(R.string.fitness_profile), onClick = onOpenFitnessProfile)
                ProfileRow("📋", stringResource(R.string.fit_auto_c2ed8d0d), onClick = onOpenFitnessPlans)
            }
            if (role == "CUSTOMER" && hasFitnessPlan) ProfileRow("🏋️", stringResource(R.string.fit_auto_d141a0e3), onClick = onOpenFitnessPlans)
        }
        ProfileSection("📍", stringResource(R.string.prof_sec_privacy), stringResource(R.string.prof_sec_privacy_sub), openSection == "privacy", { toggle("privacy") }) {
        // Opt-in: with this on, the app tells the server roughly where the person is (while the map is in use) so shops
        // nearby can send them offers. Off by default; switching it off makes the server forget the position.
        val shareLocation by container.sessionStore.shareLocationFlow.collectAsState(initial = false)
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(stringResource(R.string.profile_share_location), style = MaterialTheme.typography.bodyLarge)
                Text(stringResource(R.string.profile_share_location_sub), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Switch(
                checked = shareLocation,
                onCheckedChange = { on ->
                    scope.launch {
                        container.sessionStore.setShareLocation(on)
                        if (!on) container.profileRepository.forgetLocation()
                    }
                },
            )
        }
        // with the switch on, the person sets where they are: a map, and a button that keeps the place
        if (shareLocation) {
            var picked by remember { mutableStateOf<Pair<Double, Double>?>(null) }
            var saved by remember { mutableStateOf<Pair<Double, Double>?>(null) }
            var busy by remember { mutableStateOf(false) }
            val context = androidx.compose.ui.platform.LocalContext.current
            LaunchedEffect(Unit) { container.profileRepository.savedLocation()?.let { picked = it; saved = it } }
            Spacer(Modifier.height(8.dp))
            Text(stringResource(R.string.loc_title), style = MaterialTheme.typography.titleSmall)
            Text(stringResource(R.string.loc_hint), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(6.dp))
            com.dalilacom.app.ui.common.LocationPicker(value = picked, onChange = { picked = it })
            Spacer(Modifier.height(8.dp))
            Button(
                enabled = picked != null && !busy,
                modifier = Modifier.fillMaxWidth(),
                onClick = {
                    val p = picked ?: return@Button
                    busy = true
                    scope.launch {
                        val ok = container.profileRepository.setLocation(p.first, p.second)
                        busy = false
                        if (ok) saved = p
                        android.widget.Toast.makeText(context, context.getString(if (ok) R.string.loc_done else R.string.loc_failed), android.widget.Toast.LENGTH_SHORT).show()
                    }
                },
            ) { Text("📍  " + stringResource(R.string.loc_set)) }
            val s = saved; val p = picked
            if (s != null && p != null && kotlin.math.abs(s.first - p.first) < 0.006 && kotlin.math.abs(s.second - p.second) < 0.006) {
                Text("✓ " + stringResource(R.string.loc_saved), color = Color(0xFF1E8E3E), style = MaterialTheme.typography.labelLarge, modifier = Modifier.padding(top = 4.dp))
            }
        }
        }
        if (role == "ADMIN") ProfileSection("🛡️", stringResource(R.string.prof_sec_admin), stringResource(R.string.prof_sec_admin_sub), openSection == "admin", { toggle("admin") }) {
            ProfileRow("📣", stringResource(R.string.review_title), onClick = onOpenReview)
        }
        ProfileSection("⚙️", stringResource(R.string.prof_sec_account), stringResource(R.string.prof_sec_account_sub), openSection == "account", { toggle("account") }) {
            ProfileRow("⚙️", stringResource(R.string.profile_account_settings), onClick = onOpenAccount)
            ProfileRow("🔔", stringResource(R.string.profile_notifications) + if (unread > 0) " ($unread)" else "", onClick = onOpenNotifications)
        // "Download my data" (GDPR right of access): everything held about the person, handed to the share sheet as text
        val exportContext = androidx.compose.ui.platform.LocalContext.current
        OutlinedButton(onClick = {
            scope.launch {
                container.profileRepository.exportData()
                    .onSuccess { json ->
                        val send = android.content.Intent(android.content.Intent.ACTION_SEND).apply {
                            type = "text/plain"
                            putExtra(android.content.Intent.EXTRA_SUBJECT, "dalilacom-my-data.json")
                            putExtra(android.content.Intent.EXTRA_TEXT, json)
                        }
                        exportContext.startActivity(android.content.Intent.createChooser(send, null))
                    }
                    .onFailure { android.widget.Toast.makeText(exportContext, it.message, android.widget.Toast.LENGTH_SHORT).show() }
            }
        }, modifier = Modifier.fillMaxWidth()) { Text("⬇️ " + stringResource(R.string.profile_export_data)) }
            Spacer(Modifier.height(4.dp))
        Button(onClick = {
            scope.launch {
                container.notificationRepository.unregisterCurrentDevice() // before the session is gone
                container.profileRepository.clearCache()
                container.authRepository.logout()
                onLoggedOut()
            }
        }) {
            Text(stringResource(R.string.profile_logout))
        }

        // Delete the account for good: personal data goes, an anonymous record of orders and wallet stays for the books.
        var askDelete by remember { mutableStateOf(false) }
        var deletePassword by remember { mutableStateOf("") }
        var deleteError by remember { mutableStateOf<String?>(null) }
        TextButton(onClick = { askDelete = true }) {
            Text(stringResource(R.string.profile_delete_account), color = MaterialTheme.colorScheme.error)
        }
        if (askDelete) {
            androidx.compose.material3.AlertDialog(
                onDismissRequest = { askDelete = false },
                title = { Text(stringResource(R.string.profile_delete_account)) },
                text = {
                    Column {
                        Text(stringResource(R.string.profile_delete_message))
                        com.dalilacom.app.ui.common.PasswordField(
                            value = deletePassword,
                            onValueChange = { deletePassword = it; deleteError = null },
                            label = { Text(stringResource(R.string.profile_delete_password)) },
                            modifier = Modifier.fillMaxWidth(),
                        )
                        deleteError?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
                    }
                },
                confirmButton = {
                    TextButton(onClick = {
                        scope.launch {
                            container.profileRepository.deleteAccount(deletePassword)
                                .onSuccess {
                                    container.notificationRepository.unregisterCurrentDevice()
                                    container.profileRepository.clearCache()
                                    container.authRepository.logout()
                                    askDelete = false
                                    onLoggedOut()
                                }
                                .onFailure { deleteError = it.message }
                        }
                    }) { Text(stringResource(R.string.profile_delete_confirm), color = MaterialTheme.colorScheme.error) }
                },
                dismissButton = { TextButton(onClick = { askDelete = false }) { Text(stringResource(R.string.profile_delete_cancel)) } },
            )
        }

        }
        com.dalilacom.app.ui.common.FollowUsButton(Modifier.fillMaxWidth())
        com.dalilacom.app.ui.common.LegalLinks()
    }
}

/** Some labels already start with their own emoji; a row has an icon of its own, so that one is dropped. */
private fun plainLabel(text: String) = text.trimStart { !it.isLetterOrDigit() }

@Composable
private fun ProfileTile(icon: String, label: String, onClick: () -> Unit, modifier: Modifier = Modifier) {
    Column(
        modifier.clip(RoundedCornerShape(20.dp)).background(MaterialTheme.colorScheme.surface)
            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(20.dp)).clickable(onClick = onClick).padding(vertical = 14.dp, horizontal = 6.dp),
        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Box(Modifier.size(40.dp).clip(RoundedCornerShape(14.dp)).background(MaterialTheme.colorScheme.surfaceVariant), contentAlignment = Alignment.Center) { Text(icon, fontSize = 20.sp) }
        Text(label, fontWeight = FontWeight.Bold, fontSize = 13.sp, maxLines = 1)
    }
}

/** A group of the account page: a header (icon, title, a line of what is inside, a chevron) that opens the group's content. */
@Composable
private fun ProfileSection(icon: String, title: String, sub: String, expanded: Boolean, onToggle: () -> Unit, content: @Composable ColumnScope.() -> Unit) {
    val border = if (expanded) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(MaterialTheme.colorScheme.surface).border(1.dp, border, RoundedCornerShape(22.dp))) {
        Row(Modifier.fillMaxWidth().clickable(onClick = onToggle).padding(14.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(
                Modifier.size(42.dp).clip(RoundedCornerShape(14.dp)).background(if (expanded) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant),
                contentAlignment = Alignment.Center,
            ) { Text(icon, fontSize = 21.sp) }
            Column(Modifier.weight(1f)) {
                Text(title, fontWeight = FontWeight.Bold)
                Text(sub, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Text(if (expanded) "⌃" else "⌄", fontSize = 20.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (expanded) Column(Modifier.fillMaxWidth().padding(start = 12.dp, end = 12.dp, bottom = 14.dp), verticalArrangement = Arrangement.spacedBy(8.dp), content = content)
    }
}

/** One line inside a group: an icon, the label (and a line under it when it helps) and a chevron. */
@Composable
private fun ProfileRow(icon: String, label: String, sub: String? = null, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(MaterialTheme.colorScheme.surfaceVariant).clickable(onClick = onClick).padding(horizontal = 12.dp, vertical = 11.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(icon, fontSize = 19.sp, modifier = Modifier.width(30.dp), textAlign = androidx.compose.ui.text.style.TextAlign.Center)
        Column(Modifier.weight(1f)) {
            Text(plainLabel(label), fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
            if (sub != null) Text(sub, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Text("›", fontSize = 20.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
