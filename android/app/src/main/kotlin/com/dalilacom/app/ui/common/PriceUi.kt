package com.dalilacom.app.ui.common

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedCard
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.dalilacom.app.R
import com.dalilacom.app.data.network.ProductDto
import com.dalilacom.app.data.network.StoreProductDto

/** Syria prices in pounds or dollars: the other markets have one money only. */
fun hasTwoMoneys(): Boolean = Market.currency == "SYP" || Market.currency == "USD"

/** An amount in a given currency ("SYP" is written with its code: there is no common symbol for it). */
fun formatMoney(cents: Int, code: String): String {
    val amount = "%.2f".format(java.util.Locale.US, cents / 100.0)
    return when (code) {
        "USD" -> if (com.dalilacom.app.ui.i18n.AppStrings.language == "en") "$$amount" else "$amount $"
        else -> "$amount $code"
    }
}

/**
 * A product's price as its shop wants shoppers to see it: the market amount, the same price in the other of pounds / dollars,
 * or both. When the shop has no rate (so no second amount is known), or in any other market, it is the plain amount.
 */
fun storePrice(p: StoreProductDto, member: Boolean): String {
    val market = Market.currency
    val canon = (if (member) p.memberPriceCents else p.priceCents) ?: p.priceCents
    val alt = if (member) p.altMemberPriceCents else p.altPriceCents
    val altCode = p.altCurrency
    if (altCode == null || alt == null) return formatCents(canon)
    val d = p.displayCurrency ?: market
    fun amount(code: String) = formatMoney(if (code == market) canon else alt, code)
    return when {
        d == "BOTH" -> amount(market) + " · " + amount(altCode)
        d == market -> amount(market)
        else -> amount(altCode)
    }
}

/** The shop's own view of a product's price: what it typed (in its one pricing money), and the market amount it comes to. */
fun ownPrice(p: ProductDto, shopMoney: String?): String {
    val entered = p.enteredPriceCents
    return if (entered != null) "${formatMoney(entered, shopMoney ?: Market.currency)} (${formatCents(p.priceCents)})" else formatCents(p.priceCents)
}

/** The shop's pricing, set once for all its products: the money it writes prices in, its dollar rate and whether shoppers see both. */
@Composable
fun PricingCard(currency: String?, rate: Int?, showBoth: Boolean, onSave: (String, Int?, Boolean) -> Unit) {
    if (!hasTwoMoneys()) return
    var money by remember(currency) { mutableStateOf(currency ?: Market.currency) }
    var rateText by remember(rate) { mutableStateOf(rate?.toString().orEmpty()) }
    var both by remember(showBoth) { mutableStateOf(showBoth) }
    OutlinedCard(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(stringResource(R.string.price_rate_title), style = MaterialTheme.typography.titleMedium)
            Text(stringResource(R.string.price_rate_sub), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(stringResource(R.string.price_currency), style = MaterialTheme.typography.bodySmall)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChip(selected = money == "SYP", onClick = { money = "SYP" }, label = { Text(stringResource(R.string.price_syp)) })
                FilterChip(selected = money == "USD", onClick = { money = "USD" }, label = { Text(stringResource(R.string.price_usd)) })
            }
            OutlinedTextField(
                value = rateText,
                onValueChange = { rateText = it.filter { c -> c.isDigit() } },
                label = { Text(stringResource(R.string.price_rate_label)) },
                suffix = { Text(stringResource(R.string.price_rate_unit)) },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                modifier = Modifier.fillMaxWidth(),
            )
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().clickable { both = !both }) {
                Checkbox(checked = both, onCheckedChange = { both = it })
                Text(stringResource(R.string.price_show_both), style = MaterialTheme.typography.bodySmall)
            }
            Spacer(Modifier.height(2.dp))
            Button(onClick = { onSave(money, rateText.toIntOrNull()?.takeIf { it >= 1 }, both) }) { Text(stringResource(R.string.price_save)) }
        }
    }
}
