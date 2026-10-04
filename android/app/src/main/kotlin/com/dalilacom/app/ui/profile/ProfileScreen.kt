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
import androidx.compose.ui.unit.dp
import com.dalilacom.app.data.AppContainer
import kotlinx.coroutines.launch

@Composable
fun ProfileScreen(
    container: AppContainer,
    onLoggedOut: () -> Unit,
    onRegisterMerchant: () -> Unit,
    onOpenMerchantMode: () -> Unit,
    onOpenFavorites: () -> Unit,
    onOpenResponder: () -> Unit,
    onOpenWallet: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    var role by remember { mutableStateOf<String?>(null) }
    var account by remember { mutableStateOf<MeResponse?>(null) }
    val context = LocalContext.current

    LaunchedEffect(Unit) {
        role = container.sessionStore.getRole()
        account = container.authRepository.me()
    }

    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text("حسابي", style = MaterialTheme.typography.headlineSmall, color = MaterialTheme.colorScheme.primary)
        Spacer(Modifier.height(24.dp))

        // Only nag about verifying when the server can actually deliver the email.
        account?.takeIf { !it.user.emailVerified && it.emailDeliveryEnabled }?.let { me ->
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp)) {
                    Text("✉️ بريدك غير موثّق", style = MaterialTheme.typography.titleSmall)
                    Text("وثّق بريدك لتحمي حسابك وتقدر تسترجع كلمة السرّ.", style = MaterialTheme.typography.bodySmall)
                    TextButton(onClick = {
                        scope.launch {
                            val sent = container.authRepository.resendVerification(me.user.email)
                            Toast.makeText(context, if (sent) "أرسلنا رابط التوثيق لبريدك ✅" else "تعذّر الإرسال، جرّب بعد شوي", Toast.LENGTH_SHORT).show()
                        }
                    }) { Text("إعادة إرسال رابط التوثيق") }
                }
            }
            Spacer(Modifier.height(16.dp))
        }

        if (role == "MERCHANT") {
            Button(onClick = onOpenMerchantMode, modifier = Modifier.fillMaxWidth()) { Text("وضع التاجر") }
        } else {
            OutlinedButton(onClick = onRegisterMerchant, modifier = Modifier.fillMaxWidth()) { Text("سجّل كتاجر") }
        }
        Spacer(Modifier.height(16.dp))
        OutlinedButton(onClick = onOpenFavorites, modifier = Modifier.fillMaxWidth()) { Text("♥ أماكني المحفوظة") }
        Spacer(Modifier.height(8.dp))
        Button(onClick = onOpenResponder, modifier = Modifier.fillMaxWidth()) { Text("المجيب الآلي") }
        Spacer(Modifier.height(8.dp))
        OutlinedButton(onClick = onOpenWallet, modifier = Modifier.fillMaxWidth()) { Text("محفظتي") }
        Spacer(Modifier.height(16.dp))

        Button(onClick = {
            scope.launch {
                container.authRepository.logout()
                onLoggedOut()
            }
        }) {
            Text("تسجيل الخروج")
        }
    }
}
