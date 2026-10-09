package com.dalilacom.app.ui.common

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.dalilacom.app.R
import com.dalilacom.app.data.network.ReviewEntryDto
import com.dalilacom.app.data.network.ReviewSummaryDto

private val Gold = Color(0xFFF0A30A)

fun starsText(value: Double): String {
    val n = Math.round(value).toInt().coerceIn(0, 5)
    return "★".repeat(n) + "☆".repeat(5 - n)
}

/** What a review window is about: a product, a shop or a customer, and which one. */
data class ReviewTarget(val kind: String, val id: String, val title: String, val stars: Int = 0, val comment: String = "")

/** The big average, the bars (how many gave 5, 4, ...) and the number of ratings. */
@Composable
fun ReviewSummaryView(summary: ReviewSummaryDto) {
    if (summary.count == 0) {
        Text(stringResource(R.string.rv_none), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp)
        return
    }
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(18.dp)) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text("%.1f".format(java.util.Locale.US, summary.average), fontSize = 40.sp, fontWeight = FontWeight.ExtraBold)
            Text(starsText(summary.average), color = Gold, fontSize = 15.sp)
            Text(stringResource(R.string.rv_count, summary.count), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            for (k in 5 downTo 1) {
                val n = summary.distribution[k.toString()] ?: 0
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("$k★", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.width(26.dp))
                    Box(Modifier.weight(1f).height(8.dp).background(MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(4.dp))) {
                        Box(Modifier.fillMaxWidth(n.toFloat() / summary.count).height(8.dp).background(Gold, RoundedCornerShape(4.dp)))
                    }
                    Text("$n", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.width(26.dp), textAlign = androidx.compose.ui.text.style.TextAlign.End)
                }
            }
        }
    }
}

@Composable
fun ReviewListView(items: List<ReviewEntryDto>, byShop: Boolean = false) {
    Column {
        items.forEach { r ->
            Column(Modifier.fillMaxWidth().padding(vertical = 10.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(starsText(r.stars.toDouble()), color = Gold, fontSize = 13.sp)
                    Text(if (byShop) r.shop else r.name, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                    if (r.verified) Text("✓ " + stringResource(R.string.rv_verified), color = Color(0xFF1E8A3A), fontSize = 11.sp, fontWeight = FontWeight.Bold)
                    Text(r.createdAt.take(10), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp)
                }
                r.comment?.takeIf { it.isNotBlank() }?.let { Text(it, modifier = Modifier.padding(top = 4.dp), fontSize = 14.sp, lineHeight = 21.sp) }
            }
        }
    }
}

/** The note or the button under a summary: write when allowed, otherwise say who may. */
@Composable
fun ReviewActionView(canReview: Boolean, hasMine: Boolean, onClick: () -> Unit) {
    if (!canReview) {
        Text(stringResource(R.string.rv_need_buy), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.5.sp, modifier = Modifier.padding(vertical = 6.dp))
        return
    }
    OutlinedButton(onClick = onClick, shape = RoundedCornerShape(6.dp), modifier = Modifier.padding(vertical = 6.dp)) {
        Text("✍️  " + stringResource(if (hasMine) R.string.rv_edit else R.string.rv_write))
    }
}

/** The little window: choose the stars, write a few words, send. */
@Composable
fun ReviewDialog(target: ReviewTarget, busy: Boolean, error: String?, onSend: (Int, String) -> Unit, onDismiss: () -> Unit) {
    var stars by remember(target) { mutableStateOf(target.stars) }
    var comment by remember(target) { mutableStateOf(target.comment) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(target.title, maxLines = 2) },
        text = {
            Column {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) {
                    for (n in 1..5) Text("★", fontSize = 42.sp, color = if (n <= stars) Gold else MaterialTheme.colorScheme.outlineVariant, modifier = Modifier.clickable { stars = n }.padding(horizontal = 3.dp))
                }
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(value = comment, onValueChange = { comment = it.take(1000) }, placeholder = { Text(stringResource(R.string.rv_placeholder)) }, minLines = 3, modifier = Modifier.fillMaxWidth())
                error?.let { Text(it, color = MaterialTheme.colorScheme.error, fontSize = 12.sp, modifier = Modifier.padding(top = 6.dp)) }
            }
        },
        confirmButton = { TextButton(onClick = { onSend(stars, comment.trim()) }, enabled = stars > 0 && !busy) { Text(stringResource(R.string.rv_send)) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.rv_cancel)) } },
    )
}
