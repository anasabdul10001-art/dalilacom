package com.dalilacom.app.ui.common

import com.dalilacom.app.R
import com.journeyapps.barcodescanner.CaptureActivity
import com.journeyapps.barcodescanner.DecoratedBarcodeView
import com.journeyapps.barcodescanner.ScanOptions

/**
 * The code scanner, held upright (portrait) with a square to put the code in; the library's own screen opens sideways.
 */
class PortraitCaptureActivity : CaptureActivity() {
    override fun initializeContent(): DecoratedBarcodeView {
        setContentView(R.layout.activity_scan)
        return findViewById<DecoratedBarcodeView>(com.google.zxing.client.android.R.id.zxing_barcode_scanner).also {
            it.setStatusText(getString(R.string.scan_hint))
        }
    }
}

/** How every "scan a code" button opens the camera: upright, with the square. */
fun qrScanOptions(): ScanOptions = ScanOptions()
    .setCaptureActivity(PortraitCaptureActivity::class.java)
    .setBeepEnabled(true)
    .setOrientationLocked(false)
