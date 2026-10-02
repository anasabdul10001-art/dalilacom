package com.dalilacom.app.ui.merchant

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
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

@Composable
fun MerchantRegisterScreen(factory: ViewModelFactory, onRegistered: () -> Unit, onBack: () -> Unit) {
    val viewModel: MerchantRegisterViewModel = viewModel(factory = factory)
    val state by viewModel.uiState.collectAsState()

    var businessName by remember { mutableStateOf("") }
    var address by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }
    var selectedCategoryId by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(state.result) {
        if (state.result != null) onRegistered()
    }

    Column(modifier = Modifier.fillMaxSize().padding(24.dp)) {
        TextButton(onClick = onBack) { Text("‹ رجوع") }
        Text("سجّل كتاجر", style = MaterialTheme.typography.headlineSmall, color = MaterialTheme.colorScheme.primary)
        Text("بيصير حسابك تاجر بعد موافقة الأدمن", style = MaterialTheme.typography.bodyMedium)
        Spacer(Modifier.height(20.dp))

        OutlinedTextField(
            value = businessName,
            onValueChange = { businessName = it },
            label = { Text("اسم المحل") },
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(12.dp))

        Text("التصنيف", style = MaterialTheme.typography.bodyMedium)
        Spacer(Modifier.height(4.dp))
        LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            items(state.categoryOptions) { option ->
                FilterChip(
                    selected = selectedCategoryId == option.id,
                    onClick = { selectedCategoryId = option.id },
                    label = { Text(option.label) },
                )
            }
        }
        Spacer(Modifier.height(12.dp))

        OutlinedTextField(
            value = address,
            onValueChange = { address = it },
            label = { Text("العنوان (اختياري)") },
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(
            value = phone,
            onValueChange = { phone = it },
            label = { Text("الهاتف (اختياري)") },
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(20.dp))

        if (state.isSubmitting) {
            CircularProgressIndicator()
        } else {
            Button(
                onClick = { viewModel.register(businessName.trim(), selectedCategoryId, address.trim(), phone.trim()) },
                modifier = Modifier.fillMaxWidth(),
            ) { Text("سجّل") }
        }

        state.error?.let {
            Spacer(Modifier.height(8.dp))
            Text(it, color = MaterialTheme.colorScheme.error)
        }
    }
}
