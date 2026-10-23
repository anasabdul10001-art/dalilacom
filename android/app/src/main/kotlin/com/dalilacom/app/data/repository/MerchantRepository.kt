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
        suggestedCategory: String? = null,
    ): Result<RegisterMerchantResponse> {
        val response = safeApiCall {
            api.registerMerchant(RegisterMerchantRequest(businessName, categoryId, address, phone, whatsapp, location?.first, location?.second, suggestedCategory))
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

    /** A shop that could not find its profession writes it; the team accepts it, adds it to an existing one or refuses it. */
    suspend fun suggestCategory(name: String): Result<Unit> {
        val response = safeApiCall { api.suggestCategory(com.dalilacom.app.data.network.CategorySuggestRequest(name)) }
            ?: return Result.failure(Exception(AppStrings.get(R.string.s_d556272b)))
        return if (response.isSuccessful) Result.success(Unit) else Result.failure(Exception(errorText(response, AppStrings.get(R.string.s_43010e9c))))
    }

    /** The discounts confirmed on this account's card, newest first (null when it could not be loaded). */
    suspend fun myDiscountHistory(): List<com.dalilacom.app.data.network.DiscountTxDto>? =
        safeApiCall { api.myDiscountTransactions() }?.takeIf { it.isSuccessful }?.body()

    /** The discounts this shop confirmed, with totals. */
    suspend fun shopDiscountHistory(): com.dalilacom.app.data.network.ShopTransactionsDto? =
        safeApiCall { api.shopDiscountTransactions() }?.takeIf { it.isSuccessful }?.body()

    suspend fun referralMe(): com.dalilacom.app.data.network.ReferralMeDto? =
        safeApiCall { api.referralMe() }?.takeIf { it.isSuccessful }?.body()

    /** A person who came without a code (for example with Google) enters the one he was given. Returns the server's answer. */
    suspend fun useReferral(code: String): com.dalilacom.app.data.network.UseReferralResponse? =
        safeApiCall { api.useReferral(com.dalilacom.app.data.network.UseReferralRequest(code.trim())) }?.takeIf { it.isSuccessful }?.body()

    /** Asks to become an online ("ELECTRONIC") or field ("FIELD") marketer; the administration decides. */
    suspend fun requestMarketer(channel: String, phone: String, note: String): Result<Unit> {
        val response = safeApiCall { api.requestMarketer(com.dalilacom.app.data.network.MarketerRequestBody(channel, phone.trim().ifEmpty { null }, note.trim().ifEmpty { null })) }
            ?: return Result.failure(Exception(AppStrings.get(R.string.s_d556272b)))
        return if (response.isSuccessful) Result.success(Unit) else Result.failure(Exception(errorText(response, AppStrings.get(R.string.s_43010e9c))))
    }

    suspend fun storePlans(): com.dalilacom.app.data.network.StorePlansDto? =
        safeApiCall { api.storePlans() }?.takeIf { it.isSuccessful }?.body()

    /** The shop chooses (or renews) a store plan; the price comes out of the wallet. */
    suspend fun subscribeStorePlan(planId: String): Result<com.dalilacom.app.data.network.StorePlansDto> {
        val response = safeApiCall { api.subscribeStorePlan(com.dalilacom.app.data.network.SubscribeRequest(planId)) }
            ?: return Result.failure(Exception(AppStrings.get(R.string.s_d556272b)))
        val body = response.body()
        return if (response.isSuccessful && body != null) Result.success(body) else Result.failure(Exception(errorText(response, AppStrings.get(R.string.sp_failed))))
    }

    suspend fun branches(): List<com.dalilacom.app.data.network.BranchDto> =
        safeApiCall { api.branches() }?.takeIf { it.isSuccessful }?.body().orEmpty()

    suspend fun saveBranch(id: String?, request: com.dalilacom.app.data.network.BranchRequest): Result<com.dalilacom.app.data.network.BranchDto> {
        val response = safeApiCall { if (id == null) api.addBranch(request) else api.updateBranch(id, request) }
            ?: return Result.failure(Exception(AppStrings.get(R.string.s_d556272b)))
        val body = response.body()
        return if (response.isSuccessful && body != null) Result.success(body) else Result.failure(Exception(errorText(response, AppStrings.get(R.string.br_failed))))
    }

    suspend fun deleteBranch(id: String): Result<Unit> {
        val response = safeApiCall { api.deleteBranch(id) }
            ?: return Result.failure(Exception(AppStrings.get(R.string.s_d556272b)))
        return if (response.isSuccessful) Result.success(Unit) else Result.failure(Exception(errorText(response, AppStrings.get(R.string.br_failed))))
    }

    suspend fun shippingMethods(): List<com.dalilacom.app.data.network.ShippingMethodDto> =
        safeApiCall { api.shippingMethods() }?.takeIf { it.isSuccessful }?.body().orEmpty()

    suspend fun saveShippingMethods(methods: List<com.dalilacom.app.data.network.ShippingItemRequest>): Result<List<com.dalilacom.app.data.network.ShippingMethodDto>> {
        val response = safeApiCall { api.saveShippingMethods(com.dalilacom.app.data.network.ShippingPutRequest(methods)) }
            ?: return Result.failure(Exception(AppStrings.get(R.string.s_d556272b)))
        val body = response.body()
        return if (response.isSuccessful && body != null) Result.success(body) else Result.failure(Exception(errorText(response, AppStrings.get(R.string.ship_failed))))
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

    /** The shop's pricing, once for the whole shop: the money its prices are written in, its dollar rate (pounds per dollar) and whether shoppers see both. */
    suspend fun setPricing(currency: String, rate: Int?, showBoth: Boolean): Result<Unit> {
        val response = safeApiCall { api.putPricing(com.dalilacom.app.data.network.PricingRequest(currency, rate, showBoth)) }
            ?: return Result.failure(Exception(AppStrings.get(R.string.s_d556272b)))
        return if (response.isSuccessful) Result.success(Unit) else Result.failure(Exception(errorText(response, AppStrings.get(R.string.price_failed))))
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
