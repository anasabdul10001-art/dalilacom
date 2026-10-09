package com.dalilacom.app.ui.merchantmode

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.dalilacom.app.R
import com.dalilacom.app.data.AppContainer
import com.dalilacom.app.data.network.ShippingItemRequest
import kotlinx.coroutines.launch

private class ShipRow(name: String = "", cost: String = "") {
    var name by mutableStateOf(name)
    var cost by mutableStateOf(cost)
}

/** How the shop sends its orders and what each way costs; the customer picks one when ordering. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ShippingScreen(container: AppContainer, onBack: () -> Unit) {
    val scope = rememberCoroutineScope()
    val rows = remember { mutableStateListOf<ShipRow>() }
    var loading by remember { mutableStateOf(true) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val invalid = stringResource(R.string.ship_invalid)
    val presets = listOf(stringResource(R.string.ship_pickup) to "0", stringResource(R.string.ship_local) to "", stringResource(R.string.ship_country) to "")

    LaunchedEffect(Unit) {
        val current = container.merchantRepository.shippingMethods()
        rows.clear()
        if (current.isEmpty()) rows.add(ShipRow()) else current.forEach { rows.add(ShipRow(it.name, (it.costCents / 100.0).toString().removeSuffix(".0"))) }
        loading = false
    }

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
            Text(stringResource(R.string.ship_title), style = MaterialTheme.typography.headlineSmall, color = MaterialTheme.colorScheme.primary)
            TextButton(onClick = onBack) { Text(stringResource(R.string.disc_back)) }
        }
        Text(stringResource(R.string.ship_sub), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(10.dp))
        if (loading) { CircularProgressIndicator(); return@Column }
        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            presets.forEach { (label, cost) ->
                AssistChip(onClick = {
                    if (rows.size == 1 && rows[0].name.isBlank() && rows[0].cost.isBlank()) rows.clear()
                    if (rows.none { it.name == label } && rows.size < 8) rows.add(ShipRow(label, cost))
                }, label = { Text("+ $label") })
            }
        }
        rows.forEachIndexed { i, row ->
            Row(Modifier.fillMaxWidth().padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(value = row.name, onValueChange = { row.name = it.take(40) }, singleLine = true, placeholder = { Text(stringResource(R.string.ship_name_ph)) }, modifier = Modifier.weight(2f))
                OutlinedTextField(
                    value = row.cost, onValueChange = { row.cost = it.filter { c -> c.isDigit() || c == '.' || c == ',' }.take(9) }, singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), placeholder = { Text(stringResource(R.string.ship_cost_ph)) }, modifier = Modifier.weight(1f),
                )
                TextButton(onClick = { rows.removeAt(i) }) { Text("✕") }
            }
        }
        if (rows.size < 8) TextButton(onClick = { rows.add(ShipRow()) }) { Text("+  " + stringResource(R.string.ship_add)) }
        Text(stringResource(R.string.ship_free_note), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        error?.let { Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(top = 8.dp)) }
        Spacer(Modifier.height(12.dp))
        Button(
            onClick = {
                val filled = rows.filter { it.name.isNotBlank() || it.cost.isNotBlank() }
                val methods = filled.map { ShippingItemRequest(it.name.trim(), Math.round((it.cost.replace(",", ".").toDoubleOrNull() ?: 0.0) * 100).toInt()) }
                if (methods.isEmpty() || methods.any { it.name.length < 2 }) { error = invalid; return@Button }
                busy = true; error = null
                scope.launch {
                    container.merchantRepository.saveShippingMethods(methods)
                        .onSuccess { onBack() }
                        .onFailure { error = it.message; busy = false }
                }
            },
            enabled = !busy, shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth().height(52.dp),
        ) { Text(stringResource(if (busy) R.string.ship_saving else R.string.ship_save), fontWeight = FontWeight.ExtraBold) }
        Spacer(Modifier.height(24.dp))
    }
}
