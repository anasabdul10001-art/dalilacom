package com.dalilacom.app.data.network

import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Query

interface ApiService {
    @POST("auth/register")
    suspend fun register(@Body body: RegisterRequest): Response<AuthResponse>

    @POST("auth/login")
    suspend fun login(@Body body: LoginRequest): Response<AuthResponse>

    @POST("auth/logout")
    suspend fun logout(): Response<MessageResponse>

    @GET("membership/plans")
    suspend fun getPlans(): Response<List<MembershipPlanDto>>

    @POST("membership/subscribe")
    suspend fun subscribe(@Body body: SubscribeRequest): Response<MembershipDto>

    @GET("membership/me")
    suspend fun getMyMembership(): Response<MembershipDto>

    @GET("qr/mine")
    suspend fun getMyQrCode(): Response<QrCodeDto>

    @GET("categories")
    suspend fun getCategories(): Response<List<CategoryDto>>

    @GET("merchant")
    suspend fun searchMerchants(
        @Query("q") query: String? = null,
        @Query("categoryId") categoryId: String? = null,
        @Query("lat") lat: Double? = null,
        @Query("lng") lng: Double? = null,
        @Query("radiusKm") radiusKm: Double? = null,
    ): Response<List<MerchantDto>>

    @GET("products")
    suspend fun getProducts(@Query("merchantId") merchantId: String): Response<List<ProductDto>>
}
