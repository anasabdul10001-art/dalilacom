package com.dalilacom.app.ui.merchantmode

import com.dalilacom.app.ui.common.Hint

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
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.dalilacom.app.R
import com.dalilacom.app.data.AppContainer
import com.dalilacom.app.data.network.BranchDto
import com.dalilacom.app.data.network.BranchRequest
import com.dalilacom.app.data.network.AddressSuggestionDto
import com.dalilacom.app.ui.common.LocationPicker
import kotlinx.coroutines.launch

/** The other places of the same shop, maybe in other cities: a list, and a form with the place on the map. */
@Composable
fun BranchesScreen(container: AppContainer, onBack: () -> Unit) {
    val scope = rememberCoroutineScope()
    val branches = remember { mutableStateListOf<BranchDto>() }
    var loading by remember { mutableStateOf(true) }
    var editing by remember { mutableStateOf(false) }
    var editId by remember { mutableStateOf<String?>(null) }
    var name by remember { mutableStateOf("") }
    var city by remember { mutableStateOf("") }
    var address by remember { mutableStateOf("") }
    var addressSuggestions by remember { mutableStateOf<List<AddressSuggestionDto>>(emptyList()) }
    var phone by remember { mutableStateOf("") }
    var location by remember { mutableStateOf<Pair<Double, Double>?>(null) }
    var busy by remember { mutableStateOf(false) }
    var autoAddress by remember { mutableStateOf("") }
    var autoCity by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var toDelete by remember { mutableStateOf<BranchDto?>(null) }
    val needName = stringResource(R.string.br_need_name)
    val needPin = stringResource(R.string.br_need_pin)

    suspend fun reload() {
        val list = container.merchantRepository.branches()
        branches.clear(); branches.addAll(list)
    }
    LaunchedEffect(Unit) { reload(); loading = false }

    LaunchedEffect(address, autoAddress) {
        val query = address.trim()
        if (query.length < 3 || query == autoAddress) { addressSuggestions = emptyList(); return@LaunchedEffect }
        kotlinx.coroutines.delay(500)
        addressSuggestions = container.discoverRepository.suggestAddresses(query)
    }

    fun open(b: BranchDto?) {
        editId = b?.id; name = b?.name.orEmpty(); city = b?.city.orEmpty(); address = b?.address.orEmpty(); phone = b?.phone.orEmpty()
        location = b?.let { it.latitude to it.longitude }; autoAddress = b?.address.orEmpty(); autoCity = b?.city.orEmpty(); addressSuggestions = emptyList(); error = null; editing = true
    }

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
            Text(stringResource(if (editing) (if (editId == null) R.string.br_add else R.string.br_edit) else R.string.br_title), style = MaterialTheme.typography.headlineSmall, color = MaterialTheme.colorScheme.primary)
            TextButton(onClick = { if (editing) editing = false else onBack() }) { Text(stringResource(R.string.disc_back)) }
        }
        if (loading) { CircularProgressIndicator(); return@Column }

        if (!editing) {
            Text(stringResource(R.string.br_sub), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(10.dp))
            if (branches.isEmpty()) Text(stringResource(R.string.br_none), color = MaterialTheme.colorScheme.onSurfaceVariant)
            branches.forEach { b ->
                Card(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                    Column(Modifier.padding(12.dp)) {
                        Text("🏬 ${b.name}", style = MaterialTheme.typography.titleMedium)
                        val sub = listOfNotNull(b.city, b.address, b.phone).filter { it.isNotBlank() }.joinToString(" • ")
                        if (sub.isNotBlank()) Text(sub, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Row {
                            TextButton(onClick = { open(b) }) { Text(stringResource(R.string.br_edit)) }
                            TextButton(onClick = { toDelete = b }) { Text(stringResource(R.string.br_delete), color = MaterialTheme.colorScheme.error) }
                        }
                    }
                }
            }
            Spacer(Modifier.height(10.dp))
            Button(onClick = { open(null) }, shape = RoundedCornerShape(14.dp), modifier = Modifier.fillMaxWidth().height(52.dp)) { Text("+ " + stringResource(R.string.br_add)) }
        } else {
            OutlinedTextField(value = name, onValueChange = { name = it.take(60) }, label = { Text(stringResource(R.string.br_name)) }, placeholder = { Hint(stringResource(R.string.br_name_ph)) }, singleLine = true, modifier = Modifier.fillMaxWidth())
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(value = city, onValueChange = { city = it.take(60) }, label = { Text(stringResource(R.string.br_city)) }, singleLine = true, modifier = Modifier.fillMaxWidth(), placeholder = { Hint(stringResource(R.string.ph_city)) })
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(value = address, onValueChange = { address = it.take(200) }, label = { Text(stringResource(R.string.br_address)) }, placeholder = { Hint(stringResource(R.string.mp_address_ph)) }, modifier = Modifier.fillMaxWidth())
            if (addressSuggestions.isNotEmpty()) {
                Card(Modifier.fillMaxWidth().padding(top = 4.dp)) {
                    Column(Modifier.padding(4.dp)) {
                        addressSuggestions.forEach { item ->
                            TextButton(onClick = {
                                address = item.address.ifBlank { item.label }
                                autoAddress = address
                                if (item.city != null) { city = item.city; autoCity = item.city }
                                addressSuggestions = emptyList()
                                location = item.latitude to item.longitude
                            }, modifier = Modifier.fillMaxWidth()) {
                                Column(Modifier.fillMaxWidth()) {
                                    Text(item.label, style = MaterialTheme.typography.bodyMedium)
                                    item.city?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                                }
                            }
                        }
                        Text("© OpenStreetMap contributors", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp))
                    }
                }
            }
            Spacer(Modifier.height(12.dp))
            Text(stringResource(R.string.br_pick), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            LocationPicker(value = location, onChange = { picked ->
                location = picked
                scope.launch {
                    container.discoverRepository.addressFor(picked.first, picked.second)?.let { place ->
                        // the pinned place always replaces what was typed
                        address = place.address.orEmpty(); autoAddress = address
                        if (place.city != null) { city = place.city; autoCity = city }
                    }
                }
            })
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(value = phone, onValueChange = { phone = it.take(30) }, label = { Text(stringResource(R.string.br_phone)) }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone), modifier = Modifier.fillMaxWidth(), placeholder = { Hint(stringResource(R.string.ph_phone)) })
            error?.let { Spacer(Modifier.height(8.dp)); Text(it, color = MaterialTheme.colorScheme.error) }
            Spacer(Modifier.height(12.dp))
            Button(
                enabled = !busy,
                onClick = {
                    val pin = location
                    if (name.trim().length < 2) { error = needName; return@Button }
                    if (pin == null) { error = needPin; return@Button }
                    busy = true; error = null
                    scope.launch {
                        val result = container.merchantRepository.saveBranch(
                            editId,
                            BranchRequest(name.trim(), city.trim().ifBlank { null }, address.trim().ifBlank { null }, phone.trim().ifBlank { null }, pin.first, pin.second),
                        )
                        busy = false
                        result.onSuccess { reload(); editing = false }.onFailure { error = it.message }
                    }
                },
                shape = RoundedCornerShape(14.dp), modifier = Modifier.fillMaxWidth().height(52.dp),
            ) { Text(stringResource(if (busy) R.string.br_saving else R.string.br_save)) }
            OutlinedButton(onClick = { editing = false }, modifier = Modifier.fillMaxWidth().padding(top = 8.dp)) { Text(stringResource(R.string.br_cancel)) }
        }
        Spacer(Modifier.height(24.dp))
    }

    toDelete?.let { b ->
        AlertDialog(
            onDismissRequest = { toDelete = null },
            title = { Text(stringResource(R.string.br_confirm_del)) },
            text = { Text(b.name) },
            confirmButton = {
                TextButton(onClick = { toDelete = null; scope.launch { container.merchantRepository.deleteBranch(b.id); reload() } }) { Text(stringResource(R.string.br_delete), color = MaterialTheme.colorScheme.error) }
            },
            dismissButton = { TextButton(onClick = { toDelete = null }) { Text(stringResource(R.string.br_cancel)) } },
        )
    }
}
