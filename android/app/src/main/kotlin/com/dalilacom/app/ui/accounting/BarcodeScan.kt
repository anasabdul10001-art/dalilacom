package com.dalilacom.app.ui.accounting

import android.Manifest
import android.content.pm.PackageManager
import android.media.AudioManager
import android.media.ToneGenerator
import android.os.SystemClock
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import com.dalilacom.app.R
import com.google.zxing.BarcodeFormat
import com.journeyapps.barcodescanner.BarcodeCallback
import com.journeyapps.barcodescanner.BarcodeResult
import com.journeyapps.barcodescanner.DecoratedBarcodeView
import com.journeyapps.barcodescanner.DefaultDecoderFactory
import kotlinx.coroutines.launch

/** What happened to one scanned code: the line to show, and whether the product was accepted. */
data class ScanReply(val text: String, val ok: Boolean, val close: Boolean = false)

private val PRODUCT_CODES = listOf(
    BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E,
    BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.CODE_93, BarcodeFormat.ITF, BarcodeFormat.CODABAR,
)

/** A code that stays in front of the camera counts once; it counts again after it has been out of sight this long. */
private const val SAME_CODE_GAP_MS = 1500L

/**
 * The camera stays open and the products are passed in front of it one after the other.
 */
@Composable
fun ContinuousScanDialog(onCode: suspend (String) -> ScanReply, onDismiss: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val handle by rememberUpdatedState(onCode)
    val dismiss by rememberUpdatedState(onDismiss)
    var granted by remember { mutableStateOf(ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) }
    var reply by remember { mutableStateOf<ScanReply?>(null) }
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted = it }
    LaunchedEffect(Unit) { if (!granted) permission.launch(Manifest.permission.CAMERA) }
    val tone = remember { runCatching { ToneGenerator(AudioManager.STREAM_MUSIC, 90) }.getOrNull() }
    DisposableEffect(Unit) { onDispose { tone?.release() } }

    AlertDialog(
        onDismissRequest = onDismiss,
        confirmButton = { Button(onClick = onDismiss) { Text(stringResource(R.string.barcode_done)) } },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(stringResource(if (granted) R.string.barcode_camera_hint else R.string.barcode_camera_denied), style = MaterialTheme.typography.bodyMedium)
                if (granted) {
                    val view = remember {
                        var lastCode = ""
                        var lastSeen = 0L
                        var busy = false
                        DecoratedBarcodeView(context).apply {
                            barcodeView.decoderFactory = DefaultDecoderFactory(PRODUCT_CODES)
                            setStatusText("")
                            decodeContinuous(object : BarcodeCallback {
                                override fun barcodeResult(result: BarcodeResult) {
                                    val code = result.text?.trim().orEmpty()
                                    if (code.isEmpty()) return
                                    val now = SystemClock.elapsedRealtime()
                                    val repeated = code == lastCode && now - lastSeen < SAME_CODE_GAP_MS
                                    if (code == lastCode) lastSeen = now
                                    if (repeated || busy) return
                                    lastCode = code
                                    lastSeen = now
                                    busy = true
                                    scope.launch {
                                        try {
                                            val r = handle(code)
                                            reply = r
                                            tone?.startTone(if (r.ok) ToneGenerator.TONE_PROP_BEEP else ToneGenerator.TONE_PROP_NACK, 200)
                                            if (r.close) dismiss()
                                        } finally {
                                            busy = false
                                            lastSeen = SystemClock.elapsedRealtime()
                                        }
                                    }
                                }
                            })
                        }
                    }
                    val lifecycle = LocalLifecycleOwner.current.lifecycle
                    DisposableEffect(view, lifecycle) {
                        val observer = LifecycleEventObserver { _, event ->
                            if (event == Lifecycle.Event.ON_RESUME) view.resume()
                            if (event == Lifecycle.Event.ON_PAUSE) view.pause()
                        }
                        lifecycle.addObserver(observer)
                        view.resume()
                        onDispose { lifecycle.removeObserver(observer); view.pause() }
                    }
                    AndroidView(factory = { view }, modifier = Modifier.fillMaxWidth().height(300.dp))
                }
                reply?.let { Text(it.text, style = MaterialTheme.typography.titleSmall, color = if (it.ok) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error) }
            }
        },
    )
}

/**
 * The "camera" button and the field for a barcode reader plugged into the phone (it types the code and presses Enter).
 * The line under the field says what happened to the last code.
 */
@Composable
fun BarcodeEntryRow(note: ScanReply?, onCamera: () -> Unit, onTyped: (String) -> Unit) {
    var typed by remember { mutableStateOf("") }
    fun submit() {
        val code = typed.trim()
        typed = ""
        if (code.isNotEmpty()) onTyped(code)
    }
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Button(onClick = onCamera, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.barcode_scan_camera)) }
        Row(verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(
                typed, { typed = it },
                label = { Text(stringResource(R.string.barcode_reader_field)) },
                singleLine = true,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                keyboardActions = KeyboardActions(onDone = { submit() }),
                modifier = Modifier.fillMaxWidth().onPreviewKeyEvent { event ->
                    if (event.key != Key.Enter && event.key != Key.NumPadEnter) return@onPreviewKeyEvent false
                    if (event.type == KeyEventType.KeyDown) submit()
                    true // the focus stays here for the next code
                },
            )
        }
        note?.let { Text(it.text, style = MaterialTheme.typography.bodySmall, color = if (it.ok) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error) }
    }
}
