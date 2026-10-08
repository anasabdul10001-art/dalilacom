package com.dalilacom.app.data.repository

import com.dalilacom.app.R
import com.dalilacom.app.ui.i18n.AppStrings
import com.dalilacom.app.data.network.errorText
import com.dalilacom.app.data.network.ApiService
import com.dalilacom.app.data.network.ForgotPasswordRequest
import com.dalilacom.app.data.network.LoginRequest
import com.dalilacom.app.data.network.MeResponse
import com.dalilacom.app.data.network.ResendVerificationRequest
import com.dalilacom.app.data.network.RegisterRequest
import com.dalilacom.app.data.network.SocialExchangeRequest
import com.dalilacom.app.data.network.SocialProvidersDto
import com.dalilacom.app.data.network.UserDto
import com.dalilacom.app.data.network.safeApiCall
import com.dalilacom.app.data.store.SessionStore
import com.dalilacom.app.data.store.TokenStore

class AuthRepository(
    private val api: ApiService,
    private val tokenStore: TokenStore,
    private val sessionStore: SessionStore,
) {
    suspend fun register(email: String, password: String, fullName: String): Result<UserDto> {
        val response = safeApiCall { api.register(RegisterRequest(email, password, fullName)) }
            ?: return Result.failure(Exception(AppStrings.get(R.string.s_d556272b)))
        val body = response.body()
        return if (response.isSuccessful && body != null) {
            tokenStore.saveToken(body.token)
            sessionStore.saveRole(body.user.role)
            Result.success(body.user)
        } else {
            Result.failure(Exception(errorText(response, "Registration failed")))
        }
    }

    suspend fun login(email: String, password: String): Result<UserDto> {
        val response = safeApiCall { api.login(LoginRequest(email, password)) }
            ?: return Result.failure(Exception(AppStrings.get(R.string.s_d556272b)))
        val body = response.body()
        return if (response.isSuccessful && body != null) {
            tokenStore.saveToken(body.token)
            sessionStore.saveRole(body.user.role)
            Result.success(body.user)
        } else {
            Result.failure(Exception(if (response.code() == 401) AppStrings.get(R.string.s_3ea19382) else errorText(response, AppStrings.get(R.string.s_8562adb5))))
        }
    }

    /** Which "Continue with ..." buttons the server can serve right now. */
    suspend fun socialProviders(): SocialProvidersDto =
        safeApiCall { api.socialProviders() }?.takeIf { it.isSuccessful }?.body() ?: SocialProvidersDto()

    /** The one-time ticket the browser brought back, traded for a normal session. */
    suspend fun socialExchange(ticket: String): Result<UserDto> {
        val response = safeApiCall { api.socialExchange(SocialExchangeRequest(ticket)) }
            ?: return Result.failure(Exception(AppStrings.get(R.string.s_d556272b)))
        val body = response.body()
        return if (response.isSuccessful && body != null) {
            tokenStore.saveToken(body.token)
            sessionStore.saveRole(body.user.role)
            Result.success(body.user)
        } else {
            Result.failure(Exception(AppStrings.get(R.string.social_failed)))
        }
    }

    /** "Forgot my password": the server sends the link when the email is registered and answers the same either way. */
    suspend fun forgotPassword(email: String): Result<String> {
        val response = safeApiCall { api.forgotPassword(ForgotPasswordRequest(email.trim())) }
            ?: return Result.failure(Exception(AppStrings.get(R.string.s_d556272b)))
        return if (response.isSuccessful) Result.success(response.body()?.message ?: AppStrings.get(R.string.forgot_sent))
        else Result.failure(Exception(errorText(response, AppStrings.get(R.string.account_failed))))
    }

    /** The signed-in user (with email-verification state), or null when offline / signed out. */
    suspend fun me(): MeResponse? {
        val response = safeApiCall { api.me() } ?: return null
        return if (response.isSuccessful) response.body() else null
    }

    suspend fun resendVerification(email: String): Boolean =
        safeApiCall { api.resendVerification(ResendVerificationRequest(email)) }?.isSuccessful == true

    suspend fun logout() {
        runCatching { api.logout() }
        tokenStore.clearToken()
        sessionStore.clearRole()
    }

    suspend fun hasStoredSession(): Boolean = tokenStore.getToken() != null
}
