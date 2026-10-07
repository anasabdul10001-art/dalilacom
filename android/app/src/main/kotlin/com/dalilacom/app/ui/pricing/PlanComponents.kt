package com.dalilacom.app.ui.pricing

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import com.dalilacom.app.R
import com.dalilacom.app.data.network.CatalogPlanDto

/** What a plan costs, in the wallet's own unit. */
@Composable
fun planPriceText(plan: CatalogPlanDto, creditName: String): String = when (plan.priceCredits) {
    null -> stringResource(R.string.pricing_not_priced)
    0 -> stringResource(R.string.pricing_free)
    else -> stringResource(R.string.pricing_credits, plan.priceCredits, creditName)
}

/** One plan: name, price, length, free period, what it includes — and a button when it can be bought. */
@Composable
fun PlanCard(plan: CatalogPlanDto, creditName: String, actionLabel: String?, busy: Boolean, onAction: () -> Unit) {
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
                Text(planPriceText(plan, creditName), style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
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
            if (actionLabel != null) {
                Spacer(Modifier.height(12.dp))
                Button(onClick = onAction, enabled = !busy, shape = RoundedCornerShape(12.dp)) { Text(actionLabel) }
            }
        }
    }
}

/** The service's own welcome: what it is, the free period and the price after it, and that continuing starts the free period. */
@Composable
fun ServiceWelcome(title: String, body: String, trialDays: Int, price: String, periodDays: Int) {
    Surface(shape = RoundedCornerShape(18.dp), color = MaterialTheme.colorScheme.surfaceVariant, modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp)) {
            Text(title, style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.primary)
            Spacer(Modifier.height(6.dp))
            Text(body, style = MaterialTheme.typography.bodyMedium)
            Spacer(Modifier.height(8.dp))
            Text(
                if (trialDays > 0) stringResource(R.string.intro_trial, trialDays, price, periodDays) else stringResource(R.string.intro_no_trial, price, periodDays),
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Bold,
            )
            if (trialDays > 0) {
                Spacer(Modifier.height(4.dp))
                Text(stringResource(R.string.intro_after_continue), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}
