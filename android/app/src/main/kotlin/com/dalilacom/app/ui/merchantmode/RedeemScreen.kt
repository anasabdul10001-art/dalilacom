package com.dalilacom.app.ui.merchantmode

import com.dalilacom.app.R
import com.dalilacom.app.ui.i18n.AppStrings
import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Surface
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.lifecycle.viewmodel.compose.viewModel
import com.dalilacom.app.ui.ViewModelFactory
import com.dalilacom.app.ui.common.formatCents
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions

@Composable
fun RedeemScreen(factory: ViewModelFactory, onExportReceipt: (String) -> Unit) {
    val viewModel: RedeemViewModel = viewModel(factory = factory)
    val state by viewModel.uiState.collectAsState()
    val context = LocalContext.current

    val scanLauncher = rememberLauncherForActivityResult(ScanContract()) { result ->
        result.contents?.let(viewModel::onScanned)
    }
    val cameraPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted ->
        if (granted) scanLauncher.launch(ScanOptions().setBeepEnabled(true).setOrientationLocked(false))
    }

    fun launchScan() {
        val granted = ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) ==
            PackageManager.PERMISSION_GRANTED
        if (granted) {
            scanLauncher.launch(ScanOptions().setBeepEnabled(true).setOrientationLocked(false))
        } else {
            cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
        }
    }

    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        Text(AppStrings.get(R.string.s_d9724d06), style = MaterialTheme.typography.headlineSmall, color = MaterialTheme.colorScheme.primary)
        Spacer(Modifier.height(16.dp))

        when (state.phase) {
            RedeemPhase.INPUT -> {
                Button(onClick = ::launchScan, modifier = Modifier.fillMaxWidth()) { Text(AppStrings.get(R.string.s_f353c2e2)) }
                Spacer(Modifier.height(12.dp))
                Text(AppStrings.get(R.string.s_9a2547dd), style = MaterialTheme.typography.bodySmall)
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = state.memberNumber,
                    onValueChange = viewModel::onMemberNumberChange,
                    label = { Text(AppStrings.get(R.string.s_8522fb76)) },
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = state.code,
                    onValueChange = viewModel::onCodeChange,
                    label = { Text(AppStrings.get(R.string.s_ed8f478b)) },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(16.dp))
                if (state.isLoading) {
                    CircularProgressIndicator()
                } else {
                    Button(onClick = viewModel::verify, modifier = Modifier.fillMaxWidth()) { Text(AppStrings.get(R.string.s_fe79250b)) }
                }
            }

            RedeemPhase.VERIFIED -> {
                Text(AppStrings.get(R.string.fmt_member, state.memberName.orEmpty()), style = MaterialTheme.typography.titleMedium)
                if (state.discounts.isEmpty()) {
                    Text(AppStrings.get(R.string.fmt_discount_pct, state.discountPercent), color = MaterialTheme.colorScheme.primary)
                } else {
                    Text(stringResource(R.string.disc_pick_at_till), style = MaterialTheme.typography.titleSmall)
                    state.discounts.forEach { d ->
                        val chosen = d.id == state.selectedDiscountId
                        Surface(
                            shape = RoundedCornerShape(14.dp),
                            border = BorderStroke(if (chosen) 2.dp else 1.dp, if (chosen) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant),
                            modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp).clickable(enabled = d.eligible) { viewModel.selectDiscount(d.id) },
                        ) {
                            Column(Modifier.padding(12.dp)) {
                                Text("${d.percent}%  ${d.title}", fontWeight = FontWeight.Bold, color = if (d.eligible) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant)
                                Text(discountScopeText(d.scope, d.section, d.productNames), style = MaterialTheme.typography.bodySmall)
                                if (!d.eligible) Text(stringResource(R.string.disc_used), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                                else d.remainingForMember?.let { Text(stringResource(R.string.disc_left_for_member, it), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary) }
                            }
                        }
                    }
                    if (state.discounts.none { it.eligible }) Text(stringResource(R.string.disc_all_used), color = MaterialTheme.colorScheme.error)
                }
                Spacer(Modifier.height(16.dp))
                OutlinedTextField(
                    value = state.billAmountText,
                    onValueChange = viewModel::onBillAmountChange,
                    label = { Text(AppStrings.get(R.string.s_c89ae688)) },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(16.dp))
                if (state.isLoading) {
                    CircularProgressIndicator()
                } else {
                    Button(onClick = viewModel::confirmRedeem, enabled = state.discounts.isEmpty() || state.selectedDiscountId != null, modifier = Modifier.fillMaxWidth()) { Text(AppStrings.get(R.string.s_0b149b76)) }
                    Spacer(Modifier.height(8.dp))
                    OutlinedButton(onClick = viewModel::reset, modifier = Modifier.fillMaxWidth()) { Text(AppStrings.get(R.string.s_e776b020)) }
                }
            }

            RedeemPhase.DONE -> {
                val receipt = state.receipt!!
                Text(AppStrings.get(R.string.s_af7715dd), style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.primary)
                Spacer(Modifier.height(12.dp))
                Text(AppStrings.get(R.string.fmt_tx_ref, receipt.transactionRef))
                Text(AppStrings.get(R.string.fmt_bill_amount, formatCents(receipt.billAmountCents)))
                Text(AppStrings.get(R.string.fmt_discount_pct, receipt.discountPercent))
                Text(AppStrings.get(R.string.fmt_discount_amount, formatCents(receipt.discountAmountCents)))
                Text(AppStrings.get(R.string.fmt_final_amount, formatCents(receipt.finalAmountCents)), style = MaterialTheme.typography.titleMedium)
                Spacer(Modifier.height(20.dp))
                OutlinedButton(onClick = { onExportReceipt(receipt.transactionRef) }, modifier = Modifier.fillMaxWidth()) { Text(AppStrings.get(R.string.s_064be38d)) }
                Spacer(Modifier.height(8.dp))
                Button(onClick = viewModel::reset, modifier = Modifier.fillMaxWidth()) { Text(AppStrings.get(R.string.s_e644dc4b)) }
            }
        }

        state.error?.let {
            Spacer(Modifier.height(12.dp))
            Text(it, color = MaterialTheme.colorScheme.error)
        }
    }
}
