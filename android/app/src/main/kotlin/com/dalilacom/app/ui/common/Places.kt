package com.dalilacom.app.ui.common

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import coil.compose.AsyncImage
import com.dalilacom.app.data.network.absoluteUrl
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.dalilacom.app.R
import com.dalilacom.app.data.network.OpenStatusDto
import com.dalilacom.app.ui.i18n.AppStrings
import com.dalilacom.app.ui.theme.DeepRed
import com.dalilacom.app.ui.theme.PrimaryRed

/** Week as people read it here: Saturday first. Keys match the backend's day keys. */
val DAY_ORDER = listOf("sat", "sun", "mon", "tue", "wed", "thu", "fri")
/** Day names in the language on screen (read at use time). */
val DAY_LABEL: Map<String, String>
    get() = mapOf(
        "sun" to AppStrings.get(R.string.day_sun), "mon" to AppStrings.get(R.string.day_mon),
        "tue" to AppStrings.get(R.string.day_tue), "wed" to AppStrings.get(R.string.day_wed),
        "thu" to AppStrings.get(R.string.day_thu), "fri" to AppStrings.get(R.string.day_fri),
        "sat" to AppStrings.get(R.string.day_sat),
    )

/** 612 s -> "10 دقائق" / "10 min" */
fun formatDuration(seconds: Int): String {
    val minutes = maxOf(1, (seconds + 30) / 60)
    if (minutes >= 60) return AppStrings.get(R.string.dur_hm, minutes / 60, minutes % 60)
    return when {
        minutes == 1 -> AppStrings.get(R.string.dur_min1)
        minutes == 2 -> AppStrings.get(R.string.dur_min2)
        minutes <= 10 -> AppStrings.get(R.string.dur_min3to10, minutes)
        else -> AppStrings.get(R.string.dur_min, minutes)
    }
}

fun formatDistance(meters: Int): String =
    if (meters < 1000) AppStrings.get(R.string.unit_m, meters) else AppStrings.get(R.string.unit_km, meters / 1000.0)

/** "22:00" -> "10:00 م" / "10:00 PM" */
fun formatClock(hhmm: String): String {
    val hour = hhmm.take(2).toIntOrNull() ?: return hhmm
    val h12 = if (hour % 12 == 0) 12 else hour % 12
    return "$h12:${hhmm.drop(3).take(2)} ${AppStrings.get(if (hour >= 12) R.string.time_pm else R.string.time_am)}"
}

/** The one-line "open / closed" text, or null when the merchant hasn't set hours. */
fun openStatusText(status: OpenStatusDto?): Pair<String, Boolean>? {
    if (status == null || !status.hasHours) return null
    if (status.isOpen) return AppStrings.get(R.string.hours_open_until, status.closesAt?.let(::formatClock).orEmpty()) to true
    val day = when (status.opensDay) {
        "today" -> AppStrings.get(R.string.hours_today)
        "tomorrow" -> AppStrings.get(R.string.hours_tomorrow)
        else -> DAY_LABEL[status.opensDay].orEmpty()
    }
    return (if (status.opensAt != null) AppStrings.get(R.string.hours_opens_at, day, formatClock(status.opensAt)) else AppStrings.get(R.string.hours_closed)) to false
}

private val OpenGreen = Color(0xFF1E7E34)
private val OpenGreenBg = Color(0xFFE6F4EA)
private val ClosedBg = Color(0xFFFDECEA)

@Composable
fun OpenBadge(status: OpenStatusDto?, modifier: Modifier = Modifier) {
    val (text, open) = openStatusText(status) ?: return
    Surface(shape = RoundedCornerShape(10.dp), color = if (open) OpenGreenBg else ClosedBg, modifier = modifier) {
        Text(
            text,
            style = MaterialTheme.typography.labelMedium,
            color = if (open) OpenGreen else Color(0xFFB71C1C),
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp),
        )
    }
}

/** The account's profile photo, or a brand-gradient circle with its first letter while there is none. */
@Composable
fun Avatar(name: String, size: Dp = 48.dp, modifier: Modifier = Modifier, imageUrl: String? = null) {
    Box(
        modifier = modifier.size(size).clip(CircleShape).background(Brush.linearGradient(listOf(DeepRed, PrimaryRed))),
        contentAlignment = Alignment.Center,
    ) {
        Text(name.take(1), color = Color.White, fontSize = (size.value * 0.42f).sp, fontWeight = FontWeight.Bold)
        if (imageUrl != null) {
            AsyncImage(model = absoluteUrl(imageUrl), contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.matchParentSize())
        }
    }
}
