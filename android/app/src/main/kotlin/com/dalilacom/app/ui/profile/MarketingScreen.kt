package com.dalilacom.app.ui.profile

import android.content.Intent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.dalilacom.app.R
import com.dalilacom.app.data.AppContainer
import com.dalilacom.app.data.network.ReferralMeDto
import kotlinx.coroutines.launch

/**
 * Marketing for Dalilacom. A marketer sees his link and code, the people he brought and what he earned (a manager also his team).
 * Anyone else can enter the referral code he was given, once.
 */
@Composable
fun MarketingScreen(container: AppContainer, onBack: () -> Unit) {
    val scope = rememberCoroutineScope()
    val clipboard = LocalClipboardManager.current
    val context = LocalContext.current
    var me by remember { mutableStateOf<ReferralMeDto?>(null) }
    var loading by remember { mutableStateOf(true) }
    var code by remember { mutableStateOf("") }
    var message by remember { mutableStateOf<String?>(null) }
    var phone by remember { mutableStateOf("") }
    var note by remember { mutableStateOf("") }
    val sentText = stringResource(R.string.ref_sent)
    val okText = stringResource(R.string.ref_ok)
    val badText = stringResource(R.string.ref_bad)
    val alreadyText = stringResource(R.string.ref_already)
    val copiedText = stringResource(R.string.ref_copied)
    LaunchedEffect(Unit) { me = container.merchantRepository.referralMe(); loading = false }

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
            Text("📣 " + stringResource(R.string.ref_title), style = MaterialTheme.typography.headlineSmall, color = MaterialTheme.colorScheme.primary)
            TextButton(onClick = onBack) { Text(stringResource(R.string.disc_back)) }
        }
        val d = me
        if (loading) { CircularProgressIndicator(); return@Column }
        if (d == null) { Text(stringResource(R.string.sp_failed), color = MaterialTheme.colorScheme.error); return@Column }
        message?.let { Text(it, color = MaterialTheme.colorScheme.primary) }

        if (!d.isMarketer) {
            val pending = d.request?.status == "PENDING"
            if (pending) {
                Card(Modifier.fillMaxWidth()) { Text(stringResource(R.string.ref_pending), Modifier.padding(14.dp), fontWeight = FontWeight.Bold) }
            } else {
                if (d.request?.status == "REJECTED") Text(stringResource(R.string.ref_rejected), color = MaterialTheme.colorScheme.onSurfaceVariant)
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(stringResource(R.string.ref_become), fontWeight = FontWeight.Bold)
                        Text(stringResource(R.string.ref_become_sub), color = MaterialTheme.colorScheme.onSurfaceVariant)
                        OutlinedTextField(value = phone, onValueChange = { phone = it }, label = { Text(stringResource(R.string.ref_phone)) }, singleLine = true, modifier = Modifier.fillMaxWidth())
                        OutlinedTextField(value = note, onValueChange = { note = it }, label = { Text(stringResource(R.string.ref_note)) }, modifier = Modifier.fillMaxWidth())
                        listOf("ELECTRONIC" to ("💻 " to R.string.ref_electronic), "FIELD" to ("🚶 " to R.string.ref_field)).forEach { (channel, label) ->
                            val sub = if (channel == "FIELD") R.string.ref_field_sub else R.string.ref_electronic_sub
                            Button(onClick = {
                                scope.launch {
                                    container.merchantRepository.requestMarketer(channel, phone, note)
                                        .onSuccess { message = sentText }
                                        .onFailure { message = it.message }
                                    me = container.merchantRepository.referralMe() ?: me
                                }
                            }, modifier = Modifier.fillMaxWidth()) {
                                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                    Text(label.first + stringResource(label.second), fontWeight = FontWeight.Bold)
                                    Text(stringResource(sub), style = MaterialTheme.typography.bodySmall)
                                }
                            }
                        }
                    }
                }
            }
            if (!d.referred) {
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(stringResource(R.string.ref_enter), fontWeight = FontWeight.Bold)
                        OutlinedTextField(value = code, onValueChange = { code = it.uppercase() }, singleLine = true, modifier = Modifier.fillMaxWidth())
                        Button(onClick = {
                            if (code.isBlank()) return@Button
                            scope.launch {
                                val r = container.merchantRepository.useReferral(code)
                                message = if (r?.ok == true) okText else if (r?.reason == "ALREADY") alreadyText else badText
                                me = container.merchantRepository.referralMe() ?: me
                            }
                        }) { Text(stringResource(R.string.ref_apply)) }
                    }
                }
            }
            return@Column
        }

        val manager = d.kind == "MANAGER"
        Text(stringResource(if (manager) R.string.ref_sub_manager else R.string.ref_sub) + " (" + stringResource(if (d.channel == "FIELD") R.string.ref_field else R.string.ref_electronic) + ")", color = MaterialTheme.colorScheme.onSurfaceVariant)
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(stringResource(R.string.ref_link), fontWeight = FontWeight.Bold)
                Text(d.link, style = MaterialTheme.typography.bodySmall)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = { clipboard.setText(AnnotatedString(d.link)); message = copiedText }) { Text(stringResource(R.string.ref_copy)) }
                    OutlinedButton(onClick = {
                        context.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).apply { type = "text/plain"; putExtra(Intent.EXTRA_TEXT, d.link) }, null))
                    }) { Text(stringResource(R.string.ref_share)) }
                }
                OutlinedButton(onClick = { clipboard.setText(AnnotatedString(d.code)); message = copiedText }) { Text(stringResource(R.string.ref_code) + ": " + d.code) }
            }
        }
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                StatRow(stringResource(R.string.ref_people), d.people.toString())
                StatRow(stringResource(R.string.ref_earned), "${d.earned} ${d.creditName}")
                if (manager) {
                    StatRow(stringResource(R.string.ref_team_people), d.teamPeople.toString())
                    StatRow(stringResource(R.string.ref_from_team), "${d.earnedFromTeam} ${d.creditName}")
                }
            }
        }
        if (manager) {
            Text(stringResource(R.string.ref_team), style = MaterialTheme.typography.titleMedium)
            if (d.team.isEmpty()) Text(stringResource(R.string.ref_no_team), color = MaterialTheme.colorScheme.onSurfaceVariant)
            d.team.forEach { m ->
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(14.dp)) {
                        Text(m.name + if (m.active) "" else "  (" + stringResource(R.string.ref_off) + ")", fontWeight = FontWeight.Bold)
                        Text(stringResource(R.string.ref_member_row, m.people, "${m.earned} ${d.creditName}"), color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }
        Spacer(Modifier.height(24.dp))
    }
}

@Composable
private fun StatRow(label: String, value: String) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label)
        Text(value, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
    }
}
