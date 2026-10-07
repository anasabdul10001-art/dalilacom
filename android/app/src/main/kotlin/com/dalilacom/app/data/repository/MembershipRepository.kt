package com.dalilacom.app.data.repository

import com.dalilacom.app.data.network.ApiService
import com.dalilacom.app.data.network.CatalogDto
import com.dalilacom.app.data.network.errorText
import com.dalilacom.app.data.network.MembershipDto
import com.dalilacom.app.data.network.MembershipPlanDto
import com.dalilacom.app.data.network.QrCodeDto
import com.dalilacom.app.data.network.SubscribeRequest
import com.dalilacom.app.data.network.safeApiCall

class MembershipRepository(private val api: ApiService) {

    suspend fun getPlans(): Result<List<MembershipPlanDto>> {
        val response = safeApiCall { api.getPlans() }
            ?: return Result.failure(Exception("تعذّر الاتصال بالسيرفر، تحقق من الإنترنت"))
        return Result.success(response.body().takeIf { response.isSuccessful } ?: emptyList())
    }

    suspend fun subscribe(planId: String): Result<MembershipDto> {
        val response = safeApiCall { api.subscribe(SubscribeRequest(planId)) }
            ?: return Result.failure(Exception("تعذّر الاتصال بالسيرفر، تحقق من الإنترنت"))
        val body = response.body()
        return if (response.isSuccessful && body != null) {
            Result.success(body)
        } else {
            // The server says why (not enough wallet credit, price not set...) — show that, not a generic failure.
            Result.failure(Exception(errorText(response, "تعذّر الاشتراك بالعضوية")))
        }
    }

    /** The whole pricing page, with prices resolved for the signed-in account's country. Null when offline. */
    suspend fun getCatalog(): CatalogDto? {
        val response = safeApiCall { api.getCatalog() } ?: return null
        return if (response.isSuccessful) response.body() else null
    }

    /** Returns null when the customer has no membership yet — that's a normal state, not an error. */
    suspend fun getMyMembership(): MembershipDto? {
        val response = safeApiCall { api.getMyMembership() } ?: return null
        return if (response.isSuccessful) response.body() else null
    }

    /** Returns null when there's no active membership to show a code for. */
    suspend fun getMyQrCode(): QrCodeDto? {
        val response = safeApiCall { api.getMyQrCode() } ?: return null
        return if (response.isSuccessful) response.body() else null
    }
}
