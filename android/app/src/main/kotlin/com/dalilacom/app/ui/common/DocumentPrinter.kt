package com.dalilacom.app.ui.common

import com.dalilacom.app.R
import com.dalilacom.app.ui.i18n.AppStrings
import android.content.Context
import android.print.PrintAttributes
import android.print.PrintManager
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import com.dalilacom.app.data.network.BASE_URL
import com.dalilacom.app.data.store.TokenStore

/**
 * Invoices, receipts and the other printable documents are built by the server (with the issuing
 * account's name and photo). Here the page is loaded with the user's token in a WebView — which shapes
 * Arabic correctly — and handed to the system print dialog, where "Save as PDF" produces the file.
 */
object DocumentPrinter {
    // The print adapter needs the WebView to stay alive until the user finishes with the dialog.
    private var keepAlive: WebView? = null

    /** [path] like "/invoices/order/<id>"; [jobName] becomes the saved PDF's file name. Needs an Activity context. */
    suspend fun export(context: Context, tokenStore: TokenStore, path: String, jobName: String) {
        val token = tokenStore.getToken()
        if (token == null) {
            Toast.makeText(context, AppStrings.get(R.string.s_eecf189f), Toast.LENGTH_SHORT).show()
            return
        }
        val webView = WebView(context)
        keepAlive = webView
        webView.webViewClient = object : WebViewClient() {
            private var failed = false

            override fun onReceivedHttpError(view: WebView, request: WebResourceRequest, errorResponse: WebResourceResponse) {
                if (request.isForMainFrame) failed = true
            }

            override fun onPageFinished(view: WebView, url: String?) {
                if (failed) {
                    Toast.makeText(context, AppStrings.get(R.string.s_92dc656f), Toast.LENGTH_SHORT).show()
                    keepAlive = null
                    return
                }
                val manager = context.getSystemService(Context.PRINT_SERVICE) as PrintManager
                manager.print(jobName, view.createPrintDocumentAdapter(jobName), PrintAttributes.Builder().setMediaSize(PrintAttributes.MediaSize.ISO_A4).build())
            }
        }
        // ?lang= makes the printed document come out in the language of the app
        val separator = if (path.contains("?")) "&" else "?"
        webView.loadUrl(BASE_URL.trimEnd('/') + "/" + path.trimStart('/') + "${separator}lang=${AppStrings.language}", mapOf("Authorization" to "Bearer $token"))
    }
}
