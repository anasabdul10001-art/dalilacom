package com.dalilacom.app.data.repository

import com.dalilacom.app.R
import com.dalilacom.app.ui.i18n.AppStrings
import com.dalilacom.app.data.network.errorText
import com.dalilacom.app.data.network.ApiService
import com.dalilacom.app.data.network.CreateDiscountRequest
import com.dalilacom.app.data.network.DiscountDto
import com.dalilacom.app.data.network.DiscountInput
import com.dalilacom.app.data.network.DiscountPatchRequest
import com.dalilacom.app.data.network.MyDiscountDto
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
            ?: return Result.failure(Exception(AppStrings.get(R.string.s_d556272b)))
        val body = response.body()
        return if (response.isSuccessful && body != null) {
            // The server switched this account's role to MERCHANT; mirror that locally right
            // away instead of forcing a re-login (the server re-checks the real role from the
            // DB on every request, this is only for driving which UI entry points show).
            sessionStore.saveRole("MERCHANT")
            Result.success(body)
        } else {
            Result.failure(Exception(errorText(response, AppStrings.get(R.string.s_676f8348))))
        }
    }

    suspend fun verifyMember(memberNumber: String, code: String): Result<VerifyResponse> {
        val response = safeApiCall { api.verifyMember(VerifyRedeemRequest(memberNumber, code)) }
            ?: return Result.failure(Exception(AppStrings.get(R.string.s_d556272b)))
        val body = response.body()
        return if (response.isSuccessful && body != null) {
            Result.success(body)
        } else {
            Result.failure(Exception(errorText(response, AppStrings.get(R.string.s_beb6f577))))
        }
    }

    suspend fun redeem(memberNumber: String, code: String, billAmountCents: Int, discountId: String? = null): Result<RedeemResponse> {
        val response = safeApiCall { api.redeemDiscount(RedeemRequest(memberNumber, code, billAmountCents, discountId)) }
            ?: return Result.failure(Exception(AppStrings.get(R.string.s_d556272b)))
        val body = response.body()
        return if (response.isSuccessful && body != null) {
            Result.success(body)
        } else {
            Result.failure(Exception(errorText(response, AppStrings.get(R.string.s_70a771db))))
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
            ?: return Result.failure(Exception(AppStrings.get(R.string.s_d556272b)))
        val body = response.body()
        return if (response.isSuccessful && body != null) Result.success(body)
        else Result.failure(Exception(errorText(response, AppStrings.get(R.string.s_43010e9c))))
    }

    suspend fun myDiscounts(): List<MyDiscountDto> =
        safeApiCall { api.myDiscounts() }?.takeIf { it.isSuccessful }?.body().orEmpty()

    /** Sends a new discount to the admin for review, or (with [id]) changes an existing one, which goes back for review. */
    suspend fun saveDiscount(id: String?, input: DiscountInput): Result<Unit> {
        if (id == null) {
            val response = safeApiCall { api.createDiscount(input) }
                ?: return Result.failure(Exception(AppStrings.get(R.string.s_d556272b)))
            return if (response.isSuccessful) Result.success(Unit) else Result.failure(Exception(errorText(response, AppStrings.get(R.string.disc_failed))))
        }
        val response = safeApiCall { api.editDiscount(id, input) }
            ?: return Result.failure(Exception(AppStrings.get(R.string.s_d556272b)))
        return if (response.isSuccessful) Result.success(Unit) else Result.failure(Exception(errorText(response, AppStrings.get(R.string.disc_failed))))
    }

    suspend fun setDiscountActive(id: String, active: Boolean): Result<Unit> = patchDiscount(id, DiscountPatchRequest(isActive = active))

    suspend fun endDiscountNow(id: String): Result<Unit> = patchDiscount(id, DiscountPatchRequest(endNow = true))

    private suspend fun patchDiscount(id: String, body: DiscountPatchRequest): Result<Unit> {
        val response = safeApiCall { api.patchDiscount(id, body) }
            ?: return Result.failure(Exception(AppStrings.get(R.string.s_d556272b)))
        return if (response.isSuccessful) Result.success(Unit) else Result.failure(Exception(errorText(response, AppStrings.get(R.string.disc_failed))))
    }

    suspend fun deleteDiscount(id: String): Result<Unit> {
        val response = safeApiCall { api.deleteDiscount(id) }
            ?: return Result.failure(Exception(AppStrings.get(R.string.s_d556272b)))
        return if (response.isSuccessful) Result.success(Unit) else Result.failure(Exception(errorText(response, AppStrings.get(R.string.disc_failed))))
    }

    suspend fun addDiscount(title: String, percent: Int): Result<DiscountDto> {
        val response = safeApiCall { api.addDiscount(CreateDiscountRequest(title, percent)) }
            ?: return Result.failure(Exception(AppStrings.get(R.string.s_d556272b)))
        val body = response.body()
        return if (response.isSuccessful && body != null) {
            Result.success(body)
        } else {
            Result.failure(Exception(errorText(response, AppStrings.get(R.string.s_c4973dca))))
        }
    }
}
