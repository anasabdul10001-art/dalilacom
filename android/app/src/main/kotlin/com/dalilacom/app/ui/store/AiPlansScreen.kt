package com.dalilacom.app.ui.store

import androidx.compose.foundation.BorderStroke
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
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.dalilacom.app.R
import com.dalilacom.app.data.AppContainer
import com.dalilacom.app.data.network.AiPackageDto
import com.dalilacom.app.data.network.AiQuotaDto
import kotlinx.coroutines.launch

/** The monthly AI packages: a fixed price for a number of uses, bought from the wallet. */
@Composable
fun AiPlansScreen(container: AppContainer, onBack: () -> Unit, onWallet: () -> Unit) {
    val scope = rememberCoroutineScope()
    var packages by remember { mutableStateOf<List<AiPackageDto>>(emptyList()) }
    var quota by remember { mutableStateOf<AiQuotaDto?>(null) }
    var loading by remember { mutableStateOf(true) }
    var busy by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var confirm by remember { mutableStateOf<AiPackageDto?>(null) }

    LaunchedEffect(Unit) {
        container.storeRepository.aiPackages()?.let { packages = it.packages; quota = it.quota }
        loading = false
    }

    confirm?.let { p ->
        AlertDialog(
            onDismissRequest = { confirm = null },
            text = { Text(stringResource(R.string.ai_confirm_buy, p.name, p.credits)) },
            confirmButton = {
                TextButton(onClick = {
                    confirm = null; busy = p.id; error = null
                    scope.launch {
                        container.storeRepository.buyAiPackage(p.id)
                            .onSuccess { quota = it }
                            .onFailure { error = it.message }
                        busy = null
                    }
                }) { Text(stringResource(R.string.disc_confirm)) }
            },
            dismissButton = { TextButton(onClick = { confirm = null }) { Text(stringResource(R.string.disc_cancel)) } },
        )
    }

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
            Text("✨ " + stringResource(R.string.ai_plans_title), style = MaterialTheme.typography.headlineSmall, color = MaterialTheme.colorScheme.primary)
            TextButton(onClick = onBack) { Text(stringResource(R.string.disc_back)) }
        }
        Text(stringResource(R.string.ai_plans_sub), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (loading) { CircularProgressIndicator(); return@Column }
        val sub = quota?.subscription
        Surface(shape = RoundedCornerShape(14.dp), border = BorderStroke(1.dp, if (sub != null) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant), modifier = Modifier.fillMaxWidth()) {
            Column(Modifier.padding(14.dp)) {
                if (sub != null) {
                    Text(sub.name, fontWeight = FontWeight.Bold)
                    Text(stringResource(R.string.ai_sub_left, sub.left, sub.uses, sub.endDate.take(10)))
                    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 6.dp)) {
                        Text(stringResource(R.string.ai_auto_renew), modifier = Modifier.weight(1f), fontWeight = FontWeight.Bold)
                        androidx.compose.material3.Switch(checked = sub.autoRenew, onCheckedChange = { on ->
                            scope.launch { container.storeRepository.setAiAutoRenew(on).onSuccess { quota = it }.onFailure { error = it.message } }
                        })
                    }
                    Text(stringResource(if (sub.autoRenew) R.string.ai_auto_renew_on else R.string.ai_auto_renew_off), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                } else Text(stringResource(R.string.ai_no_plan))
            }
        }
        quota?.let { q ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(stringResource(R.string.ai_balance_line, q.balance), color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
                TextButton(onClick = onWallet) { Text(stringResource(R.string.ai_top_up)) }
            }
        }
        error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        packages.forEach { p ->
            Surface(shape = RoundedCornerShape(14.dp), border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant), modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text(p.name, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
                        Text(stringResource(R.string.ai_price, p.credits), color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
                    }
                    Text(stringResource(R.string.ai_pack_line, p.uses, p.days), color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Button(onClick = { confirm = p }, enabled = busy == null, shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth().height(48.dp)) {
                        Text(stringResource(if (busy == p.id) R.string.ai_buying else if (sub != null) R.string.ai_add_more else R.string.ai_buy))
                    }
                }
            }
        }
        if (packages.isEmpty()) Text(stringResource(R.string.ai_no_packages), color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(stringResource(R.string.ai_plans_note), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(24.dp))
    }
}
