package com.dalilacom.app.data.repository

import com.dalilacom.app.data.network.errorText
import com.dalilacom.app.data.network.ApiService
import com.dalilacom.app.data.network.OrderDto
import com.dalilacom.app.data.network.UpdateOrderStatusRequest
import com.dalilacom.app.data.network.safeApiCall

class OrderRepository(private val api: ApiService) {

    suspend fun getMyOrders(): List<OrderDto> {
        val response = safeApiCall { api.getMyOrders() } ?: return emptyList()
        return response.body().orEmpty().takeIf { response.isSuccessful } ?: emptyList()
    }

    suspend fun getMerchantOrders(): List<OrderDto> {
        val response = safeApiCall { api.getMerchantOrders() } ?: return emptyList()
        return response.body().orEmpty().takeIf { response.isSuccessful } ?: emptyList()
    }

    /** Returns null when the order doesn't exist or doesn't belong to the caller. */
    suspend fun getOrder(id: String): OrderDto? {
        val response = safeApiCall { api.getOrder(id) } ?: return null
        return if (response.isSuccessful) response.body() else null
    }

    suspend fun updateStatus(id: String, status: String, cancelReason: String? = null): Result<OrderDto> {
        val response = safeApiCall { api.updateOrderStatus(id, UpdateOrderStatusRequest(status, cancelReason)) }
            ?: return Result.failure(Exception("تعذّر الاتصال بالسيرفر، تحقق من الإنترنت"))
        val body = response.body()
        return if (response.isSuccessful && body != null) {
            Result.success(body)
        } else {
            Result.failure(Exception(errorText(response, "تعذّر تحديث حالة الطلب")))
        }
    }

    suspend fun cancel(id: String): Result<OrderDto> {
        val response = safeApiCall { api.cancelOrder(id) }
            ?: return Result.failure(Exception("تعذّر الاتصال بالسيرفر، تحقق من الإنترنت"))
        val body = response.body()
        return if (response.isSuccessful && body != null) {
            Result.success(body)
        } else {
            Result.failure(Exception(errorText(response, "تعذّر إلغاء الطلب")))
        }
    }
}
