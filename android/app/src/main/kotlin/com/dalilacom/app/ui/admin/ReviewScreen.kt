package com.dalilacom.app.ui.admin

import androidx.compose.ui.res.stringResource

import com.dalilacom.app.ui.common.Hint

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.sp
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.draw.clip
import androidx.compose.material3.ButtonDefaults
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.background
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.dalilacom.app.R
import com.dalilacom.app.data.network.ReviewItemDto
import com.dalilacom.app.data.repository.BroadcastRepository
import com.dalilacom.app.ui.ViewModelFactory
import com.dalilacom.app.ui.i18n.AppStrings
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class ReviewUiState(
    val isLoading: Boolean = true,
    val items: List<ReviewItemDto> = emptyList(),
    val busyId: String? = null,
    val message: String? = null,
    val error: String? = null,
)

/** The admin's queue of merchants' announcements: read the text and the automatic screening, then publish or refuse with a reason. */
class ReviewViewModel(private val repository: BroadcastRepository) : ViewModel() {
    private val _uiState = MutableStateFlow(ReviewUiState())
    val uiState: StateFlow<ReviewUiState> = _uiState.asStateFlow()

    init { refresh() }

    fun refresh() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }
            _uiState.update { it.copy(isLoading = false, items = repository.pending()) }
        }
    }

    private fun act(id: String, success: String, call: suspend () -> Result<Unit>) {
        viewModelScope.launch {
            _uiState.update { it.copy(busyId = id, message = null, error = null) }
            call()
                .onSuccess { _uiState.update { s -> s.copy(busyId = null, message = success) }; refresh() }
                .onFailure { e -> _uiState.update { s -> s.copy(busyId = null, error = e.message) }; refresh() }
        }
    }

    fun approve(id: String) = act(id, AppStrings.get(R.string.review_published)) { repository.approve(id) }
    fun reject(id: String, reason: String) = act(id, AppStrings.get(R.string.review_refused)) { repository.reject(id, reason.trim()) }
}

@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
fun ReviewScreen(factory: ViewModelFactory, onBack: () -> Unit) {
    val viewModel: ReviewViewModel = viewModel(factory = factory)
    val state by viewModel.uiState.collectAsState()
    var rejecting by remember { mutableStateOf<ReviewItemDto?>(null) }
    var reason by remember { mutableStateOf("") }
    val green = Color(0xFF2E9B57)

    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().padding(start = 8.dp, end = 8.dp, top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = onBack) { Text(AppStrings.get(R.string.back)) }
            Spacer(Modifier.weight(1f))
            TextButton(onClick = viewModel::refresh) { Text("↻  " + AppStrings.get(R.string.review_refresh)) }
        }
        Text(
            AppStrings.get(R.string.review_title),
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.primary,
            modifier = Modifier.padding(horizontal = 20.dp),
        )
        if (state.isLoading) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            return@Column
        }
        LazyColumn(contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 32.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            item {
                Surface(shape = RoundedCornerShape(14.dp), color = MaterialTheme.colorScheme.primary.copy(alpha = 0.08f), modifier = Modifier.fillMaxWidth()) {
                    Text("ℹ️  " + AppStrings.get(R.string.review_hint), style = MaterialTheme.typography.bodyMedium, lineHeight = 24.sp, modifier = Modifier.padding(14.dp))
                }
                state.message?.let { Text(it, color = green, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 8.dp)) }
                state.error?.let { Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(top = 8.dp)) }
            }
            if (state.items.isEmpty()) item {
                Text("✅  " + AppStrings.get(R.string.review_empty), style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(vertical = 24.dp))
            }
            items(state.items, key = { it.id }) { item ->
                val shop = item.sender?.merchantProfile?.businessName ?: item.sender?.email ?: "—"
                val where = when (item.scope) {
                    "RADIUS" -> AppStrings.get(R.string.fmt_review_radius, item.radiusKm?.toString() ?: "?")
                    "FOLLOWERS" -> AppStrings.get(R.string.review_followers)
                    else -> AppStrings.get(R.string.review_place)
                }
                val (verdictText, verdictBg, verdictFg, mark) = when (item.aiVerdict) {
                    "OK" -> listOf(AppStrings.get(R.string.review_ai_ok), Color(0xFFE6F4EA), Color(0xFF1B5E20), "✓")
                    "REVIEW" -> listOf(AppStrings.get(R.string.review_ai_review), Color(0xFFFFF4E0), Color(0xFF8A4B00), "⚠")
                    else -> listOf(AppStrings.get(R.string.review_ai_none), MaterialTheme.colorScheme.surfaceVariant, MaterialTheme.colorScheme.onSurfaceVariant, "•")
                }
                val busy = state.busyId == item.id
                Surface(shape = RoundedCornerShape(22.dp), tonalElevation = 2.dp, shadowElevation = 3.dp, modifier = Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            Box(Modifier.size(44.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primary), contentAlignment = Alignment.Center) {
                                Text(shop.trim().take(1).uppercase(), color = Color.White, fontWeight = FontWeight.ExtraBold, fontSize = 20.sp)
                            }
                            Column(Modifier.weight(1f)) {
                                Text(shop, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
                                item.sender?.fullName?.takeIf { it.isNotBlank() }?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                            }
                        }
                        Text(item.title, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, lineHeight = 28.sp)
                        Surface(shape = RoundedCornerShape(14.dp), color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.05f), modifier = Modifier.fillMaxWidth()) {
                            Text(item.body, style = MaterialTheme.typography.bodyLarge, lineHeight = 26.sp, modifier = Modifier.padding(14.dp))
                        }
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            ReviewChip("🎯  " + AppStrings.get(R.string.fmt_review_reach, where, item.targeted))
                            if (item.productId != null) ReviewChip(AppStrings.get(R.string.review_has_product))
                            if (item.discountId != null) ReviewChip(AppStrings.get(R.string.review_has_offer))
                        }
                        Surface(shape = RoundedCornerShape(14.dp), color = verdictBg as Color, modifier = Modifier.fillMaxWidth()) {
                            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                Text("$mark  " + AppStrings.get(R.string.fmt_review_ai, verdictText as String), color = verdictFg as Color, fontWeight = FontWeight.Bold, lineHeight = 22.sp)
                                item.aiReasons?.filter { it.isNotBlank() }?.forEach { Text("•  $it", color = verdictFg, style = MaterialTheme.typography.bodyMedium, lineHeight = 22.sp) }
                            }
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                            Button(
                                onClick = { viewModel.approve(item.id) }, enabled = !busy,
                                colors = ButtonDefaults.buttonColors(containerColor = green),
                                shape = RoundedCornerShape(14.dp), modifier = Modifier.weight(1f).height(50.dp),
                            ) { Text(AppStrings.get(R.string.review_publish), fontWeight = FontWeight.Bold) }
                            OutlinedButton(
                                onClick = { rejecting = item; reason = "" }, enabled = !busy,
                                colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error),
                                shape = RoundedCornerShape(14.dp), modifier = Modifier.weight(1f).height(50.dp),
                            ) { Text(AppStrings.get(R.string.review_refuse), fontWeight = FontWeight.Bold) }
                        }
                    }
                }
            }
        }
    }

    rejecting?.let { target ->
        AlertDialog(
            onDismissRequest = { rejecting = null },
            title = { Text(AppStrings.get(R.string.review_refuse)) },
            text = {
                OutlinedTextField(reason, { reason = it }, label = { Text(AppStrings.get(R.string.review_reason)) }, minLines = 3, modifier = Modifier.fillMaxWidth(), placeholder = { Hint(stringResource(R.string.ph_reject_reason)) })
            },
            confirmButton = {
                TextButton(enabled = reason.trim().length >= 3, onClick = { viewModel.reject(target.id, reason); rejecting = null }) { Text(AppStrings.get(R.string.review_refuse)) }
            },
            dismissButton = { TextButton(onClick = { rejecting = null }) { Text(AppStrings.get(R.string.account_cancel)) } },
        )
    }
}

@Composable
private fun ReviewChip(text: String) {
    Surface(shape = RoundedCornerShape(999.dp), border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)) {
        Text(text, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp))
    }
}
