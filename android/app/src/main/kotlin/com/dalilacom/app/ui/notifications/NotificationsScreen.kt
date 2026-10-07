package com.dalilacom.app.ui.notifications

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.background
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.dalilacom.app.R
import com.dalilacom.app.data.network.NotificationDto
import com.dalilacom.app.ui.nav.NotificationRoutes
import com.dalilacom.app.data.network.NotificationPreferenceDto
import com.dalilacom.app.data.repository.NotificationRepository
import com.dalilacom.app.ui.ViewModelFactory
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/** The types that actually produce notifications today (the rest are reserved on the server). */
private val WIRED_TYPES = listOf("ORDER_PLACED", "ORDER_STATUS", "DISCOUNT_RECEIVED", "MEMBERSHIP_EXPIRING")
private val MODE_CYCLE = listOf("FULL", "IN_APP_ONLY", "OFF")

data class NotificationsUiState(
    val isLoading: Boolean = true,
    val items: List<NotificationDto> = emptyList(),
    val unread: Int = 0,
    val preferences: Map<String, String> = emptyMap(),
    val failed: Boolean = false,
)

class NotificationsViewModel(private val repository: NotificationRepository) : ViewModel() {
    private val _uiState = MutableStateFlow(NotificationsUiState())
    val uiState: StateFlow<NotificationsUiState> = _uiState.asStateFlow()

    init { refresh() }

    fun refresh() {
        viewModelScope.launch {
            val inbox = repository.inbox()
            val preferences = repository.preferences().associate { it.type to it.mode }
            _uiState.value = if (inbox == null) NotificationsUiState(isLoading = false, failed = true)
            else NotificationsUiState(isLoading = false, items = inbox.items, unread = inbox.unread, preferences = preferences)
        }
    }

    fun open(item: NotificationDto) {
        if (item.readAt != null) return
        _uiState.update { state -> state.copy(items = state.items.map { if (it.id == item.id) it.copy(readAt = "now") else it }, unread = maxOf(0, state.unread - 1)) }
        viewModelScope.launch { repository.markRead(item.id) }
    }

    fun markAllRead() {
        _uiState.update { state -> state.copy(items = state.items.map { it.copy(readAt = it.readAt ?: "now") }, unread = 0) }
        viewModelScope.launch { repository.markAllRead() }
    }

    /** FULL (inbox + push + email) -> IN_APP_ONLY (inbox only) -> OFF -> back to FULL. */
    fun cycle(type: String) {
        val current = _uiState.value.preferences[type] ?: "FULL"
        val next = MODE_CYCLE[(MODE_CYCLE.indexOf(current) + 1) % MODE_CYCLE.size]
        _uiState.update { it.copy(preferences = it.preferences + (type to next)) }
        viewModelScope.launch { repository.setPreference(NotificationPreferenceDto(type, next)) }
    }
}

private val timeFormat = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm").withZone(ZoneId.systemDefault())
private fun formatTime(iso: String): String = runCatching { timeFormat.format(Instant.parse(iso)) }.getOrDefault("")

@Composable
fun NotificationsScreen(factory: ViewModelFactory, onBack: () -> Unit, onOpen: (String) -> Unit = {}) {
    val viewModel: NotificationsViewModel = viewModel(factory = factory)
    val state by viewModel.uiState.collectAsState()

    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = onBack) { Text(stringResource(R.string.back)) }
            Text(stringResource(R.string.notifications_title), style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.primary, modifier = Modifier.weight(1f))
            if (state.unread > 0) TextButton(onClick = viewModel::markAllRead) { Text(stringResource(R.string.notifications_mark_all)) }
        }
        when {
            state.isLoading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            state.failed -> Text(stringResource(R.string.notifications_failed), color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(16.dp))
            else -> LazyColumn(
                contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                if (state.items.isEmpty()) item { Text(stringResource(R.string.notifications_empty), color = MaterialTheme.colorScheme.onSurfaceVariant) }
                items(state.items, key = { it.id }) { item ->
                    NotificationRow(item) {
                        viewModel.open(item)
                        val route = NotificationRoutes.routeFor(item.type, NotificationRoutes.dataOf(item.data))
                        if (route != NotificationRoutes.INBOX) onOpen(route)
                    }
                }
                item { PreferencesSection(state.preferences, viewModel::cycle) }
            }
        }
    }
}

@Composable
private fun NotificationRow(item: NotificationDto, onClick: () -> Unit) {
    val unread = item.readAt == null
    Surface(
        shape = RoundedCornerShape(16.dp),
        border = BorderStroke(if (unread) 2.dp else 1.dp, if (unread) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant),
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick),
    ) {
        Row(Modifier.padding(14.dp), verticalAlignment = Alignment.Top) {
            if (unread) Box(Modifier.padding(top = 6.dp).size(9.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primary))
            Column(Modifier.padding(start = if (unread) 10.dp else 0.dp).weight(1f)) {
                Text(item.title, style = MaterialTheme.typography.titleSmall, fontWeight = if (unread) FontWeight.Bold else FontWeight.Normal)
                item.body?.takeIf { it.isNotBlank() }?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                Text(formatTime(item.createdAt), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable
private fun PreferencesSection(preferences: Map<String, String>, onCycle: (String) -> Unit) {
    Column(Modifier.padding(top = 12.dp)) {
        Text(stringResource(R.string.notifications_settings), style = MaterialTheme.typography.titleMedium)
        Text(stringResource(R.string.notifications_settings_hint), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(8.dp))
        WIRED_TYPES.forEach { type ->
            Row(Modifier.fillMaxWidth().padding(vertical = 3.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                Text(stringResource(typeLabel(type)), modifier = Modifier.weight(1f))
                OutlinedButton(onClick = { onCycle(type) }, shape = RoundedCornerShape(12.dp)) { Text(stringResource(modeLabel(preferences[type] ?: "FULL"))) }
            }
        }
    }
}

private fun typeLabel(type: String): Int = when (type) {
    "ORDER_PLACED" -> R.string.notif_type_order_placed
    "ORDER_STATUS" -> R.string.notif_type_order_status
    "DISCOUNT_RECEIVED" -> R.string.notif_type_discount
    else -> R.string.notif_type_membership
}

private fun modeLabel(mode: String): Int = when (mode) {
    "OFF" -> R.string.notif_mode_off
    "IN_APP_ONLY" -> R.string.notif_mode_in_app
    else -> R.string.notif_mode_full
}
