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
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.dalilacom.app.ui.ViewModelFactory
import com.dalilacom.app.ui.common.CategoryPicker
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

    LaunchedEffect(state.result) {
        if (state.result != null) onRegistered()
    }

    Column(modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(24.dp)) {
        TextButton(onClick = onBack) { Text(AppStrings.get(R.string.s_69c86923)) }
        Text(AppStrings.get(R.string.s_749f9cfe), style = MaterialTheme.typography.headlineSmall, color = MaterialTheme.colorScheme.primary)
        Text(AppStrings.get(R.string.s_c03965c6), style = MaterialTheme.typography.bodyMedium)
        Spacer(Modifier.height(20.dp))

        OutlinedTextField(
            value = businessName,
            onValueChange = { businessName = it },
            label = { Text(AppStrings.get(R.string.s_59539fc9)) },
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(12.dp))

        CategoryPicker(tree = state.categories, selectedId = selectedCategoryId, onSelect = { selectedCategoryId = it })
        Spacer(Modifier.height(12.dp))

        OutlinedTextField(
            value = address,
            onValueChange = { address = it },
            label = { Text(AppStrings.get(R.string.s_ddb9dbdc)) },
            modifier = Modifier.fillMaxWidth(),
        )
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
        Spacer(Modifier.height(16.dp))
        LocationPicker(value = location, onChange = { location = it })
        Spacer(Modifier.height(20.dp))

        if (state.isSubmitting) {
            CircularProgressIndicator()
        } else {
            Button(
                onClick = { viewModel.register(businessName.trim(), selectedCategoryId, address.trim(), phone.trim(), whatsapp, location) },
                modifier = Modifier.fillMaxWidth(),
            ) { Text(AppStrings.get(R.string.s_41066d88)) }
        }

        state.error?.let {
            Spacer(Modifier.height(8.dp))
            Text(it, color = MaterialTheme.colorScheme.error)
        }
    }
}
