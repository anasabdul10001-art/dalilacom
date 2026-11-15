package com.dalilacom.app.ui.common

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.dalilacom.app.R
import com.dalilacom.app.data.repository.HrRepository
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull

/**
 * Accounting and HR together, for an owner who has both: the month's income, the salaries (paid and still due) and the
 * final net per currency. [path] is `accounting/unified-summary` or `hr/manage/...` as the host screen needs; the server
 * answers with no summary for anybody who lacks either service, and then nothing is drawn (never an empty section).
 */
@Composable
fun UnifiedSummaryCard(repo: HrRepository, path: String, version: Int = 0) {
    var data by remember(path, version) { mutableStateOf<JsonElement?>(null) }
    LaunchedEffect(path, version) { data = repo.get(path).getOrNull() }
    val summary = (data as? JsonObject)?.get("summary") as? JsonObject ?: return
    val totals = (summary["totals"] as? JsonArray)?.mapNotNull { it as? JsonObject }.orEmpty()
    if (totals.isEmpty()) return
    val employees = (summary["employees"] as? JsonPrimitive)?.intOrNull ?: 0
    fun JsonObject.cents(k: String) = (this[k] as? JsonPrimitive)?.doubleOrNull ?: 0.0
    fun money(minor: Double, cur: String) = "%.2f %s".format(minor / 100.0, cur)
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(stringResource(R.string.unified_title), style = MaterialTheme.typography.titleMedium)
            Text(stringResource(R.string.unified_note) + " · " + stringResource(R.string.unified_employees) + ": " + employees, color = MaterialTheme.colorScheme.onSurfaceVariant)
            totals.forEach { x ->
                val cur = (x["currency"] as? JsonPrimitive)?.content.orEmpty()
                Text(cur, style = MaterialTheme.typography.labelLarge)
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    MetricTile(stringResource(R.string.accounting_income), money(x.cents("incomeCents"), cur), "income", Modifier.weight(1f))
                    MetricTile(stringResource(R.string.unified_salariesPaid), money(x.cents("payrollPaidCents"), cur), "expense", Modifier.weight(1f))
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    MetricTile(stringResource(R.string.unified_salariesDue), money(x.cents("payrollDueCents"), cur), "expense", Modifier.weight(1f))
                    MetricTile(stringResource(R.string.unified_net), money(x.cents("netCents"), cur), "net", Modifier.weight(1f))
                }
            }
        }
    }
}
