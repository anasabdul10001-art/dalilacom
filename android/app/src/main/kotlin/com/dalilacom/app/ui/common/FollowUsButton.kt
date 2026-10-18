package com.dalilacom.app.ui.common

import androidx.compose.foundation.background
import kotlinx.coroutines.delay
import androidx.compose.runtime.setValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.Icons
import androidx.compose.animation.shrinkHorizontally
import androidx.compose.animation.fadeOut
import androidx.compose.animation.fadeIn
import androidx.compose.animation.expandHorizontally
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.offset
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
import androidx.compose.ui.draw.shadow
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

/** Red discs with a white sign; the Google Play sign keeps its own four colours, so it sits on white (people know the store by it). */
private fun iconBackground(platform: String): androidx.compose.ui.graphics.Brush =
    androidx.compose.ui.graphics.SolidColor(if (platform == "googleplay") Color.White else Color(0xFFBA2A34))

private fun iconOf(platform: String): Int? = when (platform) {
    "facebook" -> R.drawable.ic_facebook_f
    "instagram" -> R.drawable.ic_social_instagram
    "youtube" -> R.drawable.ic_social_youtube
    "tiktok" -> R.drawable.ic_social_tiktok
    "googleplay" -> R.drawable.ic_social_googleplay
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
                    Modifier.size(40.dp).clip(CircleShape).background(iconBackground(link.platform)).clickable { ExternalBrowser.open(context, link.url) },
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

/** Open the first time the bar is drawn after the app starts; it is folded to its arrow afterwards (kept here so a new screen does not open it again). */
private object SocialDockState { var shown = false }

/**
 * A slim floating bar in the top corner: our pages and the Play page (the owner switches each on in the admin panel). It stays open for 5
 * seconds, then folds to a small arrow on the edge; the arrow opens it again (again for 5 seconds).
 */
@Composable
fun BoxScope.SocialDock() {
    val context = LocalContext.current
    val links by SocialLinks.links.collectAsState()
    val shown = links.filter { iconOf(it.platform) != null }
    if (shown.isEmpty()) return
    var open by remember { mutableStateOf(!SocialDockState.shown) }
    SocialDockState.shown = true
    LaunchedEffect(open) {
        if (open) {
            delay(5000)
            open = false
        }
    }
    val startShape = androidx.compose.foundation.shape.RoundedCornerShape(topStart = 16.dp, bottomStart = 16.dp)
    Row(Modifier.align(Alignment.TopEnd).padding(top = 150.dp), verticalAlignment = Alignment.Top) {
        AnimatedVisibility(visible = open, enter = fadeIn() + expandHorizontally(), exit = fadeOut() + shrinkHorizontally()) {
            Column(
                Modifier.shadow(6.dp, startShape).background(MaterialTheme.colorScheme.surface, startShape).padding(horizontal = 6.dp, vertical = 9.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                shown.forEach { link ->
                    Box(
                        Modifier.size(36.dp).clip(CircleShape).background(iconBackground(link.platform)).clickable { ExternalBrowser.open(context, link.url) },
                        contentAlignment = Alignment.Center,
                    ) {
                        androidx.compose.foundation.Image(painterResource(iconOf(link.platform)!!), contentDescription = link.platform, modifier = Modifier.size(20.dp))
                    }
                }
            }
        }
        // the small arrow that stays: it points into the screen when folded (pull out) and to the edge when open (push away)
        val tabShape = if (open) androidx.compose.ui.graphics.RectangleShape else startShape
        Box(
            Modifier.size(width = 24.dp, height = 46.dp).shadow(4.dp, tabShape).clip(tabShape).background(Color(0xFFBA2A34)).clickable { open = !open },
            contentAlignment = Alignment.Center,
        ) {
            androidx.compose.material3.Icon(
                if (open) Icons.AutoMirrored.Filled.KeyboardArrowRight else Icons.AutoMirrored.Filled.KeyboardArrowLeft,
                contentDescription = stringResource(R.string.follow_us), tint = Color.White, modifier = Modifier.size(22.dp),
            )
        }
    }
}
