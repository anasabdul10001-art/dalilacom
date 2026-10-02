package com.dalilacom.app.ui.responder

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.dalilacom.app.ui.ViewModelFactory

private fun txLabel(type: String) = when (type) {
    "TOPUP" -> "شحن"
    "SUBSCRIPTION" -> "اشتراك"
    else -> "تعديل"
}

@Composable
fun WalletScreen(factory: ViewModelFactory, onBack: () -> Unit) {
    val viewModel: WalletViewModel = viewModel(factory = factory)
    val state by viewModel.uiState.collectAsState()

    Column(modifier = Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            TextButton(onClick = onBack) { Text("رجوع") }
            Text("محفظتي", style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.primary)
        }

        if (state.isLoading && state.wallet == null) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            return@Column
        }

        val wallet = state.wallet
        val methods = state.methods
        var method by remember { mutableStateOf("") }
        var reference by remember { mutableStateOf("") }
        var amount by remember { mutableStateOf("") }

        Column(modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
            state.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            state.info?.let { Text(it, color = MaterialTheme.colorScheme.primary) }

            Card(modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp)) {
                    Text("الرصيد", style = MaterialTheme.typography.bodyMedium)
                    Text("${wallet?.balance ?: 0} ${wallet?.creditName.orEmpty()}", style = MaterialTheme.typography.headlineMedium, color = MaterialTheme.colorScheme.primary)
                }
            }

            Spacer(Modifier.height(16.dp))
            Text("شحن الرصيد", style = MaterialTheme.typography.titleMedium)
            val options = buildList {
                if (!methods?.usdtTrc20Address.isNullOrBlank()) add("USDT_TRC20" to "USDT (TRC20)")
                methods?.localWallets?.forEach { add(it.key to it.label) }
            }
            if (options.isEmpty()) {
                Text("طرق الشحن غير مفعّلة حاليًا — تواصل مع الإدارة", color = MaterialTheme.colorScheme.outline)
            } else {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(vertical = 6.dp)) {
                    options.forEach { (key, label) ->
                        FilterChip(selected = method == key, onClick = { method = key }, label = { Text(label) })
                    }
                }
                if (method == "USDT_TRC20") {
                    Text("حوّل USDT (شبكة TRC20) لهذا العنوان، وبعدها الصق رقم العملية (txid) — بيتأكد منه السيرفر تلقائيًا:", style = MaterialTheme.typography.bodySmall)
                    Text(methods?.usdtTrc20Address.orEmpty(), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.primary)
                    Text("1 USD = ${methods?.creditsPerUsd?.toInt() ?: 0} ${methods?.creditName.orEmpty()}", style = MaterialTheme.typography.bodySmall)
                } else {
                    methods?.localWallets?.firstOrNull { it.key == method }?.let {
                        Text("حوّل على الحساب: ${it.accountNumber}", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.primary)
                        it.instructions?.takeIf { text -> text.isNotBlank() }?.let { text -> Text(text, style = MaterialTheme.typography.bodySmall) }
                    }
                }
                if (method.isNotEmpty()) {
                    OutlinedTextField(reference, { reference = it }, label = { Text(if (method == "USDT_TRC20") "رقم العملية (txid)" else "رقم عملية التحويل") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
                    if (method != "USDT_TRC20") {
                        OutlinedTextField(amount, { amount = it }, label = { Text("المبلغ اللي حوّلته") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
                    }
                    Spacer(Modifier.height(8.dp))
                    Button(
                        onClick = { viewModel.submitTopUp(method, reference, amount); reference = "" },
                        enabled = !state.isBusy,
                    ) { Text("إرسال طلب الشحن") }
                }
            }

            Spacer(Modifier.height(20.dp))
            Text("آخر الحركات", style = MaterialTheme.typography.titleMedium)
            if (wallet?.transactions.isNullOrEmpty()) Text("ما في حركات بعد", color = MaterialTheme.colorScheme.outline)
            wallet?.transactions?.forEach { tx ->
                Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(txLabel(tx.type))
                    Text(
                        (if (tx.amount > 0) "+" else "") + tx.amount,
                        color = if (tx.amount > 0) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error,
                    )
                }
            }
        }
    }
}
