package com.dalilacom.app.ui.admin

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
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

@Composable
fun ReviewScreen(factory: ViewModelFactory, onBack: () -> Unit) {
    val viewModel: ReviewViewModel = viewModel(factory = factory)
    val state by viewModel.uiState.collectAsState()
    var rejecting by remember { mutableStateOf<ReviewItemDto?>(null) }
    var reason by remember { mutableStateOf("") }

    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = onBack) { Text(AppStrings.get(R.string.back)) }
            Text(AppStrings.get(R.string.review_title), style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.primary, modifier = Modifier.weight(1f))
            TextButton(onClick = viewModel::refresh) { Text(AppStrings.get(R.string.review_refresh)) }
        }
        if (state.isLoading) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            return@Column
        }
        LazyColumn(contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            item {
                Text(AppStrings.get(R.string.review_hint), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                state.message?.let { Text(it, color = MaterialTheme.colorScheme.primary) }
                state.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
            if (state.items.isEmpty()) item { Text(AppStrings.get(R.string.review_empty), color = MaterialTheme.colorScheme.onSurfaceVariant) }
            items(state.items, key = { it.id }) { item ->
                val shop = item.sender?.merchantProfile?.businessName ?: item.sender?.email ?: "—"
                Surface(shape = RoundedCornerShape(16.dp), border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant), modifier = Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text(shop, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
                        Text(item.title, style = MaterialTheme.typography.titleMedium)
                        Text(item.body, style = MaterialTheme.typography.bodyMedium)
                        val where = when (item.scope) {
                            "RADIUS" -> AppStrings.get(R.string.fmt_review_radius, item.radiusKm?.toString() ?: "?")
                            "FOLLOWERS" -> AppStrings.get(R.string.review_followers)
                            else -> AppStrings.get(R.string.review_place)
                        }
                        Text(AppStrings.get(R.string.fmt_review_reach, where, item.targeted), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        if (item.productId != null) Text(AppStrings.get(R.string.review_has_product), style = MaterialTheme.typography.bodySmall)
                        if (item.discountId != null) Text(AppStrings.get(R.string.review_has_offer), style = MaterialTheme.typography.bodySmall)
                        val verdict = when (item.aiVerdict) {
                            "OK" -> AppStrings.get(R.string.review_ai_ok)
                            "REVIEW" -> AppStrings.get(R.string.review_ai_review)
                            else -> AppStrings.get(R.string.review_ai_none)
                        }
                        Text(AppStrings.get(R.string.fmt_review_ai, verdict), style = MaterialTheme.typography.bodySmall, color = if (item.aiVerdict == "REVIEW") MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant)
                        item.aiReasons?.takeIf { it.isNotEmpty() }?.let { Text(it.joinToString(" — "), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error) }
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Button(onClick = { viewModel.approve(item.id) }, enabled = state.busyId != item.id) { Text(AppStrings.get(R.string.review_publish)) }
                            OutlinedButton(onClick = { rejecting = item; reason = "" }, enabled = state.busyId != item.id) { Text(AppStrings.get(R.string.review_refuse)) }
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
                OutlinedTextField(reason, { reason = it }, label = { Text(AppStrings.get(R.string.review_reason)) }, minLines = 2, modifier = Modifier.fillMaxWidth())
            },
            confirmButton = {
                TextButton(enabled = reason.trim().length >= 3, onClick = { viewModel.reject(target.id, reason); rejecting = null }) { Text(AppStrings.get(R.string.review_refuse)) }
            },
            dismissButton = { TextButton(onClick = { rejecting = null }) { Text(AppStrings.get(R.string.account_cancel)) } },
        )
    }
}
