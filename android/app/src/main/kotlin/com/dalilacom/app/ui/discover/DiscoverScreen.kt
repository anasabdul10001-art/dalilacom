package com.dalilacom.app.ui.discover

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.dalilacom.app.data.network.MerchantDto
import com.dalilacom.app.ui.ViewModelFactory

@Composable
fun DiscoverScreen(factory: ViewModelFactory, onMerchantClick: (String) -> Unit) {
    val viewModel: DiscoverViewModel = viewModel(factory = factory)
    val state by viewModel.uiState.collectAsState()

    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        Text("اكتشف التجار", style = MaterialTheme.typography.headlineSmall, color = MaterialTheme.colorScheme.primary)
        Spacer(Modifier.height(12.dp))

        OutlinedTextField(
            value = state.query,
            onValueChange = viewModel::onQueryChange,
            label = { Text("دور على اسم محل...") },
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(12.dp))

        LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            item {
                FilterChip(
                    selected = state.selectedCategoryId == null,
                    onClick = { viewModel.onCategorySelected(null) },
                    label = { Text("الكل") },
                )
            }
            items(state.categories) { category ->
                FilterChip(
                    selected = state.selectedCategoryId == category.id,
                    onClick = { viewModel.onCategorySelected(category.id) },
                    label = { Text(category.name) },
                )
            }
        }
        Spacer(Modifier.height(16.dp))

        if (state.isLoading) {
            CircularProgressIndicator()
        } else if (state.merchants.isEmpty()) {
            Text("ما في نتائج", style = MaterialTheme.typography.bodyMedium)
        } else {
            LazyColumn {
                items(state.merchants) { merchant -> MerchantRow(merchant, onClick = { onMerchantClick(merchant.id) }) }
            }
        }
    }
}

@Composable
private fun MerchantRow(merchant: MerchantDto, onClick: () -> Unit) {
    Card(modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp).clickable(onClick = onClick)) {
        Column(Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(merchant.businessName, style = MaterialTheme.typography.titleMedium)
                merchant.distanceKm?.let { Text("%.1f كم".format(it), style = MaterialTheme.typography.bodySmall) }
            }
            merchant.category?.let { Text(it.name, style = MaterialTheme.typography.bodySmall) }
            merchant.address?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
            merchant.discounts.forEach { discount ->
                Text(
                    "🏷️ ${discount.title} — ${discount.percent}%",
                    color = MaterialTheme.colorScheme.primary,
                    style = MaterialTheme.typography.bodySmall,
                )
            }
        }
    }
}
