package com.dalilacom.app.data.repository

import com.dalilacom.app.R
import com.dalilacom.app.data.network.ApiService
import com.dalilacom.app.data.network.BroadcastDto
import com.dalilacom.app.data.network.BroadcastPreviewDto
import com.dalilacom.app.data.network.BroadcastPreviewRequest
import com.dalilacom.app.data.network.BroadcastRequest
import com.dalilacom.app.data.network.BroadcastResultDto
import com.dalilacom.app.data.network.errorText
import com.dalilacom.app.data.network.safeApiCall
import com.dalilacom.app.ui.i18n.AppStrings
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import retrofit2.Response

/** A merchant's announcements to the people around the shop: preview the reach, send for review, read the history. */
class BroadcastRepository(private val api: ApiService) {

    /** The cities a shop can address an announcement to (the people living there). */
    suspend fun cities(): List<com.dalilacom.app.data.network.GeoUnitDto> {
        val response = safeApiCall { api.geoUnits("CITY") } ?: return emptyList()
        return response.body().orEmpty().takeIf { response.isSuccessful } ?: emptyList()
    }

    suspend fun preview(request: BroadcastPreviewRequest): Result<BroadcastPreviewDto> {
        val response = safeApiCall { api.previewBroadcast(request) }
            ?: return Result.failure(Exception(AppStrings.get(R.string.s_d556272b)))
        val body = response.body()
        return if (response.isSuccessful && body != null) Result.success(body) else Result.failure(Exception(reason(response)))
    }

    suspend fun send(request: BroadcastRequest): Result<BroadcastResultDto> {
        val response = safeApiCall { api.sendBroadcast(request) }
            ?: return Result.failure(Exception(AppStrings.get(R.string.s_d556272b)))
        val body = response.body()
        return if (response.isSuccessful && body != null) Result.success(body) else Result.failure(Exception(reason(response)))
    }

    suspend fun history(): List<BroadcastDto> {
        val response = safeApiCall { api.getBroadcasts() } ?: return emptyList()
        return response.body().orEmpty().takeIf { response.isSuccessful } ?: emptyList()
    }

    /** The server's reason, in the app's language where the code is one we know. */
    private fun reason(response: Response<*>): String {
        val code = runCatching {
            val error = Json.parseToJsonElement(response.errorBody()?.string().orEmpty()).let { it as? JsonObject }?.get("error") as? JsonObject
            (error?.get("code") as? JsonPrimitive)?.content
        }.getOrNull()
        return when (code) {
            "SHOP_HAS_NO_LOCATION" -> AppStrings.get(R.string.promo_err_no_location)
            "RADIUS_TOO_LARGE" -> AppStrings.get(R.string.promo_err_radius)
            "BROADCAST_LIMIT" -> AppStrings.get(R.string.promo_err_limit)
            "MERCHANT_NOT_APPROVED" -> AppStrings.get(R.string.promo_err_not_approved)
            "AUDIENCE_TOO_LARGE" -> AppStrings.get(R.string.promo_err_audience)
            "INSUFFICIENT_BALANCE" -> AppStrings.get(R.string.promo_err_balance)
            else -> errorText(response, AppStrings.get(R.string.promo_err_generic))
        }
    }
}
