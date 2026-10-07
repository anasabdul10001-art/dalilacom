package com.dalilacom.app.data.repository

import com.dalilacom.app.R
import com.dalilacom.app.ui.i18n.AppStrings
import com.dalilacom.app.data.network.ApiService
import com.dalilacom.app.data.network.HourRangeDto
import com.dalilacom.app.data.network.MerchantDto
import com.dalilacom.app.data.network.RouteDto
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
            ?: return Result.failure(Exception(AppStrings.get(R.string.s_d556272b)))
        return if (response.isSuccessful) Result.success(saved) else Result.failure(Exception(errorText(response, AppStrings.get(R.string.s_98bd1e1e))))
    }

    suspend fun suggest(query: String): SuggestResponse {
        val response = safeApiCall { api.suggest(query) } ?: return SuggestResponse()
        return response.body()?.takeIf { response.isSuccessful } ?: SuggestResponse()
    }

    /** The road route from [from] to [to] ("driving" or "walking"), with distance and time. */
    suspend fun route(from: Pair<Double, Double>, to: Pair<Double, Double>, mode: String): Result<RouteDto> {
        val response = safeApiCall { api.route(from.first, from.second, to.first, to.second, mode) }
            ?: return Result.failure(Exception(AppStrings.get(R.string.s_d556272b)))
        val body = response.body()
        return if (response.isSuccessful && body != null) Result.success(body)
        else Result.failure(Exception(errorText(response, AppStrings.get(R.string.s_e947849f))))
    }

    suspend fun setHours(hours: Map<String, List<HourRangeDto>>?): Result<Unit> {
        val response = safeApiCall { api.setHours(SetHoursRequest(hours)) }
            ?: return Result.failure(Exception(AppStrings.get(R.string.s_d556272b)))
        return if (response.isSuccessful) Result.success(Unit) else Result.failure(Exception(errorText(response, AppStrings.get(R.string.s_79e3c383))))
    }
}
