package com.dalilacom.app.ui.common

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.dalilacom.app.R
import com.dalilacom.app.data.network.ProductCategoryDto
import com.dalilacom.app.data.network.ProductCategoryHitDto
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** The categories from a department down to [id] (empty when it is not in the tree). */
fun productCategoryChain(tree: List<ProductCategoryDto>, id: String?): List<ProductCategoryDto> {
    if (id == null) return emptyList()
    fun walk(nodes: List<ProductCategoryDto>, trail: List<ProductCategoryDto>): List<ProductCategoryDto>? {
        for (n in nodes) {
            val next = trail + n
            if (n.id == id) return next
            walk(n.children, next)?.let { return it }
        }
        return null
    }
    return walk(tree, emptyList()).orEmpty()
}

/**
 * The category a product is filed under (not the shop's profession): type a few letters and the closest categories
 * appear with where each sits, or browse department by department; a shop may also add a category of its own.
 * Choosing a category also opens it, so the ones inside it can narrow it down.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ProductCategoryPicker(
    tree: List<ProductCategoryDto>,
    selectedId: String?,
    onSelect: (String) -> Unit,
    search: suspend (String) -> List<ProductCategoryHitDto>,
    add: suspend (name: String, parentId: String) -> Result<String>,
    modifier: Modifier = Modifier,
) {
    val scope = rememberCoroutineScope()
    var q by remember { mutableStateOf("") }
    var hits by remember { mutableStateOf<List<ProductCategoryHitDto>>(emptyList()) }
    var searched by remember { mutableStateOf(false) }
    var browsing by remember { mutableStateOf<String?>(null) } // the category whose insides are listed
    var adding by remember { mutableStateOf(false) }
    var addName by remember { mutableStateOf("") }
    var addError by remember { mutableStateOf<String?>(null) }
    val short = stringResource(R.string.pc_add_short)

    // the list follows the choice: the chosen category is opened
    LaunchedEffect(selectedId) { if (selectedId != null) browsing = selectedId }
    LaunchedEffect(q) {
        val text = q.trim()
        if (text.length < 2) { hits = emptyList(); searched = false; return@LaunchedEffect }
        delay(250)
        hits = search(text)
        searched = true
    }

    val trail = productCategoryChain(tree, browsing)
    val here = trail.lastOrNull()
    val level = here?.children ?: tree

    Column(modifier) {
        OutlinedTextField(
            value = q,
            onValueChange = { q = it },
            label = { Text(stringResource(R.string.pc_search)) },
            placeholder = { Text(stringResource(R.string.pc_search_ph)) },
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
            Text(stringResource(R.string.pc_no_hit), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }

        val chosen = productCategoryChain(tree, selectedId)
        if (chosen.isNotEmpty()) {
            Spacer(Modifier.height(8.dp))
            Text("\u2713 " + chosen.joinToString(" \u203A ") { it.name }, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.primary)
        }
        Spacer(Modifier.height(8.dp))
        Text(stringResource(R.string.pc_browse), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        // a long path wraps to the next line as whole names; a name is never squeezed into a column of letters
        FlowRow(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            TextButton(onClick = { browsing = null }) { Text(stringResource(R.string.pc_all), maxLines = 1, softWrap = false) }
            trail.forEach { n -> TextButton(onClick = { browsing = n.id }) { Text("\u203A " + n.name, maxLines = 1, softWrap = false) } }
        }
        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            level.forEach { n ->
                FilterChip(selected = selectedId == n.id, onClick = { onSelect(n.id); browsing = n.id }, label = { Text("${n.icon.orEmpty()} ${n.name}".trim()) })
            }
        }

        TextButton(onClick = { adding = !adding; addError = null }) { Text("+ " + stringResource(R.string.pc_add)) }
        if (adding) {
            if (here == null) {
                Text(stringResource(R.string.pc_add_need), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            } else {
                Text(stringResource(R.string.pc_add_under, here.name), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                OutlinedTextField(value = addName, onValueChange = { addName = it.take(40) }, label = { Text(stringResource(R.string.pc_add_ph)) }, singleLine = true, modifier = Modifier.fillMaxWidth())
                addError?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
                OutlinedButton(onClick = {
                    if (addName.trim().length < 2) { addError = short; return@OutlinedButton }
                    scope.launch {
                        add(addName.trim(), here.id)
                            .onSuccess { id -> addName = ""; adding = false; addError = null; onSelect(id); browsing = id }
                            .onFailure { addError = it.message }
                    }
                }) { Text(stringResource(R.string.pc_add_send)) }
            }
        }
    }
}
