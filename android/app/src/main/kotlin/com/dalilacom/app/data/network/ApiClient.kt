package com.dalilacom.app.data.network

import com.dalilacom.app.data.store.TokenStore
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Response
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import java.util.concurrent.TimeUnit

// The live site and server (dalilacom.com, the production service in render.yaml).
const val BASE_URL = "https://dalilacom.com/"

/** A server-relative path such as "/profile/avatar/..." as a full URL. */
fun absoluteUrl(path: String): String = BASE_URL.trimEnd('/') + path

private class AuthInterceptor(private val tokenStore: TokenStore) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val token = runBlocking { tokenStore.getToken() }
        val request = chain.request().newBuilder().apply {
            if (token != null) {
                addHeader("Authorization", "Bearer $token")
            }
        }.build()
        return chain.proceed(request)
    }
}

/**
 * The server says the stored session is no good (signed out from another device, password or email changed, switched off and
 * on again): tell the app, which clears the session and goes back to the start instead of leaving screens loading forever.
 * Only the server's own "token" answers count; a 401 for a wrong password does not end the session.
 */
private class SessionExpiredInterceptor(private val onExpired: () -> Unit) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val response = chain.proceed(chain.request())
        if (response.code == 401 && chain.request().header("Authorization") != null) {
            val body = runCatching { response.peekBody(2048).string() }.getOrDefault("")
            if (body.contains("AUTH_TOKEN_REVOKED") || body.contains("AUTH_INVALID_TOKEN")) onExpired()
        }
        return response
    }
}

object ApiClient {
    private val json = Json { ignoreUnknownKeys = true }

    fun create(tokenStore: TokenStore, languageProvider: () -> String = { "ar" }, onSessionExpired: () -> Unit = {}): ApiService {
        val logging = HttpLoggingInterceptor().apply { level = HttpLoggingInterceptor.Level.BASIC }
        val client = OkHttpClient.Builder()
            // The backend runs on Render's free tier, which spins the service down after
            // ~15 minutes idle and can take 30-60+ seconds to wake back up on the next
            // request — OkHttp's 10s defaults would time out on almost every cold start.
            .connectTimeout(60, TimeUnit.SECONDS)
            .readTimeout(60, TimeUnit.SECONDS)
            .writeTimeout(60, TimeUnit.SECONDS)
            .addInterceptor(AuthInterceptor(tokenStore))
            .addInterceptor(SessionExpiredInterceptor(onSessionExpired))
            .addInterceptor { chain -> chain.proceed(chain.request().newBuilder().header("Accept-Language", languageProvider()).build()) }
            .addInterceptor(logging)
            .build()

        val contentType = "application/json".toMediaType()
        return Retrofit.Builder()
            .baseUrl(BASE_URL)
            .client(client)
            .addConverterFactory(json.asConverterFactory(contentType))
            .build()
            .create(ApiService::class.java)
    }
}
