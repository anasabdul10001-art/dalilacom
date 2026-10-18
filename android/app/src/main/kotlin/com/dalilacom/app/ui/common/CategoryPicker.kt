package com.dalilacom.app.ui.common

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.TextButton
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.draw.clip
import kotlinx.coroutines.delay
import com.dalilacom.app.data.network.CategoryHitDto
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.dalilacom.app.R
import com.dalilacom.app.data.network.CategoryDto

/**
 * Section > profession > specialty as up to three dropdowns, each appearing once the one above is chosen.
 * [onSelect] gets the most specific choice made so far (the parent when a level is cleared, null when nothing).
 */
@Composable
fun CategoryPicker(tree: List<CategoryDto>, selectedId: String?, onSelect: (String?) -> Unit, modifier: Modifier = Modifier) {
    val chain = remember(tree, selectedId) { categoryChain(tree, selectedId) }
    val labels = listOf(R.string.picker_section, R.string.picker_profession, R.string.picker_specialty)
    Column(modifier) {
        var options = tree
        var parentId: String? = null
        for (depth in 0 until 3) {
            if (options.isEmpty()) break
            val chosen = chain.getOrNull(depth)
            val parent = parentId
            CategoryDropdown(label = stringResource(labels[depth]), options = options, chosen = chosen, onPick = { onSelect(it?.id ?: parent) })
            Spacer(Modifier.height(8.dp))
            if (chosen == null) break
            parentId = chosen.id
            options = chosen.children
        }
    }
}

@Composable
private fun CategoryDropdown(label: String, options: List<CategoryDto>, chosen: CategoryDto?, onPick: (CategoryDto?) -> Unit) {
    var open by remember { mutableStateOf(false) }
    Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    Box {
        OutlinedButton(onClick = { open = true }, shape = RoundedCornerShape(14.dp), modifier = Modifier.fillMaxWidth()) {
            Text(chosen?.let { "${it.icon.orEmpty()} ${it.name}".trim() } ?: stringResource(R.string.picker_choose))
        }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            DropdownMenuItem(text = { Text(stringResource(R.string.picker_choose)) }, onClick = { open = false; onPick(null) })
            options.forEach { option ->
                DropdownMenuItem(text = { Text("${option.icon.orEmpty()} ${option.name}".trim()) }, onClick = { open = false; onPick(option) })
            }
        }
    }
}

/** Is the chosen profession (or one above it) one that works online, so the shop needs no place on the map? */
fun isOnlineCategory(tree: List<CategoryDto>, id: String?): Boolean = categoryChain(tree, id).any { it.online }

/**
 * Finding a profession: type a few letters and the closest ones appear with where each sits,
 * or browse the lists below; a shop that cannot find its own can write it for the team to add.
 */
@Composable
fun ProfessionPicker(
    tree: List<CategoryDto>,
    selectedId: String?,
    onSelect: (String?) -> Unit,
    search: suspend (String) -> List<CategoryHitDto>,
    suggestion: String,
    onSuggestion: (String) -> Unit,
    onSendSuggestion: (() -> Unit)? = null,
    modifier: Modifier = Modifier,
) {
    var q by remember { mutableStateOf("") }
    var hits by remember { mutableStateOf<List<CategoryHitDto>>(emptyList()) }
    var searched by remember { mutableStateOf(false) }
    var sugOpen by remember { mutableStateOf(suggestion.isNotBlank()) }

    LaunchedEffect(q) {
        val text = q.trim()
        if (text.length < 2) { hits = emptyList(); searched = false; return@LaunchedEffect }
        delay(250)
        hits = search(text)
        searched = true
    }

    Column(modifier) {
        OutlinedTextField(
            value = q,
            onValueChange = { q = it },
            label = { Text(stringResource(R.string.cat_search)) },
            placeholder = { Hint(stringResource(R.string.cat_search_ph)) },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        if (hits.isNotEmpty()) {
            Spacer(Modifier.height(6.dp))
            hits.forEach { hit ->
                val shape = RoundedCornerShape(12.dp)
                Column(
                    Modifier.fillMaxWidth().padding(vertical = 3.dp).clip(shape)
                        .border(BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant), shape)
                        .clickable { onSelect(hit.id); q = ""; hits = emptyList(); searched = false }
                        .padding(horizontal = 12.dp, vertical = 10.dp),
                ) {
                    Text("${hit.icon.orEmpty()} ${hit.name}".trim(), style = MaterialTheme.typography.titleSmall)
                    if (hit.path.isNotBlank()) Text(hit.path, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        } else if (searched) {
            Spacer(Modifier.height(6.dp))
            Text(stringResource(R.string.cat_no_hit), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Spacer(Modifier.height(10.dp))
        Text(stringResource(R.string.cat_or_browse), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(4.dp))
        CategoryPicker(tree = tree, selectedId = selectedId, onSelect = onSelect)

        TextButton(onClick = { sugOpen = !sugOpen; if (!sugOpen) onSuggestion("") }) { Text(stringResource(R.string.cat_not_found)) }
        if (sugOpen) {
            OutlinedTextField(
                value = suggestion,
                onValueChange = { onSuggestion(it.take(60)) },
                label = { Text(stringResource(R.string.cat_sug_ph)) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            placeholder = { Hint(stringResource(R.string.ph_profession)) },
        )
            Spacer(Modifier.height(4.dp))
            Text(stringResource(R.string.cat_sug_note), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (onSendSuggestion != null) {
                Spacer(Modifier.height(6.dp))
                OutlinedButton(onClick = onSendSuggestion, enabled = suggestion.trim().length >= 2) { Text(stringResource(R.string.cat_sug_send)) }
            }
        }
    }
}
