package com.dalilacom.app.data.repository

import com.dalilacom.app.data.network.errorText
import com.dalilacom.app.data.network.ApiService
import com.dalilacom.app.data.network.CreateDiscountRequest
import com.dalilacom.app.data.network.DiscountDto
import com.dalilacom.app.data.network.MerchantMeDto
import com.dalilacom.app.data.network.RedeemRequest
import com.dalilacom.app.data.network.RedeemResponse
import com.dalilacom.app.data.network.RegisterMerchantRequest
import com.dalilacom.app.data.network.RegisterMerchantResponse
import com.dalilacom.app.data.network.UpdateMerchantRequest
import com.dalilacom.app.data.network.VerifyRedeemRequest
import com.dalilacom.app.data.network.VerifyResponse
import com.dalilacom.app.data.network.safeApiCall
import com.dalilacom.app.data.store.SessionStore

class MerchantRepository(
    private val api: ApiService,
    private val sessionStore: SessionStore,
) {
    suspend fun registerMerchant(
        businessName: String,
        categoryId: String,
        address: String?,
        phone: String?,
        whatsapp: String? = null,
        location: Pair<Double, Double>? = null,
    ): Result<RegisterMerchantResponse> {
        val response = safeApiCall {
            api.registerMerchant(RegisterMerchantRequest(businessName, categoryId, address, phone, whatsapp, location?.first, location?.second))
        }
            ?: return Result.failure(Exception("تعذّر الاتصال بالسيرفر، تحقق من الإنترنت"))
        val body = response.body()
        return if (response.isSuccessful && body != null) {
            // The server switched this account's role to MERCHANT; mirror that locally right
            // away instead of forcing a re-login (the server re-checks the real role from the
            // DB on every request, this is only for driving which UI entry points show).
            sessionStore.saveRole("MERCHANT")
            Result.success(body)
        } else {
            Result.failure(Exception(errorText(response, "تعذّر تسجيل حساب التاجر")))
        }
    }

    suspend fun verifyMember(memberNumber: String, code: String): Result<VerifyResponse> {
        val response = safeApiCall { api.verifyMember(VerifyRedeemRequest(memberNumber, code)) }
            ?: return Result.failure(Exception("تعذّر الاتصال بالسيرفر، تحقق من الإنترنت"))
        val body = response.body()
        return if (response.isSuccessful && body != null) {
            Result.success(body)
        } else {
            Result.failure(Exception(errorText(response, "الكود غير صالح أو منتهي")))
        }
    }

    suspend fun redeem(memberNumber: String, code: String, billAmountCents: Int): Result<RedeemResponse> {
        val response = safeApiCall { api.redeemDiscount(RedeemRequest(memberNumber, code, billAmountCents)) }
            ?: return Result.failure(Exception("تعذّر الاتصال بالسيرفر، تحقق من الإنترنت"))
        val body = response.body()
        return if (response.isSuccessful && body != null) {
            Result.success(body)
        } else {
            Result.failure(Exception(errorText(response, "تعذّر تأكيد الحسم")))
        }
    }

    /** Returns null when there's no merchant profile for this account — a normal state for a
     * customer who hasn't registered as a merchant. */
    suspend fun getMerchantMe(): MerchantMeDto? {
        val response = safeApiCall { api.getMerchantMe() } ?: return null
        return if (response.isSuccessful) response.body() else null
    }

    /** Edits the public listing: name, category, address, contacts and the pin on the map. */
    suspend fun updateListing(request: UpdateMerchantRequest): Result<MerchantMeDto> {
        val response = safeApiCall { api.updateMerchantMe(request) }
            ?: return Result.failure(Exception("تعذّر الاتصال بالسيرفر، تحقق من الإنترنت"))
        val body = response.body()
        return if (response.isSuccessful && body != null) Result.success(body)
        else Result.failure(Exception(errorText(response, "تعذّر حفظ بيانات المحل")))
    }

    suspend fun addDiscount(title: String, percent: Int): Result<DiscountDto> {
        val response = safeApiCall { api.addDiscount(CreateDiscountRequest(title, percent)) }
            ?: return Result.failure(Exception("تعذّر الاتصال بالسيرفر، تحقق من الإنترنت"))
        val body = response.body()
        return if (response.isSuccessful && body != null) {
            Result.success(body)
        } else {
            Result.failure(Exception(errorText(response, "تعذّرت إضافة الحسم")))
        }
    }
}
