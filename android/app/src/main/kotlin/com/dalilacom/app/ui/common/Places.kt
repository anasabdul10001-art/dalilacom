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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.dalilacom.app.data.network.OpenStatusDto
import com.dalilacom.app.ui.theme.DeepRed
import com.dalilacom.app.ui.theme.PrimaryRed

/** Week as people read it here: Saturday first. Keys match the backend's day keys. */
val DAY_ORDER = listOf("sat", "sun", "mon", "tue", "wed", "thu", "fri")
val DAY_LABEL = mapOf(
    "sun" to "الأحد", "mon" to "الإثنين", "tue" to "الثلاثاء", "wed" to "الأربعاء",
    "thu" to "الخميس", "fri" to "الجمعة", "sat" to "السبت",
)

/** 612 s -> "10 دقائق" */
fun formatDuration(seconds: Int): String {
    val minutes = maxOf(1, (seconds + 30) / 60)
    if (minutes >= 60) return "${minutes / 60} س ${minutes % 60} د"
    return when {
        minutes == 1 -> "دقيقة"
        minutes == 2 -> "دقيقتان"
        minutes <= 10 -> "$minutes دقائق"
        else -> "$minutes دقيقة"
    }
}

fun formatDistance(meters: Int): String = if (meters < 1000) "$meters م" else "%.1f كم".format(meters / 1000.0)

/** "22:00" -> "10:00 م" */
fun formatClock(hhmm: String): String {
    val hour = hhmm.take(2).toIntOrNull() ?: return hhmm
    val h12 = if (hour % 12 == 0) 12 else hour % 12
    return "$h12:${hhmm.drop(3).take(2)} ${if (hour >= 12) "م" else "ص"}"
}

/** The one-line "open / closed" text, or null when the merchant hasn't set hours. */
fun openStatusText(status: OpenStatusDto?): Pair<String, Boolean>? {
    if (status == null || !status.hasHours) return null
    if (status.isOpen) return "مفتوح · يسكّر ${status.closesAt?.let(::formatClock).orEmpty()}" to true
    val day = when (status.opensDay) {
        "today" -> "اليوم"
        "tomorrow" -> "بكرا"
        else -> DAY_LABEL[status.opensDay].orEmpty()
    }
    return (if (status.opensAt != null) "مغلق · يفتح $day ${formatClock(status.opensAt)}" else "مغلق") to false
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

/** Brand-gradient circle with the merchant's first letter. */
@Composable
fun Avatar(name: String, size: Dp = 48.dp, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier.size(size).clip(CircleShape).background(Brush.linearGradient(listOf(DeepRed, PrimaryRed))),
        contentAlignment = Alignment.Center,
    ) {
        Text(name.take(1), color = Color.White, fontSize = (size.value * 0.42f).sp, fontWeight = FontWeight.Bold)
    }
}
