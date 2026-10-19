package com.dalilacom.app.data.network

import kotlinx.serialization.Serializable

@Serializable
data class RegisterRequest(val email: String, val password: String, val fullName: String, val countryCode: String? = null, val cityId: String? = null, val referralCode: String? = null)

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
    /** Work done online: a shop in this profession needs no place on the map. */
    val online: Boolean = false,
    val children: List<CategoryDto> = emptyList(),
)

/** One result of typing a profession: the profession and where it sits (section > profession). */
@Serializable
data class CategoryHitDto(
    val id: String,
    val name: String,
    val path: String = "",
    val icon: String? = null,
    val online: Boolean = false,
)

/** A profession a shop proposed, and what the team decided. */
@Serializable
data class CategorySuggestionDto(val name: String, val status: String, val note: String? = null)

@Serializable
data class CategorySuggestRequest(val name: String)

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
    val peopleLeft: Int? = null,
    val myTimesLeft: Int? = null,
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
    /** The branch this entry is shown at (the nearest one to the customer), when the shop has several places. */
    val branchName: String? = null,
    val branchCount: Int = 0,
    val branches: List<BranchDto> = emptyList(),
)

/** Another place of the same shop, maybe in another city. */
@Serializable
data class BranchDto(
    val id: String,
    val name: String,
    val city: String? = null,
    val address: String? = null,
    val phone: String? = null,
    val latitude: Double,
    val longitude: Double,
)

@Serializable
data class BranchRequest(
    val name: String,
    val city: String? = null,
    val address: String? = null,
    val phone: String? = null,
    val latitude: Double,
    val longitude: Double,
)

@Serializable
data class HourRangeDto(val open: String, val close: String)

@Serializable
data class OpenStatusDto(
    val hasHours: Boolean = false,
    val isOpen: Boolean = false,
    val closesAt: String? = null,
    val alwaysOpen: Boolean = false,
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
    val productCategoryId: String? = null,
    val name: String,
    val description: String? = null,
    val priceCents: Int,
    val memberDiscountEnabled: Boolean = false,
    val memberPriceCents: Int? = null,
    val stock: Int,
    val isActive: Boolean = true,
    val images: List<String> = emptyList(),
    val imageUrl: String? = null,
    /** APPROVED (shown), PENDING (being reviewed) or REJECTED. */
    val moderation: String = "APPROVED",
    val moderationNote: String? = null,
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
data class ShippingMethodDto(val id: String, val name: String, val costCents: Int = 0)

@Serializable
data class ShippingItemRequest(val name: String, val costCents: Int)

@Serializable
data class ShippingPutRequest(val methods: List<ShippingItemRequest>)

/** How one shop in the cart can send its order. */
@Serializable
data class CartShippingDto(val merchantId: String, val methods: List<ShippingMethodDto> = emptyList())

/** The shipping method chosen for each shop, by shop id. */
@Serializable
data class CheckoutRequest(val shipping: Map<String, String> = emptyMap())

@Serializable
data class CartViewDto(val items: List<CartItemDto> = emptyList(), val shipping: List<CartShippingDto> = emptyList(), val totalCents: Int = 0)

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
    val shippingName: String? = null,
    val shippingCents: Int = 0,
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
    val suggestedCategory: String? = null,
)

@Serializable
data class RegisterMerchantResponse(val id: String, val businessName: String, val approvalStatus: String, val reason: String? = null)

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
    val productCategoryId: String? = null,
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
    val productCategoryId: String? = null,
    val stock: Int? = null,
    val sku: String? = null,
    val memberDiscountEnabled: Boolean? = null,
    val memberPriceCents: Int? = null,
    val isActive: Boolean? = null,
    val images: List<String>? = null,
)

@Serializable
data class MerchantMeDto(
    val id: String,
    val businessName: String,
    val approvalStatus: String,
    val rejectionReason: String? = null,
    val categoryId: String? = null,
    val address: String? = null,
    val phone: String? = null,
    val whatsapp: String? = null,
    val latitude: Double? = null,
    val longitude: Double? = null,
    val discounts: List<DiscountDto> = emptyList(),
    val openingHours: Map<String, List<HourRangeDto>>? = null,
    val onboarding: OnboardingDto? = null,
    val categorySuggestion: CategorySuggestionDto? = null,
    val categoryOnline: Boolean = false,
    val storePlan: StorePlanStateDto? = null,
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
data class SocialLinkDto(val platform: String, val url: String)

@Serializable
data class AppUpdateDto(val version: String? = null, val notify: Boolean = false, val playUrl: String? = null)

@Serializable
data class SocialLinksDto(val links: List<SocialLinkDto> = emptyList())

@Serializable
data class LandmarkKindDto(val slug: String, val name: String, val icon: String, val color: String, val geometry: String = "POINT")

@Serializable
data class LandmarkDto(
    val id: String,
    val name: String,
    val description: String? = null,
    val kind: LandmarkKindDto,
    val sector: String? = null,
    val address: String? = null,
    val phone: String? = null,
    val latitude: Double,
    val longitude: Double,
    /** A street: a list of pieces, each a list of [lat, lng]. */
    val path: List<List<List<Double>>>? = null,
    val claimable: Boolean = false,
)

@Serializable
data class ClaimStateDto(val id: String, val status: String, val message: String? = null)

@Serializable
data class MyClaimDto(val claim: ClaimStateDto? = null)

@Serializable
data class ClaimRequest(val role: String, val phone: String, val note: String? = null)

@Serializable
data class ClaimCreatedDto(val id: String, val status: String)

@Serializable
data class SimilarKindDto(val slug: String = "", val name: String = "", val nameEn: String = "", val icon: String = "")

@Serializable
data class SimilarLandmarkDto(val id: String, val name: String, val kind: SimilarKindDto = SimilarKindDto(), val address: String? = null)

@Serializable
data class SimilarLandmarksDto(val items: List<SimilarLandmarkDto> = emptyList())

@Serializable
data class LandmarksDto(val items: List<LandmarkDto> = emptyList())

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
    val shipping: List<ShippingMethodDto> = emptyList(),
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
data class StoreSlotDto(val slot: Int, val ad: Boolean = false, val adId: String? = null, val creativeUrl: String? = null, val product: StoreProductDto)

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
data class AdSizeDto(val width: Int = 0, val height: Int = 0)

@Serializable
data class AdSizesDto(val banner: AdSizeDto = AdSizeDto(1600, 600), val space: AdSizeDto = AdSizeDto(800, 500))

@Serializable
data class AdPackagesDto(val packages: List<AdPackageDto> = emptyList(), val bannerPackages: List<AdPackageDto> = emptyList(), val creditName: String = "", val balance: Int? = null, val autoApprove: Boolean = false, val sizes: AdSizesDto = AdSizesDto())

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
    val hasImage: Boolean = false,
)

/* ---------------- photos: searching the store with one, and a product from one ---------------- */

@Serializable
data class SpecDto(val label: String, val value: String)

@Serializable
data class AiSubscriptionDto(val name: String, val uses: Int = 0, val used: Int = 0, val left: Int = 0, val endDate: String = "", val autoRenew: Boolean = true)

@Serializable
data class AiPackageDto(val id: String, val name: String, val days: Int = 30, val uses: Int = 0, val credits: Int = 0)

@Serializable
data class AiPackagesDto(val packages: List<AiPackageDto> = emptyList(), val quota: AiQuotaDto = AiQuotaDto())

@Serializable
data class AiSubscribeRequest(val packageId: String)

@Serializable
data class AiAutoRenewRequest(val autoRenew: Boolean)

@Serializable
data class AiSubscribeResponse(val quota: AiQuotaDto = AiQuotaDto())

@Serializable
data class AiQuotaDto(
    val freePerMonth: Int = 0,
    val used: Int = 0,
    val freeLeft: Int = 0,
    val creditsPerUse: Int = 0,
    val balance: Int = 0,
    val photoEdit: Boolean = true,
    val describe: Boolean = true,
    val subscription: AiSubscriptionDto? = null,
)

/** action: clean | white_bg | studio | recolor (with a colour). */
@Serializable
data class PhotoEditRequest(val action: String, val color: String? = null)

@Serializable
data class PhotoEditResponse(val id: String, val url: String, val quota: AiQuotaDto? = null)

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
data class AiDraftResponseDto(val available: Boolean = false, val draft: AiDraftDto? = null, val priceHint: PriceHintDto? = null, val productCategoryId: String? = null)

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
    val hasImage: Boolean = false,
)

/** A category a product is filed under (department > category > kind), named in the app's language. */
@Serializable
data class ProductCategoryDto(
    val id: String,
    val slug: String = "",
    val name: String,
    val icon: String? = null,
    val custom: Boolean = false,
    val children: List<ProductCategoryDto> = emptyList(),
)

/** One result of typing a product category, with where it sits. */
@Serializable
data class ProductCategoryHitDto(val id: String, val name: String, val path: String = "", val icon: String? = null)

@Serializable
data class AddProductCategoryRequest(val name: String, val parentId: String)

@Serializable
data class AddProductCategoryResponse(val id: String, val created: Boolean = true, val name: String = "")

/** A pinned place in words: the street, area and city, ready for the address field. */
@Serializable
data class PlaceInWordsDto(val address: String? = null, val city: String? = null)

/** Whether the shop's store is open: it opens when a plan is chosen (while the owner has set store plans). */
@Serializable
data class StorePlanStateDto(val required: Boolean = false, val active: Boolean = true)

@Serializable
data class StorePlanDto(
    val id: String,
    val name: String,
    val description: String? = null,
    val durationDays: Int = 30,
    val priceCredits: Int? = null,
    val free: Boolean = false,
    val features: List<PlanFeatureDto> = emptyList(),
)

@Serializable
data class CurrentStorePlanDto(val id: String, val name: String, val endsAt: String? = null)

@Serializable
data class StorePlansDto(
    val creditName: String = "",
    val required: Boolean = false,
    val active: Boolean = true,
    val current: CurrentStorePlanDto? = null,
    val plans: List<StorePlanDto> = emptyList(),
)

/** The store's advertising calendar: per day, how many spaces are free and whether the chosen length fits starting that day. */
@Serializable
data class AdDayDto(val date: String, val free: Int = 0, val canStart: Boolean = true)

@Serializable
data class AdAvailabilityDto(val slots: Int = 6, val days: List<AdDayDto> = emptyList())

/** A marketer's own page: the link to share, the people brought, what was earned (a manager also sees his team). */
@Serializable
data class ReferralTeamMemberDto(val id: String = "", val name: String = "", val active: Boolean = true, val people: Int = 0, val earned: Int = 0)

@Serializable
data class ReferralRequestDto(val channel: String = "", val status: String = "")

@Serializable
data class MarketerRequestBody(val channel: String, val phone: String? = null, val note: String? = null)

@Serializable
data class ReferralMeDto(
    val isMarketer: Boolean = false,
    val referred: Boolean = false,
    val request: ReferralRequestDto? = null,
    val kind: String = "",
    val channel: String = "",
    val code: String = "",
    val link: String = "",
    val people: Int = 0,
    val earned: Int = 0,
    val team: List<ReferralTeamMemberDto> = emptyList(),
    val teamPeople: Int = 0,
    val earnedFromTeam: Int = 0,
    val creditName: String = "",
)

@Serializable
data class UseReferralRequest(val code: String)

@Serializable
data class UseReferralResponse(val ok: Boolean = false, val reason: String? = null)

/** One discount that was confirmed at a shop: seen by the customer (with the shop's name) and by the shop (with the customer's). */
@Serializable
data class TxMerchantDto(val businessName: String = "")

@Serializable
data class DiscountTxDto(
    val transactionRef: String,
    val createdAt: String = "",
    val billAmountCents: Int = 0,
    val discountPercent: Int = 0,
    val discountAmountCents: Int = 0,
    val finalAmountCents: Int = 0,
    val merchant: TxMerchantDto? = null,
    val memberName: String? = null,
)

@Serializable
data class TxSummaryDto(val count: Int = 0, val billCents: Int = 0, val discountCents: Int = 0)

@Serializable
data class ShopTransactionsDto(val summary: TxSummaryDto = TxSummaryDto(), val items: List<DiscountTxDto> = emptyList())
