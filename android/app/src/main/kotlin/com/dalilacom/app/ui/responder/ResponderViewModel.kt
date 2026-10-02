package com.dalilacom.app.ui.responder

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.dalilacom.app.data.network.ChannelDto
import com.dalilacom.app.data.network.ConnectionDto
import com.dalilacom.app.data.network.CreateRuleRequest
import com.dalilacom.app.data.network.InboxItemDto
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
            _uiState.update {
                it.copy(
                    isLoading = false,
                    status = status.getOrNull() ?: it.status,
                    error = status.exceptionOrNull()?.message,
                    channels = channels,
                    connections = connections,
                    rules = rules,
                    inbox = inbox,
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
                    needsTopUp = failure?.message?.contains("رصيدك") == true,
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
        act(if (isFirstActivation) "تم التفعيل" else "تم تجديد الاشتراك") {
            if (isFirstActivation) repository.activate() else repository.renew()
        }
    }

    fun saveProfile(description: String, tone: String) =
        act("تم حفظ بيانات النشاط") { repository.saveProfile(description.trim(), tone.trim()) }

    fun connect(channelId: String, credentials: Map<String, String>) =
        act("تم ربط القناة") { repository.connect(channelId, credentials) }

    fun toggleConnection(id: String, active: Boolean) = act(null) { repository.toggleConnection(id, active) }

    fun addRule(name: String, keywords: String, mode: String, replyTemplate: String, aiInstructions: String) {
        val list = keywords.split(",", "،").map { it.trim() }.filter { it.isNotEmpty() }
        if (name.isBlank() || list.isEmpty()) {
            _uiState.update { it.copy(error = "اكتب اسم القاعدة وكلمة مفتاحية وحدة على الأقل", info = null) }
            return
        }
        val postIds = _uiState.value.selectedPostIds.toList()
        act("تمت إضافة القاعدة") {
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

    fun deleteRule(id: String) = act("تم حذف القاعدة") { repository.deleteRule(id) }

    fun sendReply(id: String, reply: String) {
        if (reply.isBlank()) return
        act("تم إرسال الرد") { repository.sendReply(id, reply.trim()) }
    }
}
