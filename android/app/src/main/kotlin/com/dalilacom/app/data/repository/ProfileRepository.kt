package com.dalilacom.app.data.repository

import com.dalilacom.app.R
import com.dalilacom.app.ui.i18n.AppStrings
import com.dalilacom.app.data.network.ApiService
import com.dalilacom.app.data.network.DeleteAccountRequest
import com.dalilacom.app.data.network.LocationRequest
import com.dalilacom.app.data.network.ProfileDto
import com.dalilacom.app.data.network.UpdateProfileRequest
import com.dalilacom.app.data.network.errorText
import com.dalilacom.app.data.network.safeApiCall
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody

/** The signed-in account's own profile: name, description and photo. */
class ProfileRepository(private val api: ApiService) {

    /** The profile as last seen: the profile screen draws it at once while the fresh one is on its way (no empty name and photo for a moment). */
    @Volatile
    var cached: ProfileDto? = null
        private set

    fun clearCache() { cached = null }

    /** Null when offline or signed out. */
    suspend fun me(): ProfileDto? {
        val response = safeApiCall { api.getProfile() } ?: return null
        return (if (response.isSuccessful) response.body() else null)?.also { cached = it }
    }

    suspend fun update(fullName: String, bio: String): Result<ProfileDto> =
        result(AppStrings.get(R.string.s_ca575cfb)) { api.updateProfile(UpdateProfileRequest(fullName.trim(), bio.trim().ifBlank { null })) }

    /** Tells the server which language this account reads, so push notifications and emails match. Silent on failure. */
    suspend fun setLanguage(code: String) {
        safeApiCall { api.updateProfile(UpdateProfileRequest(language = code)) }
    }

    /** Deletes the account for good. A wrong password comes back as the server's own message. */
    suspend fun deleteAccount(password: String): Result<Unit> {
        val response = safeApiCall { api.deleteAccount(DeleteAccountRequest(confirm = true, password = password.ifBlank { null })) }
            ?: return Result.failure(Exception(AppStrings.get(R.string.s_d556272b)))
        return if (response.isSuccessful) Result.success(Unit) else Result.failure(Exception(errorText(response, AppStrings.get(R.string.profile_delete_failed))))
    }

    /** "Download my data" (GDPR right of access): the JSON the server holds about the person. */
    suspend fun exportData(): Result<String> {
        val response = safeApiCall { api.exportMyData() }
            ?: return Result.failure(Exception(AppStrings.get(R.string.s_d556272b)))
        val text = if (response.isSuccessful) response.body()?.string() else null
        return if (text != null) Result.success(text) else Result.failure(Exception(AppStrings.get(R.string.profile_export_failed)))
    }

    /** The person opted in: tell the server roughly where they are (it rounds to ~1 km). Silent on failure. */
    suspend fun reportLocation(latitude: Double, longitude: Double) {
        safeApiCall { api.putLocation(LocationRequest(latitude, longitude, consent = true)) }
    }

    /** The place the person set last time (as the server keeps it), so the map starts where the pin was. */
    suspend fun savedLocation(): Pair<Double, Double>? =
        safeApiCall { api.getLocation() }?.takeIf { it.isSuccessful }?.body()?.location?.let { it.latitude to it.longitude }

    /** The person pressed "set": true when the server kept the place. */
    suspend fun setLocation(latitude: Double, longitude: Double): Boolean =
        safeApiCall { api.putLocation(LocationRequest(latitude, longitude, consent = true)) }?.isSuccessful == true

    /** The person opted out: the server forgets the position it kept. */
    suspend fun forgetLocation() {
        safeApiCall { api.deleteLocation() }
    }

    /** [jpeg] is already cropped to a square and shrunk (see ImageUtil). */
    suspend fun uploadAvatar(jpeg: ByteArray): Result<ProfileDto> =
        result(AppStrings.get(R.string.s_e78265a1)) { api.uploadAvatar(jpeg.toRequestBody("image/jpeg".toMediaType())) }

    suspend fun removeAvatar(): Result<ProfileDto> = result(AppStrings.get(R.string.s_347c4ba8)) { api.deleteAvatar() }

    private suspend fun result(fallback: String, call: suspend () -> retrofit2.Response<ProfileDto>): Result<ProfileDto> {
        val response = safeApiCall { call() } ?: return Result.failure(Exception(AppStrings.get(R.string.s_d556272b)))
        val body = response.body()
        return if (response.isSuccessful && body != null) { cached = body; Result.success(body) } else Result.failure(Exception(errorText(response, fallback)))
    }
}
