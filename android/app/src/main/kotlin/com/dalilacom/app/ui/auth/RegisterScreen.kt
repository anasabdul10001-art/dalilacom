package com.dalilacom.app.ui.auth

import androidx.compose.foundation.clickable

import com.dalilacom.app.ui.common.Hint

import com.dalilacom.app.R
import com.dalilacom.app.ui.i18n.AppStrings
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.rememberScrollState
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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.layout.width
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.dalilacom.app.ui.ViewModelFactory
import com.dalilacom.app.ui.common.PlaceDropdown

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
    var referralCode by remember { mutableStateOf("") }
    var acceptTerms by remember { mutableStateOf(false) }
    var signupIntent by remember { mutableStateOf(SignupIntent.CUSTOMER) }
    val places by viewModel.places.collectAsState()
    LaunchedEffect(Unit) { viewModel.loadPlaces() }

    LaunchedEffect(uiState) {
        if (uiState is AuthUiState.Success) onRegisterSuccess(signupIntent == SignupIntent.MERCHANT)
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        com.dalilacom.app.ui.common.BrandLogo(modifier = Modifier.width(210.dp), wide = true)
        Spacer(Modifier.height(12.dp))
        Text(AppStrings.get(R.string.s_bb6cc0f4), style = MaterialTheme.typography.headlineSmall, color = MaterialTheme.colorScheme.primary)
        Spacer(Modifier.height(16.dp))
        com.dalilacom.app.ui.common.AuthFeatures()
        Spacer(Modifier.height(16.dp))

        Text(stringResource(R.string.reg_who), style = MaterialTheme.typography.bodyMedium)
        Spacer(Modifier.height(8.dp))
        IntentCard("🏪", stringResource(R.string.reg_biz_title), stringResource(R.string.reg_biz_sub), signupIntent == SignupIntent.MERCHANT) { signupIntent = SignupIntent.MERCHANT }
        Spacer(Modifier.height(10.dp))
        IntentCard("👤", stringResource(R.string.reg_user_title), stringResource(R.string.reg_user_sub), signupIntent == SignupIntent.CUSTOMER) { signupIntent = SignupIntent.CUSTOMER }
        if (signupIntent == SignupIntent.MERCHANT) {
            Spacer(Modifier.height(6.dp))
            Text(stringResource(R.string.reg_biz_note), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
        }
        Spacer(Modifier.height(20.dp))

        OutlinedTextField(
            value = fullName,
            onValueChange = { fullName = it },
            label = { Text(AppStrings.get(R.string.s_e19b16bd)) },
            modifier = Modifier.fillMaxWidth(),
        placeholder = { Hint(stringResource(R.string.ph_person)) },
    )
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(
            value = email,
            onValueChange = { email = it },
            label = { Text(AppStrings.get(R.string.s_cc6b3855)) },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
            modifier = Modifier.fillMaxWidth(),
        placeholder = { Hint(stringResource(R.string.ph_email)) },
    )
        Spacer(Modifier.height(12.dp))
        com.dalilacom.app.ui.common.PasswordField(
            value = password,
            onValueChange = { password = it },
            label = { Text(AppStrings.get(R.string.s_4b860f78)) },
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(12.dp))
        // country first, then its governorates, then the cities of the chosen governorate
        if (places.countries.isNotEmpty()) {
            PlaceDropdown(AppStrings.get(R.string.account_country), places.countries, places.countryId) { viewModel.pickCountry(it) }
            if (places.regions.isNotEmpty()) {
                Spacer(Modifier.height(8.dp))
                PlaceDropdown(AppStrings.get(R.string.account_region), places.regions, places.regionId) { viewModel.pickRegion(it) }
            }
            if (places.cities.isNotEmpty()) {
                Spacer(Modifier.height(8.dp))
                PlaceDropdown(AppStrings.get(R.string.account_city), places.cities, places.cityId) { viewModel.pickCity(it) }
            }
        }
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(
            value = referralCode,
            onValueChange = { referralCode = it.uppercase() },
            label = { Text(stringResource(R.string.ref_code_optional)) },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        placeholder = { Hint(stringResource(R.string.ph_ref_code)) },
    )
        Spacer(Modifier.height(12.dp))
        androidx.compose.foundation.layout.Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth().clickable { acceptTerms = !acceptTerms },
        ) {
            androidx.compose.material3.Checkbox(checked = acceptTerms, onCheckedChange = { acceptTerms = it })
            Text(stringResource(R.string.reg_accept_terms), style = MaterialTheme.typography.bodySmall)
        }
        Spacer(Modifier.height(8.dp))

        if (uiState is AuthUiState.Error) {
            Text((uiState as AuthUiState.Error).message, color = MaterialTheme.colorScheme.error)
            Spacer(Modifier.height(8.dp))
        }

        if (uiState is AuthUiState.Loading) {
            CircularProgressIndicator()
        } else {
            Button(
                onClick = { viewModel.register(email.trim(), password, fullName.trim(), referralCode, acceptTerms) },
                modifier = Modifier.fillMaxWidth(),
            ) { Text(AppStrings.get(R.string.s_a40a6e99)) }
        }

        Spacer(Modifier.height(12.dp))
        SocialButtons(viewModel)
        Spacer(Modifier.height(12.dp))
        TextButton(onClick = onNavigateToLogin) {
            Text(AppStrings.get(R.string.s_d97a32ee))
        }
        Spacer(Modifier.height(8.dp))
        com.dalilacom.app.ui.common.FollowUsButton(Modifier.fillMaxWidth())
        com.dalilacom.app.ui.common.LegalLinks()
    }
}

/** One of the two sign-up choices: an icon, what it is, and who it is for. */
@androidx.compose.runtime.Composable
private fun IntentCard(icon: String, title: String, subtitle: String, selected: Boolean, onClick: () -> Unit) {
    androidx.compose.material3.Surface(
        onClick = onClick,
        shape = androidx.compose.foundation.shape.RoundedCornerShape(16.dp),
        border = androidx.compose.foundation.BorderStroke(if (selected) 2.dp else 1.dp, if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(Modifier.padding(horizontal = 16.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(icon, fontSize = 26.sp)
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f)) {
                Text(title, style = MaterialTheme.typography.titleMedium)
                Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}
