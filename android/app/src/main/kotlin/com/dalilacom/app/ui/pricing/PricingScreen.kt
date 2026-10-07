package com.dalilacom.app.ui.pricing

import android.widget.Toast
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.dalilacom.app.R
import com.dalilacom.app.data.network.CatalogDto
import com.dalilacom.app.data.network.CatalogPlanDto
import com.dalilacom.app.data.repository.MembershipRepository
import com.dalilacom.app.ui.ViewModelFactory
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class PricingUiState(
    val isLoading: Boolean = true,
    val catalog: CatalogDto? = null,
    val subscribingPlanId: String? = null,
    /** One-shot text for a toast: a success or the server's own reason for refusing. */
    val message: String? = null,
    val subscribed: Boolean = false,
)

class PricingViewModel(private val memberships: MembershipRepository) : ViewModel() {
    private val _uiState = MutableStateFlow(PricingUiState())
    val uiState: StateFlow<PricingUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch { _uiState.value = PricingUiState(isLoading = false, catalog = memberships.getCatalog()) }
    }

    fun subscribe(planId: String, successText: String) {
        _uiState.update { it.copy(subscribingPlanId = planId, message = null) }
        viewModelScope.launch {
            val result = memberships.subscribe(planId)
            _uiState.update {
                it.copy(subscribingPlanId = null, subscribed = result.isSuccess, message = if (result.isSuccess) successText else result.exceptionOrNull()?.message)
            }
        }
    }

    fun messageShown() = _uiState.update { it.copy(message = null) }
}

private fun serviceTitle(service: String): Int = when (service) {
    "MEMBERSHIP" -> R.string.service_membership
    "MERCHANT_ACCOUNT" -> R.string.service_merchant
    "RESPONDER_CUSTOMER" -> R.string.service_responder_customer
    else -> R.string.service_responder_merchant
}

/** Every service and plan with the price for the customer's country, and a subscribe button on memberships. */
@Composable
fun PricingScreen(factory: ViewModelFactory, isSignedIn: suspend () -> Boolean, onLogin: () -> Unit, onBack: () -> Unit) {
    val viewModel: PricingViewModel = viewModel(factory = factory)
    val state by viewModel.uiState.collectAsState()
    val context = LocalContext.current
    var signedIn by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { signedIn = isSignedIn() }
    val subscribedText = stringResource(R.string.pricing_subscribed)

    LaunchedEffect(state.message) {
        state.message?.let {
            Toast.makeText(context, it, Toast.LENGTH_LONG).show()
            viewModel.messageShown()
        }
    }

    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = onBack) { Text(stringResource(R.string.back)) }
            Text(stringResource(R.string.pricing_title), style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.primary)
        }
        val catalog = state.catalog
        when {
            state.isLoading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            catalog == null || catalog.services.isEmpty() -> Text(stringResource(R.string.pricing_empty), modifier = Modifier.padding(16.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
            else -> LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                item { Text(stringResource(R.string.pricing_sub), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                catalog.services.forEach { group ->
                    item { Text(stringResource(serviceTitle(group.service)), style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 10.dp)) }
                    group.plans.forEach { plan ->
                        item(key = plan.id) {
                            PlanCard(
                                plan = plan,
                                creditName = catalog.creditName,
                                canSubscribe = group.service == "MEMBERSHIP" && plan.source == "catalog" && plan.priceCredits != null,
                                busy = state.subscribingPlanId == plan.id,
                                onSubscribe = { if (signedIn) viewModel.subscribe(plan.id, subscribedText) else onLogin() },
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun PlanCard(plan: CatalogPlanDto, creditName: String, canSubscribe: Boolean, busy: Boolean, onSubscribe: () -> Unit) {
    val price = when (plan.priceCredits) {
        null -> stringResource(R.string.pricing_not_priced)
        0 -> stringResource(R.string.pricing_free)
        else -> stringResource(R.string.pricing_credits, plan.priceCredits, creditName)
    }
    val facts = buildList {
        add(stringResource(R.string.pricing_days, plan.durationDays))
        if (plan.trialDays > 0) add(stringResource(R.string.pricing_trial, plan.trialDays))
        if (plan.priceFrom == "country") add(stringResource(R.string.pricing_your_country))
        plan.monthlyBroadcastLimit?.takeIf { it > 0 }?.let { add(stringResource(R.string.pricing_broadcasts, it)) }
    }
    Surface(shape = RoundedCornerShape(18.dp), border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant), modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(plan.name, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                Text(price, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
            }
            plan.description?.takeIf { it.isNotBlank() }?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            Text(facts.joinToString(" • "), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 6.dp))
            if (plan.features.isNotEmpty()) {
                Spacer(Modifier.height(8.dp))
                plan.features.forEach { feature ->
                    Text(
                        (if (feature.included) "✔ " else "✘ ") + feature.text,
                        style = MaterialTheme.typography.bodyMedium,
                        color = if (feature.included) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant,
                        textDecoration = if (feature.included) null else TextDecoration.LineThrough,
                    )
                }
            }
            if (canSubscribe) {
                Spacer(Modifier.height(12.dp))
                Button(onClick = onSubscribe, enabled = !busy, shape = RoundedCornerShape(12.dp)) { Text(stringResource(R.string.pricing_subscribe)) }
            }
        }
    }
}
