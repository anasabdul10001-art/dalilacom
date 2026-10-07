package com.dalilacom.app.ui.auth

import com.dalilacom.app.ui.i18n.AppStrings
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.dalilacom.app.R
import com.dalilacom.app.ui.ViewModelFactory
import com.dalilacom.app.ui.theme.DeepRed
import com.dalilacom.app.ui.theme.PrimaryRed

@Composable
fun LoginScreen(
    factory: ViewModelFactory,
    onLoginSuccess: () -> Unit,
    onNavigateToRegister: () -> Unit,
    onBrowseAsGuest: () -> Unit,
) {
    val viewModel: AuthViewModel = viewModel(factory = factory)
    val uiState by viewModel.uiState.collectAsState()

    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }

    LaunchedEffect(uiState) {
        if (uiState is AuthUiState.Success) onLoginSuccess()
    }

    Column(modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).imePadding()) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(Brush.verticalGradient(listOf(DeepRed, PrimaryRed)))
                .padding(top = 56.dp, bottom = 64.dp),
            contentAlignment = Alignment.Center,
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Box(
                    modifier = Modifier.size(92.dp).clip(CircleShape).background(Color.White),
                    contentAlignment = Alignment.Center,
                ) {
                    Image(painterResource(R.drawable.ic_launcher_foreground), contentDescription = AppStrings.get(R.string.s_7feb59f4), modifier = Modifier.size(92.dp))
                }
                Spacer(Modifier.height(14.dp))
                Text(AppStrings.get(R.string.s_7feb59f4), style = MaterialTheme.typography.headlineLarge, color = Color.White)
                Text(AppStrings.get(R.string.s_249b177e), style = MaterialTheme.typography.bodyMedium, color = Color.White.copy(alpha = 0.85f))
            }
        }

        Surface(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp).padding(top = 0.dp),
            shape = RoundedCornerShape(24.dp),
            shadowElevation = 6.dp,
            color = MaterialTheme.colorScheme.surface,
        ) {
            Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(AppStrings.get(R.string.s_8c6117b6), style = MaterialTheme.typography.titleLarge)
                OutlinedTextField(
                    value = email,
                    onValueChange = { email = it },
                    label = { Text(AppStrings.get(R.string.s_cc6b3855)) },
                    singleLine = true,
                    shape = RoundedCornerShape(14.dp),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = password,
                    onValueChange = { password = it },
                    label = { Text(AppStrings.get(R.string.s_db4175ae)) },
                    singleLine = true,
                    shape = RoundedCornerShape(14.dp),
                    visualTransformation = PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                    modifier = Modifier.fillMaxWidth(),
                )
                if (uiState is AuthUiState.Error) {
                    Text((uiState as AuthUiState.Error).message, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                }
                if (uiState is AuthUiState.Loading) {
                    Box(Modifier.fillMaxWidth().height(52.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
                } else {
                    Button(
                        onClick = { viewModel.login(email.trim(), password) },
                        shape = RoundedCornerShape(14.dp),
                        modifier = Modifier.fillMaxWidth().height(52.dp),
                    ) { Text(AppStrings.get(R.string.s_c9cbc8b2), style = MaterialTheme.typography.titleSmall) }
                }
            }
        }

        Column(Modifier.fillMaxWidth().padding(16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            TextButton(onClick = onNavigateToRegister) { Text(AppStrings.get(R.string.s_60e251d0)) }
            TextButton(onClick = onBrowseAsGuest) { Text(AppStrings.get(R.string.s_d2cbe1d2), color = MaterialTheme.colorScheme.onSurfaceVariant) }
        }
    }
}
