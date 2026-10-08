package com.dalilacom.app.ui.profile

import com.dalilacom.app.ui.i18n.AppStrings
import android.widget.Toast
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
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
import androidx.compose.runtime.LaunchedEffect
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

@Composable
fun ProfileScreen(
    container: AppContainer,
    onLoggedOut: () -> Unit,
    onEditProfile: () -> Unit,
    onOpenAccount: () -> Unit,
    onOpenReview: () -> Unit,
    onOpenNotifications: () -> Unit,
    onRegisterMerchant: () -> Unit,
    onOpenMerchantMode: () -> Unit,
    onOpenStore: () -> Unit,
    onOpenResponder: () -> Unit,
    onOpenWallet: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    var role by remember { mutableStateOf<String?>(null) }
    var account by remember { mutableStateOf<MeResponse?>(null) }
    var profile by remember { mutableStateOf<ProfileDto?>(null) }
    var unread by remember { mutableStateOf(0) }
    val context = LocalContext.current

    LaunchedEffect(Unit) {
        role = container.sessionStore.getRole()
        account = container.authRepository.me()
        profile = container.profileRepository.me()
        unread = container.notificationRepository.unreadCount()
    }

    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Avatar(profile?.fullName ?: AppStrings.get(R.string.s_d14862b0), size = 96.dp, imageUrl = profile?.avatarUrl)
        Spacer(Modifier.height(10.dp))
        Text(profile?.fullName ?: stringResource(R.string.profile_title), style = MaterialTheme.typography.headlineSmall, color = MaterialTheme.colorScheme.primary)
        profile?.bio?.takeIf { it.isNotBlank() }?.let {
            Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
        }
        TextButton(onClick = onEditProfile) { Text(stringResource(R.string.profile_edit)) }
        TextButton(onClick = onOpenAccount) { Text(stringResource(R.string.profile_account_settings)) }
        Spacer(Modifier.height(24.dp))

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
            Spacer(Modifier.height(16.dp))
        }

        if (role == "ADMIN") {
            Button(onClick = onOpenReview, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.review_title)) }
            Spacer(Modifier.height(8.dp))
        }
        if (role == "MERCHANT") {
            Button(onClick = onOpenMerchantMode, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.profile_merchant_mode)) }
        } else {
            OutlinedButton(onClick = onRegisterMerchant, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.profile_register_merchant)) }
        }
        Spacer(Modifier.height(16.dp))
        OutlinedButton(onClick = onOpenNotifications, modifier = Modifier.fillMaxWidth()) {
            Text(stringResource(R.string.profile_notifications) + if (unread > 0) " ($unread)" else "")
        }
        Spacer(Modifier.height(12.dp))
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
        Spacer(Modifier.height(8.dp))
        Button(onClick = onOpenStore, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.profile_store)) }
        Spacer(Modifier.height(8.dp))
        Button(onClick = onOpenResponder, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.profile_responder)) }
        Spacer(Modifier.height(8.dp))
        OutlinedButton(onClick = onOpenWallet, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.profile_wallet)) }
        Spacer(Modifier.height(16.dp))

        Button(onClick = {
            scope.launch {
                container.notificationRepository.unregisterCurrentDevice() // before the session is gone
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
                        androidx.compose.material3.OutlinedTextField(
                            value = deletePassword,
                            onValueChange = { deletePassword = it; deleteError = null },
                            label = { Text(stringResource(R.string.profile_delete_password)) },
                            singleLine = true,
                            visualTransformation = androidx.compose.ui.text.input.PasswordVisualTransformation(),
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
}
