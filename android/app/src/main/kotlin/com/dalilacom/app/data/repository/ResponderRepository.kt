package com.dalilacom.app.data.repository

import com.dalilacom.app.R
import com.dalilacom.app.ui.i18n.AppStrings
import com.dalilacom.app.data.network.ApiService
import com.dalilacom.app.data.network.CreateRuleRequest
import com.dalilacom.app.data.network.ConnectRequest
import com.dalilacom.app.data.network.MetaOAuthCompleteRequest
import com.dalilacom.app.data.network.ProfileRequest
import com.dalilacom.app.data.network.SendReplyRequest
import com.dalilacom.app.data.network.ToggleRequest
import com.dalilacom.app.data.network.TopUpRequestBody
import com.dalilacom.app.data.network.errorText
import com.dalilacom.app.data.network.safeApiCall
import retrofit2.Response

/** Auto-responder + wallet calls. Every call returns a Result so screens can show the server's own message. */
class ResponderRepository(private val api: ApiService) {

    private suspend fun <T> call(fallback: String, block: suspend () -> Response<T>): Result<T> {
        val response = safeApiCall(block)
            ?: return Result.failure(Exception(AppStrings.get(R.string.s_d556272b)))
        val body = response.body()
        return if (response.isSuccessful && body != null) Result.success(body)
        else Result.failure(Exception(errorText(response, fallback)))
    }

    suspend fun status() = call(AppStrings.get(R.string.s_221bae78)) { api.getResponderStatus() }
    suspend fun activate() = call(AppStrings.get(R.string.s_da0717d9)) { api.activateResponder() }
    suspend fun renew() = call(AppStrings.get(R.string.s_daaa4ebe)) { api.renewResponder() }
    suspend fun saveProfile(description: String, tone: String, fallbackMode: String, fallbackReply: String) =
        call(AppStrings.get(R.string.s_98bd1e1e)) { api.saveResponderProfile(ProfileRequest(description, tone, fallbackMode, fallbackReply.ifBlank { null })) }

    suspend fun stats() = call(AppStrings.get(R.string.s_221bae78)) { api.getResponderStats() }

    suspend fun channels() = call(AppStrings.get(R.string.s_e51fe37e)) { api.getResponderChannels() }
    suspend fun connections() = call(AppStrings.get(R.string.s_bc12337c)) { api.getResponderConnections() }
    suspend fun connect(channelId: String, credentials: Map<String, String>) =
        call(AppStrings.get(R.string.s_f5f6d8c4)) { api.connectChannel(ConnectRequest(channelId, credentials)) }
    suspend fun toggleConnection(id: String, active: Boolean) =
        call(AppStrings.get(R.string.s_fd98f999)) { api.toggleConnection(id, ToggleRequest(active)) }

    suspend fun posts(connectionId: String) = call(AppStrings.get(R.string.s_a5f6da27)) { api.getConnectionPosts(connectionId) }

    suspend fun rules() = call(AppStrings.get(R.string.s_a3e249b8)) { api.getResponderRules() }
    suspend fun createRule(request: CreateRuleRequest) = call(AppStrings.get(R.string.s_471a369e)) { api.createResponderRule(request) }
    suspend fun toggleRule(id: String, active: Boolean) =
        call(AppStrings.get(R.string.s_fd98f999)) { api.toggleResponderRule(id, ToggleRequest(active)) }
    suspend fun deleteRule(id: String) = call(AppStrings.get(R.string.s_47228890)) { api.deleteResponderRule(id) }

    suspend fun inbox() = call(AppStrings.get(R.string.s_fdc54283)) { api.getResponderInbox() }
    suspend fun sendReply(id: String, reply: String) =
        call(AppStrings.get(R.string.s_0c05c599)) { api.sendInboxReply(id, SendReplyRequest(reply)) }

    // ---- Facebook Login (no Page token is ever typed by the merchant) ----
    suspend fun metaStatus() = call(AppStrings.get(R.string.s_a4409754)) { api.getMetaOAuthStatus() }
    suspend fun metaStart() = call(AppStrings.get(R.string.s_55cf1553)) { api.startMetaOAuth() }
    suspend fun metaSession(sessionId: String) = call(AppStrings.get(R.string.s_d685576e)) { api.getMetaOAuthSession(sessionId) }
    suspend fun metaComplete(sessionId: String, pageId: String, driver: String) =
        call(AppStrings.get(R.string.s_6e274458)) { api.completeMetaOAuth(MetaOAuthCompleteRequest(sessionId, pageId, driver)) }

    suspend fun wallet() = call(AppStrings.get(R.string.s_06a4e0cc)) { api.getWallet() }
    suspend fun walletMethods() = call(AppStrings.get(R.string.s_5f10f855)) { api.getWalletMethods() }
    suspend fun topUp(method: String, reference: String, amount: Double?) =
        call(AppStrings.get(R.string.s_afabc0f2)) { api.submitTopUp(TopUpRequestBody(method, reference, amount)) }
}
