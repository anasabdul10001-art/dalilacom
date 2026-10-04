package com.dalilacom.app.ui.merchantmode

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Column
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
        Text("تأكيد حسم", style = MaterialTheme.typography.headlineSmall, color = MaterialTheme.colorScheme.primary)
        Spacer(Modifier.height(16.dp))

        when (state.phase) {
            RedeemPhase.INPUT -> {
                Button(onClick = ::launchScan, modifier = Modifier.fillMaxWidth()) { Text("امسح الكود 📷") }
                Spacer(Modifier.height(12.dp))
                Text("أو دخّل بيانات العضوية يدويًا", style = MaterialTheme.typography.bodySmall)
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = state.memberNumber,
                    onValueChange = viewModel::onMemberNumberChange,
                    label = { Text("رقم العضوية") },
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = state.code,
                    onValueChange = viewModel::onCodeChange,
                    label = { Text("الكود (6 أرقام)") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(16.dp))
                if (state.isLoading) {
                    CircularProgressIndicator()
                } else {
                    Button(onClick = viewModel::verify, modifier = Modifier.fillMaxWidth()) { Text("تحقق") }
                }
            }

            RedeemPhase.VERIFIED -> {
                Text("العضو: ${state.memberName}", style = MaterialTheme.typography.titleMedium)
                Text("نسبة الحسم: ${state.discountPercent}%", color = MaterialTheme.colorScheme.primary)
                Spacer(Modifier.height(16.dp))
                OutlinedTextField(
                    value = state.billAmountText,
                    onValueChange = viewModel::onBillAmountChange,
                    label = { Text("قيمة الفاتورة") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(16.dp))
                if (state.isLoading) {
                    CircularProgressIndicator()
                } else {
                    Button(onClick = viewModel::confirmRedeem, modifier = Modifier.fillMaxWidth()) { Text("تأكيد الحسم") }
                    Spacer(Modifier.height(8.dp))
                    OutlinedButton(onClick = viewModel::reset, modifier = Modifier.fillMaxWidth()) { Text("إلغاء") }
                }
            }

            RedeemPhase.DONE -> {
                val receipt = state.receipt!!
                Text("تم تأكيد الحسم ✓", style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.primary)
                Spacer(Modifier.height(12.dp))
                Text("رقم العملية: ${receipt.transactionRef}")
                Text("قيمة الفاتورة: ${formatCents(receipt.billAmountCents)}")
                Text("نسبة الحسم: ${receipt.discountPercent}%")
                Text("قيمة الحسم: ${formatCents(receipt.discountAmountCents)}")
                Text("المبلغ النهائي: ${formatCents(receipt.finalAmountCents)}", style = MaterialTheme.typography.titleMedium)
                Spacer(Modifier.height(20.dp))
                OutlinedButton(onClick = { onExportReceipt(receipt.transactionRef) }, modifier = Modifier.fillMaxWidth()) { Text("📄 تصدير الإيصال PDF") }
                Spacer(Modifier.height(8.dp))
                Button(onClick = viewModel::reset, modifier = Modifier.fillMaxWidth()) { Text("عملية جديدة") }
            }
        }

        state.error?.let {
            Spacer(Modifier.height(12.dp))
            Text(it, color = MaterialTheme.colorScheme.error)
        }
    }
}
