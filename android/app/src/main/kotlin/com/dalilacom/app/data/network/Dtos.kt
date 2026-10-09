package com.dalilacom.app.data.network

import kotlinx.serialization.Serializable

@Serializable
data class RegisterRequest(val email: String, val password: String, val fullName: String, val countryCode: String? = null, val cityId: String? = null)

@Serializable
data class LoginRequest(val email: String, val password: String)

@Serializable
data class UserDto(val id: String, val email: String, val fullName: String, val role: String, val emailVerified: Boolean = false)

@Serializable
data class ProfileDto(
    val id: String,
    val email: String,
    val emailVerified: Boolean = false,
    val phone: String? = null,
    val fullName: String,
    val role: String,
    val bio: String? = null,
    val countryCode: String? = null,
    val cityId: String? = null,
    val vatNumber: String? = null,
    val avatarUrl: String? = null,
)

@Serializable
data class UpdateProfileRequest(
    val fullName: String? = null,
    val bio: String? = null,
    val language: String? = null,
    val phone: String? = null,
    val countryCode: String? = null,
    val cityId: String? = null,
    val vatNumber: String? = null,
)

// `confirm` has no default on purpose: defaults are not sent, and the server insists on an explicit true.
@Serializable
data class DeleteAccountRequest(val confirm: Boolean, val password: String? = null)

@Serializable
data class LocationRequest(val latitude: Double, val longitude: Double)

@Serializable
data class MeResponse(val user: UserDto, val emailDeliveryEnabled: Boolean = false)

@Serializable
data class ResendVerificationRequest(val email: String)

@Serializable
data class AuthResponse(val token: String, val user: UserDto)

@Serializable
data class GeoUnitDto(val id: String, val name: String, val nameArabic: String? = null, val nameEnglish: String? = null, val isoCode2: String? = null, val parentId: String? = null)

@Serializable
data class ChangeEmailRequest(val newEmail: String, val password: String? = null)

@Serializable
data class ForgotPasswordRequest(val email: String)

@Serializable
data class ChangePasswordRequest(val currentPassword: String, val newPassword: String)

@Serializable
data class ChangePasswordResponse(val token: String)

@Serializable
data class AddressDto(
    val id: String,
    val label: String? = null,
    val isDefault: Boolean = false,
    val street: String? = null,
    val buildingNumber: String? = null,
    val country: GeoUnitDto,
    val region: GeoUnitDto? = null,
    val city: GeoUnitDto? = null,
    val area: GeoUnitDto? = null,
)

@Serializable
data class AddressRequest(
    val countryId: String,
    val regionId: String? = null,
    val cityId: String? = null,
    val areaId: String? = null,
    val street: String? = null,
    val buildingNumber: String? = null,
    val postalCode: String? = null,
    val label: String? = null,
    val isDefault: Boolean,
)

@Serializable
data class ReviewShopDto(val businessName: String? = null)

@Serializable
data class ReviewSenderDto(val fullName: String? = null, val email: String? = null, val merchantProfile: ReviewShopDto? = null)

@Serializable
data class ReviewItemDto(
    val id: String,
    val title: String,
    val body: String,
    val scope: String = "",
    val radiusKm: Double? = null,
    val targeted: Int = 0,
    val productId: String? = null,
    val discountId: String? = null,
    val aiVerdict: String? = null,
    val aiReasons: List<String>? = null,
    val sender: ReviewSenderDto? = null,
)

@Serializable
data class RejectRequest(val reason: String)

// isDefault has no default on purpose: defaults are not sent.
@Serializable
data class DefaultAddressRequest(val isDefault: Boolean)

@Serializable
data class BroadcastPreviewRequest(val radiusKm: Double? = null, val followers: Boolean? = null, val geoUnitId: String? = null)

@Serializable
data class BroadcastPreviewDto(val count: Int = 0, val cap: Int = 0, val limit: Int? = null, val remainingThisMonth: Int? = null, val price: Int = 0, val balance: Int? = null)

@Serializable
data class BroadcastRequest(val title: String, val body: String, val radiusKm: Double? = null, val followers: Boolean? = null, val geoUnitId: String? = null, val productId: String? = null, val discountId: String? = null)

@Serializable
data class BroadcastResultDto(val id: String = "", val status: String = "", val targeted: Int = 0, val delivered: Int = 0, val reasons: List<String> = emptyList())

@Serializable
data class BroadcastDto(
    val id: String,
    val title: String,
    val body: String,
    val status: String,
    val targeted: Int = 0,
    val delivered: Int = 0,
    val reviewNote: String? = null,
    val creditsCharged: Int = 0,
    val createdAt: String = "",
)

@Serializable
data class SocialProvidersDto(val google: Boolean = false, val facebook: Boolean = false)

@Serializable
data class SocialExchangeRequest(val ticket: String)

@Serializable
data class SocialCompleteRequest(val pending: String, val email: String)

@Serializable
data class MessageResponse(val message: String? = null, val error: String? = null)

@Serializable
data class MembershipPlanDto(
    val id: String,
    val name: String,
    val durationDays: Int,
    val priceCents: Int,
    val currency: String,
)

@Serializable
data class SubscribeRequest(val planId: String)

@Serializable
data class MembershipDto(
    val id: String? = null,
    val memberNumber: String,
    val status: String,
    val startDate: String,
    val endDate: String,
    val isTrial: Boolean = false,
)

@Serializable
data class QrCodeDto(
    val memberNumber: String,
    val code: String,
    val expiresInSeconds: Int,
)

@Serializable
data class CategoryDto(
    val id: String,
    val name: String,
    val slug: String,
    val icon: String? = null,
    val merchantCount: Int = 0,
    val children: List<CategoryDto> = emptyList(),
)

@Serializable
data class DiscountSectionDto(val id: String, val name: String, val nameEn: String = "")

/** A discount as customers see it on a shop page: what it covers, until when, and its limits. */
@Serializable
data class DiscountDto(
    val id: String,
    val title: String,
    val percent: Int,
    val description: String? = null,
    val endDate: String? = null,
    val perCustomerLimit: Int? = null,
    val maxCustomers: Int? = null,
    val scope: String = "ALL",
    val section: DiscountSectionDto? = null,
    val productNames: List<String> = emptyList(),
)

/** A discount in the shop's own list, with its state, review result and how it has been used. */
@Serializable
data class MyDiscountDto(
    val id: String,
    val title: String,
    val percent: Int,
    val description: String? = null,
    val startDate: String? = null,
    val endDate: String? = null,
    val maxCustomers: Int? = null,
    val perCustomerLimit: Int? = null,
    val isActive: Boolean = true,
    val status: String = "PENDING",
    val rejectionReason: String? = null,
    val state: String = "PENDING",
    val productIds: List<String> = emptyList(),
    val scopeSection: String? = null,
    val scope: String = "ALL",
    val section: DiscountSectionDto? = null,
    val productNames: List<String> = emptyList(),
    val uses: Int = 0,
    val customers: Int = 0,
    val savedCents: Int = 0,
)

/** What the form sends; null fields are sent too so an edit can clear a limit or an end date. */
@OptIn(kotlinx.serialization.ExperimentalSerializationApi::class)
@Serializable
data class DiscountInput(
    @kotlinx.serialization.EncodeDefault val title: String,
    @kotlinx.serialization.EncodeDefault val percent: Int,
    @kotlinx.serialization.EncodeDefault val description: String? = null,
    @kotlinx.serialization.EncodeDefault val scope: String = "ALL",
    @kotlinx.serialization.EncodeDefault val scopeSection: String? = null,
    @kotlinx.serialization.EncodeDefault val productIds: List<String> = emptyList(),
    @kotlinx.serialization.EncodeDefault val startDate: String? = null,
    @kotlinx.serialization.EncodeDefault val endDate: String? = null,
    @kotlinx.serialization.EncodeDefault val maxCustomers: Int? = null,
    @kotlinx.serialization.EncodeDefault val perCustomerLimit: Int? = null,
)

@Serializable
data class DiscountPatchRequest(val isActive: Boolean? = null, val endNow: Boolean? = null)

/** One of the shop's running discounts, as seen when a member is scanned. */
@Serializable
data class VerifiedDiscountDto(
    val id: String,
    val title: String,
    val percent: Int,
    val description: String? = null,
    val endDate: String? = null,
    val eligible: Boolean = true,
    val usedByMember: Int = 0,
    val remainingForMember: Int? = null,
    val scope: String = "ALL",
    val section: DiscountSectionDto? = null,
    val productNames: List<String> = emptyList(),
)

@Serializable
data class MerchantDto(
    val id: String,
    val businessName: String,
    val address: String? = null,
    val latitude: Double? = null,
    val longitude: Double? = null,
    val category: CategoryDto? = null,
    val discounts: List<DiscountDto> = emptyList(),
    val distanceKm: Double? = null,
    val phone: String? = null,
    val whatsapp: String? = null,
    val openingHours: Map<String, List<HourRangeDto>>? = null,
    val openStatus: OpenStatusDto? = null,
    val bio: String? = null,
    val avatarUrl: String? = null,
    val rating: Double = 0.0,
    val ratingCount: Int = 0,
    val followersCount: Int = 0,
)

@Serializable
data class HourRangeDto(val open: String, val close: String)

@Serializable
data class OpenStatusDto(
    val hasHours: Boolean = false,
    val isOpen: Boolean = false,
    val closesAt: String? = null,
    val opensAt: String? = null,
    val opensDay: String? = null,
)

@Serializable
data class SuggestMerchantDto(val id: String, val businessName: String, val category: CategoryRefDto? = null)

@Serializable
data class CategoryRefDto(val name: String)

@Serializable
data class SuggestCategoryDto(
    val id: String,
    val name: String,
    val icon: String? = null,
    val path: String? = null,
    val merchantCount: Int = 0,
)

@Serializable
data class SuggestResponse(
    val merchants: List<SuggestMerchantDto> = emptyList(),
    val categories: List<SuggestCategoryDto> = emptyList(),
)

@Serializable
data class SetHoursRequest(val openingHours: Map<String, List<HourRangeDto>>?)

@Serializable
data class HoursResponse(val openStatus: OpenStatusDto? = null)

@Serializable
data class ProductDto(
    val id: String,
    val merchantId: String,
    val categoryId: String? = null,
    val name: String,
    val description: String? = null,
    val priceCents: Int,
    val memberDiscountEnabled: Boolean = false,
    val memberPriceCents: Int? = null,
    val stock: Int,
    val isActive: Boolean = true,
)

@Serializable
data class MerchantSummaryDto(val id: String, val businessName: String)

@Serializable
data class UserNameDto(val fullName: String, val id: String = "")

@Serializable
data class CartProductDto(
    val id: String,
    val name: String,
    val merchant: MerchantSummaryDto,
    val stock: Int,
    val isActive: Boolean,
)

@Serializable
data class CartItemDto(
    val id: String,
    val quantity: Int,
    val product: CartProductDto,
    val regularPriceCents: Int,
    val unitPriceCents: Int,
    val lineTotalCents: Int,
)

@Serializable
data class CartViewDto(val items: List<CartItemDto> = emptyList(), val totalCents: Int = 0)

@Serializable
data class AddCartItemRequest(val productId: String, val quantity: Int = 1)

@Serializable
data class UpdateCartItemRequest(val quantity: Int)

@Serializable
data class OrderItemDto(
    val id: String,
    val productId: String,
    val productName: String,
    val quantity: Int,
    val unitPriceCents: Int,
)

@Serializable
data class OrderDto(
    val id: String,
    val orderNumber: String,
    val status: String,
    val subtotalCents: Int,
    val memberDiscountCents: Int = 0,
    val totalCents: Int,
    val cancelReason: String? = null,
    val createdAt: String,
    val merchant: MerchantSummaryDto? = null,
    val user: UserNameDto? = null,
    val items: List<OrderItemDto> = emptyList(),
    val rated: RatedDto? = null,
    val customer: CustomerRefDto? = null,
    val customerRating: RatingDto? = null,
    val ratedCustomer: Boolean = false,
)

@Serializable
data class UpdateOrderStatusRequest(val status: String, val cancelReason: String? = null)

@Serializable
data class RegisterMerchantRequest(
    val businessName: String,
    val categoryId: String,
    val address: String? = null,
    val phone: String? = null,
    val whatsapp: String? = null,
    val latitude: Double? = null,
    val longitude: Double? = null,
)

@Serializable
data class RegisterMerchantResponse(val id: String, val businessName: String, val approvalStatus: String)

@Serializable
data class VerifyRedeemRequest(val memberNumber: String, val code: String)

@Serializable
data class VerifiedMemberDto(val fullName: String, val memberNumber: String)

@Serializable
data class VerifyResponse(
    val verified: Boolean,
    val member: VerifiedMemberDto,
    val discount: DiscountDto? = null,
    val discounts: List<VerifiedDiscountDto> = emptyList(),
)

@Serializable
data class RedeemRequest(val memberNumber: String, val code: String, val billAmountCents: Int, val discountId: String? = null)

@Serializable
data class RedeemResponse(
    val transactionRef: String,
    val billAmountCents: Int,
    val discountPercent: Int,
    val discountAmountCents: Int,
    val finalAmountCents: Int,
    val createdAt: String,
)

@Serializable
data class CreateProductRequest(
    val name: String,
    val description: String? = null,
    val priceCents: Int,
    val categoryId: String? = null,
    val stock: Int = 0,
    val sku: String? = null,
    val memberDiscountEnabled: Boolean = false,
    val memberPriceCents: Int? = null,
    val storeSection: String? = null,
    val images: List<String>? = null,
    val specs: List<SpecDto>? = null,
    val condition: String? = null,
)

@Serializable
data class UpdateProductRequest(
    val name: String? = null,
    val description: String? = null,
    val priceCents: Int? = null,
    val categoryId: String? = null,
    val stock: Int? = null,
    val sku: String? = null,
    val memberDiscountEnabled: Boolean? = null,
    val memberPriceCents: Int? = null,
    val isActive: Boolean? = null,
)

@Serializable
data class MerchantMeDto(
    val id: String,
    val businessName: String,
    val approvalStatus: String,
    val categoryId: String? = null,
    val address: String? = null,
    val phone: String? = null,
    val whatsapp: String? = null,
    val latitude: Double? = null,
    val longitude: Double? = null,
    val discounts: List<DiscountDto> = emptyList(),
    val openingHours: Map<String, List<HourRangeDto>>? = null,
    val onboarding: OnboardingDto? = null,
)

/** What still stands between a merchant and being found on the map. */
@Serializable
data class OnboardingDto(
    val approved: Boolean = false,
    val location: Boolean = false,
    val hours: Boolean = false,
    val discount: Boolean = false,
    val product: Boolean = false,
) {
    val doneCount get() = listOf(approved, location, hours, discount, product).count { it }
    val complete get() = doneCount == 5
}

@Serializable
data class UpdateMerchantRequest(
    val businessName: String? = null,
    val categoryId: String? = null,
    val address: String? = null,
    val phone: String? = null,
    val whatsapp: String? = null,
    val latitude: Double? = null,
    val longitude: Double? = null,
)

/** Road route from the server: points are [lat, lng]. */
@Serializable
data class RouteDto(
    val mode: String = "driving",
    val distanceMeters: Int,
    val durationSeconds: Int,
    val geometry: List<List<Double>> = emptyList(),
    /** The manoeuvres of the route, for turn-by-turn guidance. */
    val steps: List<RouteStepDto> = emptyList(),
)

/** One manoeuvre: what to do ([type] + [modifier]), on which road, where ([location] = lat, lng) and how long the step is. */
@Serializable
data class RouteStepDto(
    val type: String = "",
    val modifier: String = "",
    val exit: Int? = null,
    val name: String = "",
    val location: List<Double> = emptyList(),
    val distanceMeters: Int = 0,
    val durationSeconds: Int = 0,
)

@Serializable
data class CreateDiscountRequest(val title: String, val percent: Int)


@Serializable
data class NotificationDto(
    val id: String,
    val type: String,
    val title: String,
    val body: String? = null,
    val data: kotlinx.serialization.json.JsonElement? = null,
    val readAt: String? = null,
    val createdAt: String,
)

@Serializable
data class NotificationsResponse(val items: List<NotificationDto> = emptyList(), val unread: Int = 0)

@Serializable
data class UnreadCountDto(val unread: Int = 0)

@Serializable
data class NotificationPreferenceDto(val type: String, val mode: String)

@Serializable
data class NotificationPreferencesRequest(val preferences: List<NotificationPreferenceDto>)

@Serializable
data class DeviceRequest(val token: String)

@Serializable
data class UnregisterDeviceRequest(val token: String)

@Serializable
data class PlanFeatureDto(val text: String, val included: Boolean = true)

@Serializable
data class CatalogPlanDto(
    val id: String,
    val service: String,
    val name: String,
    val description: String? = null,
    val durationDays: Int,
    val trialDays: Int = 0,
    val priceCredits: Int? = null,
    val priceFrom: String = "default",
    val monthlyBroadcastLimit: Int? = null,
    val features: List<PlanFeatureDto> = emptyList(),
    val source: String = "catalog",
)

@Serializable
data class CatalogServiceDto(val service: String, val plans: List<CatalogPlanDto> = emptyList())

@Serializable
data class CatalogDto(val creditName: String = "", val countryCode: String? = null, val services: List<CatalogServiceDto> = emptyList())

/* ---------------- the online store ---------------- */

@Serializable
data class MarketDto(val country: String = "", val currencyCode: String = "")

@Serializable
data class StoreSectionDto(val id: String, val name: String, val nameEn: String = "", val icon: String = "", val image: String = "", val count: Int = 0)

@Serializable
data class StoreShopDto(val id: String, val name: String)

@Serializable
data class StoreProductDto(
    val id: String,
    val name: String,
    val description: String? = null,
    val priceCents: Int,
    val memberDiscountEnabled: Boolean = false,
    val memberPriceCents: Int? = null,
    val stock: Int = 0,
    val imageUrl: String? = null,
    val images: List<String> = emptyList(),
    val specs: List<SpecDto> = emptyList(),
    val condition: String? = null,
    val icon: String = "🛍️",
    val hue: Int = 0,
    val rating: Double = 0.0,
    val ratingCount: Int = 0,
    val soldCount: Int = 0,
    val section: StoreSectionDto? = null,
    val merchant: StoreShopDto,
    val related: List<StoreProductDto> = emptyList(),
    val currency: String = "",
)

@Serializable
data class StoreHomeDto(
    val country: String = "",
    val currency: String = "",
    val sections: List<StoreSectionDto> = emptyList(),
    val slots: List<StoreSlotDto> = emptyList(),
    val adOffer: AdOfferDto? = null,
    val bestSellers: List<StoreProductDto> = emptyList(),
    val deals: List<StoreProductDto> = emptyList(),
    val newest: List<StoreProductDto> = emptyList(),
)

@Serializable
data class StoreListDto(val total: Int = 0, val currency: String = "", val items: List<StoreProductDto> = emptyList())

/* ---------------- advertising space and the store's banners ---------------- */

@Serializable
data class StoreSlotDto(val slot: Int, val ad: Boolean = false, val adId: String? = null, val product: StoreProductDto)

@Serializable
data class AdOfferDto(val fromCredits: Int = 0, val days: Int = 1, val creditName: String = "")

@Serializable
data class BannerTargetDto(val type: String = "none", val value: String? = null)

@Serializable
data class StoreBannerDto(
    val id: String,
    val title: String,
    val subtitle: String? = null,
    val buttonText: String? = null,
    val bg: String = "coral",
    val imageUrl: String? = null,
    val target: BannerTargetDto = BannerTargetDto(),
)

@Serializable
data class StoreBannersDto(val intervalSeconds: Int = 5, val banners: List<StoreBannerDto> = emptyList())

@Serializable
data class AdPackageDto(val days: Int, val credits: Int)

@Serializable
data class AdPackagesDto(val packages: List<AdPackageDto> = emptyList(), val bannerPackages: List<AdPackageDto> = emptyList(), val creditName: String = "", val balance: Int? = null, val autoApprove: Boolean = false)

@Serializable
data class BookAdRequest(val productId: String, val days: Int, val start: String? = null)

@Serializable
data class AdBookingDto(val id: String, val status: String)

@Serializable
data class MyAdProductDto(val id: String, val name: String, val icon: String? = null)

@Serializable
data class MyAdDto(
    val id: String,
    val product: MyAdProductDto,
    val days: Int,
    val credits: Int,
    val state: String,
    val startsAt: String,
    val endsAt: String,
    val impressions: Int = 0,
    val clicks: Int = 0,
    val rejectionReason: String? = null,
)

/* ---------------- photos: searching the store with one, and a product from one ---------------- */

@Serializable
data class SpecDto(val label: String, val value: String)

@Serializable
data class PhotoSearchDto(val title: String = "", val currency: String = "", val items: List<StoreProductDto> = emptyList())

@Serializable
data class ProductPhotoDto(val id: String, val url: String)

@Serializable
data class AiDraftRequest(val photoId: String)

@Serializable
data class AiDraftDto(
    val name: String = "",
    val alternatives: List<String> = emptyList(),
    val section: String? = null,
    val description: String = "",
    val specs: List<SpecDto> = emptyList(),
    val condition: String? = null,
)

@Serializable
data class PriceHintDto(val min: Int = 0, val median: Int = 0, val max: Int = 0, val count: Int = 0)

@Serializable
data class AiDraftResponseDto(val available: Boolean = false, val draft: AiDraftDto? = null, val priceHint: PriceHintDto? = null)

/* ---------------- ratings and comments ---------------- */

@Serializable
data class ReviewSummaryDto(val average: Double = 0.0, val count: Int = 0, val distribution: Map<String, Int> = emptyMap())

@Serializable
data class ReviewEntryDto(
    val id: String,
    val stars: Int,
    val comment: String? = null,
    val name: String = "",
    val shop: String = "",
    val verified: Boolean = false,
    val createdAt: String = "",
    val mine: Boolean = false,
)

@Serializable
data class MyReviewDto(val stars: Int = 0, val comment: String? = null)

@Serializable
data class ReviewsDto(
    val summary: ReviewSummaryDto = ReviewSummaryDto(),
    val items: List<ReviewEntryDto> = emptyList(),
    val canReview: Boolean = false,
    val mine: MyReviewDto? = null,
    val followersCount: Int = 0,
)

@Serializable
data class ReviewRequest(val stars: Int, val comment: String? = null)

@Serializable
data class RatedDto(val shop: Boolean = false, val products: List<String> = emptyList())

@Serializable
data class RatingDto(val rating: Double = 0.0, val ratingCount: Int = 0)

@Serializable
data class CustomerRefDto(val id: String, val fullName: String = "")

@Serializable
data class BannerBookRequest(val days: Int, val phone: String, val start: String? = null, val whatsapp: String? = null, val note: String? = null)

@Serializable
data class BannerBookingDto(
    val id: String,
    val days: Int = 0,
    val credits: Int = 0,
    val requestedStart: String = "",
    val status: String = "PENDING",
    val phone: String = "",
    val rejectionReason: String? = null,
)
