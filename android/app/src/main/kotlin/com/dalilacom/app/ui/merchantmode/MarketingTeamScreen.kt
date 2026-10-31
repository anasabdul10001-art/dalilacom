package com.dalilacom.app.ui.merchantmode

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.dalilacom.app.R
import com.dalilacom.app.data.AppContainer
import com.dalilacom.app.data.network.ShopAffiliateDto
import kotlinx.coroutines.launch

@Composable
fun MarketingTeamScreen(container: AppContainer, onBack: () -> Unit) {
    val repository = container.shopAffiliateRepository
    val scope = rememberCoroutineScope()
    var team by remember { mutableStateOf<List<ShopAffiliateDto>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var busy by remember { mutableStateOf(false) }
    var email by remember { mutableStateOf("") }
    var amount by remember { mutableStateOf("") }
    var commissionType by remember { mutableStateOf("PERCENT") }
    var error by remember { mutableStateOf<String?>(null) }
    var info by remember { mutableStateOf<String?>(null) }
    val percentLabel = stringResource(R.string.affiliate_team_percent)
    val fixedLabel = stringResource(R.string.affiliate_team_fixed)
    val loadError = stringResource(R.string.affiliate_team_load_error)
    val invalidEmail = stringResource(R.string.affiliate_team_invalid_email)
    val invalidCommission = stringResource(R.string.affiliate_team_invalid_commission)
    val invalidPercent = stringResource(R.string.affiliate_team_invalid_percent)
    val addedMessage = stringResource(R.string.affiliate_team_added)
    val addError = stringResource(R.string.affiliate_team_add_error)
    val updateError = stringResource(R.string.affiliate_team_update_error)
    val savingLabel = stringResource(R.string.affiliate_team_saving)

    suspend fun refresh() {
        repository.list().onSuccess { team = it }.onFailure { error = it.message ?: loadError }
        loading = false
    }
    LaunchedEffect(Unit) { refresh() }

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
            Text(stringResource(R.string.affiliate_team_title), style = MaterialTheme.typography.headlineSmall, color = MaterialTheme.colorScheme.primary)
            TextButton(onClick = onBack) { Text(stringResource(R.string.disc_back)) }
        }
        Text(stringResource(R.string.affiliate_team_intro), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(12.dp))
        if (loading) {
            CircularProgressIndicator()
        } else {
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(14.dp)) {
                    Text(stringResource(R.string.affiliate_team_add_title), style = MaterialTheme.typography.titleMedium)
                    Spacer(Modifier.height(8.dp))
                    OutlinedTextField(
                        value = email,
                        onValueChange = { email = it; error = null },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                        label = { Text(stringResource(R.string.affiliate_team_email)) },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Next),
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        FilterChip(selected = commissionType == "PERCENT", onClick = { commissionType = "PERCENT" }, label = { Text(percentLabel) })
                        FilterChip(selected = commissionType == "FIXED", onClick = { commissionType = "FIXED" }, label = { Text(fixedLabel) })
                    }
                    OutlinedTextField(
                        value = amount,
                        onValueChange = { amount = it.filter(Char::isDigit); error = null },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                        label = { Text(stringResource(R.string.affiliate_team_commission)) },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number, imeAction = ImeAction.Done),
                    )
                    Spacer(Modifier.height(10.dp))
                    Button(
                        onClick = {
                            val value = amount.toIntOrNull()
                            when {
                                !email.contains('@') -> error = invalidEmail
                                value == null || value <= 0 -> error = invalidCommission
                                commissionType == "PERCENT" && value > 100 -> error = invalidPercent
                                else -> {
                                    busy = true; error = null; info = null
                                    scope.launch {
                                        repository.add(email.trim(), commissionType, value)
                                            .onSuccess { email = ""; amount = ""; info = addedMessage; refresh() }
                                            .onFailure { error = it.message ?: addError }
                                        busy = false
                                    }
                                }
                            }
                        },
                        enabled = !busy,
                        modifier = Modifier.fillMaxWidth(),
                    ) { Text(if (busy) savingLabel else stringResource(R.string.affiliate_team_add)) }
                }
            }
            Spacer(Modifier.height(14.dp))
            Text(stringResource(R.string.affiliate_team_list_title, team.size), style = MaterialTheme.typography.titleMedium)
            if (team.isEmpty()) {
                Spacer(Modifier.height(6.dp))
                Text(stringResource(R.string.affiliate_team_empty), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            team.forEach { person ->
                Spacer(Modifier.height(8.dp))
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(14.dp)) {
                        Text(person.user.fullName, style = MaterialTheme.typography.titleSmall)
                        Text(person.user.email, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        val commission = if (person.commissionType == "PERCENT") "${person.commissionValue}%" else person.commissionValue.toString()
                        Text(stringResource(R.string.affiliate_team_person_commission, commission), style = MaterialTheme.typography.bodySmall)
                        Text(stringResource(R.string.affiliate_team_person_stats, person.referredCount, person.totalCommissionCents / 100.0), style = MaterialTheme.typography.bodySmall)
                        TextButton(
                            enabled = !busy,
                            onClick = {
                                busy = true
                                scope.launch {
                                    repository.setActive(person.id, !person.isActive)
                                        .onSuccess { team = team.map { if (it.id == person.id) it.copy(isActive = !person.isActive) else it } }
                                        .onFailure { error = it.message ?: updateError }
                                    busy = false
                                }
                            },
                        ) { Text(stringResource(if (person.isActive) R.string.affiliate_team_disable else R.string.affiliate_team_enable)) }
                    }
                }
            }
        }
        info?.let { Spacer(Modifier.height(8.dp)); Text(it, color = MaterialTheme.colorScheme.primary) }
        error?.let { Spacer(Modifier.height(8.dp)); Text(it, color = MaterialTheme.colorScheme.error) }
        Spacer(Modifier.height(24.dp))
    }
}
