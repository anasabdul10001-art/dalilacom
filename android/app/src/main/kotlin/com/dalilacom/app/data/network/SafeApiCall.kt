package com.dalilacom.app.data.network

import com.dalilacom.app.R
import com.dalilacom.app.ui.i18n.AppStrings
import retrofit2.Response

/**
 * Retrofit throws (SocketTimeoutException, UnknownHostException, SerializationException, ...)
 * instead of returning an error Response when the call never makes it to a server response —
 * no connectivity, a slow/cold backend, a malformed body. Every repository call site wraps its
 * `api.xxx(...)` in this so a bad connection surfaces as an inline error instead of crashing
 * the whole app.
 */
suspend fun <T> safeApiCall(block: suspend () -> Response<T>): Response<T>? = try {
    block()
} catch (e: Exception) {
    null
}

/**
 * Turns a failed response into a user-facing message. The backend's unified error envelope is
 * {"error":{"code","message","details"}}; older responses were {"error":"text"} — both are
 * understood, and anything unparseable falls back to [fallback] instead of showing raw JSON.
 */
fun errorText(response: Response<*>, fallback: String): String {
    val raw = runCatching { response.errorBody()?.string() }.getOrNull() ?: return fallback
    return runCatching {
        val error = kotlinx.serialization.json.Json.parseToJsonElement(raw)
            .let { it as? kotlinx.serialization.json.JsonObject }?.get("error")
        when (error) {
            is kotlinx.serialization.json.JsonPrimitive -> error.content
            is kotlinx.serialization.json.JsonObject -> {
                if ((error["code"] as? kotlinx.serialization.json.JsonPrimitive)?.content == "AUTH_MISSING_TOKEN") return AppStrings.get(R.string.s_3bb9ad91)
                val details = error["details"] as? kotlinx.serialization.json.JsonObject
                val fields = details?.get("fieldErrors") as? kotlinx.serialization.json.JsonObject
                // a refused field is named in plain words (the server's own wording for it is technical)
                val named = fields?.keys?.firstNotNullOfOrNull {
                    when (it) {
                        "email", "newEmail" -> AppStrings.get(R.string.err_field_email)
                        "password", "newPassword" -> AppStrings.get(R.string.err_password_short)
                        "fullName" -> AppStrings.get(R.string.err_enter_name)
                        "phone" -> AppStrings.get(R.string.err_field_phone)
                        else -> null
                    }
                }
                val fieldError = fields?.values?.firstNotNullOfOrNull { (it as? kotlinx.serialization.json.JsonArray)?.firstOrNull() as? kotlinx.serialization.json.JsonPrimitive }
                named ?: fieldError?.content ?: (error["message"] as? kotlinx.serialization.json.JsonPrimitive)?.content ?: fallback
            }
            else -> fallback
        }
    }.getOrNull()?.takeIf { it.isNotBlank() } ?: fallback
}
