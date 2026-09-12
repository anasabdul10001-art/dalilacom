package com.dalilacom.app.data.repository

import com.dalilacom.app.data.network.ApiService
import com.dalilacom.app.data.network.LoginRequest
import com.dalilacom.app.data.network.RegisterRequest
import com.dalilacom.app.data.network.UserDto
import com.dalilacom.app.data.store.TokenStore

class AuthRepository(
    private val api: ApiService,
    private val tokenStore: TokenStore,
) {
    suspend fun register(email: String, password: String, fullName: String): Result<UserDto> {
        val response = api.register(RegisterRequest(email, password, fullName))
        val body = response.body()
        return if (response.isSuccessful && body != null) {
            tokenStore.saveToken(body.token)
            Result.success(body.user)
        } else {
            Result.failure(Exception(response.errorBody()?.string() ?: "Registration failed"))
        }
    }

    suspend fun login(email: String, password: String): Result<UserDto> {
        val response = api.login(LoginRequest(email, password))
        val body = response.body()
        return if (response.isSuccessful && body != null) {
            tokenStore.saveToken(body.token)
            Result.success(body.user)
        } else {
            Result.failure(Exception("بيانات الدخول غير صحيحة"))
        }
    }

    suspend fun logout() {
        runCatching { api.logout() }
        tokenStore.clearToken()
    }

    suspend fun hasStoredSession(): Boolean = tokenStore.getToken() != null
}
