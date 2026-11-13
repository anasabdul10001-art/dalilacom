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
    @GET("fitness-plans/coach")
    suspend fun fitnessCoachPlans(): Response<FitnessPlanListDto>

    @GET("fitness-plans/coach/trainees")
    suspend fun fitnessCoachTrainees(): Response<FitnessTraineeListDto>

    @POST("fitness-plans/coach")
    suspend fun createFitnessPlan(@Body body: FitnessPlanBody): Response<FitnessPlanDto>

    @retrofit2.http.PATCH("fitness-plans/coach/{id}")
    suspend fun updateFitnessPlan(@Path("id") id: String, @Body body: FitnessPlanUpdateBody): Response<FitnessPlanDto>

    @GET("fitness-plans/mine")
    suspend fun myFitnessPlans(): Response<FitnessPlanListDto>

    @POST("fitness-plans/{id}/progress")
    suspend fun addFitnessProgress(@Path("id") id: String, @Body body: FitnessProgressBody): Response<FitnessProgressDto>

    @GET("fitness-enrollments/mine")
    suspend fun myFitnessEnrollments(): Response<FitnessEnrollmentListDto>

    @POST("fitness-enrollments/offers/{offerId}/request")
    suspend fun requestFitnessEnrollment(@Path("offerId") offerId: String): Response<FitnessEnrollmentDto>

    @POST("fitness-enrollments/mine/{id}/cancel")
    suspend fun cancelFitnessEnrollment(@Path("id") id: String): Response<kotlinx.serialization.json.JsonElement>

    @GET("fitness-enrollments/coach")
    suspend fun coachFitnessEnrollments(): Response<FitnessEnrollmentListDto>

    @PATCH("fitness-enrollments/coach/{id}")
    suspend fun updateFitnessEnrollment(@Path("id") id: String, @Body body: FitnessEnrollmentStatusBody): Response<FitnessEnrollmentDto>

    @GET("fitness-profile/me")
    suspend fun getFitnessProfile(): Response<FitnessProfileDto>

    @PUT("fitness-profile/me")
    suspend fun saveFitnessProfile(@Body body: FitnessProfileBody): Response<FitnessProfileDto>

    @retrofit2.http.Headers("Content-Type: image/jpeg")
    @POST("fitness-profile/photos")
    suspend fun uploadFitnessPhoto(@Body body: RequestBody): Response<ProductPhotoDto>

    @GET("fitness-profile/offers/me")
    suspend fun fitnessOffers(): Response<FitnessOfferListDto>

    @POST("fitness-profile/offers")
    suspend fun createFitnessOffer(@Body body: FitnessOfferBody): Response<FitnessOfferDto>

    @retrofit2.http.PATCH("fitness-profile/offers/{id}")
    suspend fun updateFitnessOffer(@Path("id") id: String, @Body body: FitnessOfferBody): Response<FitnessOfferDto>

    @DELETE("fitness-profile/offers/{id}")
    suspend fun deleteFitnessOffer(@Path("id") id: String): Response<kotlinx.serialization.json.JsonElement>

    @GET("appointments/doctors/{doctorId}/slots")
    suspend fun doctorAppointmentSlots(@Path("doctorId") doctorId: String, @Query("days") days: Int = 31): Response<DoctorAppointmentScheduleDto>

    @POST("appointments/doctors/{doctorId}/book")
    suspend fun bookDoctorAppointment(@Path("doctorId") doctorId: String, @Body body: DoctorAppointmentBookBody): Response<DoctorAppointmentDto>

    @GET("appointments/mine")
    suspend fun myDoctorAppointments(): Response<DoctorAppointmentListDto>

    @GET("appointments/settings")
    suspend fun doctorAppointmentSettings(): Response<DoctorAppointmentSettingsDto>

    @PUT("appointments/settings")
    suspend fun saveDoctorAppointmentSettings(@Body body: DoctorAppointmentSettingsBody): Response<DoctorAppointmentSettingsDto>

    @GET("appointments/doctor/mine")
    suspend fun myClinicAppointments(): Response<ClinicAppointmentListDto>

    @POST("appointments/{id}/cancel")
    suspend fun cancelDoctorAppointment(@Path("id") id: String): Response<kotlinx.serialization.json.JsonElement>

    @GET("doctor-care")
    suspend fun doctorCare(): Response<DoctorCareDto>

    @POST("doctor-care/requests")
    suspend fun requestPatient(@Body body: DoctorCareRequestBody): Response<DoctorCareConnectionDto>

    @POST("doctor-care/requests/{id}/respond")
    suspend fun respondDoctorRequest(@Path("id") id: String, @Body body: DoctorCareRespondBody): Response<kotlinx.serialization.json.JsonElement>

    @POST("doctor-care/connections/{id}/revoke")
    suspend fun revokeDoctorCare(@Path("id") id: String): Response<kotlinx.serialization.json.JsonElement>

    @GET("doctor-care/connections/{id}/records")
    suspend fun doctorCareRecords(@Path("id") id: String): Response<DoctorCareRecordsDto>

    @POST("doctor-care/connections/{id}/records")
    suspend fun addDoctorCareRecord(@Path("id") id: String, @Body body: DoctorCareRecordBody): Response<DoctorCareRecordDto>

    @POST("auth/register")
    suspend fun register(@Body body: RegisterRequest): Response<AuthResponse>

    @POST("auth/login")
    suspend fun login(@Body body: LoginRequest): Response<AuthResponse>

    @retrofit2.http.HTTP(method = "DELETE", path = "profile/me", hasBody = true)
    suspend fun deleteAccount(@Body body: DeleteAccountRequest): Response<kotlinx.serialization.json.JsonElement>

    @GET("profile/export")
    suspend fun exportMyData(): Response<okhttp3.ResponseBody>

    @PUT("profile/location")
    suspend fun putLocation(@Body body: LocationRequest): Response<kotlinx.serialization.json.JsonElement>

    @GET("profile/location")
    suspend fun getLocation(): Response<MyLocationDto>

    @DELETE("profile/location")
    suspend fun deleteLocation(): Response<kotlinx.serialization.json.JsonElement>

    @GET("geo/units")
    suspend fun geoUnits(@Query("level") level: String): Response<List<GeoUnitDto>>

    @GET("geo/units")
    suspend fun geoChildren(@Query("countryId") countryId: String?, @Query("level") level: String?, @Query("parentId") parentId: String?): Response<List<GeoUnitDto>>

    @GET("geo/countries")
    suspend fun geoCountries(): Response<List<GeoUnitDto>>

    @GET("addresses")
    suspend fun getAddresses(): Response<List<AddressDto>>

    @POST("addresses")
    suspend fun addAddress(@Body body: AddressRequest): Response<kotlinx.serialization.json.JsonElement>

    @PATCH("addresses/{id}")
    suspend fun updateAddress(@retrofit2.http.Path("id") id: String, @Body body: DefaultAddressRequest): Response<kotlinx.serialization.json.JsonElement>

    @DELETE("addresses/{id}")
    suspend fun deleteAddress(@retrofit2.http.Path("id") id: String): Response<kotlinx.serialization.json.JsonElement>

    @POST("auth/change-email")
    suspend fun changeEmail(@Body body: ChangeEmailRequest): Response<MessageResponse>

    @POST("auth/forgot-password")
    suspend fun forgotPassword(@Body body: ForgotPasswordRequest): Response<MessageResponse>

    @POST("auth/change-password")
    suspend fun changePassword(@Body body: ChangePasswordRequest): Response<ChangePasswordResponse>

    @POST("broadcasts/preview")
    suspend fun previewBroadcast(@Body body: BroadcastPreviewRequest): Response<BroadcastPreviewDto>

    @POST("broadcasts")
    suspend fun sendBroadcast(@Body body: BroadcastRequest): Response<BroadcastResultDto>

    @GET("broadcasts")
    suspend fun getBroadcasts(): Response<List<BroadcastDto>>

    @GET("broadcasts")
    suspend fun getPendingBroadcasts(@Query("status") status: String = "PENDING_REVIEW"): Response<List<ReviewItemDto>>

    @POST("broadcasts/{id}/approve")
    suspend fun approveBroadcast(@retrofit2.http.Path("id") id: String): Response<kotlinx.serialization.json.JsonElement>

    @POST("broadcasts/{id}/reject")
    suspend fun rejectBroadcast(@retrofit2.http.Path("id") id: String, @Body body: RejectRequest): Response<kotlinx.serialization.json.JsonElement>

    @GET("auth/social/providers")
    suspend fun socialProviders(): Response<SocialProvidersDto>

    @POST("auth/social/exchange")
    suspend fun socialExchange(@Body body: SocialExchangeRequest): Response<AuthResponse>

    @POST("auth/social/complete")
    suspend fun socialComplete(@Body body: SocialCompleteRequest): Response<AuthResponse>

    @GET("profile/me")
    suspend fun getProfile(): Response<ProfileDto>

    @PATCH("profile/me")
    suspend fun updateProfile(@Body body: UpdateProfileRequest): Response<ProfileDto>

    @GET("profile/payment-methods")
    suspend fun getSellerPaymentMethods(): Response<SellerPaymentMethodsResponse>

    @PUT("profile/payment-methods")
    suspend fun saveSellerPaymentMethods(@Body body: SellerPaymentMethodsRequest): Response<SellerPaymentMethodsResponse>

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

    @GET("plans/catalog")
    suspend fun getCatalog(): Response<CatalogDto>

    @POST("membership/subscribe")
    suspend fun subscribe(@Body body: SubscribeRequest): Response<MembershipDto>

    @GET("membership/me")
    suspend fun getMyMembership(): Response<MembershipDto>

    /** Human resources (inside DALILACOM): every human-resources route (the server's hr area) goes through these two calls. */
    @GET suspend fun hrGet(@retrofit2.http.Url path: String): Response<kotlinx.serialization.json.JsonElement>
    @POST suspend fun hrPost(@retrofit2.http.Url path: String, @Body body: kotlinx.serialization.json.JsonObject): Response<kotlinx.serialization.json.JsonElement>
    @retrofit2.http.PUT suspend fun hrPut(@retrofit2.http.Url path: String, @Body body: kotlinx.serialization.json.JsonObject): Response<kotlinx.serialization.json.JsonElement>
    @retrofit2.http.PATCH suspend fun hrPatch(@retrofit2.http.Url path: String, @Body body: kotlinx.serialization.json.JsonObject): Response<kotlinx.serialization.json.JsonElement>
    @retrofit2.http.DELETE suspend fun hrDelete(@retrofit2.http.Url path: String): Response<kotlinx.serialization.json.JsonElement>
    @GET("accounting/summary") suspend fun accountingSummary(): Response<AccountingSummaryDto>
    @GET("accounting/products") suspend fun accountingProducts(@Query("q") query: String? = null): Response<List<AccountingProductDto>>
    @POST("accounting/products") suspend fun addAccountingProduct(@Body body: AccountingProductRequest): Response<AccountingProductDto>
    @POST("accounting/products/{id}/sell") suspend fun sellAccountingProduct(@Path("id") id: String, @Body body: AccountingSellRequest): Response<AccountingSellResponseDto>
    @POST("accounting/products/{id}/stock") suspend fun changeAccountingStock(@Path("id") id: String, @Body body: AccountingStockRequest): Response<AccountingProductDto>
    @POST("accounting/sales/{id}/returns") suspend fun returnAccountingSale(@Path("id") id: String, @Body body: AccountingReturnRequest): Response<okhttp3.ResponseBody>
    @POST("accounting/purchases/{id}/returns") suspend fun returnAccountingPurchase(@Path("id") id: String, @Body body: AccountingReturnRequest): Response<okhttp3.ResponseBody>
    @GET("accounting/recurring") suspend fun accountingRecurring(): Response<List<AccountingRecurringDto>>
    @GET("accounting/statements") suspend fun accountingStatements(@Query("from") from: String, @Query("to") to: String): Response<AccountingStatementsDto>
    @GET("accounting/tax/rates") suspend fun accountingTaxRates(): Response<List<AccountingTaxRateDto>>
    @POST("accounting/tax/rates") suspend fun createAccountingTaxRate(@Body body: AccountingTaxRateRequest): Response<okhttp3.ResponseBody>
    @retrofit2.http.PATCH("accounting/tax/rates/{id}") suspend fun patchAccountingTaxRate(@Path("id") id: String, @Body body: AccountingTaxRatePatch): Response<okhttp3.ResponseBody>
    @GET("accounting/settings") suspend fun accountingSettings(): Response<AccountingSettingsDto>
    @retrofit2.http.PUT("accounting/settings") suspend fun saveAccountingSettings(@Body body: AccountingSettingsDto): Response<okhttp3.ResponseBody>
    @GET("accounting/tax/report") suspend fun accountingTaxReport(@Query("from") from: String, @Query("to") to: String): Response<AccountingTaxReportDto>
    @retrofit2.http.PATCH("accounting/products/{id}") suspend fun setAccountingProductTax(@Path("id") id: String, @Body body: AccountingProductTaxPatch): Response<okhttp3.ResponseBody>
    @POST("accounting/recurring") suspend fun createAccountingRecurring(@Body body: AccountingRecurringRequest): Response<okhttp3.ResponseBody>
    @retrofit2.http.PATCH("accounting/recurring/{id}") suspend fun patchAccountingRecurring(@Path("id") id: String, @Body body: AccountingRecurringPatch): Response<okhttp3.ResponseBody>
    @DELETE("accounting/recurring/{id}") suspend fun deleteAccountingRecurring(@Path("id") id: String): Response<okhttp3.ResponseBody>
    @POST("accounting/purchases") suspend fun createAccountingPurchase(@Body body: AccountingPurchaseRequest): Response<AccountingPurchaseDto>
    @GET("accounting/purchases") suspend fun accountingPurchases(): Response<List<AccountingPurchaseDto>>
    @GET("accounting/parties") suspend fun accountingParties(): Response<AccountingPartiesDto>
    @GET("accounting/parties/{id}") suspend fun accountingParty(@Path("id") id: String): Response<AccountingPartyDetailDto>
    @POST("accounting/parties") suspend fun createAccountingParty(@Body body: AccountingPartyRequest): Response<okhttp3.ResponseBody>
    @POST("accounting/parties/{id}/payments") suspend fun payAccountingParty(@Path("id") id: String, @Body body: AccountingPartyPaymentRequest): Response<okhttp3.ResponseBody>
    @POST("accounting/parties/{id}/charges") suspend fun chargeAccountingParty(@Path("id") id: String, @Body body: AccountingPartyChargeRequest): Response<okhttp3.ResponseBody>
    @GET("accounting/reports") suspend fun accountingReport(@Query("from") from: String, @Query("to") to: String, @Query("groupBy") groupBy: String): Response<AccountingReportDto>
    @GET("accounting/stock/low") suspend fun accountingLowStock(): Response<AccountingLowDto>
    @GET("accounting/products/{id}/movements") suspend fun accountingMovements(@Path("id") id: String): Response<List<AccountingMovementDto>>
    @POST("accounting/stock/count") suspend fun accountingStockCount(@Body body: AccountingCountRequest): Response<AccountingCountResultDto>
    @retrofit2.http.PATCH("accounting/products/{id}") suspend fun setAccountingProductMin(@Path("id") id: String, @Body body: AccountingMinRequest): Response<okhttp3.ResponseBody>
    @POST("accounting/sales") suspend fun createAccountingSale(@Body body: AccountingSaleRequest): Response<AccountingSaleDto>
    @GET("accounting/sales") suspend fun accountingSales(): Response<List<AccountingSaleDto>>
    @GET("accounting/cash") suspend fun accountingCash(@retrofit2.http.Query("day") day: String, @retrofit2.http.Query("currency") currency: String): Response<AccountingCashDto>
    @retrofit2.http.PUT("accounting/cash/opening") suspend fun setAccountingCashOpening(@Body body: AccountingCashOpeningRequest): Response<okhttp3.ResponseBody>
    @POST("accounting/cash/close") suspend fun closeAccountingCash(@Body body: AccountingCashCloseRequest): Response<okhttp3.ResponseBody>
    @DELETE("accounting/cash/close") suspend fun reopenAccountingCash(@retrofit2.http.Query("day") day: String, @retrofit2.http.Query("currency") currency: String): Response<okhttp3.ResponseBody>
    @POST("accounting/entries") suspend fun addAccountingEntry(@Body body: AccountingEntryRequest): Response<AccountingEntryDto>
    @PATCH("accounting/entries/{id}") suspend fun updateAccountingEntry(@Path("id") id: String, @Body body: AccountingEntryEditRequest): Response<AccountingEntryDto>
    @DELETE("accounting/entries/{id}") suspend fun deleteAccountingEntry(@Path("id") id: String): Response<okhttp3.ResponseBody>
    @DELETE("accounting/products/{id}") suspend fun deleteAccountingProduct(@Path("id") id: String): Response<okhttp3.ResponseBody>
    @POST("accounting/invoices/scan") suspend fun scanAccountingInvoice(@Body image: RequestBody): Response<AccountingInvoiceDraftDto>
    @POST("accounting/invoices/{id}/confirm") suspend fun confirmAccountingInvoice(@Path("id") id: String, @Body body: AccountingInvoiceConfirmRequest): Response<AccountingEntryDto>
    @GET("plans/catalog") suspend fun planCatalog(): Response<PlanCatalogDto>
    @POST("billing/checkout") suspend fun beginBillingCheckout(@Body body: BillingRequest): Response<BillingCheckoutDto>
    @POST("billing/trial") suspend fun beginBillingTrial(@Body body: BillingRequest): Response<kotlinx.serialization.json.JsonElement>
    @POST("billing/activate-free") suspend fun activateFreePlan(@Body body: BillingRequest): Response<kotlinx.serialization.json.JsonElement>

    @GET("qr/mine")
    suspend fun getMyQrCode(): Response<QrCodeDto>

    @GET("categories")
    suspend fun getCategories(): Response<List<CategoryDto>>

    @GET("categories/search")
    suspend fun searchCategories(@Query("q") query: String): Response<List<CategoryHitDto>>

    @GET("categories/for-name")
    suspend fun categoryForName(@Query("name") name: String): Response<NameGuessDto>

    @POST("merchant/category-suggestions")
    suspend fun suggestCategory(@Body body: CategorySuggestRequest): Response<Unit>

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


    @GET("geo/reverse")
    suspend fun reverseGeocode(@Query("lat") lat: Double, @Query("lng") lng: Double): Response<PlaceInWordsDto>

    @GET("geo/suggest")
    suspend fun suggestAddresses(@Query("q") query: String): Response<List<AddressSuggestionDto>>

    @GET("ads/availability")
    suspend fun adAvailability(@Query("days") days: Int): Response<AdAvailabilityDto>

    @GET("product-categories")
    suspend fun productCategories(): Response<List<ProductCategoryDto>>

    @GET("product-categories/search")
    suspend fun searchProductCategories(@Query("q") query: String): Response<List<ProductCategoryHitDto>>

    @POST("product-categories")
    suspend fun addProductCategory(@Body body: AddProductCategoryRequest): Response<AddProductCategoryResponse>

    @GET("store/sections")
    suspend fun storeSections(@Query("all") all: String?): Response<List<StoreSectionDto>>

    @POST("products/photos")
    suspend fun uploadProductPhoto(@Body body: RequestBody): Response<ProductPhotoDto>

    @POST("products/ai-draft")
    suspend fun aiDraft(@Body body: AiDraftRequest): Response<AiDraftResponseDto>

    @GET("store/banners")
    suspend fun storeBanners(): Response<StoreBannersDto>

    @POST("store/banners/{id}/click")
    suspend fun bannerClick(@Path("id") id: String): Response<Unit>

    @GET("ads/packages")
    suspend fun adPackages(): Response<AdPackagesDto>

    @POST("ads")
    suspend fun bookAd(@Body body: BookAdRequest): Response<AdBookingDto>

    @POST("ads/banners")
    suspend fun bookBanner(@Body body: BannerBookRequest): Response<BannerBookingDto>

    @GET("ads/banners/mine")
    suspend fun myBannerBookings(): Response<List<BannerBookingDto>>

    /** The picture of a booking, already cut to the exact size (raw JPEG bytes). */
    @PUT("ads/banners/{id}/image")
    suspend fun uploadBannerImage(@Path("id") id: String, @Body body: RequestBody): Response<Unit>

    @PUT("ads/{id}/image")
    suspend fun uploadAdImage(@Path("id") id: String, @Body body: RequestBody): Response<Unit>

    @POST("ads/banners/{id}/cancel")
    suspend fun cancelBannerBooking(@Path("id") id: String): Response<Unit>

    @GET("ads/mine")
    suspend fun myAds(): Response<List<MyAdDto>>

    @POST("ads/{id}/cancel")
    suspend fun cancelAd(@Path("id") id: String): Response<Unit>

    @POST("ads/{id}/click")
    suspend fun adClick(@Path("id") id: String): Response<Unit>

    @GET("reviews/products/{id}")
    suspend fun productReviews(@Path("id") id: String, @Query("limit") limit: Int, @Query("offset") offset: Int): Response<ReviewsDto>

    @GET("reviews/shops/{id}")
    suspend fun shopReviews(@Path("id") id: String, @Query("limit") limit: Int, @Query("offset") offset: Int): Response<ReviewsDto>

    @PUT("reviews/products/{id}")
    suspend fun reviewProduct(@Path("id") id: String, @Body body: ReviewRequest): Response<Unit>

    @PUT("reviews/shops/{id}")
    suspend fun reviewShop(@Path("id") id: String, @Body body: ReviewRequest): Response<Unit>

    @PUT("reviews/customers/{id}")
    suspend fun reviewCustomer(@Path("id") id: String, @Body body: ReviewRequest): Response<Unit>

    /** Our social media pages the owner switched on (admin panel). */
    @GET("social-links")
    suspend fun socialLinks(): Response<SocialLinksDto>

    /** Is a newer version out, and has the owner switched the "new version" message on. */
    @GET("app-update")
    suspend fun appUpdate(): Response<AppUpdateDto>

    /** The public places (mosques, hospitals, parks, main streets) inside the visible map. */
    @GET("landmarks")
    suspend fun landmarks(
        @Query("minLat") minLat: Double,
        @Query("maxLat") maxLat: Double,
        @Query("minLng") minLng: Double,
        @Query("maxLng") maxLng: Double,
        @Query("zoom") zoom: Double? = null,
        @Query("limit") limit: Int = 300,
    ): Response<LandmarksDto>

    /** Shops and public places in one list, nearest and best first. */
    @GET("search")
    suspend fun search(@Query("q") q: String, @Query("lat") lat: Double? = null, @Query("lng") lng: Double? = null, @Query("cityId") cityId: String? = null, @Query("limit") limit: Int = 40): Response<SearchResponseDto>

    @GET("landmarks/similar")
    suspend fun similarLandmarks(@Query("name") name: String, @Query("lat") lat: Double? = null, @Query("lng") lng: Double? = null, @Query("address") address: String? = null): Response<SimilarLandmarksDto>

    @GET("landmarks/{id}")
    suspend fun landmark(@Path("id") id: String): Response<LandmarkDto>

    @GET("landmarks/{id}/my-claim")
    suspend fun myLandmarkClaim(@Path("id") id: String): Response<MyClaimDto>

    @POST("landmarks/{id}/claims")
    suspend fun submitLandmarkClaim(@Path("id") id: String, @Body body: ClaimRequest): Response<ClaimCreatedDto>

    @PUT("landmarks/claims/{id}/files")
    suspend fun uploadClaimFile(@Path("id") id: String, @Query("name") name: String, @Body body: RequestBody): Response<Unit>

    @POST("landmarks/claims/{id}/withdraw")
    suspend fun withdrawLandmarkClaim(@Path("id") id: String): Response<Unit>

    @POST("landmarks/claims/{id}/resubmit")
    suspend fun resubmitLandmarkClaim(@Path("id") id: String, @Body body: Map<String, String?>): Response<Unit>

    @GET("geo/market")
    suspend fun market(): Response<MarketDto>

    @GET("store/home")
    suspend fun storeHome(
        @Query("scope") scope: String?,
        @Query("cityId") cityId: String?,
        @Query("radiusKm") radiusKm: Int?,
        @Query("lat") lat: Double?,
        @Query("lng") lng: Double?,
    ): Response<StoreHomeDto>

    @GET("store/products")
    suspend fun storeProducts(
        @Query("q") q: String?,
        @Query("section") section: String?,
        @Query("deals") deals: String?,
        @Query("merchantId") merchantId: String?,
        @Query("sort") sort: String,
        @Query("limit") limit: Int,
        @Query("offset") offset: Int,
        @Query("scope") scope: String?,
        @Query("cityId") cityId: String?,
        @Query("radiusKm") radiusKm: Int?,
        @Query("lat") lat: Double?,
        @Query("lng") lng: Double?,
    ): Response<StoreListDto>

    @GET("store/products/{id}")
    suspend fun storeProduct(@Path("id") id: String): Response<StoreProductDto>

    @GET("marketplace/settings") suspend fun marketplaceSettings(): Response<MarketplaceSettingsDto>
    @GET("marketplace/listings") suspend fun marketplaceListings(@Query("q") q: String? = null): Response<MarketplaceListingsDto>
    @GET("marketplace/mine") suspend fun myMarketplace(): Response<MyMarketplaceDto>
    @GET("marketplace/my-store") suspend fun myMarketplaceStore(): Response<MarketplaceStoreResponseDto>
    @PUT("marketplace/my-store") suspend fun saveMarketplaceStore(@Body body: Map<String, String?>): Response<MarketplaceStoreResponseDto>
    @GET("marketplace/stores/{id}") suspend fun marketplaceStore(@Path("id") id: String): Response<MarketplaceStoreDetailDto>
    @POST("marketplace/listings") suspend fun createMarketplaceListing(@Body body: CreateMarketplaceListingRequest): Response<MarketplaceCreateResponseDto>
    @retrofit2.http.Headers("Content-Type: image/jpeg")
    @POST("marketplace/photos") suspend fun uploadMarketplacePhoto(@Body body: RequestBody): Response<ProductPhotoDto>
    @PATCH("marketplace/listings/{id}") suspend fun updateMarketplaceListing(@Path("id") id: String, @Body body: Map<String, String>): Response<Unit>
    @POST("marketplace/subscribe") suspend fun subscribeMarketplace(@Body body: Map<String, String>): Response<MarketplaceSubscriptionResponseDto>

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

    @PUT("merchant/pricing")
    suspend fun putPricing(@Body body: PricingRequest): Response<kotlinx.serialization.json.JsonElement>

    @PATCH("merchant/me")
    suspend fun updateMerchantMe(@Body body: UpdateMerchantRequest): Response<MerchantMeDto>

    @POST("merchant/register")
    suspend fun registerMerchant(@Body body: RegisterMerchantRequest): Response<RegisterMerchantResponse>

    @GET("affiliates")
    suspend fun getMyMarketingTeam(): Response<List<ShopAffiliateDto>>

    @POST("affiliates")
    suspend fun addShopAffiliate(@Body body: AddShopAffiliateRequest): Response<kotlinx.serialization.json.JsonElement>

    @PATCH("affiliates/{id}")
    suspend fun updateShopAffiliate(@Path("id") id: String, @Body body: UpdateShopAffiliateRequest): Response<kotlinx.serialization.json.JsonElement>

    @POST("merchant/discounts")
    suspend fun addDiscount(@Body body: CreateDiscountRequest): Response<DiscountDto>

    @GET("merchant/discounts")
    suspend fun myDiscounts(): Response<List<MyDiscountDto>>

    @POST("merchant/discounts")
    suspend fun createDiscount(@Body body: DiscountInput): Response<DiscountDto>

    @PATCH("merchant/discounts/{id}")
    suspend fun editDiscount(@Path("id") id: String, @Body body: DiscountInput): Response<okhttp3.ResponseBody>

    @PATCH("merchant/discounts/{id}")
    suspend fun patchDiscount(@Path("id") id: String, @Body body: DiscountPatchRequest): Response<okhttp3.ResponseBody>

    @DELETE("merchant/discounts/{id}")
    suspend fun deleteDiscount(@Path("id") id: String): Response<okhttp3.ResponseBody>

    @GET("cart")
    suspend fun getCart(): Response<CartViewDto>

    @POST("cart/items")
    suspend fun addCartItem(@Body body: AddCartItemRequest): Response<CartViewDto>

    @PATCH("cart/items/{id}")
    suspend fun updateCartItem(@Path("id") id: String, @Body body: UpdateCartItemRequest): Response<CartViewDto>

    @DELETE("cart/items/{id}")
    suspend fun removeCartItem(@Path("id") id: String): Response<CartViewDto>

    @POST("cart/checkout")
    suspend fun checkout(@Body body: CheckoutRequest): Response<List<OrderDto>>

    @GET("qr/transactions/mine")
    suspend fun myDiscountTransactions(): Response<List<DiscountTxDto>>

    @GET("qr/transactions/shop")
    suspend fun shopDiscountTransactions(): Response<ShopTransactionsDto>

    @GET("referral/me")
    suspend fun referralMe(): Response<ReferralMeDto>

    @POST("referral/request")
    suspend fun requestMarketer(@Body body: MarketerRequestBody): Response<Unit>

    @POST("referral/use")
    suspend fun useReferral(@Body body: UseReferralRequest): Response<UseReferralResponse>

    @GET("merchant/store-plans")
    suspend fun storePlans(): Response<StorePlansDto>

    @POST("merchant/store-plans/subscribe")
    suspend fun subscribeStorePlan(@Body body: SubscribeRequest): Response<StorePlansDto>

    @GET("merchant/branches")
    suspend fun branches(): Response<List<BranchDto>>

    @POST("merchant/branches")
    suspend fun addBranch(@Body body: BranchRequest): Response<BranchDto>

    @PATCH("merchant/branches/{id}")
    suspend fun updateBranch(@Path("id") id: String, @Body body: BranchRequest): Response<BranchDto>

    @DELETE("merchant/branches/{id}")
    suspend fun deleteBranch(@Path("id") id: String): Response<kotlinx.serialization.json.JsonElement>

    @GET("merchant/shipping-methods")
    suspend fun shippingMethods(): Response<List<ShippingMethodDto>>

    @PUT("merchant/shipping-methods")
    suspend fun saveShippingMethods(@Body body: ShippingPutRequest): Response<List<ShippingMethodDto>>

    @POST("products/photos/{id}/edit")
    suspend fun editProductPhoto(@Path("id") id: String, @Body body: PhotoEditRequest): Response<PhotoEditResponse>

    @GET("products/ai-quota")
    suspend fun aiQuota(): Response<AiQuotaDto>

    @GET("products/ai-packages")
    suspend fun aiPackages(): Response<AiPackagesDto>

    @PATCH("products/ai-subscription")
    suspend fun aiAutoRenew(@Body body: AiAutoRenewRequest): Response<AiSubscribeResponse>

    @POST("products/ai-subscribe")
    suspend fun aiSubscribe(@Body body: AiSubscribeRequest): Response<AiSubscribeResponse>

    @GET("orders/mine")
    suspend fun getMyOrders(): Response<List<OrderDto>>

    @GET("orders/merchant")
    suspend fun getMerchantOrders(): Response<List<OrderDto>>

    @GET("orders/{id}")
    suspend fun getOrder(@Path("id") id: String): Response<OrderDto>

    @POST("orders/{id}/payment/confirm-cash")
    suspend fun confirmCash(@Path("id") id: String): Response<PaymentDto>

    @POST("orders/{id}/payment/submit-transfer")
    suspend fun submitTransfer(@Path("id") id: String, @Body body: TransferReferenceRequest): Response<PaymentDto>

    @POST("orders/{id}/payment/confirm-transfer")
    suspend fun confirmTransfer(@Path("id") id: String): Response<PaymentDto>

    @PATCH("orders/{id}/status")
    suspend fun updateOrderStatus(@Path("id") id: String, @Body body: UpdateOrderStatusRequest): Response<OrderDto>

    @POST("orders/{id}/cancel")
    suspend fun cancelOrder(@Path("id") id: String): Response<OrderDto>

    @POST("qr/verify")
    suspend fun verifyMember(@Body body: VerifyRedeemRequest): Response<VerifyResponse>

    @POST("qr/redeem")
    suspend fun redeemDiscount(@Body body: RedeemRequest): Response<RedeemResponse>

    @GET("responder/stats")
    suspend fun getResponderStats(): Response<ResponderStatsDto>

    @GET("responder/status")
    suspend fun getResponderStatus(): Response<ResponderStatusDto>

    @GET("responder/plans")
    suspend fun getResponderPlans(): Response<List<ResponderPlanDto>>

    @POST("responder/plans/{id}/trial")
    suspend fun startResponderPlanTrial(@Path("id") id: String): Response<kotlinx.serialization.json.JsonElement>

    @POST("responder/plans/{id}/purchase")
    suspend fun purchaseResponderPlan(@Path("id") id: String, @Body body: ResponderPlanPurchaseDto): Response<kotlinx.serialization.json.JsonElement>

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

    @PATCH("responder/rules/{id}")
    suspend fun updateResponderRule(@Path("id") id: String, @Body body: CreateRuleRequest): Response<kotlinx.serialization.json.JsonElement>

    @DELETE("responder/connections/{id}")
    suspend fun deleteResponderConnection(@Path("id") id: String): Response<kotlinx.serialization.json.JsonElement>

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
