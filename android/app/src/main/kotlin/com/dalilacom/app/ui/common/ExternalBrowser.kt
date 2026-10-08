package com.dalilacom.app.ui.common

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri

/**
 * Opens a web page in the phone's own browser. A plain ACTION_VIEW on a facebook.com link is taken over by the Facebook
 * app when it is installed, and its in-app page fails on the Page-linking dialog ("an error occurred while loading the
 * page"). Naming the default browser's package keeps the dialog in the browser, which then comes back to the app.
 */
object ExternalBrowser {
    fun open(context: Context, url: String) {
        val uri = Uri.parse(url)
        val probe = Intent(Intent.ACTION_VIEW, Uri.parse("https://example.com")).addCategory(Intent.CATEGORY_BROWSABLE)
        val browser = runCatching { context.packageManager.resolveActivity(probe, PackageManager.MATCH_DEFAULT_ONLY)?.activityInfo?.packageName }.getOrNull()
        val intent = Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        // "android" is the system chooser (no default browser set): leave the intent open then
        if (browser != null && browser != "android") intent.setPackage(browser)
        runCatching { context.startActivity(intent) }.onFailure {
            runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
        }
    }
}
