package com.dalilacom.app.data.network

import okhttp3.RequestBody
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.HTTP
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path
import retrofit2.http.Query

interface ApiService {
    @POST("auth/register")
    suspend fun register(@Body body: RegisterRequest): Response<AuthResponse>

    @POST("auth/login")
    suspend fun login(@Body body: LoginRequest): Response<AuthResponse>

    @GET("profile/me")
    suspend fun getProfile(): Response<ProfileDto>

    @PATCH("profile/me")
    suspend fun updateProfile(@Body body: UpdateProfileRequest): Response<ProfileDto>

    @PUT("profile/avatar")
    suspend fun uploadAvatar(@Body body: RequestBody): Response<ProfileDto>

    @DELETE("profile/avatar")
    suspend fun deleteAvatar(): Response<ProfileDto>

    @GET("notifications")
    suspend fun getNotifications(@Query("take") take: Int = 50): Response<NotificationsResponse>

    @GET("notifications/unread-count")
    suspend fun getUnreadCount(): Response<UnreadCountDto>

    @POST("notifications/{id}/read")
    suspend fun markNotificationRead(@Path("id") id: String): Response<kotlinx.serialization.json.JsonElement>

    @POST("notifications/read-all")
    suspend fun markAllNotificationsRead(): Response<kotlinx.serialization.json.JsonElement>

    @GET("notifications/preferences")
    suspend fun getNotificationPreferences(): Response<List<NotificationPreferenceDto>>

    @PUT("notifications/preferences")
    suspend fun setNotificationPreferences(@Body body: NotificationPreferencesRequest): Response<List<NotificationPreferenceDto>>

    @POST("notifications/devices")
    suspend fun registerDevice(@Body body: DeviceRequest): Response<kotlinx.serialization.json.JsonElement>

    @HTTP(method = "DELETE", path = "notifications/devices", hasBody = true)
    suspend fun unregisterDevice(@Body body: UnregisterDeviceRequest): Response<kotlinx.serialization.json.JsonElement>

    @GET("auth/me")
    suspend fun me(): Response<MeResponse>

    @POST("auth/resend-verification")
    suspend fun resendVerification(@Body body: ResendVerificationRequest): Response<MessageResponse>

    @GET("route")
    suspend fun route(
        @Query("fromLat") fromLat: Double,
        @Query("fromLng") fromLng: Double,
        @Query("toLat") toLat: Double,
        @Query("toLng") toLng: Double,
        @Query("mode") mode: String,
    ): Response<RouteDto>

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
        @Query("minLat") minLat: Double? = null,
        @Query("maxLat") maxLat: Double? = null,
        @Query("minLng") minLng: Double? = null,
        @Query("maxLng") maxLng: Double? = null,
    ): Response<List<MerchantDto>>

    @GET("merchant/suggest")
    suspend fun suggest(@Query("q") query: String): Response<SuggestResponse>

    @PUT("merchant/me/hours")
    suspend fun setHours(@Body body: SetHoursRequest): Response<HoursResponse>

    @GET("favorites")
    suspend fun getFavorites(): Response<List<MerchantDto>>

    @GET("favorites/ids")
    suspend fun getFavoriteIds(): Response<List<String>>

    @PUT("favorites/{id}")
    suspend fun saveFavorite(@Path("id") id: String): Response<kotlinx.serialization.json.JsonElement>

    @DELETE("favorites/{id}")
    suspend fun removeFavorite(@Path("id") id: String): Response<kotlinx.serialization.json.JsonElement>

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

    @PATCH("merchant/me")
    suspend fun updateMerchantMe(@Body body: UpdateMerchantRequest): Response<MerchantMeDto>

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

    @GET("responder/status")
    suspend fun getResponderStatus(): Response<ResponderStatusDto>

    @POST("responder/activate")
    suspend fun activateResponder(): Response<kotlinx.serialization.json.JsonElement>

    @POST("responder/renew")
    suspend fun renewResponder(): Response<kotlinx.serialization.json.JsonElement>

    @PATCH("responder/profile")
    suspend fun saveResponderProfile(@Body body: ProfileRequest): Response<kotlinx.serialization.json.JsonElement>

    @GET("responder/channels")
    suspend fun getResponderChannels(): Response<List<ChannelDto>>

    @GET("responder/connections")
    suspend fun getResponderConnections(): Response<List<ConnectionDto>>

    @POST("responder/connections")
    suspend fun connectChannel(@Body body: ConnectRequest): Response<kotlinx.serialization.json.JsonElement>

    @PATCH("responder/connections/{id}")
    suspend fun toggleConnection(@Path("id") id: String, @Body body: ToggleRequest): Response<kotlinx.serialization.json.JsonElement>

    @GET("responder/connections/{id}/posts")
    suspend fun getConnectionPosts(@Path("id") id: String): Response<List<PostDto>>

    @GET("responder/rules")
    suspend fun getResponderRules(): Response<List<RuleDto>>

    @POST("responder/rules")
    suspend fun createResponderRule(@Body body: CreateRuleRequest): Response<kotlinx.serialization.json.JsonElement>

    @PATCH("responder/rules/{id}")
    suspend fun toggleResponderRule(@Path("id") id: String, @Body body: ToggleRequest): Response<kotlinx.serialization.json.JsonElement>

    @DELETE("responder/rules/{id}")
    suspend fun deleteResponderRule(@Path("id") id: String): Response<kotlinx.serialization.json.JsonElement>

    @GET("responder/inbox")
    suspend fun getResponderInbox(): Response<List<InboxItemDto>>

    @POST("responder/inbox/{id}/send")
    suspend fun sendInboxReply(@Path("id") id: String, @Body body: SendReplyRequest): Response<kotlinx.serialization.json.JsonElement>

    // Facebook Login: the merchant signs in to Facebook here instead of pasting a Page token.
    @GET("responder/meta/oauth/status")
    suspend fun getMetaOAuthStatus(): Response<MetaOAuthStatusDto>

    @GET("responder/meta/oauth/start")
    suspend fun startMetaOAuth(): Response<MetaOAuthStartDto>

    @GET("responder/meta/oauth/session/{id}")
    suspend fun getMetaOAuthSession(@Path("id") id: String): Response<MetaOAuthSessionDto>

    @POST("responder/meta/oauth/complete")
    suspend fun completeMetaOAuth(@Body body: MetaOAuthCompleteRequest): Response<MetaConnectionDto>

    @GET("wallet")
    suspend fun getWallet(): Response<WalletDto>

    @GET("wallet/methods")
    suspend fun getWalletMethods(): Response<WalletMethodsDto>

    @POST("wallet/topups")
    suspend fun submitTopUp(@Body body: TopUpRequestBody): Response<TopUpDto>
}
