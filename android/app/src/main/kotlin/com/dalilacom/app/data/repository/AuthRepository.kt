package com.dalilacom.app.data.repository

import com.dalilacom.app.data.network.errorText
import com.dalilacom.app.data.network.ApiService
import com.dalilacom.app.data.network.LoginRequest
import com.dalilacom.app.data.network.RegisterRequest
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
            ?: return Result.failure(Exception("تعذّر الاتصال بالسيرفر، تحقق من الإنترنت"))
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
            ?: return Result.failure(Exception("تعذّر الاتصال بالسيرفر، تحقق من الإنترنت"))
        val body = response.body()
        return if (response.isSuccessful && body != null) {
            tokenStore.saveToken(body.token)
            sessionStore.saveRole(body.user.role)
            Result.success(body.user)
        } else {
            Result.failure(Exception(if (response.code() == 401) "بيانات الدخول غير صحيحة" else errorText(response, "تعذّر تسجيل الدخول")))
        }
    }

    suspend fun logout() {
        runCatching { api.logout() }
        tokenStore.clearToken()
        sessionStore.clearRole()
    }

    suspend fun hasStoredSession(): Boolean = tokenStore.getToken() != null
}
