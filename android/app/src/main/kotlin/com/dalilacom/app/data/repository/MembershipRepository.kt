package com.dalilacom.app.data.repository

import com.dalilacom.app.data.network.ApiService
import com.dalilacom.app.data.network.MembershipDto
import com.dalilacom.app.data.network.MembershipPlanDto
import com.dalilacom.app.data.network.QrCodeDto
import com.dalilacom.app.data.network.SubscribeRequest

class MembershipRepository(private val api: ApiService) {

    suspend fun getPlans(): Result<List<MembershipPlanDto>> = runCatching {
        val response = api.getPlans()
        response.body().takeIf { response.isSuccessful } ?: emptyList()
    }

    suspend fun subscribe(planId: String): Result<MembershipDto> {
        val response = api.subscribe(SubscribeRequest(planId))
        val body = response.body()
        return if (response.isSuccessful && body != null) {
            Result.success(body)
        } else {
            Result.failure(Exception("تعذّر الاشتراك بالعضوية"))
        }
    }

    /** Returns null when the customer has no membership yet — that's a normal state, not an error. */
    suspend fun getMyMembership(): MembershipDto? {
        val response = api.getMyMembership()
        return if (response.isSuccessful) response.body() else null
    }

    /** Returns null when there's no active membership to show a code for. */
    suspend fun getMyQrCode(): QrCodeDto? {
        val response = api.getMyQrCode()
        return if (response.isSuccessful) response.body() else null
    }
}
