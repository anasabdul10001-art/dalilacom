package com.dalilacom.app.ui.common

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.dalilacom.app.R
import com.dalilacom.app.data.network.absoluteUrl

/** The essential pages (about, privacy, terms, returns, shipping), opened in the browser: they are the same pages the website shows. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun LegalLinks(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val items = listOf(
        R.string.legal_about to "/about.html",
        R.string.legal_impressum to "/impressum.html",
        R.string.legal_privacy to "/privacy.html",
        R.string.legal_terms to "/terms.html",
        R.string.legal_refund to "/refund.html",
        R.string.legal_shipping to "/shipping.html",
    )
    FlowRow(
        modifier.fillMaxWidth().padding(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(14.dp, Alignment.CenterHorizontally),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        items.forEach { (label, path) ->
            Text(
                stringResource(label), fontSize = 12.5.sp, color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.clickable { ExternalBrowser.open(context, absoluteUrl(path)) }.padding(vertical = 6.dp),
            )
        }
    }
}
