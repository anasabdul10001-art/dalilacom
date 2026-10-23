package com.dalilacom.app.data.repository

import com.dalilacom.app.R
import com.dalilacom.app.ui.i18n.AppStrings
import com.dalilacom.app.data.network.errorText
import com.dalilacom.app.data.network.ApiService
import com.dalilacom.app.data.network.OrderDto
import com.dalilacom.app.data.network.PaymentDto
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
            ?: return Result.failure(Exception(AppStrings.get(R.string.s_d556272b)))
        val body = response.body()
        return if (response.isSuccessful && body != null) {
            Result.success(body)
        } else {
            Result.failure(Exception(errorText(response, AppStrings.get(R.string.s_cdffc53b))))
        }
    }

    /** The shop got the cash for a pay-on-delivery order. */
    suspend fun confirmCash(id: String): Result<PaymentDto> {
        val response = safeApiCall { api.confirmCash(id) }
            ?: return Result.failure(Exception(AppStrings.get(R.string.s_d556272b)))
        val body = response.body()
        return if (response.isSuccessful && body != null) Result.success(body)
        else Result.failure(Exception(errorText(response, AppStrings.get(R.string.pay_confirm_failed))))
    }

    suspend fun cancel(id: String): Result<OrderDto> {
        val response = safeApiCall { api.cancelOrder(id) }
            ?: return Result.failure(Exception(AppStrings.get(R.string.s_d556272b)))
        val body = response.body()
        return if (response.isSuccessful && body != null) {
            Result.success(body)
        } else {
            Result.failure(Exception(errorText(response, AppStrings.get(R.string.s_bdb567d9))))
        }
    }
}
