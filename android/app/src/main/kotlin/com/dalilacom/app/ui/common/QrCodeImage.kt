package com.dalilacom.app.ui.common

import android.graphics.Bitmap
import android.graphics.Color as AndroidColor
import androidx.compose.foundation.Image
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import com.google.zxing.BarcodeFormat
import com.google.zxing.qrcode.QRCodeWriter

/** Renders `content` as a real, camera-scannable QR bitmap (used for the rotating membership code). */
@Composable
fun QrCodeImage(content: String, sizePx: Int = 512, modifier: Modifier = Modifier) {
    val bitmap = remember(content) { generateQrBitmap(content, sizePx) }
    bitmap?.let {
        Image(bitmap = it.asImageBitmap(), contentDescription = "QR Code", modifier = modifier)
    }
}

private fun generateQrBitmap(content: String, sizePx: Int): Bitmap? = runCatching {
    val matrix = QRCodeWriter().encode(content, BarcodeFormat.QR_CODE, sizePx, sizePx)
    val bitmap = Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.RGB_565)
    for (x in 0 until sizePx) {
        for (y in 0 until sizePx) {
            bitmap.setPixel(x, y, if (matrix[x, y]) AndroidColor.BLACK else AndroidColor.WHITE)
        }
    }
    bitmap
}.getOrNull()
