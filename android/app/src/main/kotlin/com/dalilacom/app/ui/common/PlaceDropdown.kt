package com.dalilacom.app.ui.common

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
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
import com.dalilacom.app.R
import com.dalilacom.app.data.network.GeoUnitDto
import com.dalilacom.app.ui.i18n.AppStrings

fun GeoUnitDto.title(): String = nameArabic?.takeIf { AppStrings.language == "ar" } ?: nameEnglish ?: name

/** A drop-down of places (country, governorate, city, area), shown as a button with the current choice. */
@Composable
fun PlaceDropdown(label: String, options: List<GeoUnitDto>, selectedId: String?, onSelect: (GeoUnitDto) -> Unit) {
    var open by remember { mutableStateOf(false) }
    val chosen = options.firstOrNull { it.id == selectedId }
    Column {
        Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Box {
            OutlinedButton(onClick = { open = true }, modifier = Modifier.fillMaxWidth()) { Text(chosen?.title() ?: AppStrings.get(R.string.account_choose)) }
            DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
                options.forEach { unit -> DropdownMenuItem(text = { Text(unit.title()) }, onClick = { onSelect(unit); open = false }) }
            }
        }
    }
}
