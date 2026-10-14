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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
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
import com.dalilacom.app.data.network.StorePlansDto
import com.dalilacom.app.ui.common.countdownText
import kotlinx.coroutines.launch

/** The shop's store opens when a plan is chosen: the free one or a paid one, at the prices the owner sets. */
@Composable
fun StorePlansScreen(container: AppContainer, onBack: () -> Unit, onOpenStore: () -> Unit) {
    val scope = rememberCoroutineScope()
    var data by remember { mutableStateOf<StorePlansDto?>(null) }
    var loading by remember { mutableStateOf(true) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(Unit) { data = container.merchantRepository.storePlans(); loading = false }

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
            Text("🛍️ " + stringResource(R.string.sp_title), style = MaterialTheme.typography.headlineSmall, color = MaterialTheme.colorScheme.primary)
            TextButton(onClick = onBack) { Text(stringResource(R.string.disc_back)) }
        }
        val d = data
        if (loading) { CircularProgressIndicator(); return@Column }
        if (d == null) { Text(stringResource(R.string.sp_failed), color = MaterialTheme.colorScheme.error); return@Column }

        if (d.current != null && d.active) {
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(14.dp)) {
                    Text(stringResource(R.string.sp_current, d.current.name), style = MaterialTheme.typography.titleMedium)
                    d.current.endsAt?.let { end -> countdownText(end)?.let { Text("⏳ " + stringResource(R.string.cd_ends_in) + " " + it, color = MaterialTheme.colorScheme.primary) } }
                    Spacer(Modifier.height(8.dp))
                    Button(onClick = onOpenStore, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.sp_open)) }
                }
            }
            Spacer(Modifier.height(12.dp))
            Text(stringResource(R.string.sp_change), style = MaterialTheme.typography.titleMedium)
        } else if (!d.required) {
            Text(stringResource(R.string.sp_no_plans_yet))
            Spacer(Modifier.height(8.dp))
            Button(onClick = onOpenStore, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.sp_open)) }
        } else {
            Text(stringResource(R.string.sp_choose), color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Spacer(Modifier.height(10.dp))

        d.plans.forEach { plan ->
            Card(Modifier.fillMaxWidth().padding(vertical = 5.dp), shape = RoundedCornerShape(16.dp)) {
                Column(Modifier.padding(14.dp)) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text(plan.name, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                        Text(
                            when { plan.priceCredits == null -> stringResource(R.string.pricing_not_priced); plan.priceCredits == 0 -> stringResource(R.string.pricing_free); else -> stringResource(R.string.pricing_credits, plan.priceCredits, d.creditName) },
                            color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold,
                        )
                    }
                    plan.description?.takeIf { it.isNotBlank() }?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                    Text(stringResource(R.string.pricing_days, plan.durationDays), style = MaterialTheme.typography.labelMedium, modifier = Modifier.padding(top = 4.dp))
                    plan.features.forEach { f -> Text((if (f.included) "✔ " else "✘ ") + f.text, style = MaterialTheme.typography.bodyMedium) }
                    if (plan.priceCredits != null) {
                        Spacer(Modifier.height(8.dp))
                        val renew = d.active && d.current?.id == plan.id
                        Button(
                            enabled = !busy,
                            onClick = {
                                busy = true; error = null
                                val first = !d.active
                                scope.launch {
                                    container.merchantRepository.subscribeStorePlan(plan.id)
                                        .onSuccess { data = it; if (first) onOpenStore() }
                                        .onFailure { error = it.message }
                                    busy = false
                                }
                            },
                            modifier = Modifier.fillMaxWidth(),
                        ) { Text(stringResource(if (renew) R.string.sp_renew else R.string.sp_choose_btn)) }
                    }
                }
            }
        }
        error?.let { Spacer(Modifier.height(8.dp)); Text(it, color = MaterialTheme.colorScheme.error) }
        Spacer(Modifier.height(24.dp))
    }
}
