package com.dalilacom.app.ui.responder

import com.dalilacom.app.R
import com.dalilacom.app.ui.i18n.AppStrings
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.dalilacom.app.data.network.ChannelDto
import com.dalilacom.app.data.network.ConnectionDto
import com.dalilacom.app.data.network.CreateRuleRequest
import com.dalilacom.app.data.network.InboxItemDto
import com.dalilacom.app.data.network.MetaOAuthStatusDto
import com.dalilacom.app.data.network.MetaPageDto
import com.dalilacom.app.data.network.PostDto
import com.dalilacom.app.data.network.ResponderStatusDto
import com.dalilacom.app.data.network.RuleDto
import com.dalilacom.app.data.repository.ResponderRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class ResponderUiState(
    val isLoading: Boolean = true,
    val isBusy: Boolean = false,
    val error: String? = null,
    val info: String? = null,
    val needsTopUp: Boolean = false,
    val status: ResponderStatusDto? = null,
    val channels: List<ChannelDto> = emptyList(),
    val connections: List<ConnectionDto> = emptyList(),
    val rules: List<RuleDto> = emptyList(),
    val inbox: List<InboxItemDto> = emptyList(),
    val tab: Int = 0,
    val posts: List<PostDto> = emptyList(),
    val postsLoading: Boolean = false,
    val postsConnectionId: String? = null,
    val selectedPostIds: Set<String> = emptySet(),
    // Facebook Login state: the status tells us whether the feature is configured at all, metaAuthUrl
    // is a URL the screen must open in a browser, and metaPages is the picker once the browser hands
    // the flow back to the app.
    val metaStatus: MetaOAuthStatusDto? = null,
    val metaAuthUrl: String? = null,
    val metaSessionId: String? = null,
    val metaPages: List<MetaPageDto> = emptyList(),
    val metaLoading: Boolean = false,
)

class ResponderViewModel(private val repository: ResponderRepository) : ViewModel() {
    private val _uiState = MutableStateFlow(ResponderUiState())
    val uiState: StateFlow<ResponderUiState> = _uiState.asStateFlow()

    init {
        refresh()
    }

    fun setTab(tab: Int) = _uiState.update { it.copy(tab = tab, error = null, info = null) }

    fun refresh() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }
            val status = repository.status()
            val channels = repository.channels().getOrNull().orEmpty()
            val connections = repository.connections().getOrNull().orEmpty()
            val rules = repository.rules().getOrNull().orEmpty()
            val inbox = repository.inbox().getOrNull().orEmpty()
            val metaStatus = repository.metaStatus().getOrNull()
            _uiState.update {
                it.copy(
                    isLoading = false,
                    status = status.getOrNull() ?: it.status,
                    error = status.exceptionOrNull()?.message,
                    channels = channels,
                    connections = connections,
                    rules = rules,
                    inbox = inbox,
                    metaStatus = metaStatus ?: it.metaStatus,
                )
            }
        }
    }

    private fun act(success: String?, block: suspend () -> Result<*>) {
        viewModelScope.launch {
            _uiState.update { it.copy(isBusy = true, error = null, info = null, needsTopUp = false) }
            val result = block()
            val failure = result.exceptionOrNull()
            _uiState.update {
                it.copy(
                    isBusy = false,
                    error = failure?.message,
                    needsTopUp = failure?.message?.contains(AppStrings.get(R.string.s_a2750cc7)) == true,
                    info = if (failure == null) success else null,
                )
            }
            if (failure == null) refresh()
        }
    }

    private fun clearPostPicker() =
        _uiState.update { it.copy(posts = emptyList(), postsConnectionId = null, selectedPostIds = emptySet()) }

    fun activateOrRenew() {
        val status = _uiState.value.status ?: return
        val isFirstActivation = !status.running && status.status != "EXPIRED"
        act(if (isFirstActivation) AppStrings.get(R.string.s_fd85c447) else AppStrings.get(R.string.s_937c3091)) {
            if (isFirstActivation) repository.activate() else repository.renew()
        }
    }

    fun saveProfile(description: String, tone: String) =
        act(AppStrings.get(R.string.s_a1ec84ae)) { repository.saveProfile(description.trim(), tone.trim()) }

    fun connect(channelId: String, credentials: Map<String, String>) =
        act(AppStrings.get(R.string.s_0224de46)) { repository.connect(channelId, credentials) }

    fun toggleConnection(id: String, active: Boolean) = act(null) { repository.toggleConnection(id, active) }

    fun addRule(name: String, keywords: String, mode: String, replyTemplate: String, aiInstructions: String) {
        val list = keywords.split(",", AppStrings.get(R.string.s_2e1a34c3)).map { it.trim() }.filter { it.isNotEmpty() }
        if (name.isBlank() || list.isEmpty()) {
            _uiState.update { it.copy(error = AppStrings.get(R.string.s_56be3fdb), info = null) }
            return
        }
        val postIds = _uiState.value.selectedPostIds.toList()
        act(AppStrings.get(R.string.s_14737605)) {
            repository.createRule(CreateRuleRequest(name.trim(), list, mode, replyTemplate.trim(), aiInstructions.trim(), postIds))
                .also { if (it.isSuccess) clearPostPicker() }
        }
    }

    fun toggleRule(id: String, active: Boolean) = act(null) { repository.toggleRule(id, active) }

    /** Loads the recent posts of a Facebook/Instagram connection so a rule can be limited to some of them. */
    fun loadPosts(connectionId: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(postsLoading = true, postsConnectionId = connectionId, posts = emptyList(), selectedPostIds = emptySet(), error = null) }
            val result = repository.posts(connectionId)
            _uiState.update { it.copy(postsLoading = false, posts = result.getOrNull().orEmpty(), error = result.exceptionOrNull()?.message) }
        }
    }

    fun togglePost(id: String) = _uiState.update {
        it.copy(selectedPostIds = if (id in it.selectedPostIds) it.selectedPostIds - id else it.selectedPostIds + id)
    }

    fun deleteRule(id: String) = act(AppStrings.get(R.string.s_d3f3e653)) { repository.deleteRule(id) }

    /* ---------------- Facebook Login (section 7/23) ---------------- */

    /** Asks the server for a Facebook dialog URL; the screen opens it in a browser. */
    fun startMetaOAuth() {
        viewModelScope.launch {
            _uiState.update { it.copy(metaLoading = true, error = null, info = null, metaPages = emptyList()) }
            val result = repository.metaStart()
            _uiState.update {
                it.copy(
                    metaLoading = false,
                    metaAuthUrl = result.getOrNull()?.url,
                    error = result.exceptionOrNull()?.message,
                )
            }
        }
    }

    /** The URL was handed to the browser — clear it so a recomposition doesn't open it twice. */
    fun consumeMetaAuthUrl() = _uiState.update { it.copy(metaAuthUrl = null) }

    /** The app path: the browser came back with a session id, so the picker happens in the app. */
    fun loadMetaSession(sessionId: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(metaLoading = true, metaSessionId = sessionId, error = null, info = null) }
            val result = repository.metaSession(sessionId)
            _uiState.update {
                it.copy(
                    metaLoading = false,
                    metaPages = result.getOrNull()?.pages.orEmpty(),
                    metaSessionId = result.getOrNull()?.sessionId ?: sessionId,
                    error = result.exceptionOrNull()?.message,
                )
            }
        }
    }

    fun completeMetaOAuth(pageId: String, driver: String) {
        val sessionId = _uiState.value.metaSessionId ?: return
        viewModelScope.launch {
            _uiState.update { it.copy(metaLoading = true, error = null, info = null) }
            val result = repository.metaComplete(sessionId, pageId, driver)
            val failure = result.exceptionOrNull()
            _uiState.update {
                it.copy(
                    metaLoading = false,
                    error = failure?.message,
                    info = if (failure == null) AppStrings.get(R.string.s_ef73b75f) else null,
                    metaPages = if (failure == null) emptyList() else it.metaPages,
                )
            }
            if (failure == null) refresh()
        }
    }

    fun clearMetaPages() = _uiState.update { it.copy(metaPages = emptyList(), metaSessionId = null) }

    /** Back from the browser through the dalilacom:// deep link: report it and reload the channels. */
    fun onMetaReturned(ok: Boolean, connectionId: String?) {
        _uiState.update {
            it.copy(
                info = if (ok) AppStrings.get(R.string.s_7121fbcc) else null,
                error = if (ok) null else AppStrings.get(R.string.s_c758841f),
            )
        }
        if (ok && connectionId != null) refresh()
    }

    fun sendReply(id: String, reply: String) {
        if (reply.isBlank()) return
        act(AppStrings.get(R.string.s_e470027c)) { repository.sendReply(id, reply.trim()) }
    }
}
