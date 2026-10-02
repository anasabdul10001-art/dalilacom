package com.dalilacom.app.data.network

import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path
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

    @GET("products/{id}")
    suspend fun getProduct(@Path("id") id: String): Response<ProductDto>

    @POST("products")
    suspend fun createProduct(@Body body: CreateProductRequest): Response<ProductDto>

    @GET("products/mine")
    suspend fun getMyProducts(): Response<List<ProductDto>>

    @PATCH("products/{id}")
    suspend fun updateProduct(@Path("id") id: String, @Body body: UpdateProductRequest): Response<ProductDto>

    @GET("merchant/{id}")
    suspend fun getMerchant(@Path("id") id: String): Response<MerchantDto>

    @GET("merchant/me")
    suspend fun getMerchantMe(): Response<MerchantMeDto>

    @POST("merchant/register")
    suspend fun registerMerchant(@Body body: RegisterMerchantRequest): Response<RegisterMerchantResponse>

    @POST("merchant/discounts")
    suspend fun addDiscount(@Body body: CreateDiscountRequest): Response<DiscountDto>

    @GET("cart")
    suspend fun getCart(): Response<CartViewDto>

    @POST("cart/items")
    suspend fun addCartItem(@Body body: AddCartItemRequest): Response<CartViewDto>

    @PATCH("cart/items/{id}")
    suspend fun updateCartItem(@Path("id") id: String, @Body body: UpdateCartItemRequest): Response<CartViewDto>

    @DELETE("cart/items/{id}")
    suspend fun removeCartItem(@Path("id") id: String): Response<CartViewDto>

    @POST("cart/checkout")
    suspend fun checkout(): Response<List<OrderDto>>

    @GET("orders/mine")
    suspend fun getMyOrders(): Response<List<OrderDto>>

    @GET("orders/merchant")
    suspend fun getMerchantOrders(): Response<List<OrderDto>>

    @GET("orders/{id}")
    suspend fun getOrder(@Path("id") id: String): Response<OrderDto>

    @PATCH("orders/{id}/status")
    suspend fun updateOrderStatus(@Path("id") id: String, @Body body: UpdateOrderStatusRequest): Response<OrderDto>

    @POST("orders/{id}/cancel")
    suspend fun cancelOrder(@Path("id") id: String): Response<OrderDto>

    @POST("qr/verify")
    suspend fun verifyMember(@Body body: VerifyRedeemRequest): Response<VerifyResponse>

    @POST("qr/redeem")
    suspend fun redeemDiscount(@Body body: RedeemRequest): Response<RedeemResponse>
}
