package com.dalilacom.app.ui.common

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
