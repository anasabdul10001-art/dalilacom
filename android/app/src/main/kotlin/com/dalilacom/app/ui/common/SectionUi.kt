package com.dalilacom.app.ui.common

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/* Small pieces for the HR, accounting and auto-responder screens: page-shaped loaders, avatars, chips, metric tiles, steps, folds. */

/** A loader that looks like the page it replaces: a few grey cards that pulse, instead of one lonely spinner. */
@Composable
fun SkeletonList(count: Int = 3, tiles: Boolean = false) {
    val pulse by rememberInfiniteTransition(label = "skeleton").animateFloat(
        initialValue = 0.45f, targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(850), RepeatMode.Reverse), label = "skeletonAlpha",
    )
    Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        if (tiles) Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            repeat(2) { Box(Modifier.weight(1f).height(80.dp).clip(RoundedCornerShape(18.dp)).background(MaterialTheme.colorScheme.surfaceVariant).alpha(pulse)) }
        }
        repeat(count) { Box(Modifier.fillMaxWidth().height(92.dp).clip(RoundedCornerShape(20.dp)).background(MaterialTheme.colorScheme.surfaceVariant).alpha(pulse)) }
    }
}

private fun tone(name: String): Color = when (name) {
    "income", "ok" -> Color(0xFF2E7D32)
    "expense", "bad" -> Color(0xFFC62828)
    "payroll", "warn" -> Color(0xFFC58A00)
    "info" -> Color(0xFF1565C0)
    else -> Color(0xFFC4552B)
}

/** Round initials in a colour taken from the name, so each person keeps the same one. */
@Composable
fun PersonAvatar(name: String, size: Int = 44) {
    var h = 0
    name.forEach { h = (h * 31 + it.code) % 360 }
    val initials = name.trim().split(Regex("\\s+")).take(2).mapNotNull { it.firstOrNull()?.uppercaseChar() }.joinToString("").ifEmpty { "?" }
    Box(Modifier.size(size.dp).clip(CircleShape).background(Color.hsv(h.toFloat(), 0.55f, 0.72f)), contentAlignment = Alignment.Center) {
        Text(initials, color = Color.White, fontWeight = FontWeight.ExtraBold, fontSize = (size / 2.6).sp)
    }
}

/** A small pill: a status, a role, a count. */
@Composable
fun StatusChip(text: String, toneName: String = "neutral") {
    val c = if (toneName == "neutral") MaterialTheme.colorScheme.onSurfaceVariant else tone(toneName)
    Text(
        text, color = c, fontSize = 11.5.sp, fontWeight = FontWeight.ExtraBold,
        modifier = Modifier.clip(RoundedCornerShape(999.dp)).background(c.copy(alpha = 0.13f)).padding(horizontal = 10.dp, vertical = 3.dp),
    )
}

/** A figure with its label and a coloured edge: income, expenses, net, payroll... */
@Composable
fun MetricTile(label: String, value: String, toneName: String = "net", modifier: Modifier = Modifier) {
    Row(
        modifier.clip(RoundedCornerShape(18.dp)).background(MaterialTheme.colorScheme.surface).border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(18.dp)),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.width(4.dp).height(64.dp).background(tone(toneName)))
        Column(Modifier.padding(horizontal = 14.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(label, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, fontWeight = FontWeight.Bold)
            Text(value, fontSize = 18.sp, fontWeight = FontWeight.ExtraBold)
        }
    }
}

/** The steps of a process (draft, calculated, paid): the ones reached are filled. */
@Composable
fun StepBar(labels: List<String>, reached: Int) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        labels.forEachIndexed { i, l ->
            Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                Box(Modifier.fillMaxWidth().height(6.dp).clip(RoundedCornerShape(6.dp)).background(if (i <= reached) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant))
                Spacer(Modifier.height(4.dp))
                Text(l, fontSize = 11.5.sp, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center, color = if (i <= reached) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

/** A section closed by default, for the details nobody needs at first glance. */
@Composable
fun FoldSection(title: String, content: @Composable () -> Unit) {
    var open by rememberSaveable { mutableStateOf(false) }
    Column(Modifier.fillMaxWidth()) {
        Row(Modifier.fillMaxWidth().clickable { open = !open }.padding(vertical = 6.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(title, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.ExtraBold, fontSize = 12.5.sp)
            Text(if (open) "⌃" else "⌄", color = MaterialTheme.colorScheme.primary, fontSize = 16.sp)
        }
        AnimatedVisibility(open) { Column(verticalArrangement = Arrangement.spacedBy(4.dp)) { content() } }
    }
}

/** An empty list says so with a big icon instead of a bare line. */
@Composable
fun EmptyHint(icon: String, text: String) {
    Column(Modifier.fillMaxWidth().padding(vertical = 24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(icon, fontSize = 38.sp)
        Text(text, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
    }
}

/** A button that shows it is working while a request runs, and cannot be pressed twice. */
@Composable
fun BusyButton(text: String, busy: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier, outlined: Boolean = false, enabled: Boolean = true) {
    val shape = RoundedCornerShape(14.dp)
    val content: @Composable () -> Unit = {
        if (busy) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.5.dp, color = if (outlined) MaterialTheme.colorScheme.primary else Color.White)
        else Text(text, fontWeight = FontWeight.ExtraBold)
    }
    if (outlined) OutlinedButton(onClick = onClick, enabled = enabled && !busy, shape = shape, modifier = modifier.height(46.dp), content = { content() })
    else Button(onClick = onClick, enabled = enabled && !busy, shape = shape, modifier = modifier.height(46.dp), content = { content() })
}
