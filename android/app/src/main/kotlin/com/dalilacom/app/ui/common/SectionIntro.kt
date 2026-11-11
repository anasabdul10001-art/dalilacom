package com.dalilacom.app.ui.common

import android.content.Context
import androidx.annotation.StringRes
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.dalilacom.app.R

/** Which section a page introduces. */
enum class IntroKind(
    val key: String,
    @StringRes val kicker: Int,
    @StringRes val title: Int,
    @StringRes val sub: Int,
    val featureIcons: List<String>,
    val features: List<Pair<Int, Int>>,
    val steps: List<Int>,
) {
    Accounting(
        "accounting", R.string.sec_acc_kicker, R.string.sec_acc_title, R.string.sec_acc_sub, listOf("📒", "📦", "🧾", "📊"),
        listOf(R.string.sec_acc_f1t to R.string.sec_acc_f1d, R.string.sec_acc_f2t to R.string.sec_acc_f2d, R.string.sec_acc_f3t to R.string.sec_acc_f3d, R.string.sec_acc_f4t to R.string.sec_acc_f4d),
        listOf(R.string.sec_acc_s1, R.string.sec_acc_s2, R.string.sec_acc_s3),
    ),
    Hr(
        "hr", R.string.sec_hr_kicker, R.string.sec_hr_title, R.string.sec_hr_sub, listOf("🕒", "🏖️", "💵", "🤝"),
        listOf(R.string.sec_hr_f1t to R.string.sec_hr_f1d, R.string.sec_hr_f2t to R.string.sec_hr_f2d, R.string.sec_hr_f3t to R.string.sec_hr_f3d, R.string.sec_hr_f4t to R.string.sec_hr_f4d),
        listOf(R.string.sec_hr_s1, R.string.sec_hr_s2, R.string.sec_hr_s3),
    ),
    Responder(
        "responder", R.string.sec_resp_kicker, R.string.sec_resp_title, R.string.sec_resp_sub, listOf("💬", "⚙️", "✨", "📥"),
        listOf(R.string.sec_resp_f1t to R.string.sec_resp_f1d, R.string.sec_resp_f2t to R.string.sec_resp_f2d, R.string.sec_resp_f3t to R.string.sec_resp_f3d, R.string.sec_resp_f4t to R.string.sec_resp_f4d),
        listOf(R.string.sec_resp_s1, R.string.sec_resp_s2, R.string.sec_resp_s3),
    ),
}

/** Remembers, per device, which section intros the person has already been through. */
object IntroPrefs {
    private fun prefs(context: Context) = context.getSharedPreferences("section_intros", Context.MODE_PRIVATE)
    fun seen(context: Context, kind: IntroKind) = prefs(context).getBoolean(kind.key, false)
    fun markSeen(context: Context, kind: IntroKind) = prefs(context).edit().putBoolean(kind.key, true).apply()
}

/**
 * A section's front page: what it is, what it offers, how it works, and one clear button to go on. Shown on the first visit,
 * to guests (whose button is "sign in"), and again from the section's "about" link.
 */
@Composable
fun SectionIntro(
    kind: IntroKind,
    primaryLabel: String,
    onPrimary: () -> Unit,
    secondaryLabel: String? = null,
    onSecondary: () -> Unit = {},
    onBack: (() -> Unit)? = null,
    note: String? = null,
) {
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        if (onBack != null) TextButton(onClick = onBack) { Text("‹ " + stringResource(R.string.sec_back)) }
        note?.let { Text(it, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth()) }
        Box(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(28.dp))
                .background(Brush.verticalGradient(listOf(Color.White, MaterialTheme.colorScheme.surfaceVariant, MaterialTheme.colorScheme.primaryContainer)))
                .padding(horizontal = 20.dp, vertical = 28.dp),
        ) {
            Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(stringResource(kind.kicker), fontWeight = FontWeight.Bold, fontSize = 13.sp, color = Color(0xFF1C1C20),
                    modifier = Modifier.clip(RoundedCornerShape(999.dp)).background(Color.White).padding(horizontal = 14.dp, vertical = 6.dp))
                Text(stringResource(kind.title), style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.ExtraBold, textAlign = TextAlign.Center, color = Color(0xFF1C1C20))
                Text(stringResource(kind.sub), textAlign = TextAlign.Center, color = Color(0xFF6B6B70), lineHeight = 24.sp)
                Spacer(Modifier.height(4.dp))
                Button(onClick = onPrimary, shape = RoundedCornerShape(999.dp), modifier = Modifier.fillMaxWidth()) { Text(primaryLabel, fontWeight = FontWeight.Bold) }
                if (secondaryLabel != null) OutlinedButton(onClick = onSecondary, shape = RoundedCornerShape(999.dp), border = BorderStroke(1.dp, MaterialTheme.colorScheme.primary), modifier = Modifier.fillMaxWidth()) { Text(secondaryLabel, color = MaterialTheme.colorScheme.secondary) }
            }
        }
        Text(stringResource(R.string.sec_why), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.ExtraBold)
        kind.features.forEachIndexed { i, (title, desc) ->
            Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(22.dp), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)) {
                Row(Modifier.padding(14.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.Top) {
                    Box(Modifier.size(44.dp).clip(RoundedCornerShape(14.dp)).background(MaterialTheme.colorScheme.surfaceVariant), contentAlignment = Alignment.Center) { Text(kind.featureIcons[i], fontSize = 22.sp) }
                    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text(stringResource(title), fontWeight = FontWeight.Bold)
                        Text(stringResource(desc), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp, lineHeight = 20.sp)
                    }
                }
            }
        }
        Text(stringResource(R.string.sec_how), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.ExtraBold)
        kind.steps.forEachIndexed { i, step ->
            Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(18.dp), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)) {
                Row(Modifier.padding(horizontal = 14.dp, vertical = 12.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(30.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primary), contentAlignment = Alignment.Center) { Text("${i + 1}", fontWeight = FontWeight.ExtraBold, color = MaterialTheme.colorScheme.onPrimary) }
                    Text(stringResource(step), fontWeight = FontWeight.SemiBold)
                }
            }
        }
        Button(onClick = onPrimary, shape = RoundedCornerShape(999.dp), modifier = Modifier.fillMaxWidth().padding(top = 6.dp, bottom = 16.dp)) { Text(primaryLabel, fontWeight = FontWeight.Bold) }
    }
}
