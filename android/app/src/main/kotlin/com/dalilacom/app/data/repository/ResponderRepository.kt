package com.dalilacom.app.data.repository

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
            ?: return Result.failure(Exception("تعذّر الاتصال بالسيرفر، تحقق من الإنترنت"))
        val body = response.body()
        return if (response.isSuccessful && body != null) Result.success(body)
        else Result.failure(Exception(errorText(response, fallback)))
    }

    suspend fun status() = call("تعذّر تحميل الحالة") { api.getResponderStatus() }
    suspend fun activate() = call("تعذّر التفعيل") { api.activateResponder() }
    suspend fun renew() = call("تعذّر التجديد") { api.renewResponder() }
    suspend fun saveProfile(description: String, tone: String) =
        call("تعذّر الحفظ") { api.saveResponderProfile(ProfileRequest(description, tone)) }

    suspend fun channels() = call("تعذّر تحميل القنوات") { api.getResponderChannels() }
    suspend fun connections() = call("تعذّر تحميل الاتصالات") { api.getResponderConnections() }
    suspend fun connect(channelId: String, credentials: Map<String, String>) =
        call("تعذّر ربط القناة") { api.connectChannel(ConnectRequest(channelId, credentials)) }
    suspend fun toggleConnection(id: String, active: Boolean) =
        call("تعذّر التعديل") { api.toggleConnection(id, ToggleRequest(active)) }

    suspend fun posts(connectionId: String) = call("تعذّر جلب المنشورات") { api.getConnectionPosts(connectionId) }

    suspend fun rules() = call("تعذّر تحميل القواعد") { api.getResponderRules() }
    suspend fun createRule(request: CreateRuleRequest) = call("تعذّرت إضافة القاعدة") { api.createResponderRule(request) }
    suspend fun toggleRule(id: String, active: Boolean) =
        call("تعذّر التعديل") { api.toggleResponderRule(id, ToggleRequest(active)) }
    suspend fun deleteRule(id: String) = call("تعذّر الحذف") { api.deleteResponderRule(id) }

    suspend fun inbox() = call("تعذّر تحميل الوارد") { api.getResponderInbox() }
    suspend fun sendReply(id: String, reply: String) =
        call("تعذّر إرسال الرد") { api.sendInboxReply(id, SendReplyRequest(reply)) }

    // ---- Facebook Login (no Page token is ever typed by the merchant) ----
    suspend fun metaStatus() = call("تعذّر تحميل حالة الربط بفيسبوك") { api.getMetaOAuthStatus() }
    suspend fun metaStart() = call("تعذّر بدء الربط بفيسبوك") { api.startMetaOAuth() }
    suspend fun metaSession(sessionId: String) = call("تعذّر تحميل صفحاتك") { api.getMetaOAuthSession(sessionId) }
    suspend fun metaComplete(sessionId: String, pageId: String, driver: String) =
        call("تعذّر ربط الصفحة") { api.completeMetaOAuth(MetaOAuthCompleteRequest(sessionId, pageId, driver)) }

    suspend fun wallet() = call("تعذّر تحميل المحفظة") { api.getWallet() }
    suspend fun walletMethods() = call("تعذّر تحميل طرق الدفع") { api.getWalletMethods() }
    suspend fun topUp(method: String, reference: String, amount: Double?) =
        call("تعذّر إرسال طلب الشحن") { api.submitTopUp(TopUpRequestBody(method, reference, amount)) }
}
