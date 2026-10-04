package com.dalilacom.app.data.repository

import com.dalilacom.app.data.network.ApiService
import com.dalilacom.app.data.network.HourRangeDto
import com.dalilacom.app.data.network.MerchantDto
import com.dalilacom.app.data.network.SetHoursRequest
import com.dalilacom.app.data.network.SuggestResponse
import com.dalilacom.app.data.network.errorText
import com.dalilacom.app.data.network.safeApiCall

/** Saved places, search suggestions and a merchant's opening hours. */
class PlacesRepository(private val api: ApiService) {

    suspend fun favoriteIds(): Set<String> {
        val response = safeApiCall { api.getFavoriteIds() } ?: return emptySet()
        return if (response.isSuccessful) response.body().orEmpty().toSet() else emptySet()
    }

    suspend fun favorites(): List<MerchantDto> {
        val response = safeApiCall { api.getFavorites() } ?: return emptyList()
        return if (response.isSuccessful) response.body().orEmpty() else emptyList()
    }

    /** Result.success(true) once saved/removed; failure carries the server's message (e.g. not signed in). */
    suspend fun setSaved(merchantId: String, saved: Boolean): Result<Boolean> {
        val response = safeApiCall { if (saved) api.saveFavorite(merchantId) else api.removeFavorite(merchantId) }
            ?: return Result.failure(Exception("تعذّر الاتصال بالسيرفر، تحقق من الإنترنت"))
        return if (response.isSuccessful) Result.success(saved) else Result.failure(Exception(errorText(response, "تعذّر الحفظ")))
    }

    suspend fun suggest(query: String): SuggestResponse {
        val response = safeApiCall { api.suggest(query) } ?: return SuggestResponse()
        return response.body()?.takeIf { response.isSuccessful } ?: SuggestResponse()
    }

    suspend fun setHours(hours: Map<String, List<HourRangeDto>>?): Result<Unit> {
        val response = safeApiCall { api.setHours(SetHoursRequest(hours)) }
            ?: return Result.failure(Exception("تعذّر الاتصال بالسيرفر، تحقق من الإنترنت"))
        return if (response.isSuccessful) Result.success(Unit) else Result.failure(Exception(errorText(response, "تعذّر حفظ ساعات العمل")))
    }
}
