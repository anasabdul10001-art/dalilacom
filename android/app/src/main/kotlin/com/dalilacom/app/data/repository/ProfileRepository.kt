package com.dalilacom.app.data.repository

import com.dalilacom.app.data.network.ApiService
import com.dalilacom.app.data.network.ProfileDto
import com.dalilacom.app.data.network.UpdateProfileRequest
import com.dalilacom.app.data.network.errorText
import com.dalilacom.app.data.network.safeApiCall
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody

/** The signed-in account's own profile: name, description and photo. */
class ProfileRepository(private val api: ApiService) {

    /** Null when offline or signed out. */
    suspend fun me(): ProfileDto? {
        val response = safeApiCall { api.getProfile() } ?: return null
        return if (response.isSuccessful) response.body() else null
    }

    suspend fun update(fullName: String, bio: String): Result<ProfileDto> =
        result("تعذّر حفظ الملف الشخصي") { api.updateProfile(UpdateProfileRequest(fullName.trim(), bio.trim().ifBlank { null })) }

    /** [jpeg] is already cropped to a square and shrunk (see ImageUtil). */
    suspend fun uploadAvatar(jpeg: ByteArray): Result<ProfileDto> =
        result("تعذّر رفع الصورة") { api.uploadAvatar(jpeg.toRequestBody("image/jpeg".toMediaType())) }

    suspend fun removeAvatar(): Result<ProfileDto> = result("تعذّر حذف الصورة") { api.deleteAvatar() }

    private suspend fun result(fallback: String, call: suspend () -> retrofit2.Response<ProfileDto>): Result<ProfileDto> {
        val response = safeApiCall { call() } ?: return Result.failure(Exception("تعذّر الاتصال بالسيرفر، تحقق من الإنترنت"))
        val body = response.body()
        return if (response.isSuccessful && body != null) Result.success(body) else Result.failure(Exception(errorText(response, fallback)))
    }
}
