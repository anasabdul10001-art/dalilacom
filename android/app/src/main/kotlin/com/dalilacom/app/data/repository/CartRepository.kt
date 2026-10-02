package com.dalilacom.app.data.repository

import com.dalilacom.app.data.network.errorText
import com.dalilacom.app.data.network.AddCartItemRequest
import com.dalilacom.app.data.network.ApiService
import com.dalilacom.app.data.network.CartViewDto
import com.dalilacom.app.data.network.OrderDto
import com.dalilacom.app.data.network.UpdateCartItemRequest
import com.dalilacom.app.data.network.safeApiCall

class CartRepository(private val api: ApiService) {

    /** Returns null on failure — the screen falls back to an empty cart. */
    suspend fun getCart(): CartViewDto? {
        val response = safeApiCall { api.getCart() } ?: return null
        return if (response.isSuccessful) response.body() else null
    }

    suspend fun addItem(productId: String, quantity: Int = 1): Result<CartViewDto> {
        val response = safeApiCall { api.addCartItem(AddCartItemRequest(productId, quantity)) }
            ?: return Result.failure(Exception("تعذّر الاتصال بالسيرفر، تحقق من الإنترنت"))
        val body = response.body()
        return if (response.isSuccessful && body != null) {
            Result.success(body)
        } else {
            Result.failure(Exception(errorText(response, "تعذّرت إضافة المنتج للسلة")))
        }
    }

    suspend fun updateItem(itemId: String, quantity: Int): Result<CartViewDto> {
        val response = safeApiCall { api.updateCartItem(itemId, UpdateCartItemRequest(quantity)) }
            ?: return Result.failure(Exception("تعذّر الاتصال بالسيرفر، تحقق من الإنترنت"))
        val body = response.body()
        return if (response.isSuccessful && body != null) {
            Result.success(body)
        } else {
            Result.failure(Exception(errorText(response, "تعذّر تعديل الكمية")))
        }
    }

    suspend fun removeItem(itemId: String): Result<CartViewDto> {
        val response = safeApiCall { api.removeCartItem(itemId) }
            ?: return Result.failure(Exception("تعذّر الاتصال بالسيرفر، تحقق من الإنترنت"))
        val body = response.body()
        return if (response.isSuccessful && body != null) {
            Result.success(body)
        } else {
            Result.failure(Exception(errorText(response, "تعذّر حذف المنتج")))
        }
    }

    suspend fun checkout(): Result<List<OrderDto>> {
        val response = safeApiCall { api.checkout() }
            ?: return Result.failure(Exception("تعذّر الاتصال بالسيرفر، تحقق من الإنترنت"))
        val body = response.body()
        return if (response.isSuccessful && body != null) {
            Result.success(body)
        } else {
            Result.failure(Exception(errorText(response, "تعذّر إتمام الطلب")))
        }
    }
}
