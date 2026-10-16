package com.dalilacom.app.ui.common

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.dalilacom.app.R

const val FACEBOOK_URL = "https://www.facebook.com/Dalilacomsy"

/** The follow button to our one official Facebook page; [showNote] adds the line that other pages with the name are not ours. */
@Composable
fun FollowUsButton(modifier: Modifier = Modifier, showNote: Boolean = true) {
    val context = LocalContext.current
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(
            Modifier
                .background(Color(0xFF1877F2), RoundedCornerShape(50))
                .clickable { ExternalBrowser.open(context, FACEBOOK_URL) }
                .padding(horizontal = 20.dp, vertical = 9.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            androidx.compose.foundation.Image(painterResource(R.drawable.ic_facebook_f), contentDescription = null, modifier = Modifier.size(20.dp))
            Text(stringResource(R.string.follow_facebook), color = Color.White, fontWeight = FontWeight.Bold, fontSize = 14.sp)
        }
        if (showNote) Text(
            stringResource(R.string.follow_official), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, lineHeight = 17.sp,
            textAlign = TextAlign.Center, modifier = Modifier.padding(horizontal = 24.dp),
        )
    }
}
