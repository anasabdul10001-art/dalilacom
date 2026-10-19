package com.dalilacom.app.data.repository

import com.dalilacom.app.R
import com.dalilacom.app.data.network.ApiService
import com.dalilacom.app.data.network.ClaimRequest
import com.dalilacom.app.data.network.ClaimStateDto
import com.dalilacom.app.data.network.LandmarkDto
import com.dalilacom.app.data.network.errorText
import com.dalilacom.app.data.network.safeApiCall
import com.dalilacom.app.ui.i18n.AppStrings
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody

/** A public place (a private hospital) whose owner or manager asks to take it over, with photos of proof. */
class LandmarkRepository(private val api: ApiService) {
    suspend fun landmark(id: String): LandmarkDto? = safeApiCall { api.landmark(id) }?.takeIf { it.isSuccessful }?.body()

    suspend fun myClaim(id: String): ClaimStateDto? = safeApiCall { api.myLandmarkClaim(id) }?.takeIf { it.isSuccessful }?.body()?.claim

    /** Returns the new request's id, or the server's own message. */
    suspend fun submit(landmarkId: String, role: String, phone: String, note: String?): Result<String> {
        val response = safeApiCall { api.submitLandmarkClaim(landmarkId, ClaimRequest(role, phone, note?.ifBlank { null })) }
            ?: return Result.failure(Exception(AppStrings.get(R.string.s_d556272b)))
        val body = response.body()
        return if (response.isSuccessful && body != null) Result.success(body.id) else Result.failure(Exception(errorText(response, AppStrings.get(R.string.lm_failed))))
    }

    suspend fun upload(claimId: String, name: String, jpeg: ByteArray): Result<Unit> {
        val response = safeApiCall { api.uploadClaimFile(claimId, name, jpeg.toRequestBody("image/jpeg".toMediaType())) }
            ?: return Result.failure(Exception(AppStrings.get(R.string.s_d556272b)))
        return if (response.isSuccessful) Result.success(Unit) else Result.failure(Exception(errorText(response, AppStrings.get(R.string.lm_photo_failed))))
    }

    suspend fun withdraw(claimId: String): Result<Unit> {
        val response = safeApiCall { api.withdrawLandmarkClaim(claimId) } ?: return Result.failure(Exception(AppStrings.get(R.string.s_d556272b)))
        return if (response.isSuccessful) Result.success(Unit) else Result.failure(Exception(errorText(response, AppStrings.get(R.string.lm_failed))))
    }

    suspend fun resubmit(claimId: String, note: String?): Result<Unit> {
        val response = safeApiCall { api.resubmitLandmarkClaim(claimId, mapOf("note" to note?.ifBlank { null })) } ?: return Result.failure(Exception(AppStrings.get(R.string.s_d556272b)))
        return if (response.isSuccessful) Result.success(Unit) else Result.failure(Exception(errorText(response, AppStrings.get(R.string.lm_failed))))
    }
}
