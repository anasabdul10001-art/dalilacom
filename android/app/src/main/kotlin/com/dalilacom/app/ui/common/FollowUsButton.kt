package com.dalilacom.app.ui.common

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.dalilacom.app.R
import com.dalilacom.app.data.network.SocialLinkDto
import kotlinx.coroutines.flow.MutableStateFlow

const val FACEBOOK_URL = "https://www.facebook.com/Dalilacomsy"

/** Our social media pages the owner switched on in the admin panel; the AppContainer fills it once at start (Facebook shows until then). */
object SocialLinks {
    val links = MutableStateFlow(listOf(SocialLinkDto("facebook", FACEBOOK_URL)))
}

private fun iconOf(platform: String): Int? = when (platform) {
    "facebook" -> R.drawable.ic_facebook_f
    "instagram" -> R.drawable.ic_social_instagram
    "youtube" -> R.drawable.ic_social_youtube
    "tiktok" -> R.drawable.ic_social_tiktok
    else -> null
}

/** Small round icons to our pages; [showNote] adds the line that other pages with the name are not ours. */
@Composable
fun FollowUsButton(modifier: Modifier = Modifier, showNote: Boolean = true) {
    val context = LocalContext.current
    val links by SocialLinks.links.collectAsState()
    val shown = links.filter { iconOf(it.platform) != null }
    if (shown.isEmpty()) return
    Column(modifier, horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(stringResource(R.string.follow_us), color = MaterialTheme.colorScheme.onSurfaceVariant, fontWeight = FontWeight.Bold, fontSize = 13.sp)
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
            shown.forEach { link ->
                Box(
                    Modifier.size(40.dp).clip(CircleShape).background(Color(0xFFBA2A34)).clickable { ExternalBrowser.open(context, link.url) },
                    contentAlignment = Alignment.Center,
                ) {
                    androidx.compose.foundation.Image(painterResource(iconOf(link.platform)!!), contentDescription = link.platform, modifier = Modifier.size(22.dp))
                }
            }
        }
        if (showNote) Text(
            stringResource(R.string.follow_official), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, lineHeight = 17.sp,
            textAlign = TextAlign.Center, modifier = Modifier.padding(horizontal = 24.dp),
        )
    }
}
