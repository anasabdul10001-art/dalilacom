package com.dalilacom.app.data.repository

import com.dalilacom.app.R
import com.dalilacom.app.data.network.AddressDto
import com.dalilacom.app.data.network.AddressRequest
import com.dalilacom.app.data.network.ApiService
import com.dalilacom.app.data.network.ChangeEmailRequest
import com.dalilacom.app.data.network.ChangePasswordRequest
import com.dalilacom.app.data.network.DefaultAddressRequest
import com.dalilacom.app.data.network.GeoUnitDto
import com.dalilacom.app.data.network.ProfileDto
import com.dalilacom.app.data.network.UpdateProfileRequest
import com.dalilacom.app.data.network.errorText
import com.dalilacom.app.data.network.safeApiCall
import com.dalilacom.app.data.store.TokenStore
import com.dalilacom.app.ui.i18n.AppStrings
import retrofit2.Response

/** Everything the account settings screen reads and writes: profile details, the password, places and saved addresses. */
class AccountRepository(private val api: ApiService, private val tokenStore: TokenStore) {

    suspend fun profile(): ProfileDto? = safeApiCall { api.getProfile() }?.takeIf { it.isSuccessful }?.body()

    suspend fun countries(): List<GeoUnitDto> = safeApiCall { api.geoCountries() }?.takeIf { it.isSuccessful }?.body().orEmpty()

    suspend fun units(countryId: String? = null, level: String? = null, parentId: String? = null): List<GeoUnitDto> =
        safeApiCall { api.geoChildren(countryId, level, parentId) }?.takeIf { it.isSuccessful }?.body().orEmpty()

    suspend fun addresses(): List<AddressDto> = safeApiCall { api.getAddresses() }?.takeIf { it.isSuccessful }?.body().orEmpty()

    /** Only what is passed is sent; an empty phone clears it. */
    suspend fun update(phone: String? = null, countryCode: String? = null, cityId: String? = null, vatNumber: String? = null): Result<ProfileDto> =
        result(AppStrings.get(R.string.account_failed)) { api.updateProfile(UpdateProfileRequest(phone = phone, countryCode = countryCode, cityId = cityId, vatNumber = vatNumber)) }

    /** Can the server send mail at all? Changing the email needs it, so the form is offered only then. */
    suspend fun emailDelivery(): Boolean = safeApiCall { api.me() }?.takeIf { it.isSuccessful }?.body()?.emailDeliveryEnabled == true

    /** Asks for the change: a confirmation link goes to the new address. A wrong password is a 403 (never an expired session). */
    suspend fun changeEmail(newEmail: String, password: String): Result<String> {
        val response = safeApiCall { api.changeEmail(ChangeEmailRequest(newEmail.trim(), password.ifBlank { null })) }
            ?: return Result.failure(Exception(AppStrings.get(R.string.s_d556272b)))
        return if (response.isSuccessful) Result.success(response.body()?.message ?: AppStrings.get(R.string.account_email_sent))
        else Result.failure(Exception(errorText(response, AppStrings.get(R.string.account_failed))))
    }

    /** Changes the password and keeps this phone signed in: the server hands back a fresh token (the old ones stop working). */
    suspend fun changePassword(current: String, new: String): Result<Unit> {
        val response = safeApiCall { api.changePassword(ChangePasswordRequest(current, new)) }
            ?: return Result.failure(Exception(AppStrings.get(R.string.s_d556272b)))
        val body = response.body()
        return if (response.isSuccessful && body != null) {
            tokenStore.saveToken(body.token)
            Result.success(Unit)
        } else {
            Result.failure(Exception(if (response.code() == 401) AppStrings.get(R.string.account_pw_wrong) else errorText(response, AppStrings.get(R.string.account_failed))))
        }
    }

    suspend fun addAddress(request: AddressRequest): Result<Unit> = unit(AppStrings.get(R.string.account_failed)) { api.addAddress(request) }
    suspend fun makeDefault(id: String): Result<Unit> = unit(AppStrings.get(R.string.account_failed)) { api.updateAddress(id, DefaultAddressRequest(true)) }
    suspend fun deleteAddress(id: String): Result<Unit> = unit(AppStrings.get(R.string.account_failed)) { api.deleteAddress(id) }

    private suspend fun result(fallback: String, call: suspend () -> Response<ProfileDto>): Result<ProfileDto> {
        val response = safeApiCall { call() } ?: return Result.failure(Exception(AppStrings.get(R.string.s_d556272b)))
        val body = response.body()
        return if (response.isSuccessful && body != null) Result.success(body) else Result.failure(Exception(errorText(response, fallback)))
    }

    private suspend fun <T> unit(fallback: String, call: suspend () -> Response<T>): Result<Unit> {
        val response = safeApiCall { call() } ?: return Result.failure(Exception(AppStrings.get(R.string.s_d556272b)))
        return if (response.isSuccessful) Result.success(Unit) else Result.failure(Exception(errorText(response, fallback)))
    }
}
