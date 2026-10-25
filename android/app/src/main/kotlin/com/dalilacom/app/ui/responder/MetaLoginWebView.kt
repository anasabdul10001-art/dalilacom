package com.dalilacom.app.ui.responder

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.WebSettings
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.TextButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.dalilacom.app.MainActivity
import com.dalilacom.app.data.network.BASE_URL

/**
 * The Facebook Page-linking dialog, shown inside the app. Opened through the phone's browser, a facebook.com link can be
 * taken over by the Facebook app, whose in-app page fails on this dialog; here nothing outside the app can step in.
 * The server's last page sends the browser on to dalilacom://responder/meta — that is caught here and handed to
 * MainActivity, exactly as when the browser used to return, so the rest of the flow is unchanged.
 */
@SuppressLint("SetJavaScriptEnabled")
@Composable
fun MetaLoginWebView(url: String, onClose: () -> Unit) {
    val context = LocalContext.current
    val appHost = Uri.parse(BASE_URL).host.orEmpty()
    val webView = remember {
        WebView(context).apply {
            layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.allowFileAccess = false
            settings.allowContentAccess = false
            settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            settings.javaScriptCanOpenWindowsAutomatically = false
            settings.setSupportMultipleWindows(false)
            settings.safeBrowsingEnabled = true
            // an embedded browser announces itself with "; wv" — sign-in pages treat that differently, so look like the browser
            settings.userAgentString = settings.userAgentString.replace("; wv", "")
            CookieManager.getInstance().setAcceptCookie(true)
            CookieManager.getInstance().setAcceptThirdPartyCookies(this, true)
            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                    val target = request.url
                    if (isMetaReturn(target)) {
                        if (!request.isForMainFrame) return true
                        handBack(context, target)
                        onClose()
                        return true
                    }
                    return !isAllowedMetaPage(target, appHost)
                }
            }
            if (isAllowedMetaPage(Uri.parse(url), appHost)) loadUrl(url)
        }
    }

    DisposableEffect(webView) {
        onDispose {
            webView.stopLoading()
            webView.loadUrl("about:blank")
            webView.removeAllViews()
            webView.destroy()
        }
    }

    BackHandler { if (webView.canGoBack()) webView.goBack() else onClose() }

    Dialog(onDismissRequest = onClose, properties = DialogProperties(usePlatformDefaultWidth = false, dismissOnBackPress = false)) {
        Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
            Column(Modifier.fillMaxSize()) {
                TextButton(onClick = onClose, modifier = Modifier.padding(horizontal = 8.dp)) { Text("✕") }
                AndroidView(factory = { webView }, modifier = Modifier.fillMaxWidth().weight(1f))
            }
        }
    }
}

private fun isMetaReturn(uri: Uri): Boolean =
    uri.scheme == "dalilacom" && uri.host == "responder" && uri.path == "/meta"

private fun isAllowedMetaPage(uri: Uri, appHost: String): Boolean {
    if (uri.scheme != "https" || uri.userInfo != null || (uri.port != -1 && uri.port != 443)) return false
    val host = uri.host?.lowercase() ?: return false
    return host == appHost.lowercase() || host == "facebook.com" || host.endsWith(".facebook.com")
}

private fun handBack(context: Context, uri: Uri) {
    if (!isMetaReturn(uri)) return
    runCatching {
        context.startActivity(Intent(Intent.ACTION_VIEW, uri, context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP))
    }
}
