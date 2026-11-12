package com.dalilacom.app.ui.common

import androidx.annotation.StringRes
import androidx.compose.animation.Crossfade
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
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
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.ScrollableTabRow
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.dalilacom.app.R
import kotlinx.coroutines.delay

/** The three sections that work like small sites of their own: a home page that is always there, and (for two of them) a tool behind a tab. */
enum class SiteKind(
    val key: String,
    val icon: String,
    @StringRes val kicker: Int,
    @StringRes val appTab: Int,
    val slideT: List<Int>, val slideD: List<Int>,
    val statN: List<Int>, val statL: List<Int>,
    val featureIcons: List<String>, val featureT: List<Int>, val featureD: List<Int>,
    val stepT: List<Int>, val stepD: List<Int>,
    val faqQ: List<Int>, val faqA: List<Int>,
    val art: List<String>,
    /** The "in detail" cards (a title and three lines each); empty for a section that has none yet. */
    val detailT: List<Int> = emptyList(), val detailB: List<List<Int>> = emptyList(),
) {
    Accounting(
        key = "accounting", icon = "🧮", kicker = R.string.sec_acc_kicker, appTab = R.string.site_accounting_tab_summary,
        slideT = listOf(R.string.site_accounting_slide1_t, R.string.site_accounting_slide2_t, R.string.site_accounting_slide3_t),
        slideD = listOf(R.string.site_accounting_slide1_d, R.string.site_accounting_slide2_d, R.string.site_accounting_slide3_d),
        statN = listOf(R.string.site_accounting_st1_n, R.string.site_accounting_st2_n, R.string.site_accounting_st3_n), statL = listOf(R.string.site_accounting_st1_l, R.string.site_accounting_st2_l, R.string.site_accounting_st3_l),
        featureIcons = listOf("📒", "📦", "🧾", "📊"),
        featureT = listOf(R.string.sec_acc_f1t, R.string.sec_acc_f2t, R.string.sec_acc_f3t, R.string.sec_acc_f4t), featureD = listOf(R.string.sec_acc_f1d, R.string.sec_acc_f2d, R.string.sec_acc_f3d, R.string.sec_acc_f4d),
        stepT = listOf(R.string.sec_acc_s1, R.string.sec_acc_s2, R.string.sec_acc_s3), stepD = listOf(R.string.site_accounting_s1_d, R.string.site_accounting_s2_d, R.string.site_accounting_s3_d),
        faqQ = listOf(R.string.site_accounting_faq1_q, R.string.site_accounting_faq2_q, R.string.site_accounting_faq3_q, R.string.site_accounting_faq4_q), faqA = listOf(R.string.site_accounting_faq1_a, R.string.site_accounting_faq2_a, R.string.site_accounting_faq3_a, R.string.site_accounting_faq4_a),
        art = listOf("bars", "receipt", "stock"),
        detailT = listOf(R.string.site_accounting_d1_t, R.string.site_accounting_d2_t, R.string.site_accounting_d3_t, R.string.site_accounting_d4_t),
        detailB = listOf(
            listOf(R.string.site_accounting_d1_b1, R.string.site_accounting_d1_b2, R.string.site_accounting_d1_b3),
            listOf(R.string.site_accounting_d2_b1, R.string.site_accounting_d2_b2, R.string.site_accounting_d2_b3),
            listOf(R.string.site_accounting_d3_b1, R.string.site_accounting_d3_b2, R.string.site_accounting_d3_b3),
            listOf(R.string.site_accounting_d4_b1, R.string.site_accounting_d4_b2, R.string.site_accounting_d4_b3),
        ),
    ),
    Responder(
        key = "responder", icon = "🤖", kicker = R.string.sec_resp_kicker, appTab = R.string.site_responder_tab_overview,
        slideT = listOf(R.string.site_responder_slide1_t, R.string.site_responder_slide2_t, R.string.site_responder_slide3_t),
        slideD = listOf(R.string.site_responder_slide1_d, R.string.site_responder_slide2_d, R.string.site_responder_slide3_d),
        statN = listOf(R.string.site_responder_st1_n, R.string.site_responder_st2_n, R.string.site_responder_st3_n), statL = listOf(R.string.site_responder_st1_l, R.string.site_responder_st2_l, R.string.site_responder_st3_l),
        featureIcons = listOf("💬", "⚙️", "✨", "📥"),
        featureT = listOf(R.string.sec_resp_f1t, R.string.sec_resp_f2t, R.string.sec_resp_f3t, R.string.sec_resp_f4t), featureD = listOf(R.string.sec_resp_f1d, R.string.sec_resp_f2d, R.string.sec_resp_f3d, R.string.sec_resp_f4d),
        stepT = listOf(R.string.sec_resp_s1, R.string.sec_resp_s2, R.string.sec_resp_s3), stepD = listOf(R.string.site_responder_s1_d, R.string.site_responder_s2_d, R.string.site_responder_s3_d),
        faqQ = listOf(R.string.site_responder_faq1_q, R.string.site_responder_faq2_q, R.string.site_responder_faq3_q, R.string.site_responder_faq4_q), faqA = listOf(R.string.site_responder_faq1_a, R.string.site_responder_faq2_a, R.string.site_responder_faq3_a, R.string.site_responder_faq4_a),
        art = listOf("chat", "orbit", "ai"),
        detailT = listOf(R.string.site_responder_d1_t, R.string.site_responder_d2_t, R.string.site_responder_d3_t, R.string.site_responder_d4_t),
        detailB = listOf(
            listOf(R.string.site_responder_d1_b1, R.string.site_responder_d1_b2, R.string.site_responder_d1_b3),
            listOf(R.string.site_responder_d2_b1, R.string.site_responder_d2_b2, R.string.site_responder_d2_b3),
            listOf(R.string.site_responder_d3_b1, R.string.site_responder_d3_b2, R.string.site_responder_d3_b3),
            listOf(R.string.site_responder_d4_b1, R.string.site_responder_d4_b2, R.string.site_responder_d4_b3),
        ),
    ),
    Hr(
        key = "hr", icon = "👥", kicker = R.string.sec_hr_kicker, appTab = R.string.sec_hr_open,
        slideT = listOf(R.string.site_hr_slide1_t, R.string.site_hr_slide2_t, R.string.site_hr_slide3_t),
        slideD = listOf(R.string.site_hr_slide1_d, R.string.site_hr_slide2_d, R.string.site_hr_slide3_d),
        statN = listOf(R.string.site_hr_st1_n, R.string.site_hr_st2_n, R.string.site_hr_st3_n), statL = listOf(R.string.site_hr_st1_l, R.string.site_hr_st2_l, R.string.site_hr_st3_l),
        featureIcons = listOf("🕒", "🏖️", "💵", "🤝"),
        featureT = listOf(R.string.sec_hr_f1t, R.string.sec_hr_f2t, R.string.sec_hr_f3t, R.string.sec_hr_f4t), featureD = listOf(R.string.sec_hr_f1d, R.string.sec_hr_f2d, R.string.sec_hr_f3d, R.string.sec_hr_f4d),
        stepT = listOf(R.string.sec_hr_s1, R.string.sec_hr_s2, R.string.sec_hr_s3), stepD = listOf(R.string.site_hr_s1_d, R.string.site_hr_s2_d, R.string.site_hr_s3_d),
        faqQ = listOf(R.string.site_hr_faq1_q, R.string.site_hr_faq2_q, R.string.site_hr_faq3_q, R.string.site_hr_faq4_q), faqA = listOf(R.string.site_hr_faq1_a, R.string.site_hr_faq2_a, R.string.site_hr_faq3_a, R.string.site_hr_faq4_a),
        art = listOf("team", "payslip", "calendar"),
    );
}

private val Ink = Color(0xFF1C1C20)
private val Muted = Color(0xFF55555B)

/**
 * A section as a small site: a title, a tab bar (Home, and the tool when there is one and the person is signed in), and the home page
 * with moving slides, figures, features, steps and questions. [appContent] is the tool; [onOpenExternal] replaces it with a button
 * that opens another site (the HR system).
 */
@Composable
fun SectionSite(
    kind: SiteKind,
    signedIn: Boolean,
    onLogin: () -> Unit,
    onRegister: () -> Unit,
    onBack: (() -> Unit)? = null,
    startOnApp: Boolean = false,
    onOpenExternal: (() -> Unit)? = null,
    appContent: (@Composable () -> Unit)? = null,
) {
    val hasApp = appContent != null && signedIn
    var tab by rememberSaveable(kind.key) { mutableStateOf(if (startOnApp && hasApp) 1 else 0) }
    if (!hasApp && tab != 0) tab = 0
    Column(Modifier.fillMaxSize()) {
        if (onBack != null) TextButton(onClick = onBack) { Text("‹ " + stringResource(R.string.sec_back)) }
        Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Box(Modifier.size(40.dp).clip(RoundedCornerShape(14.dp)).background(MaterialTheme.colorScheme.primary), contentAlignment = Alignment.Center) { Text(kind.icon, fontSize = 21.sp) }
            Text(stringResource(kind.kicker), fontWeight = FontWeight.ExtraBold, fontSize = 19.sp)
        }
        if (hasApp) {
            ScrollableTabRow(selectedTabIndex = tab, edgePadding = 12.dp, containerColor = Color.Transparent) {
                Tab(selected = tab == 0, onClick = { tab = 0 }, text = { Text(stringResource(R.string.site_tab_home), fontWeight = FontWeight.Bold) })
                Tab(selected = tab == 1, onClick = { tab = 1 }, text = { Text(stringResource(kind.appTab), fontWeight = FontWeight.Bold) })
            }
        }
        Box(Modifier.weight(1f).fillMaxWidth()) {
            if (tab == 0 || !hasApp) SiteHome(kind, signedIn, onLogin, onRegister, onOpenExternal) { tab = 1 }
            else appContent?.invoke()
        }
    }
}

@Composable
private fun SiteHome(kind: SiteKind, signedIn: Boolean, onLogin: () -> Unit, onRegister: () -> Unit, onOpenExternal: (() -> Unit)?, openApp: () -> Unit) {
    val primaryLabel = when {
        onOpenExternal != null -> stringResource(R.string.sec_hr_open)
        !signedIn -> stringResource(R.string.site_login)
        else -> stringResource(if (kind == SiteKind.Responder) R.string.site_open_responder else R.string.site_open_accounting)
    }
    val primary: () -> Unit = { if (onOpenExternal != null) onOpenExternal() else if (!signedIn) onLogin() else openApp() }
    val secondaryLabel = if (onOpenExternal == null && !signedIn) stringResource(R.string.site_register) else null
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 10.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        SiteSlider(kind, primaryLabel, primary, secondaryLabel, onRegister)
        // the three figures are one height, whichever of their labels wraps to two lines
        Row(Modifier.fillMaxWidth().height(androidx.compose.foundation.layout.IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            for (i in 0..2) Column(
                Modifier.weight(1f).fillMaxHeight().clip(RoundedCornerShape(20.dp)).background(MaterialTheme.colorScheme.surface).border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(20.dp)).padding(vertical = 14.dp, horizontal = 6.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text(stringResource(kind.statN[i]), fontWeight = FontWeight.ExtraBold, fontSize = 22.sp, color = MaterialTheme.colorScheme.secondary)
                Text(stringResource(kind.statL[i]), fontSize = 11.5.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
            }
        }
        Text(stringResource(R.string.site_featuresTitle), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.ExtraBold)
        for (i in 0..3) Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(22.dp), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)) {
            Row(Modifier.padding(14.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.Top) {
                Box(Modifier.size(46.dp).clip(RoundedCornerShape(15.dp)).background(MaterialTheme.colorScheme.surfaceVariant), contentAlignment = Alignment.Center) { Text(kind.featureIcons[i], fontSize = 23.sp) }
                Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(stringResource(kind.featureT[i]), fontWeight = FontWeight.Bold)
                    Text(stringResource(kind.featureD[i]), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp, lineHeight = 20.sp)
                }
            }
        }
        if (kind.detailT.isNotEmpty()) {
            Text(stringResource(R.string.site_detailsTitle), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.ExtraBold)
            for (i in kind.detailT.indices) Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(22.dp), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)) {
                Row(Modifier.padding(14.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.Top) {
                    Box(Modifier.size(46.dp).clip(RoundedCornerShape(15.dp)).background(MaterialTheme.colorScheme.surfaceVariant), contentAlignment = Alignment.Center) { Text(kind.featureIcons[i], fontSize = 23.sp) }
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(stringResource(kind.detailT[i]), fontWeight = FontWeight.Bold)
                        for (line in kind.detailB[i]) Text("• " + stringResource(line), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp, lineHeight = 20.sp)
                    }
                }
            }
        }
        Text(stringResource(R.string.site_stepsTitle), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.ExtraBold)
        for (i in 0..2) Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(20.dp), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)) {
            Row(Modifier.padding(14.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.Top) {
                Box(Modifier.size(34.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primary), contentAlignment = Alignment.Center) { Text("${i + 1}", fontWeight = FontWeight.ExtraBold, color = MaterialTheme.colorScheme.onPrimary) }
                Column {
                    Text(stringResource(kind.stepT[i]), fontWeight = FontWeight.Bold)
                    Text(stringResource(kind.stepD[i]), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp, lineHeight = 20.sp)
                }
            }
        }
        Text(stringResource(R.string.site_faq), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.ExtraBold)
        var open by rememberSaveable(kind.key) { mutableStateOf(-1) }
        for (i in 0..3) Column(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(MaterialTheme.colorScheme.surface).border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(18.dp))
                .clickable { open = if (open == i) -1 else i }.padding(horizontal = 16.dp, vertical = 14.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(stringResource(kind.faqQ[i]), fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                Text(if (open == i) "−" else "+", fontSize = 22.sp, color = MaterialTheme.colorScheme.secondary)
            }
            if (open == i) Text(stringResource(kind.faqA[i]), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 14.sp, lineHeight = 22.sp, modifier = Modifier.padding(top = 8.dp))
        }
        Column(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(28.dp)).background(Brush.linearGradient(listOf(Color(0xFFB84C24), Color(0xFFE0653A)))).padding(22.dp),
            horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(stringResource(R.string.site_ctaTitle), color = Color.White, fontWeight = FontWeight.ExtraBold, fontSize = 22.sp)
            Text(stringResource(R.string.site_ctaSub), color = Color.White.copy(alpha = 0.92f), textAlign = TextAlign.Center)
            Button(onClick = primary, shape = RoundedCornerShape(999.dp), colors = androidx.compose.material3.ButtonDefaults.buttonColors(containerColor = Color.White, contentColor = Ink)) { Text(primaryLabel, fontWeight = FontWeight.Bold) }
        }
        Spacer(Modifier.height(10.dp))
    }
}

/** Three slides with moving pictures; they change by themselves every few seconds, and the dots jump to one. */
@Composable
private fun SiteSlider(kind: SiteKind, primaryLabel: String, onPrimary: () -> Unit, secondaryLabel: String?, onSecondary: () -> Unit) {
    var page by remember { mutableStateOf(0) }
    LaunchedEffect(page) { delay(6000); page = (page + 1) % 3 }
    Box(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(30.dp)).border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(30.dp))
            .background(Brush.linearGradient(listOf(Color(0xFFFFF6EE), Color(0xFFFDE3D1), Color(0xFFFBCDB2)))),
    ) {
        Crossfade(targetState = page, animationSpec = tween(500), label = "slide") { i ->
            Column(Modifier.fillMaxWidth().padding(start = 20.dp, end = 20.dp, top = 22.dp, bottom = 52.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Box(Modifier.fillMaxWidth().height(220.dp), contentAlignment = Alignment.Center) { SiteArt(kind.art[i]) }
                Text(stringResource(kind.slideT[i]), fontWeight = FontWeight.ExtraBold, fontSize = 24.sp, lineHeight = 30.sp, textAlign = TextAlign.Center, color = Ink)
                Text(stringResource(kind.slideD[i]), color = Muted, textAlign = TextAlign.Center, lineHeight = 22.sp)
                Spacer(Modifier.height(2.dp))
                Button(onClick = onPrimary, shape = RoundedCornerShape(999.dp), modifier = Modifier.fillMaxWidth()) { Text(primaryLabel, fontWeight = FontWeight.Bold) }
                if (secondaryLabel != null) OutlinedButton(onClick = onSecondary, shape = RoundedCornerShape(999.dp), border = BorderStroke(1.dp, MaterialTheme.colorScheme.primary), modifier = Modifier.fillMaxWidth()) { Text(secondaryLabel, color = MaterialTheme.colorScheme.secondary) }
            }
        }
        Row(Modifier.align(Alignment.BottomCenter).padding(bottom = 18.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            for (i in 0..2) Box(Modifier.height(9.dp).width(if (i == page) 28.dp else 9.dp).clip(CircleShape).background(if (i == page) MaterialTheme.colorScheme.secondary else Ink.copy(alpha = 0.25f)).clickable { page = i })
        }
    }
}

@Composable private fun appear(delayMs: Int): Float {
    val a = remember { Animatable(0f) }
    LaunchedEffect(Unit) { delay(delayMs.toLong()); a.animateTo(1f, tween(500)) }
    return a.value
}
@Composable private fun wave(from: Float, to: Float, ms: Int): Float {
    val t = rememberInfiniteTransition(label = "wave")
    return t.animateFloat(from, to, infiniteRepeatable(tween(ms, easing = LinearEasing), RepeatMode.Reverse), label = "w").value
}
@Composable private fun card(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    Box(modifier.clip(RoundedCornerShape(22.dp)).background(Color.White).padding(14.dp)) { content() }
}

/** The pictures: small scenes drawn with boxes and text, moving while their slide is on. */
@Composable
private fun SiteArt(name: String) {
    when (name) {
        "chat" -> Column(Modifier.width(290.dp), verticalArrangement = Arrangement.spacedBy(9.dp)) {
            listOf(R.string.site_art_chat1 to false, R.string.site_art_chat2 to true, R.string.site_art_chat3 to false, R.string.site_art_chat4 to true).forEachIndexed { i, (res, out) ->
                val a = appear(200 + i * 1250)
                Row(Modifier.fillMaxWidth().graphicsLayer { alpha = a; translationY = (1f - a) * 24f }, horizontalArrangement = if (out) Arrangement.End else Arrangement.Start) {
                    Text(stringResource(res), fontWeight = FontWeight.SemiBold, fontSize = 13.sp, color = Ink, modifier = Modifier.clip(RoundedCornerShape(18.dp)).background(if (out) MaterialTheme.colorScheme.primary else Color.White).padding(horizontal = 14.dp, vertical = 10.dp))
                }
            }
        }
        "orbit" -> Box(Modifier.size(210.dp), contentAlignment = Alignment.Center) {
            val pulse = wave(1f, 1.1f, 1100)
            Box(Modifier.size(210.dp).border(2.dp, MaterialTheme.colorScheme.secondary.copy(alpha = 0.4f), CircleShape))
            Box(Modifier.size(90.dp).graphicsLayer { scaleX = pulse; scaleY = pulse }.clip(CircleShape).background(MaterialTheme.colorScheme.primary), contentAlignment = Alignment.Center) { Text("🤖", fontSize = 42.sp) }
            listOf(Triple("f", 0.dp, (-92).dp), Triple("◎", (-78).dp, 62.dp), Triple("✈", 78.dp, 62.dp)).forEachIndexed { i, (txt, x, y) ->
                val bob = wave(-6f, 6f, 1500 + i * 300)
                Box(Modifier.graphicsLayer { translationX = x.toPx(); translationY = y.toPx() + bob }.size(48.dp).clip(CircleShape).background(Color.White), contentAlignment = Alignment.Center) { Text(txt, fontWeight = FontWeight.ExtraBold, fontSize = 20.sp, color = Color(0xFFC4552B)) }
            }
        }
        "ai" -> Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
            val shimmer = wave(0.35f, 1f, 900)
            card(Modifier.width(230.dp)) {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("✨", fontSize = 22.sp)
                    listOf(0.9f, 0.7f, 0.82f).forEach { w -> Box(Modifier.fillMaxWidth(w).height(10.dp).graphicsLayer { alpha = shimmer }.clip(RoundedCornerShape(6.dp)).background(Color(0xFFFBC9AD))) }
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf(R.string.site_art_kw1, R.string.site_art_kw2, R.string.site_art_kw3).forEachIndexed { i, res ->
                    val a = appear(300 + i * 600)
                    Text(stringResource(res), fontWeight = FontWeight.Bold, fontSize = 12.5.sp, color = Ink, modifier = Modifier.graphicsLayer { alpha = a }.clip(RoundedCornerShape(999.dp)).background(Color.White).padding(horizontal = 13.dp, vertical = 6.dp))
                }
            }
        }
        "bars" -> Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
            card {
                Row(Modifier.height(140.dp).padding(horizontal = 6.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.Bottom) {
                    listOf(0.55f, 0.35f, 0.75f, 0.45f, 0.9f, 0.6f).forEachIndexed { i, h ->
                        val a = appear(i * 150)
                        Box(Modifier.width(26.dp).height((140f * h * a).dp).clip(RoundedCornerShape(topStart = 9.dp, topEnd = 9.dp)).background(if (i % 2 == 1) Ink else MaterialTheme.colorScheme.primary))
                    }
                }
            }
            Text(stringResource(R.string.site_art_net) + "  + 1,250", fontWeight = FontWeight.ExtraBold, fontSize = 14.sp, color = Color(0xFF1E7E34), modifier = Modifier.clip(RoundedCornerShape(999.dp)).background(Color.White).padding(horizontal = 16.dp, vertical = 7.dp))
        }
        "receipt" -> card(Modifier.width(210.dp)) {
            val y = wave(0f, 1f, 2200)
            Box {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text(stringResource(R.string.site_art_invoice), fontWeight = FontWeight.ExtraBold, fontSize = 14.sp, color = Ink)
                    listOf(1f, 1f, 0.6f, 1f).forEach { w -> Box(Modifier.fillMaxWidth(w).height(9.dp).clip(RoundedCornerShape(5.dp)).background(Color(0xFFF0E6DE))) }
                    Row(Modifier.fillMaxWidth().padding(top = 6.dp), horizontalArrangement = Arrangement.SpaceBetween) { Text(stringResource(R.string.site_art_total), color = Ink, fontSize = 13.sp); Text("86.40", fontWeight = FontWeight.ExtraBold, color = Ink) }
                }
                Box(Modifier.fillMaxWidth().height(3.dp).graphicsLayer { translationY = y * 150.dp.toPx() }.background(MaterialTheme.colorScheme.primary))
            }
        }
        "stock" -> Column(Modifier.width(290.dp), verticalArrangement = Arrangement.spacedBy(9.dp)) {
            listOf(Triple(R.string.site_art_item1, 0.82f, false), Triple(R.string.site_art_item2, 0.46f, false), Triple(R.string.site_art_item3, 0.12f, true)).forEachIndexed { i, (res, w, low) ->
                val a = appear(i * 250)
                Row(Modifier.fillMaxWidth().graphicsLayer { alpha = a }.clip(RoundedCornerShape(16.dp)).background(Color.White).padding(horizontal = 12.dp, vertical = 11.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text(stringResource(res), fontWeight = FontWeight.Bold, fontSize = 12.5.sp, color = Ink, modifier = Modifier.width(84.dp))
                    Box(Modifier.weight(1f).height(8.dp).clip(RoundedCornerShape(5.dp)).background(Color(0xFFF0E6DE))) { Box(Modifier.fillMaxWidth(w * a).height(8.dp).clip(RoundedCornerShape(5.dp)).background(if (low) Color(0xFFD93025) else MaterialTheme.colorScheme.primary)) }
                    if (low) Text(stringResource(R.string.site_art_low), fontSize = 10.5.sp, color = Color(0xFFB71C1C), modifier = Modifier.clip(RoundedCornerShape(999.dp)).background(Color(0xFFFDECEA)).padding(horizontal = 8.dp, vertical = 2.dp))
                }
            }
        }
        "team" -> Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                listOf("👩‍💼", "👨‍💼", "🧑‍💻", "👩‍🔧", "👨‍🏭").forEachIndexed { i, e ->
                    val a = appear(i * 180)
                    Box(Modifier.size(52.dp).graphicsLayer { alpha = a; scaleX = 0.4f + 0.6f * a; scaleY = 0.4f + 0.6f * a }.clip(CircleShape).background(Color.White), contentAlignment = Alignment.Center) { Text(e, fontSize = 24.sp) }
                }
            }
            Text("✓ " + stringResource(R.string.site_art_present) + " 5/5", fontWeight = FontWeight.ExtraBold, color = Color(0xFF1E7E34), modifier = Modifier.clip(RoundedCornerShape(999.dp)).background(Color.White).padding(horizontal = 18.dp, vertical = 7.dp))
        }
        "payslip" -> card(Modifier.width(220.dp)) {
            val pulse = wave(1f, 1.04f, 1200)
            Column(verticalArrangement = Arrangement.spacedBy(11.dp)) {
                Text(stringResource(R.string.site_art_payslip), fontWeight = FontWeight.ExtraBold, color = Ink)
                listOf(0.5f, 0.4f, 0.6f).forEach { w -> Box(Modifier.fillMaxWidth(w).height(9.dp).clip(RoundedCornerShape(5.dp)).background(Color(0xFFF0E6DE))) }
                Row(Modifier.fillMaxWidth().graphicsLayer { scaleX = pulse; scaleY = pulse }.clip(RoundedCornerShape(14.dp)).background(MaterialTheme.colorScheme.primary).padding(horizontal = 14.dp, vertical = 11.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(stringResource(R.string.site_art_netpay), color = Ink, fontSize = 13.sp); Text("1,840", fontWeight = FontWeight.ExtraBold, color = Ink, fontSize = 18.sp)
                }
            }
        }
        else -> Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
            card {
                Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
                    for (r in 0..3) Row(horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                        for (c in 0..6) {
                            val n = r * 7 + c
                            val a = appear(n * 30)
                            val pulse = if (n in listOf(9, 10, 11, 17)) wave(0.7f, 1f, 900) else 1f
                            Box(Modifier.size(28.dp).graphicsLayer { alpha = a * pulse }.clip(RoundedCornerShape(9.dp)).background(when (n) { 9, 10, 11, 17 -> MaterialTheme.colorScheme.primary; 3, 4 -> Color(0xFFCFE9D6); else -> Color(0xFFF3E9E1) }))
                        }
                    }
                }
            }
            Text("🏖️ " + stringResource(R.string.site_art_leave), fontWeight = FontWeight.ExtraBold, fontSize = 14.sp, color = Ink, modifier = Modifier.clip(RoundedCornerShape(999.dp)).background(Color.White).padding(horizontal = 16.dp, vertical = 7.dp))
        }
    }
}
