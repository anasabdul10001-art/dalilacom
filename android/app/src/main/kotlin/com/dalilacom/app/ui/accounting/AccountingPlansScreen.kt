package com.dalilacom.app.ui.accounting

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.dalilacom.app.R
import com.dalilacom.app.data.AppContainer
import com.dalilacom.app.data.network.ServicePlanDto
import kotlinx.coroutines.launch

@Composable
fun AccountingPlansScreen(container: AppContainer, onBack: () -> Unit, service: String = "ACCOUNTING", hint: Int = R.string.accounting_plan_required) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var plans by remember { mutableStateOf<List<ServicePlanDto>?>(null) }
    var creditName by remember { mutableStateOf("") }
    var busyId by remember { mutableStateOf<String?>(null) }
    var message by remember { mutableStateOf("") }
    LaunchedEffect(Unit) {
        val catalog = container.accountingRepository.planCatalog()
        creditName = catalog?.creditName.orEmpty()
        plans = catalog?.services?.firstOrNull { it.service == service }?.plans.orEmpty()
    }
    Column(Modifier.fillMaxSize().padding(16.dp)) {
        Text(stringResource(R.string.billing_title), style = MaterialTheme.typography.headlineSmall)
        Text("\u2022 ${stringResource(hint)}", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 6.dp, bottom = 12.dp))
        when (val list = plans) {
            null -> CircularProgressIndicator()
            else -> LazyColumn(contentPadding = PaddingValues(bottom = 20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                if (list.isEmpty()) item { Text(stringResource(R.string.billing_failed), color = MaterialTheme.colorScheme.error) }
                items(list, key = { it.id }) { plan ->
                    Card(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text(plan.name, style = MaterialTheme.typography.titleLarge)
                            plan.description?.let { Text(it, style = MaterialTheme.typography.bodyMedium) }
                            val price = if (plan.cashAmountCents <= 0) "${plan.priceCredits ?: 0} $creditName" else "${planMoney(plan.cashAmountCents)} ${plan.currency}"
                            Text(price, color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.titleMedium)
                            Text("${plan.durationDays} ${stringResource(R.string.plans_days)}${if (plan.trialDays > 0) " · ${plan.trialDays} ${stringResource(R.string.plans_trial_days)}" else ""}")
                            plan.features.forEach { Text("• ${it.text}", style = MaterialTheme.typography.bodySmall) }
                            Button(onClick = {
                                busyId = plan.id
                                scope.launch {
                                    when {
                                        plan.trialDays > 0 -> container.accountingRepository.trial(plan.id).fold({
                                            message = context.getString(R.string.billing_activated)
                                            container.accountingRepository.summary()
                                            onBack()
                                        }, { message = it.message ?: context.getString(R.string.billing_failed) })
                                        plan.cashAmountCents == 0 -> container.accountingRepository.activateFree(plan.id).fold({
                                            message = context.getString(R.string.billing_activated)
                                            container.accountingRepository.summary()
                                            onBack()
                                        }, { message = it.message ?: context.getString(R.string.billing_failed) })
                                        else -> container.accountingRepository.checkout(plan.id).fold({ checkout ->
                                            context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(checkout.checkoutUrl)))
                                            message = checkout.provider
                                        }, { message = it.message ?: context.getString(R.string.billing_failed) })
                                    }
                                    busyId = null
                                }
                            }, enabled = busyId == null, modifier = Modifier.fillMaxWidth()) {
                                Text(if (busyId == plan.id) stringResource(R.string.billing_loading) else stringResource(if (plan.trialDays > 0) R.string.billing_start_trial else R.string.billing_subscribe))
                            }
                            if (plan.paypalAvailable && plan.cashAmountCents > 0 && plan.trialDays == 0) {
                                androidx.compose.material3.OutlinedButton(onClick = {
                                    busyId = plan.id
                                    scope.launch {
                                        container.accountingRepository.checkout(plan.id, "PAYPAL").fold({ checkout ->
                                            context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(checkout.checkoutUrl)))
                                        }, { message = it.message ?: context.getString(R.string.billing_failed) })
                                        busyId = null
                                    }
                                }, enabled = busyId == null, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.billing_paypal)) }
                            }
                        }
                    }
                }
                if (message.isNotBlank()) item { Text(message, color = MaterialTheme.colorScheme.primary) }
                item { Button(onClick = onBack, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.back)) } }
            }
        }
    }
}

private fun planMoney(cents: Int) = "%.2f".format(cents / 100.0)
