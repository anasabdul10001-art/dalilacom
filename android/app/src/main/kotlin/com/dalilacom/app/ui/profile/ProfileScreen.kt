package com.dalilacom.app.ui.profile

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
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
import androidx.compose.ui.unit.dp
import com.dalilacom.app.data.AppContainer
import kotlinx.coroutines.launch

@Composable
fun ProfileScreen(
    container: AppContainer,
    onLoggedOut: () -> Unit,
    onRegisterMerchant: () -> Unit,
    onOpenMerchantMode: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    var role by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) { role = container.sessionStore.getRole() }

    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text("حسابي", style = MaterialTheme.typography.headlineSmall, color = MaterialTheme.colorScheme.primary)
        Spacer(Modifier.height(24.dp))

        if (role == "MERCHANT") {
            Button(onClick = onOpenMerchantMode, modifier = Modifier.fillMaxWidth()) { Text("وضع التاجر") }
        } else {
            OutlinedButton(onClick = onRegisterMerchant, modifier = Modifier.fillMaxWidth()) { Text("سجّل كتاجر") }
        }
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
