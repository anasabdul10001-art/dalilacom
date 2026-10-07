package com.dalilacom.app.ui.auth

import com.dalilacom.app.R
import com.dalilacom.app.ui.i18n.AppStrings
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.dalilacom.app.ui.ViewModelFactory

private enum class SignupIntent { CUSTOMER, MERCHANT }

@Composable
fun RegisterScreen(
    factory: ViewModelFactory,
    onRegisterSuccess: (registeringAsMerchant: Boolean) -> Unit,
    onNavigateToLogin: () -> Unit,
) {
    val viewModel: AuthViewModel = viewModel(factory = factory)
    val uiState by viewModel.uiState.collectAsState()

    var fullName by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var signupIntent by remember { mutableStateOf(SignupIntent.CUSTOMER) }

    LaunchedEffect(uiState) {
        if (uiState is AuthUiState.Success) onRegisterSuccess(signupIntent == SignupIntent.MERCHANT)
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(AppStrings.get(R.string.s_bb6cc0f4), style = MaterialTheme.typography.headlineSmall, color = MaterialTheme.colorScheme.primary)
        Spacer(Modifier.height(16.dp))

        Text(AppStrings.get(R.string.s_10ceb09f), style = MaterialTheme.typography.bodyMedium)
        Spacer(Modifier.height(8.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilterChip(
                selected = signupIntent == SignupIntent.CUSTOMER,
                onClick = { signupIntent = SignupIntent.CUSTOMER },
                label = { Text(AppStrings.get(R.string.s_58c8a282)) },
            )
            FilterChip(
                selected = signupIntent == SignupIntent.MERCHANT,
                onClick = { signupIntent = SignupIntent.MERCHANT },
                label = { Text(AppStrings.get(R.string.s_625e3fc7)) },
            )
        }
        if (signupIntent == SignupIntent.MERCHANT) {
            Spacer(Modifier.height(6.dp))
            Text(
                AppStrings.get(R.string.s_1e3477e2),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.primary,
            )
        }
        Spacer(Modifier.height(20.dp))

        OutlinedTextField(
            value = fullName,
            onValueChange = { fullName = it },
            label = { Text(AppStrings.get(R.string.s_e19b16bd)) },
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(
            value = email,
            onValueChange = { email = it },
            label = { Text(AppStrings.get(R.string.s_cc6b3855)) },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(
            value = password,
            onValueChange = { password = it },
            label = { Text(AppStrings.get(R.string.s_4b860f78)) },
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(20.dp))

        if (uiState is AuthUiState.Error) {
            Text((uiState as AuthUiState.Error).message, color = MaterialTheme.colorScheme.error)
            Spacer(Modifier.height(8.dp))
        }

        if (uiState is AuthUiState.Loading) {
            CircularProgressIndicator()
        } else {
            Button(
                onClick = { viewModel.register(email.trim(), password, fullName.trim()) },
                modifier = Modifier.fillMaxWidth(),
            ) { Text(AppStrings.get(R.string.s_a40a6e99)) }
        }

        Spacer(Modifier.height(12.dp))
        SocialButtons(viewModel)
        Spacer(Modifier.height(12.dp))
        TextButton(onClick = onNavigateToLogin) {
            Text(AppStrings.get(R.string.s_d97a32ee))
        }
    }
}
