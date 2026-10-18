package com.dalilacom.app.ui.common

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import com.dalilacom.app.R
import com.dalilacom.app.data.network.absoluteUrl
import com.dalilacom.app.data.repository.StoreRepository

private const val PLAY_PACKAGE = "com.android.vending"
private const val PREFS = "update_prompt"
private const val KEY_DISMISSED = "dismissed_version"

/** "1.10.2" is newer than "1.9": compared number by number. */
internal fun isNewerVersion(latest: String, installed: String): Boolean {
    val a = latest.split('.').map { it.toIntOrNull() ?: 0 }
    val b = installed.split('.').map { it.toIntOrNull() ?: 0 }
    for (i in 0 until maxOf(a.size, b.size)) {
        val x = a.getOrElse(i) { 0 }
        val y = b.getOrElse(i) { 0 }
        if (x != y) return x > y
    }
    return false
}

private fun installedVersion(context: Context): String =
    runCatching { context.packageManager.getPackageInfo(context.packageName, 0).versionName }.getOrNull().orEmpty()

private fun installedFromPlay(context: Context): Boolean {
    val pm = context.packageManager
    val installer = runCatching {
        if (Build.VERSION.SDK_INT >= 30) pm.getInstallSourceInfo(context.packageName).installingPackageName
        else @Suppress("DEPRECATION") pm.getInstallerPackageName(context.packageName)
    }.getOrNull()
    return installer == PLAY_PACKAGE
}

/** Whoever got the app from Google Play is sent to its page there; whoever downloaded the file is sent to the download page. */
private fun openUpdate(context: Context, playUrl: String?) {
    if (installedFromPlay(context)) {
        val market = Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=${context.packageName}")).setPackage(PLAY_PACKAGE).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        if (runCatching { context.startActivity(market) }.isSuccess) return
        ExternalBrowser.open(context, playUrl ?: "https://play.google.com/store/apps/details?id=${context.packageName}")
    } else {
        ExternalBrowser.open(context, absoluteUrl("/download.html"))
    }
}

/**
 * The "a new version is out" message: asked once when the home screen opens, shown only when the owner switched it on (admin panel) and
 * this phone has an older version. "Later" hides it until a still newer version comes.
 */
@Composable
fun UpdatePrompt(repository: StoreRepository) {
    val context = LocalContext.current
    var latest by remember { mutableStateOf<String?>(null) }
    var playUrl by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(Unit) {
        val info = repository.appUpdate() ?: return@LaunchedEffect
        val version = info.version ?: return@LaunchedEffect
        if (!info.notify || !isNewerVersion(version, installedVersion(context))) return@LaunchedEffect
        val dismissed = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_DISMISSED, null)
        if (dismissed == version) return@LaunchedEffect
        playUrl = info.playUrl
        latest = version
    }
    val version = latest ?: return
    AlertDialog(
        onDismissRequest = {
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY_DISMISSED, version).apply()
            latest = null
        },
        title = { Text(stringResource(R.string.update_title)) },
        text = { Text(stringResource(R.string.update_text, version)) },
        confirmButton = {
            TextButton(onClick = { openUpdate(context, playUrl); latest = null }) { Text(stringResource(R.string.update_now)) }
        },
        dismissButton = {
            TextButton(onClick = {
                context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY_DISMISSED, version).apply()
                latest = null
            }) { Text(stringResource(R.string.update_later)) }
        },
    )
}
