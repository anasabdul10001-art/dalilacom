package com.dalilacom.app.ui.profile

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

@Composable
fun ProfileScreen(
    container: AppContainer,
    onLoggedOut: () -> Unit,
    onEditProfile: () -> Unit,
    onRegisterMerchant: () -> Unit,
    onOpenMerchantMode: () -> Unit,
    onOpenFavorites: () -> Unit,
    onOpenResponder: () -> Unit,
    onOpenWallet: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    var role by remember { mutableStateOf<String?>(null) }
    var account by remember { mutableStateOf<MeResponse?>(null) }
    var profile by remember { mutableStateOf<ProfileDto?>(null) }
    val context = LocalContext.current

    LaunchedEffect(Unit) {
        role = container.sessionStore.getRole()
        account = container.authRepository.me()
        profile = container.profileRepository.me()
    }

    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Avatar(profile?.fullName ?: "؟", size = 96.dp, imageUrl = profile?.avatarUrl)
        Spacer(Modifier.height(10.dp))
        Text(profile?.fullName ?: stringResource(R.string.profile_title), style = MaterialTheme.typography.headlineSmall, color = MaterialTheme.colorScheme.primary)
        profile?.bio?.takeIf { it.isNotBlank() }?.let {
            Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
        }
        TextButton(onClick = onEditProfile) { Text(stringResource(R.string.profile_edit)) }
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

        if (role == "MERCHANT") {
            Button(onClick = onOpenMerchantMode, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.profile_merchant_mode)) }
        } else {
            OutlinedButton(onClick = onRegisterMerchant, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.profile_register_merchant)) }
        }
        Spacer(Modifier.height(16.dp))
        OutlinedButton(onClick = onOpenFavorites, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.profile_favorites)) }
        Spacer(Modifier.height(8.dp))
        Button(onClick = onOpenResponder, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.profile_responder)) }
        Spacer(Modifier.height(8.dp))
        OutlinedButton(onClick = onOpenWallet, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.profile_wallet)) }
        Spacer(Modifier.height(16.dp))

        Button(onClick = {
            scope.launch {
                container.authRepository.logout()
                onLoggedOut()
            }
        }) {
            Text(stringResource(R.string.profile_logout))
        }
    }
}
