package com.dalilacom.app.data.network

import kotlinx.serialization.Serializable

@Serializable
data class RegisterRequest(val email: String, val password: String, val fullName: String)

@Serializable
data class LoginRequest(val email: String, val password: String)

@Serializable
data class UserDto(val id: String, val email: String, val fullName: String, val role: String)

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
)

@Serializable
data class ProductDto(
    val id: String,
    val merchantId: String,
    val name: String,
    val description: String? = null,
    val priceCents: Int,
    val memberDiscountEnabled: Boolean = false,
    val memberPriceCents: Int? = null,
    val stock: Int,
)
