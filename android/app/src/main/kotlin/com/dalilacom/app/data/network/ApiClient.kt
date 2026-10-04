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

// The live backend deployed on Render (see dalilacom/render.yaml in the repo root).
const val BASE_URL = "https://dalilacom-api.onrender.com/"

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

object ApiClient {
    private val json = Json { ignoreUnknownKeys = true }

    fun create(tokenStore: TokenStore): ApiService {
        val logging = HttpLoggingInterceptor().apply { level = HttpLoggingInterceptor.Level.BASIC }
        val client = OkHttpClient.Builder()
            // The backend runs on Render's free tier, which spins the service down after
            // ~15 minutes idle and can take 30-60+ seconds to wake back up on the next
            // request — OkHttp's 10s defaults would time out on almost every cold start.
            .connectTimeout(60, TimeUnit.SECONDS)
            .readTimeout(60, TimeUnit.SECONDS)
            .writeTimeout(60, TimeUnit.SECONDS)
            .addInterceptor(AuthInterceptor(tokenStore))
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
