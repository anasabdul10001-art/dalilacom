package com.dalilacom.app.data.network

import kotlinx.serialization.Serializable

@Serializable
data class RegisterRequest(val email: String, val password: String, val fullName: String)

@Serializable
data class LoginRequest(val email: String, val password: String)

@Serializable
data class UserDto(val id: String, val email: String, val fullName: String, val role: String, val emailVerified: Boolean = false)

@Serializable
data class ProfileDto(
    val id: String,
    val email: String,
    val fullName: String,
    val role: String,
    val bio: String? = null,
    val avatarUrl: String? = null,
)

@Serializable
data class UpdateProfileRequest(val fullName: String? = null, val bio: String? = null)

@Serializable
data class MeResponse(val user: UserDto, val emailDeliveryEnabled: Boolean = false)

@Serializable
data class ResendVerificationRequest(val email: String)

@Serializable
data class AuthResponse(val token: String, val user: UserDto)

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
data class DiscountDto(
    val id: String,
    val title: String,
    val percent: Int,
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
data class UserNameDto(val fullName: String)

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
)

@Serializable
data class RedeemRequest(val memberNumber: String, val code: String, val billAmountCents: Int)

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
)

@Serializable
data class CreateDiscountRequest(val title: String, val percent: Int)
