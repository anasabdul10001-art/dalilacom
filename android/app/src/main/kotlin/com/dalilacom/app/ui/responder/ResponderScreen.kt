package com.dalilacom.app.ui.responder

import com.dalilacom.app.R
import com.dalilacom.app.ui.i18n.AppStrings
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
import androidx.compose.material3.Checkbox
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
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.dalilacom.app.data.network.InboxItemDto
import com.dalilacom.app.data.network.MetaPageDto
import com.dalilacom.app.data.network.ResponderStatusDto
import com.dalilacom.app.ui.ViewModelFactory
import com.dalilacom.app.ui.pricing.ServiceWelcome

private val TAB_TITLES get() = listOf(AppStrings.get(R.string.s_90a91c96), AppStrings.get(R.string.s_53655660), AppStrings.get(R.string.s_b642dd5a), AppStrings.get(R.string.s_a3e7dfc4))

private fun statusLabel(status: String) = when (status) {
    "TRIAL" -> AppStrings.get(R.string.s_4e387930)
    "ACTIVE" -> AppStrings.get(R.string.s_89a4c18a)
    "EXPIRED" -> AppStrings.get(R.string.s_a6ed2a71)
    else -> AppStrings.get(R.string.s_439b0d4e)
}

private fun interactionLabel(status: String) = when (status) {
    "SENT" -> AppStrings.get(R.string.s_a549b16b)
    "NEEDS_REVIEW" -> AppStrings.get(R.string.s_4b028e52)
    "FAILED" -> AppStrings.get(R.string.s_ee5aea07)
    else -> AppStrings.get(R.string.s_d7359b3c)
}

@Composable
fun ResponderScreen(
    factory: ViewModelFactory,
    onBack: () -> Unit,
    onOpenWallet: () -> Unit,
    /** Come back from the browser through dalilacom://responder/meta (null unless we were sent there). */
    metaOk: Boolean? = null,
    metaConnectionId: String? = null,
    /** Several Pages: the server sent the session so the merchant picks inside the app. */
    metaSessionId: String? = null,
) {
    val viewModel: ResponderViewModel = viewModel(factory = factory)
    val state by viewModel.uiState.collectAsState()
    val context = LocalContext.current

    // The browser handed the flow back: either it already connected a Page, or it wants the app to pick one.
    LaunchedEffect(metaOk, metaConnectionId) {
        if (metaOk != null) viewModel.onMetaReturned(metaOk, metaConnectionId)
    }
    LaunchedEffect(metaSessionId) {
        metaSessionId?.let { viewModel.loadMetaSession(it) }
    }
    // A start request produced a dialog URL: show it inside the app, then forget it so a redraw doesn't reopen it.
    var loginUrl by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(state.metaAuthUrl) {
        state.metaAuthUrl?.let {
            loginUrl = it
            viewModel.consumeMetaAuthUrl()
        }
    }
    loginUrl?.let { MetaLoginWebView(url = it, onClose = { loginUrl = null }) }

    Column(modifier = Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            TextButton(onClick = onBack) { Text(AppStrings.get(R.string.s_328ddce5)) }
            Text(AppStrings.get(R.string.s_2136e58d), style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.primary)
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
                OutlinedButton(onClick = onOpenWallet) { Text(AppStrings.get(R.string.s_f85fd2a4)) }
            }
            if (state.error != null || state.info != null) Spacer(Modifier.height(10.dp))

            when (state.tab) {
                0 -> OverviewTab(state.status, state.stats, state.isBusy, onActivate = viewModel::activateOrRenew, onSaveProfile = viewModel::saveProfile)
                1 -> ChannelsTab(state, viewModel)
                2 -> RulesTab(state, viewModel)
                else -> InboxTab(state.inbox, state.isBusy, onSend = viewModel::sendReply)
            }
        }
    }
}

@Composable
private fun OverviewTab(
    status: ResponderStatusDto?,
    stats: com.dalilacom.app.data.network.ResponderStatsDto?,
    busy: Boolean,
    onActivate: () -> Unit,
    onSaveProfile: (String, String, String, String) -> Unit,
) {
    if (status == null) {
        Text(AppStrings.get(R.string.s_8c818f60))
        return
    }
    // First visit: the service's own welcome — the free period and the price after it — before the status.
    val firstVisit = !status.running && status.status != "EXPIRED"
    if (firstVisit) {
        ServiceWelcome(
            title = AppStrings.get(R.string.intro_responder_title),
            body = AppStrings.get(R.string.intro_responder_body),
            trialDays = if (status.trialAvailable) status.trialDays else 0,
            price = "${status.price} ${status.creditName}",
            periodDays = status.periodDays,
        )
        Spacer(Modifier.height(12.dp))
    }
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp)) {
            Text(AppStrings.get(R.string.fmt_status, statusLabel(status.status)), style = MaterialTheme.typography.titleMedium)
            val until = (if (status.status == "TRIAL") status.trialEndsAt else status.periodEnd)?.take(10)
            if (until != null && status.running) Text(AppStrings.get(R.string.fmt_ends_on, until))
            Text(AppStrings.get(R.string.fmt_your_balance, status.balance, status.creditName))
            Text(AppStrings.get(R.string.fmt_price_every, status.price, status.creditName, status.periodDays))
            if (status.aiReplyLimit > 0) Text(AppStrings.get(R.string.fmt_ai_replies, status.aiRepliesUsed, status.aiReplyLimit))
            if (stats != null && status.running) Text(AppStrings.get(R.string.fmt_responder_stats, stats.sent, stats.needsReview, stats.failed), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(12.dp))
            val label = when {
                !status.running && status.status != "EXPIRED" && status.trialAvailable -> AppStrings.get(R.string.intro_continue)
                !status.running && status.status != "EXPIRED" -> AppStrings.get(R.string.fmt_subscribe_price, status.price, status.creditName)
                else -> AppStrings.get(R.string.fmt_renew_price, status.price, status.creditName)
            }
            Button(onClick = onActivate, enabled = !busy, modifier = Modifier.fillMaxWidth()) { Text(label) }
        }
    }

    Spacer(Modifier.height(16.dp))
    var description by remember(status.businessDescription) { mutableStateOf(status.businessDescription.orEmpty()) }
    var tone by remember(status.tone) { mutableStateOf(status.tone.orEmpty()) }
    Text(AppStrings.get(R.string.s_dc09c826), style = MaterialTheme.typography.titleSmall)
    OutlinedTextField(description, { description = it }, label = { Text(AppStrings.get(R.string.s_04230bfd)) }, modifier = Modifier.fillMaxWidth(), minLines = 3)
    OutlinedTextField(tone, { tone = it }, label = { Text(AppStrings.get(R.string.s_6d05e053)) }, modifier = Modifier.fillMaxWidth())
    // What to do with a message no rule matches.
    var fallbackMode by remember(status.fallbackMode) { mutableStateOf(status.fallbackMode) }
    var fallbackReply by remember(status.fallbackReply) { mutableStateOf(status.fallbackReply.orEmpty()) }
    Spacer(Modifier.height(8.dp))
    Text(AppStrings.get(R.string.responder_fallback_title), style = MaterialTheme.typography.labelLarge)
    androidx.compose.foundation.layout.Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        androidx.compose.material3.FilterChip(selected = fallbackMode == "OFF", onClick = { fallbackMode = "OFF" }, label = { Text(AppStrings.get(R.string.responder_fallback_off)) })
        androidx.compose.material3.FilterChip(selected = fallbackMode == "AI", onClick = { fallbackMode = "AI" }, label = { Text(AppStrings.get(R.string.responder_fallback_ai)) })
        androidx.compose.material3.FilterChip(selected = fallbackMode == "TEMPLATE", onClick = { fallbackMode = "TEMPLATE" }, label = { Text(AppStrings.get(R.string.responder_fallback_text)) })
    }
    if (fallbackMode == "TEMPLATE") {
        OutlinedTextField(fallbackReply, { fallbackReply = it }, label = { Text(AppStrings.get(R.string.responder_fallback_reply)) }, modifier = Modifier.fillMaxWidth(), minLines = 2)
    }
    Spacer(Modifier.height(8.dp))
    OutlinedButton(onClick = { onSaveProfile(description, tone, fallbackMode, fallbackReply) }, enabled = !busy) { Text(AppStrings.get(R.string.s_56ee6e0d)) }
}

@Composable
private fun ChannelsTab(
    state: ResponderUiState,
    viewModel: ResponderViewModel,
) {
    val channels = state.channels
    val connections = state.connections
    val busy = state.isBusy

    FacebookCard(state, viewModel)

    Spacer(Modifier.height(16.dp))
    Text(AppStrings.get(R.string.s_53bd39b7), style = MaterialTheme.typography.titleMedium)
    Spacer(Modifier.height(8.dp))
    channels.forEach { channel ->
        var expanded by remember { mutableStateOf(false) }
        val values = remember { mutableStateOf(mapOf<String, String>()) }
        Card(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
            Column(Modifier.padding(12.dp)) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Text(channel.name, style = MaterialTheme.typography.titleSmall)
                    if (channel.connectable) {
                        TextButton(onClick = { expanded = !expanded }) { Text(if (expanded) AppStrings.get(R.string.s_5bf826c5) else AppStrings.get(R.string.s_c91b0e1d)) }
                    } else {
                        Text(AppStrings.get(R.string.s_f008af11), color = MaterialTheme.colorScheme.outline)
                    }
                }
                // Facebook and Instagram are meant to be connected by signing in, not by pasting a
                // token — the fields stay available as a manual fallback only.
                if (expanded && channel.connectable) {
                    if (channel.key == "facebook" || channel.key == "instagram") {
                        Text(
                            AppStrings.get(R.string.s_a26cb7f2),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.outline,
                        )
                        Spacer(Modifier.height(6.dp))
                    }
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
                    ) { Text(AppStrings.get(R.string.s_2a837234)) }
                }
            }
        }
    }

    Spacer(Modifier.height(16.dp))
    Text(AppStrings.get(R.string.s_1be55892), style = MaterialTheme.typography.titleMedium)
    if (connections.isEmpty()) Text(AppStrings.get(R.string.s_57833160), color = MaterialTheme.colorScheme.outline)
    connections.forEach { connection ->
        Card(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
            Column(Modifier.padding(12.dp)) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Text("${connection.channel}${connection.externalAccountId?.let { " — $it" } ?: ""}")
                    Switch(checked = connection.isActive, onCheckedChange = { viewModel.toggleConnection(connection.id, it) })
                }
                connection.hookUrl?.let { Text(AppStrings.get(R.string.fmt_hook_url, it), style = MaterialTheme.typography.bodySmall) }
            }
        }
    }
}

/**
 * "Log in with Facebook" (section 7/23): the merchant signs in to Facebook, grants access to a Page,
 * and we store the Page token ourselves — nothing is copied out of the Meta dashboard.
 */
@Composable
private fun FacebookCard(state: ResponderUiState, viewModel: ResponderViewModel) {
    val status = state.metaStatus
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp)) {
            Text(AppStrings.get(R.string.s_9aa19dc9), style = MaterialTheme.typography.titleMedium)
            Text(
                AppStrings.get(R.string.s_8c7eace2),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.outline,
            )
            Spacer(Modifier.height(10.dp))

            when {
                status == null -> Text(AppStrings.get(R.string.s_d036d6bd))
                !status.available -> Text(
                    AppStrings.get(R.string.s_b89a6549) +
                        AppStrings.get(R.string.s_a3836012),
                    color = MaterialTheme.colorScheme.error,
                )
                !status.responderRunning -> Text(AppStrings.get(R.string.s_cd1c71a4), color = MaterialTheme.colorScheme.error)
                else -> {
                    Button(
                        onClick = { viewModel.startMetaOAuth() },
                        enabled = !state.metaLoading && !state.isBusy,
                        modifier = Modifier.fillMaxWidth(),
                    ) { Text(AppStrings.get(R.string.s_9aa19dc9)) }
                }
            }

            if (state.metaLoading) {
                Spacer(Modifier.height(10.dp))
                CircularProgressIndicator()
            }

            // The browser came back with several Pages: pick one here, inside the app.
            if (state.metaPages.isNotEmpty()) {
                Spacer(Modifier.height(12.dp))
                Text(AppStrings.get(R.string.s_6310b20d), style = MaterialTheme.typography.titleSmall)
                state.metaPages.forEach { page: MetaPageDto ->
                    Card(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                        Column(Modifier.padding(12.dp)) {
                            Text(page.name.ifBlank { page.id }, style = MaterialTheme.typography.bodyLarge)
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 6.dp)) {
                                Button(
                                    onClick = { viewModel.completeMetaOAuth(page.id, "FACEBOOK") },
                                    enabled = !state.metaLoading,
                                ) { Text(AppStrings.get(R.string.s_21019a65)) }
                                if (page.hasInstagram) {
                                    OutlinedButton(
                                        onClick = { viewModel.completeMetaOAuth(page.id, "INSTAGRAM") },
                                        enabled = !state.metaLoading,
                                    ) {
                                        Text(page.instagramUsername?.let { AppStrings.get(R.string.fmt_connect_ig, it) } ?: AppStrings.get(R.string.s_02cdc94a))
                                    }
                                }
                            }
                        }
                    }
                }
                TextButton(onClick = { viewModel.clearMetaPages() }) { Text(AppStrings.get(R.string.s_e776b020)) }
            }
        }
    }
}

@Composable
private fun RulesTab(state: ResponderUiState, viewModel: ResponderViewModel) {
    val rules = state.rules
    val busy = state.isBusy
    var name by remember { mutableStateOf("") }
    var keywords by remember { mutableStateOf("") }
    var mode by remember { mutableStateOf("FIXED") }
    var template by remember { mutableStateOf("") }
    var instructions by remember { mutableStateOf("") }

    Text(AppStrings.get(R.string.s_c9fbbd3c), style = MaterialTheme.typography.titleMedium)
    OutlinedTextField(name, { name = it }, label = { Text(AppStrings.get(R.string.s_5ffc2bb8)) }, modifier = Modifier.fillMaxWidth(), singleLine = true)
    OutlinedTextField(keywords, { keywords = it }, label = { Text(AppStrings.get(R.string.s_d82b4deb)) }, modifier = Modifier.fillMaxWidth())
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(vertical = 6.dp)) {
        FilterChip(selected = mode == "FIXED", onClick = { mode = "FIXED" }, label = { Text(AppStrings.get(R.string.s_38ceca24)) })
        FilterChip(selected = mode == "AI", onClick = { mode = "AI" }, label = { Text(AppStrings.get(R.string.s_ec6d9289)) })
    }
    if (mode == "FIXED") {
        OutlinedTextField(template, { template = it }, label = { Text(AppStrings.get(R.string.s_a5e584ae)) }, modifier = Modifier.fillMaxWidth(), minLines = 2)
    } else {
        OutlinedTextField(instructions, { instructions = it }, label = { Text(AppStrings.get(R.string.s_54b49c02)) }, modifier = Modifier.fillMaxWidth(), minLines = 2)
        OutlinedTextField(template, { template = it }, label = { Text(AppStrings.get(R.string.s_faa866bc)) }, modifier = Modifier.fillMaxWidth())
    }
    val socialConnections = state.connections.filter { it.supportsPosts }
    if (socialConnections.isNotEmpty()) {
        Spacer(Modifier.height(10.dp))
        Text(AppStrings.get(R.string.s_ca70f840), style = MaterialTheme.typography.titleSmall)
        Text(AppStrings.get(R.string.s_e0501ddf), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.outline)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(vertical = 6.dp)) {
            socialConnections.forEach { connection ->
                FilterChip(
                    selected = state.postsConnectionId == connection.id,
                    onClick = { viewModel.loadPosts(connection.id) },
                    label = { Text(connection.channel) },
                )
            }
        }
        if (state.postsLoading) CircularProgressIndicator()
        state.posts.forEach { post ->
            Row(
                modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Checkbox(checked = post.id in state.selectedPostIds, onCheckedChange = { viewModel.togglePost(post.id) })
                Column(Modifier.weight(1f)) {
                    Text(post.text.take(90), style = MaterialTheme.typography.bodyMedium, maxLines = 2)
                    post.createdAt?.take(10)?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.outline) }
                }
            }
        }
        if (state.selectedPostIds.isNotEmpty()) {
            Text(AppStrings.get(R.string.fmt_posts_selected, state.selectedPostIds.size), color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.bodySmall)
        }
    }

    Spacer(Modifier.height(8.dp))
    Button(
        onClick = {
            viewModel.addRule(name, keywords, mode, template, instructions)
            name = ""; keywords = ""; template = ""; instructions = ""
        },
        enabled = !busy,
    ) { Text(AppStrings.get(R.string.s_7f9255f4)) }

    Spacer(Modifier.height(16.dp))
    Text(AppStrings.get(R.string.s_b045d443), style = MaterialTheme.typography.titleMedium)
    if (rules.isEmpty()) Text(AppStrings.get(R.string.s_c33c7465), color = MaterialTheme.colorScheme.outline)
    rules.forEach { rule ->
        Card(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
            Column(Modifier.padding(12.dp)) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Text(rule.name, style = MaterialTheme.typography.titleSmall)
                    Switch(checked = rule.isActive, onCheckedChange = { viewModel.toggleRule(rule.id, it) })
                }
                Text(AppStrings.get(R.string.fmt_keywords, rule.keywords.joinToString(AppStrings.get(R.string.list_separator))), style = MaterialTheme.typography.bodySmall)
                if (rule.postIds.isNotEmpty()) Text(AppStrings.get(R.string.fmt_limited_posts, rule.postIds.size), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
                Text(if (rule.mode == "AI") AppStrings.get(R.string.s_ec6d9289) else AppStrings.get(R.string.fmt_fixed_reply, rule.replyTemplate.orEmpty()), style = MaterialTheme.typography.bodySmall)
                TextButton(onClick = { viewModel.deleteRule(rule.id) }) { Text(AppStrings.get(R.string.s_2d2bbdc2), color = MaterialTheme.colorScheme.error) }
            }
        }
    }
}

@Composable
private fun InboxTab(inbox: List<InboxItemDto>, busy: Boolean, onSend: (String, String) -> Unit) {
    Text(AppStrings.get(R.string.s_a6f73674), style = MaterialTheme.typography.titleMedium)
    Text(AppStrings.get(R.string.s_f542f592), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.outline)
    Spacer(Modifier.height(8.dp))
    if (inbox.isEmpty()) Text(AppStrings.get(R.string.s_7b3296cc), color = MaterialTheme.colorScheme.outline)
    inbox.forEach { item ->
        var reply by remember(item.id) { mutableStateOf("") }
        Card(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
            Column(Modifier.padding(12.dp)) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("${item.authorName} (${item.channel})", style = MaterialTheme.typography.titleSmall)
                    Text(interactionLabel(item.status), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
                }
                Text(item.message)
                item.reply?.let { Text(AppStrings.get(R.string.fmt_reply, it), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary) }
                if (item.status == "NEEDS_REVIEW" || item.status == "FAILED") {
                    OutlinedTextField(reply, { reply = it }, label = { Text(AppStrings.get(R.string.s_47428e01)) }, modifier = Modifier.fillMaxWidth(), keyboardOptions = KeyboardOptions.Default)
                    Button(onClick = { onSend(item.id, reply) }, enabled = !busy && reply.isNotBlank()) { Text(AppStrings.get(R.string.s_90cf87a4)) }
                }
            }
        }
    }
}
