package com.dalilacom.app.ui.store

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.horizontalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.runtime.collectAsState
import coil.compose.AsyncImage
import com.dalilacom.app.R
import com.dalilacom.app.data.network.AiQuotaDto
import com.dalilacom.app.data.network.PhotoEditResponse
import com.dalilacom.app.data.network.absoluteUrl
import com.dalilacom.app.data.repository.StoreRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class PhotoEditState(
    val url: String? = null, // the photo being edited (null = the editor is closed)
    val busy: Boolean = false,
    val error: String? = null,
    val quota: AiQuotaDto? = null,
    val history: Map<String, List<String>> = emptyMap(), // edited url -> the versions before it, oldest first
)

/**
 * Editing one product photo: tidy it, remove the background, studio light, change the colour — and go back.
 * Every edit is a new copy on the server, so undoing is just switching to the previous one. [swap] puts a new version in
 * place of the old one wherever the screen keeps its photos.
 */
class PhotoEditor(private val store: StoreRepository, private val scope: CoroutineScope, private val swap: (old: String, new: PhotoEditResponse) -> Unit) {
    private val _state = MutableStateFlow(PhotoEditState())
    val state: StateFlow<PhotoEditState> = _state.asStateFlow()

    fun open(url: String) {
        _state.update { it.copy(url = url, busy = false, error = null) }
        scope.launch { store.aiQuota()?.let { q -> _state.update { s -> s.copy(quota = q) } } }
    }

    fun close() = _state.update { it.copy(url = null, error = null) }

    fun run(action: String, color: String? = null) {
        val s = _state.value
        val url = s.url ?: return
        if (s.busy) return
        _state.update { it.copy(busy = true, error = null) }
        scope.launch {
            store.editPhoto(url.substringAfterLast("/"), action, color)
                .onSuccess { r ->
                    swap(url, r)
                    _state.update { st -> st.copy(busy = false, url = r.url, quota = r.quota ?: st.quota, history = st.history + (r.url to (st.history[url].orEmpty() + url))) }
                }
                .onFailure { e -> _state.update { it.copy(busy = false, error = e.message) } }
        }
    }

    fun undo() {
        val s = _state.value
        val url = s.url ?: return
        val stack = s.history[url].orEmpty()
        val previous = stack.lastOrNull() ?: return
        swap(url, PhotoEditResponse(previous.substringAfterLast("/"), previous))
        _state.update { it.copy(url = previous, history = it.history + (previous to stack.dropLast(1))) }
    }
}

private val COLORS = listOf(
    "red" to 0xFFD32F2F, "blue" to 0xFF1976D2, "green" to 0xFF2E7D32, "black" to 0xFF111111, "white" to 0xFFF5F5F5, "gold" to 0xFFD4AF37, "silver" to 0xFFB0B7BD, "pink" to 0xFFEC7FA9,
    "purple" to 0xFF7B3FA0, "orange" to 0xFFF57C00, "yellow" to 0xFFF2C200, "brown" to 0xFF7B4A2D, "gray" to 0xFF8A8A8A, "beige" to 0xFFD9C3A0, "navy" to 0xFF1B2A5A,
)

/** The window over the screen with the photo and what can be done to it. */
@Composable
fun PhotoEditDialog(editor: PhotoEditor) {
    val s by editor.state.collectAsState()
    val url = s.url ?: return
    val q = s.quota
    val aiOff = q != null && !q.photoEdit
    val canUndo = s.history[url].orEmpty().isNotEmpty()
    AlertDialog(
        onDismissRequest = { editor.close() },
        confirmButton = { Button(onClick = { editor.close() }) { Text(stringResource(R.string.ai_done)) } },
        title = { Text(stringResource(R.string.ai_edit_title)) },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Box(Modifier.fillMaxWidth().height(220.dp).clip(RoundedCornerShape(14.dp)).background(MaterialTheme.colorScheme.surfaceVariant), contentAlignment = Alignment.Center) {
                    AsyncImage(model = if (url.startsWith("/")) absoluteUrl(url) else url, contentDescription = null, contentScale = ContentScale.Fit, modifier = Modifier.fillMaxSize())
                    if (s.busy) Box(Modifier.fillMaxSize().background(Color(0xC7FFFFFF)), contentAlignment = Alignment.Center) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) { CircularProgressIndicator(); Text(stringResource(R.string.ai_working)) }
                    }
                }
                if (q != null) Text(
                    "✨ " + when {
                        q.freeLeft > 0 -> stringResource(R.string.ai_free_left, q.freeLeft, q.freePerMonth)
                        q.creditsPerUse > 0 -> stringResource(R.string.ai_paid_per, q.creditsPerUse, q.balance)
                        else -> stringResource(R.string.ai_no_more)
                    },
                    color = MaterialTheme.colorScheme.primary, fontWeight = androidx.compose.ui.text.font.FontWeight.Bold, style = MaterialTheme.typography.bodySmall,
                )
                if (aiOff) Text(stringResource(R.string.ai_unavailable), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                s.error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
                OutlinedButton(onClick = { editor.run("clean") }, enabled = !s.busy, modifier = Modifier.fillMaxWidth()) { Text("🧼  " + stringResource(R.string.ai_clean)) }
                OutlinedButton(onClick = { editor.run("white_bg") }, enabled = !s.busy && !aiOff, modifier = Modifier.fillMaxWidth()) { Text("✂️  " + stringResource(R.string.ai_white_bg)) }
                OutlinedButton(onClick = { editor.run("studio") }, enabled = !s.busy && !aiOff, modifier = Modifier.fillMaxWidth()) { Text("💡  " + stringResource(R.string.ai_studio)) }
                Text("🎨  " + stringResource(R.string.ai_recolor), fontWeight = androidx.compose.ui.text.font.FontWeight.Bold)
                Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    COLORS.forEach { (name, argb) ->
                        Surface(
                            onClick = { editor.run("recolor", name) }, enabled = !s.busy && !aiOff, shape = CircleShape, color = Color(argb),
                            border = BorderStroke(2.dp, Color(0x2E000000)), modifier = Modifier.size(36.dp),
                        ) {}
                    }
                }
                if (canUndo) OutlinedButton(onClick = { editor.undo() }, enabled = !s.busy, modifier = Modifier.fillMaxWidth()) { Text("↩️  " + stringResource(R.string.ai_undo)) }
            }
        },
    )
}
