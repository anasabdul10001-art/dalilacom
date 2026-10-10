package com.dalilacom.app.ui.merchantmode

import com.dalilacom.app.R
import com.dalilacom.app.ui.i18n.AppStrings
import androidx.compose.foundation.layout.Arrangement
import kotlinx.coroutines.launch
import androidx.compose.ui.draw.clip
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
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
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.dalilacom.app.data.AppContainer

@Composable
fun ProductEditScreen(
    container: AppContainer,
    productId: String?,
    onSaved: () -> Unit,
    onBack: () -> Unit,
    onOpenShipping: () -> Unit = {},
    onOpenAiPlans: () -> Unit = {},
) {
    val viewModel: ProductEditViewModel = viewModel(
        factory = viewModelFactory {
            initializer { ProductEditViewModel(container.productRepository, container.discoverRepository, container.merchantRepository, container.storeRepository, productId) }
        },
    )
    val state by viewModel.uiState.collectAsState()
    val context = androidx.compose.ui.platform.LocalContext.current
    val photoScope = androidx.compose.runtime.rememberCoroutineScope()
    val picker = com.dalilacom.app.ui.common.rememberPhotoPicker { uri: android.net.Uri ->
        photoScope.launch { viewModel.addPhoto(kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.Default) { com.dalilacom.app.ui.common.ImageUtil.maxJpeg(context, uri) }) }
    }

    LaunchedEffect(state.saved) { if (state.saved) onSaved() }
    com.dalilacom.app.ui.store.PhotoEditDialog(viewModel.editor, onOpenAiPlans)

    Column(modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
        TextButton(onClick = onBack) { Text(AppStrings.get(R.string.s_69c86923)) }
        Text(
            if (state.isNew) AppStrings.get(R.string.s_18d994f4) else AppStrings.get(R.string.s_a0b697cb),
            style = MaterialTheme.typography.headlineSmall,
            color = MaterialTheme.colorScheme.primary,
        )
        Spacer(Modifier.height(16.dp))

        if (state.isLoading) {
            CircularProgressIndicator()
        } else {
            OutlinedTextField(
                value = state.name,
                onValueChange = viewModel::onNameChange,
                label = { Text(AppStrings.get(R.string.s_864c0780)) },
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(10.dp))
            OutlinedTextField(
                value = state.description,
                onValueChange = viewModel::onDescriptionChange,
                label = { Text(AppStrings.get(R.string.s_21a1bc3f)) },
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(10.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedTextField(
                    value = state.priceText,
                    onValueChange = viewModel::onPriceChange,
                    label = { Text(AppStrings.get(R.string.s_b6aa0c7d)) },
                    modifier = Modifier.weight(1f),
                )
                OutlinedTextField(
                    value = state.stockText,
                    onValueChange = viewModel::onStockChange,
                    label = { Text(AppStrings.get(R.string.s_d697a2b1)) },
                    placeholder = { Text(androidx.compose.ui.res.stringResource(R.string.stock_ph)) },
                    keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = androidx.compose.ui.text.input.KeyboardType.Number),
                    modifier = Modifier.weight(1f),
                )
            }
            Spacer(Modifier.height(10.dp))
            Text(androidx.compose.ui.res.stringResource(R.string.pe_photos), style = MaterialTheme.typography.titleSmall)
            androidx.compose.foundation.lazy.LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 6.dp)) {
                items(state.images.size) { i ->
                    androidx.compose.foundation.layout.Box(Modifier.size(110.dp).clip(androidx.compose.foundation.shape.RoundedCornerShape(12.dp))) {
                        coil.compose.AsyncImage(
                            model = state.images[i].let { if (it.startsWith("/")) com.dalilacom.app.data.network.absoluteUrl(it) else it },
                            contentDescription = null, contentScale = androidx.compose.ui.layout.ContentScale.Crop, modifier = Modifier.fillMaxSize(),
                        )
                        androidx.compose.material3.Surface(onClick = { viewModel.removePhoto(i) }, shape = androidx.compose.foundation.shape.CircleShape, color = androidx.compose.ui.graphics.Color(0x99000000), contentColor = androidx.compose.ui.graphics.Color.White, modifier = Modifier.align(Alignment.TopEnd).padding(4.dp).size(26.dp)) {
                            androidx.compose.foundation.layout.Box(contentAlignment = Alignment.Center) { Text("✕") }
                        }
                        if (i == 0) Text(androidx.compose.ui.res.stringResource(R.string.wiz_main_photo), color = androidx.compose.ui.graphics.Color.White, style = MaterialTheme.typography.labelSmall, modifier = Modifier.align(Alignment.TopStart).padding(4.dp).background(androidx.compose.ui.graphics.Color(0xA6000000), androidx.compose.foundation.shape.RoundedCornerShape(6.dp)).padding(horizontal = 6.dp, vertical = 2.dp))
                        else androidx.compose.material3.Surface(onClick = { viewModel.makeMainPhoto(i) }, shape = androidx.compose.foundation.shape.CircleShape, color = androidx.compose.ui.graphics.Color(0x99000000), contentColor = androidx.compose.ui.graphics.Color.White, modifier = Modifier.align(Alignment.TopStart).padding(4.dp).size(26.dp)) {
                            androidx.compose.foundation.layout.Box(contentAlignment = Alignment.Center) { Text("★") }
                        }
                        androidx.compose.material3.Surface(onClick = { viewModel.editor.open(state.images[i]) }, shape = androidx.compose.foundation.shape.RoundedCornerShape(8.dp), color = androidx.compose.ui.graphics.Color(0xB3000000), contentColor = androidx.compose.ui.graphics.Color.White, modifier = Modifier.align(Alignment.BottomCenter).padding(4.dp)) {
                            Text("✨ " + androidx.compose.ui.res.stringResource(R.string.ai_edit), style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp))
                        }
                    }
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 6.dp)) {
                if (state.images.size < 6) {
                    androidx.compose.material3.OutlinedButton(onClick = picker.openCamera, enabled = !state.uploadingPhoto) { Text("📷  " + androidx.compose.ui.res.stringResource(R.string.wiz_take_photo)) }
                    androidx.compose.material3.OutlinedButton(onClick = picker.openGallery, enabled = !state.uploadingPhoto) { Text("🖼️  " + androidx.compose.ui.res.stringResource(R.string.wiz_pick_photo)) }
                }
                if (state.uploadingPhoto) CircularProgressIndicator(Modifier.size(24.dp))
            }
            Text(androidx.compose.ui.res.stringResource(R.string.wiz_enhance_note), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(10.dp))
            OutlinedTextField(
                value = state.sku,
                onValueChange = viewModel::onSkuChange,
                label = { Text(AppStrings.get(R.string.s_615e65ba)) },
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(16.dp))

            Text(AppStrings.get(R.string.s_7c75fec5), style = MaterialTheme.typography.bodyMedium)
            Spacer(Modifier.height(4.dp))
            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                items(state.categoryOptions) { option ->
                    FilterChip(
                        selected = state.selectedCategoryId == option.id,
                        onClick = {
                            viewModel.onCategorySelected(if (state.selectedCategoryId == option.id) null else option.id)
                        },
                        label = { Text(option.label) },
                    )
                }
            }
            Spacer(Modifier.height(16.dp))

            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(AppStrings.get(R.string.s_f6b288e4), modifier = Modifier.weight(1f))
                Switch(checked = state.memberDiscountEnabled, onCheckedChange = viewModel::onMemberDiscountToggle)
            }
            if (state.memberDiscountEnabled) {
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = state.memberPriceText,
                    onValueChange = viewModel::onMemberPriceChange,
                    label = { Text(AppStrings.get(R.string.s_1aa879ba)) },
                    modifier = Modifier.fillMaxWidth(),
                )
            }

            if (!state.isNew) {
                Spacer(Modifier.height(12.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(AppStrings.get(R.string.s_a2daab91), modifier = Modifier.weight(1f))
                    Switch(checked = state.isActive, onCheckedChange = viewModel::onActiveToggle)
                }
            }

            Spacer(Modifier.height(20.dp))
            Button(onClick = viewModel::save, enabled = !state.isSaving, modifier = Modifier.fillMaxWidth()) {
                Text(AppStrings.get(R.string.s_56ee6e0d))
            }
        }

        state.error?.let {
            Spacer(Modifier.height(8.dp))
            Text(it, color = MaterialTheme.colorScheme.error)
        }
    }
}
