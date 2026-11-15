package com.dalilacom.app.data.repository

import com.dalilacom.app.R
import com.dalilacom.app.data.network.ApiService
import com.dalilacom.app.data.network.StaffAcceptDto
import com.dalilacom.app.data.network.StaffAcceptRequest
import com.dalilacom.app.data.network.StaffCommissionDto
import com.dalilacom.app.data.network.StaffCreateRequest
import com.dalilacom.app.data.network.StaffDto
import com.dalilacom.app.data.network.StaffPatchRequest
import com.dalilacom.app.data.network.StaffPayRequest
import com.dalilacom.app.data.network.StaffWorkplaceDto
import com.dalilacom.app.data.network.errorText
import com.dalilacom.app.data.network.safeApiCall
import com.dalilacom.app.ui.i18n.AppStrings

/** The staff of a business owner: the owner side (list, invite, commissions) and the staff member side (workplaces, own commissions). */
class StaffRepository(private val api: ApiService) {
    suspend fun workplaces(): List<StaffWorkplaceDto> = safeApiCall { api.staffWorkplaces() }?.takeIf { it.isSuccessful }?.body().orEmpty()
    suspend fun myCommissions(staffId: String): List<StaffCommissionDto> = safeApiCall { api.staffMyCommissions(staffId) }?.takeIf { it.isSuccessful }?.body().orEmpty()
    suspend fun list(): List<StaffDto> = safeApiCall { api.staffList() }?.takeIf { it.isSuccessful }?.body().orEmpty()

    suspend fun driverOrders(staffId: String): List<com.dalilacom.app.data.network.StaffOrderDto> = safeApiCall { api.driverOrders(staffId) }?.takeIf { it.isSuccessful }?.body().orEmpty()
    suspend fun pickup(staffId: String, orderId: String): Result<Unit> = call({ api.driverPickup(staffId, orderId) }) { Unit }
    suspend fun deliver(staffId: String, orderId: String): Result<Unit> = call({ api.driverDeliver(staffId, orderId) }) { Unit }
    suspend fun paySalary(id: String): Result<Unit> = call({ api.staffPaySalary(id) }) { Unit }
    suspend fun accept(code: String): Result<StaffAcceptDto> = call({ api.staffAccept(StaffAcceptRequest(code)) }) { it.body()!! }
    suspend fun create(name: String, role: String, rateBp: Int, fixedPayCents: Long): Result<Unit> = call({ api.staffCreate(StaffCreateRequest(name, role, rateBp, fixedPayCents)) }) { Unit }
    suspend fun setRate(id: String, rateBp: Int): Result<Unit> = call({ api.staffPatch(id, StaffPatchRequest(rateBp)) }) { Unit }
    suspend fun remove(id: String): Result<Unit> = call({ api.staffRemove(id) }) { Unit }
    suspend fun invite(id: String): Result<String> = call({ api.staffInvite(id) }) { it.body()!!.code }
    suspend fun pay(id: String, currency: String): Result<Long> = call({ api.staffPay(id, StaffPayRequest(currency)) }) { it.body()!!.paidCents }

    private suspend fun <B, T> call(request: suspend () -> retrofit2.Response<B>, map: (retrofit2.Response<B>) -> T): Result<T> {
        val response = safeApiCall { request() } ?: return Result.failure(Exception(AppStrings.get(R.string.s_89f995b3)))
        return if (response.isSuccessful) runCatching { map(response) } else Result.failure(Exception(errorText(response, AppStrings.get(R.string.s_0a2edd30))))
    }
}
