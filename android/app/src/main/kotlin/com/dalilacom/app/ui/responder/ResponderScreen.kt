package com.dalilacom.app.ui.responder

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.dalilacom.app.data.network.ChannelDto
import com.dalilacom.app.data.network.InboxItemDto
import com.dalilacom.app.data.network.ResponderStatusDto
import com.dalilacom.app.ui.ViewModelFactory

private val TAB_TITLES = listOf("نظرة عامة", "القنوات", "القواعد", "الوارد")

private fun statusLabel(status: String) = when (status) {
    "TRIAL" -> "تجربة مجانية"
    "ACTIVE" -> "فعّال"
    "EXPIRED" -> "منتهي"
    else -> "غير مفعّل"
}

private fun interactionLabel(status: String) = when (status) {
    "SENT" -> "تم الرد"
    "NEEDS_REVIEW" -> "بانتظار ردك"
    "FAILED" -> "فشل الإرسال"
    else -> "تم التجاهل"
}

@Composable
fun ResponderScreen(factory: ViewModelFactory, onBack: () -> Unit, onOpenWallet: () -> Unit) {
    val viewModel: ResponderViewModel = viewModel(factory = factory)
    val state by viewModel.uiState.collectAsState()

    Column(modifier = Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            TextButton(onClick = onBack) { Text("رجوع") }
            Text("المجيب الآلي", style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.primary)
        }
        TabRow(selectedTabIndex = state.tab) {
            TAB_TITLES.forEachIndexed { index, title ->
                Tab(selected = state.tab == index, onClick = { viewModel.setTab(index) }, text = { Text(title) })
            }
        }

        if (state.isLoading && state.status == null) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            return@Column
        }

        Column(modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
            state.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            state.info?.let { Text(it, color = MaterialTheme.colorScheme.primary) }
            if (state.needsTopUp) {
                Spacer(Modifier.height(6.dp))
                OutlinedButton(onClick = onOpenWallet) { Text("شحن المحفظة") }
            }
            if (state.error != null || state.info != null) Spacer(Modifier.height(10.dp))

            when (state.tab) {
                0 -> OverviewTab(state.status, state.isBusy, onActivate = viewModel::activateOrRenew, onSaveProfile = viewModel::saveProfile)
                1 -> ChannelsTab(state.channels, state.connections, state.isBusy, viewModel)
                2 -> RulesTab(state.rules, state.isBusy, viewModel)
                else -> InboxTab(state.inbox, state.isBusy, onSend = viewModel::sendReply)
            }
        }
    }
}

@Composable
private fun OverviewTab(
    status: ResponderStatusDto?,
    busy: Boolean,
    onActivate: () -> Unit,
    onSaveProfile: (String, String) -> Unit,
) {
    if (status == null) {
        Text("تعذّر تحميل الحالة، اسحب للرجوع وحاول من جديد")
        return
    }
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp)) {
            Text("الحالة: ${statusLabel(status.status)}", style = MaterialTheme.typography.titleMedium)
            val until = (if (status.status == "TRIAL") status.trialEndsAt else status.periodEnd)?.take(10)
            if (until != null && status.running) Text("ينتهي بتاريخ $until")
            Text("رصيدك: ${status.balance} ${status.creditName}")
            Text("السعر: ${status.price} ${status.creditName} كل ${status.periodDays} يوم")
            if (status.aiReplyLimit > 0) Text("ردود الذكاء الاصطناعي: ${status.aiRepliesUsed} من ${status.aiReplyLimit}")
            Spacer(Modifier.height(12.dp))
            val label = when {
                !status.running && status.status != "EXPIRED" && status.trialAvailable -> "ابدأ التجربة المجانية (${status.trialDays} يوم)"
                !status.running && status.status != "EXPIRED" -> "اشترك — ${status.price} ${status.creditName}"
                else -> "جدّد الاشتراك — ${status.price} ${status.creditName}"
            }
            Button(onClick = onActivate, enabled = !busy, modifier = Modifier.fillMaxWidth()) { Text(label) }
        }
    }

    Spacer(Modifier.height(16.dp))
    var description by remember(status.businessDescription) { mutableStateOf(status.businessDescription.orEmpty()) }
    var tone by remember(status.tone) { mutableStateOf(status.tone.orEmpty()) }
    Text("عن نشاطك (يستخدمها الذكاء الاصطناعي بالرد)", style = MaterialTheme.typography.titleSmall)
    OutlinedTextField(description, { description = it }, label = { Text("وصف النشاط") }, modifier = Modifier.fillMaxWidth(), minLines = 3)
    OutlinedTextField(tone, { tone = it }, label = { Text("نبرة الرد (مثال: ودّية ومختصرة)") }, modifier = Modifier.fillMaxWidth())
    Spacer(Modifier.height(8.dp))
    OutlinedButton(onClick = { onSaveProfile(description, tone) }, enabled = !busy) { Text("حفظ") }
}

@Composable
private fun ChannelsTab(
    channels: List<ChannelDto>,
    connections: List<com.dalilacom.app.data.network.ConnectionDto>,
    busy: Boolean,
    viewModel: ResponderViewModel,
) {
    Text("قنوات التواصل المتاحة", style = MaterialTheme.typography.titleMedium)
    Spacer(Modifier.height(8.dp))
    channels.forEach { channel ->
        var expanded by remember { mutableStateOf(false) }
        val values = remember { mutableStateOf(mapOf<String, String>()) }
        Card(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
            Column(Modifier.padding(12.dp)) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Text(channel.name, style = MaterialTheme.typography.titleSmall)
                    if (channel.connectable) {
                        TextButton(onClick = { expanded = !expanded }) { Text(if (expanded) "إغلاق" else "ربط") }
                    } else {
                        Text("قريبًا", color = MaterialTheme.colorScheme.outline)
                    }
                }
                if (expanded && channel.connectable) {
                    channel.fields.forEach { field ->
                        OutlinedTextField(
                            value = values.value[field.key].orEmpty(),
                            onValueChange = { values.value = values.value + (field.key to it) },
                            label = { Text(field.label) },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true,
                            visualTransformation = if (field.secret) PasswordVisualTransformation() else VisualTransformation.None,
                        )
                    }
                    Spacer(Modifier.height(8.dp))
                    Button(
                        onClick = { viewModel.connect(channel.id, values.value.filterValues { it.isNotBlank() }) },
                        enabled = !busy,
                    ) { Text("ربط القناة") }
                }
            }
        }
    }

    Spacer(Modifier.height(16.dp))
    Text("قنواتي المربوطة", style = MaterialTheme.typography.titleMedium)
    if (connections.isEmpty()) Text("ما في قنوات مربوطة بعد", color = MaterialTheme.colorScheme.outline)
    connections.forEach { connection ->
        Card(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
            Column(Modifier.padding(12.dp)) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Text("${connection.channel}${connection.externalAccountId?.let { " — $it" } ?: ""}")
                    Switch(checked = connection.isActive, onCheckedChange = { viewModel.toggleConnection(connection.id, it) })
                }
                connection.hookUrl?.let { Text("رابط الاستقبال: $it", style = MaterialTheme.typography.bodySmall) }
            }
        }
    }
}

@Composable
private fun RulesTab(
    rules: List<com.dalilacom.app.data.network.RuleDto>,
    busy: Boolean,
    viewModel: ResponderViewModel,
) {
    var name by remember { mutableStateOf("") }
    var keywords by remember { mutableStateOf("") }
    var mode by remember { mutableStateOf("FIXED") }
    var template by remember { mutableStateOf("") }
    var instructions by remember { mutableStateOf("") }

    Text("قاعدة رد جديدة", style = MaterialTheme.typography.titleMedium)
    OutlinedTextField(name, { name = it }, label = { Text("اسم القاعدة") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
    OutlinedTextField(keywords, { keywords = it }, label = { Text("كلمات مفتاحية (مفصولة بفاصلة)") }, modifier = Modifier.fillMaxWidth())
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(vertical = 6.dp)) {
        FilterChip(selected = mode == "FIXED", onClick = { mode = "FIXED" }, label = { Text("رد ثابت") })
        FilterChip(selected = mode == "AI", onClick = { mode = "AI" }, label = { Text("ذكاء اصطناعي") })
    }
    if (mode == "FIXED") {
        OutlinedTextField(template, { template = it }, label = { Text("نص الرد (استخدم {name} لاسم الزبون)") }, modifier = Modifier.fillMaxWidth(), minLines = 2)
    } else {
        OutlinedTextField(instructions, { instructions = it }, label = { Text("تعليمات للذكاء الاصطناعي") }, modifier = Modifier.fillMaxWidth(), minLines = 2)
        OutlinedTextField(template, { template = it }, label = { Text("رد احتياطي إذا الذكاء الاصطناعي غير متاح (اختياري)") }, modifier = Modifier.fillMaxWidth())
    }
    Spacer(Modifier.height(8.dp))
    Button(
        onClick = {
            viewModel.addRule(name, keywords, mode, template, instructions)
            name = ""; keywords = ""; template = ""; instructions = ""
        },
        enabled = !busy,
    ) { Text("إضافة القاعدة") }

    Spacer(Modifier.height(16.dp))
    Text("قواعدي", style = MaterialTheme.typography.titleMedium)
    if (rules.isEmpty()) Text("ما عندك قواعد بعد", color = MaterialTheme.colorScheme.outline)
    rules.forEach { rule ->
        Card(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
            Column(Modifier.padding(12.dp)) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Text(rule.name, style = MaterialTheme.typography.titleSmall)
                    Switch(checked = rule.isActive, onCheckedChange = { viewModel.toggleRule(rule.id, it) })
                }
                Text("الكلمات: ${rule.keywords.joinToString("، ")}", style = MaterialTheme.typography.bodySmall)
                Text(if (rule.mode == "AI") "ذكاء اصطناعي" else "رد ثابت: ${rule.replyTemplate}", style = MaterialTheme.typography.bodySmall)
                TextButton(onClick = { viewModel.deleteRule(rule.id) }) { Text("حذف", color = MaterialTheme.colorScheme.error) }
            }
        }
    }
}

@Composable
private fun InboxTab(inbox: List<InboxItemDto>, busy: Boolean, onSend: (String, String) -> Unit) {
    Text("الرسائل الواردة", style = MaterialTheme.typography.titleMedium)
    Text("الشكاوى ما بينرد عليها تلقائيًا أبدًا، بتظهر هون لتردّ عليها أنت.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.outline)
    Spacer(Modifier.height(8.dp))
    if (inbox.isEmpty()) Text("ما في رسائل بعد", color = MaterialTheme.colorScheme.outline)
    inbox.forEach { item ->
        var reply by remember(item.id) { mutableStateOf("") }
        Card(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
            Column(Modifier.padding(12.dp)) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("${item.authorName} (${item.channel})", style = MaterialTheme.typography.titleSmall)
                    Text(interactionLabel(item.status), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
                }
                Text(item.message)
                item.reply?.let { Text("الرد: $it", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary) }
                if (item.status == "NEEDS_REVIEW" || item.status == "FAILED") {
                    OutlinedTextField(reply, { reply = it }, label = { Text("اكتب ردك") }, modifier = Modifier.fillMaxWidth(), keyboardOptions = KeyboardOptions.Default)
                    Button(onClick = { onSend(item.id, reply) }, enabled = !busy && reply.isNotBlank()) { Text("إرسال") }
                }
            }
        }
    }
}
