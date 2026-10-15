package com.dalilacom.app.ui.merchant

import com.dalilacom.app.R
import com.dalilacom.app.ui.i18n.AppStrings
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
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
import androidx.compose.ui.Modifier
import kotlinx.coroutines.launch
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.dalilacom.app.ui.ViewModelFactory
import com.dalilacom.app.ui.common.ProfessionPicker
import com.dalilacom.app.ui.common.isOnlineCategory
import androidx.compose.ui.res.stringResource
import com.dalilacom.app.ui.common.LocationPicker

@Composable
fun MerchantRegisterScreen(factory: ViewModelFactory, onRegistered: () -> Unit, onBack: () -> Unit) {
    val viewModel: MerchantRegisterViewModel = viewModel(factory = factory)
    val state by viewModel.uiState.collectAsState()

    var businessName by remember { mutableStateOf("") }
    var address by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }
    var whatsapp by remember { mutableStateOf("") }
    var selectedCategoryId by remember { mutableStateOf<String?>(null) }
    var location by remember { mutableStateOf<Pair<Double, Double>?>(null) }
    var suggestion by remember { mutableStateOf("") }
    var autoAddress by remember { mutableStateOf("") } // what the map filled in
    var localError by remember { mutableStateOf<String?>(null) }
    val addressNeeded = stringResource(R.string.addr_need)
    val scope = androidx.compose.runtime.rememberCoroutineScope()
    val online = isOnlineCategory(state.categories, selectedCategoryId)

    LaunchedEffect(state.result) {
        if (state.result != null) onRegistered()
    }

    Column(modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(24.dp)) {
        TextButton(onClick = onBack) { Text(AppStrings.get(R.string.s_69c86923)) }
        Text(AppStrings.get(R.string.s_749f9cfe), style = MaterialTheme.typography.headlineSmall, color = MaterialTheme.colorScheme.primary)
        Text(AppStrings.get(R.string.s_c03965c6), style = MaterialTheme.typography.bodyMedium)
        Spacer(Modifier.height(20.dp))

        Text(stringResource(R.string.mp_sec_name), style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.primary)
        Spacer(Modifier.height(6.dp))
        OutlinedTextField(
            value = businessName,
            onValueChange = { businessName = it },
            label = { Text(AppStrings.get(R.string.s_59539fc9)) },
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(12.dp))

        Text(stringResource(R.string.mp_sec_profession), style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.primary)
        Spacer(Modifier.height(6.dp))
        ProfessionPicker(
            tree = state.categories, selectedId = selectedCategoryId, onSelect = { selectedCategoryId = it },
            search = viewModel::searchCategories, suggestion = suggestion, onSuggestion = { suggestion = it },
        )
        Spacer(Modifier.height(12.dp))

        Text(stringResource(R.string.mp_sec_contact), style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.primary)
        Spacer(Modifier.height(6.dp))
        OutlinedTextField(
            value = address,
            onValueChange = { address = it },
            label = { Text(AppStrings.get(R.string.s_ddb9dbdc)) },
            placeholder = { Text(stringResource(R.string.mp_address_ph)) },
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(16.dp))
        Text(stringResource(R.string.mp_sec_map), style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.primary)
        Spacer(Modifier.height(6.dp))
        if (online) {
            Text(stringResource(R.string.cat_online_note), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.primary)
        } else {
            LocationPicker(value = location, onChange = { picked ->
                location = picked
                scope.launch {
                    viewModel.addressFor(picked.first, picked.second)?.let { place ->
                        // placing the pin always replaces the address with the pinned place's
                        address = place.address.orEmpty(); autoAddress = address
                    }
                }
            })
        }
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(
            value = phone,
            onValueChange = { phone = it },
            label = { Text(AppStrings.get(R.string.s_073f5f4b)) },
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(
            value = whatsapp,
            onValueChange = { whatsapp = it },
            label = { Text(AppStrings.get(R.string.s_5059c36f)) },
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(20.dp))

        if (state.isSubmitting) {
            CircularProgressIndicator()
        } else {
            Button(
                onClick = {
                    if (!online && location == null && address.isBlank()) { localError = addressNeeded }
                    else { localError = null; viewModel.register(businessName.trim(), selectedCategoryId, address.trim(), phone.trim(), whatsapp, if (online) null else location, suggestion) }
                },
                modifier = Modifier.fillMaxWidth(),
            ) { Text(AppStrings.get(R.string.s_41066d88)) }
        }

        (localError ?: state.error)?.let {
            Spacer(Modifier.height(8.dp))
            Text(it, color = MaterialTheme.colorScheme.error)
        }
    }
}
