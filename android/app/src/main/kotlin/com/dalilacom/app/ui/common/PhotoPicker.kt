package com.dalilacom.app.ui.common

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import java.io.File

/** Takes a photo with the camera or picks one from the gallery; either way [onPicked] gets the picture's Uri. */
class PhotoPicker(val openCamera: () -> Unit, val openGallery: () -> Unit)

@Composable
fun rememberPhotoPicker(onPicked: (Uri) -> Unit): PhotoPicker {
    val context = LocalContext.current
    val target = remember { arrayOfNulls<Uri>(1) }
    val camera = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { ok -> if (ok) target[0]?.let(onPicked) }
    val gallery = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri -> if (uri != null) onPicked(uri) }
    fun shoot() {
        val dir = File(context.cacheDir, "photos").apply { mkdirs() }
        val file = File.createTempFile("shot", ".jpg", dir)
        val uri = FileProvider.getUriForFile(context, context.packageName + ".fileprovider", file)
        target[0] = uri
        camera.launch(uri)
    }
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted -> if (granted) shoot() }
    return PhotoPicker(
        openCamera = {
            if (ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) shoot()
            else permission.launch(Manifest.permission.CAMERA)
        },
        openGallery = { gallery.launch("image/*") },
    )
}
