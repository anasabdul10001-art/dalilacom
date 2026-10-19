package com.dalilacom.app.ui.store

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Rect
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.dalilacom.app.R
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream

/** The picture of an ad booking, already cut to the exact size: the bytes to send and the preview as the store will show it. */
class AdPicture(val uri: Uri, val whole: Boolean, val bytes: ByteArray, val preview: Bitmap)

/** The photo at the gallery [uri] brought to exactly [w] x [h]: "fill" cuts the edges and keeps the middle; "whole" keeps all of it over a soft copy of itself. */
fun fitAdPhoto(context: Context, uri: Uri, w: Int, h: Int, whole: Boolean): AdPicture? = runCatching {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    context.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
    var sample = 1
    while (maxOf(bounds.outWidth, bounds.outHeight) / sample > maxOf(w, h) * 2) sample *= 2
    val src = context.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample }) } ?: return@runCatching null
    val out = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(out)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)
    val cover = maxOf(w.toFloat() / src.width, h.toFloat() / src.height)
    val coverRect = Rect(((w - src.width * cover) / 2).toInt(), ((h - src.height * cover) / 2).toInt(), ((w + src.width * cover) / 2).toInt(), ((h + src.height * cover) / 2).toInt())
    if (whole) {
        // a soft copy fills the edges: a tiny version blown up is a cheap blur, and no empty bars show
        val tiny = Bitmap.createScaledBitmap(src, 24, (24f * src.height / src.width).toInt().coerceAtLeast(2), true)
        canvas.drawBitmap(tiny, null, coverRect, paint)
        val fit = minOf(w.toFloat() / src.width, h.toFloat() / src.height)
        canvas.drawBitmap(src, null, Rect(((w - src.width * fit) / 2).toInt(), ((h - src.height * fit) / 2).toInt(), ((w + src.width * fit) / 2).toInt(), ((h + src.height * fit) / 2).toInt()), paint)
    } else {
        canvas.drawBitmap(src, null, coverRect, paint)
    }
    val bytes = ByteArrayOutputStream().also { out.compress(Bitmap.CompressFormat.JPEG, 86, it) }.toByteArray()
    AdPicture(uri, whole, bytes, out)
}.getOrNull()

/** The picture part of a booking: the size written, the picker, the preview in the shape the store shows, fill/whole, remove. */
@Composable
fun AdPicturePicker(width: Int, height: Int, picture: AdPicture?, onPicture: (AdPicture?) -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var failed by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    fun build(uri: Uri, whole: Boolean) {
        scope.launch {
            busy = true
            val made = withContext(Dispatchers.Default) { fitAdPhoto(context, uri, width, height, whole) }
            busy = false
            failed = made == null
            if (made != null) onPicture(made)
        }
    }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri -> if (uri != null) build(uri, false) }
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(stringResource(R.string.ads_img_label), fontWeight = FontWeight.Bold)
        Text(stringResource(R.string.ads_img_size, width, height) + " " + stringResource(R.string.ads_img_auto), fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        OutlinedButton(onClick = { picker.launch("image/*") }, shape = RoundedCornerShape(8.dp), modifier = Modifier.fillMaxWidth()) {
            Text(if (picture == null) stringResource(R.string.ads_img_pick) else stringResource(R.string.ads_img_change))
        }
        if (failed) Text(stringResource(R.string.ads_img_read_fail), color = MaterialTheme.colorScheme.error, fontSize = 12.sp)
        if (picture != null) {
            Image(
                bitmap = picture.preview.asImageBitmap(), contentDescription = null, contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxWidth().aspectRatio(width.toFloat() / height).clip(RoundedCornerShape(8.dp)),
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChip(!picture.whole, { if (picture.whole) build(picture.uri, false) }, label = { Text(stringResource(R.string.ads_img_fill)) }, enabled = !busy)
                FilterChip(picture.whole, { if (!picture.whole) build(picture.uri, true) }, label = { Text(stringResource(R.string.ads_img_whole)) }, enabled = !busy)
                FilterChip(false, { onPicture(null) }, label = { Text("✕ " + stringResource(R.string.ads_img_remove)) })
            }
        }
    }
}
