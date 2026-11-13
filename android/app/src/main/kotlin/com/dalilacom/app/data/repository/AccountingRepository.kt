package com.dalilacom.app.data.repository

import com.dalilacom.app.ui.i18n.AppStrings
import com.dalilacom.app.R
import com.dalilacom.app.data.network.DataLabels
import com.dalilacom.app.data.network.AccountingEntryRequest
import com.dalilacom.app.data.network.AccountingProductDto
import com.dalilacom.app.data.network.AccountingProductRequest
import com.dalilacom.app.data.network.AccountingSellRequest
import com.dalilacom.app.data.network.AccountingStockRequest
import com.dalilacom.app.data.network.AccountingInvoiceConfirmRequest
import com.dalilacom.app.data.network.AccountingInvoiceDraftDto
import com.dalilacom.app.data.network.PlanCatalogDto
import com.dalilacom.app.data.network.BillingRequest
import com.dalilacom.app.data.network.BillingCheckoutDto
import com.dalilacom.app.data.network.ApiService
import com.dalilacom.app.data.network.safeApiCall
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody

class AccountingRepository(private val api: ApiService) {
    var requiresPlan: Boolean = false
        private set
    suspend fun summary() = safeApiCall { api.accountingSummary() }?.also { requiresPlan = it.code() == 402 }?.takeIf { it.isSuccessful }?.body()
    suspend fun planCatalog(): PlanCatalogDto? = safeApiCall { api.planCatalog() }?.takeIf { it.isSuccessful }?.body()
    suspend fun checkout(planId: String, provider: String = "STRIPE"): Result<BillingCheckoutDto> {
        val response = safeApiCall { api.beginBillingCheckout(BillingRequest(planId, provider)) } ?: return Result.failure(Exception(AppStrings.get(R.string.s_89f995b3)))
        val body = response.body()
        return if (response.isSuccessful && body != null) Result.success(body) else Result.failure(Exception(AppStrings.get(R.string.s_f03c2218)))
    }
    suspend fun trial(planId: String): Result<Unit> = result { api.beginBillingTrial(BillingRequest(planId)) }
    suspend fun activateFree(planId: String): Result<Unit> = result { api.activateFreePlan(BillingRequest(planId)) }
    suspend fun products(query: String? = null): List<AccountingProductDto> = safeApiCall { api.accountingProducts(query) }?.takeIf { it.isSuccessful }?.body().orEmpty()
    suspend fun addProduct(body: AccountingProductRequest): Result<Unit> = result { api.addAccountingProduct(body) }
    suspend fun addEntry(body: AccountingEntryRequest): Result<Unit> = result { api.addAccountingEntry(body) }
    suspend fun editEntry(id: String, description: String, amountCents: Int): Result<Unit> = result { api.updateAccountingEntry(id, com.dalilacom.app.data.network.AccountingEntryEditRequest(description, amountCents)) }
    suspend fun deleteEntry(id: String): Result<Unit> = result { api.deleteAccountingEntry(id) }
    suspend fun deleteProduct(id: String): Result<Unit> = result { api.deleteAccountingProduct(id) }
    suspend fun sell(id: String, quantity: Int, payMethod: String = "CASH"): Result<Unit> = result { api.sellAccountingProduct(id, AccountingSellRequest(quantity, payMethod = payMethod)) }
    suspend fun purchases(): List<com.dalilacom.app.data.network.AccountingPurchaseDto> = safeApiCall { api.accountingPurchases() }?.takeIf { it.isSuccessful }?.body().orEmpty()
    suspend fun createPurchase(body: com.dalilacom.app.data.network.AccountingPurchaseRequest): Result<com.dalilacom.app.data.network.AccountingPurchaseDto> {
        val response = safeApiCall { api.createAccountingPurchase(body) } ?: return Result.failure(Exception(AppStrings.get(R.string.s_89f995b3)))
        val purchase = response.body()
        return if (response.isSuccessful && purchase != null) Result.success(purchase) else Result.failure(Exception(com.dalilacom.app.data.network.errorText(response, AppStrings.get(R.string.s_0a2edd30))))
    }
    suspend fun parties() = safeApiCall { api.accountingParties() }?.takeIf { it.isSuccessful }?.body()
    suspend fun party(id: String) = safeApiCall { api.accountingParty(id) }?.takeIf { it.isSuccessful }?.body()
    suspend fun addParty(kind: String, name: String): Result<Unit> = result { api.createAccountingParty(com.dalilacom.app.data.network.AccountingPartyRequest(kind, name)) }
    suspend fun payParty(id: String, amountCents: Long, currency: String, payMethod: String): Result<Unit> = result { api.payAccountingParty(id, com.dalilacom.app.data.network.AccountingPartyPaymentRequest(amountCents, currency, payMethod)) }
    suspend fun chargeParty(id: String, amountCents: Long, currency: String, book: Boolean): Result<Unit> = result { api.chargeAccountingParty(id, com.dalilacom.app.data.network.AccountingPartyChargeRequest(amountCents, currency, book)) }
    suspend fun report(from: String, to: String, groupBy: String = "day") = safeApiCall { api.accountingReport(from, to, groupBy) }?.takeIf { it.isSuccessful }?.body()
    suspend fun lowStock() = safeApiCall { api.accountingLowStock() }?.takeIf { it.isSuccessful }?.body()
    suspend fun movements(id: String) = safeApiCall { api.accountingMovements(id) }?.takeIf { it.isSuccessful }?.body().orEmpty()
    suspend fun countStock(items: List<Pair<String, Int>>): Result<com.dalilacom.app.data.network.AccountingCountResultDto> {
        val response = safeApiCall { api.accountingStockCount(com.dalilacom.app.data.network.AccountingCountRequest(items.map { com.dalilacom.app.data.network.AccountingCountItemRequest(it.first, it.second) })) } ?: return Result.failure(Exception(AppStrings.get(R.string.s_89f995b3)))
        val body = response.body()
        return if (response.isSuccessful && body != null) Result.success(body) else Result.failure(Exception(AppStrings.get(R.string.s_0a2edd30)))
    }
    suspend fun setMin(id: String, value: Int): Result<Unit> = result { api.setAccountingProductMin(id, com.dalilacom.app.data.network.AccountingMinRequest(value)) }
    suspend fun sales(): List<com.dalilacom.app.data.network.AccountingSaleDto> = safeApiCall { api.accountingSales() }?.takeIf { it.isSuccessful }?.body().orEmpty()
    suspend fun createSale(body: com.dalilacom.app.data.network.AccountingSaleRequest): Result<com.dalilacom.app.data.network.AccountingSaleDto> {
        val response = safeApiCall { api.createAccountingSale(body) } ?: return Result.failure(Exception(AppStrings.get(R.string.s_89f995b3)))
        val sale = response.body()
        return if (response.isSuccessful && sale != null) Result.success(sale) else Result.failure(Exception(com.dalilacom.app.data.network.errorText(response, AppStrings.get(R.string.s_0a2edd30))))
    }
    suspend fun cash(day: String, currency: String) = safeApiCall { api.accountingCash(day, currency) }?.takeIf { it.isSuccessful }?.body()
    suspend fun closeCash(day: String, currency: String, countedCents: Long): Result<Unit> = result { api.closeAccountingCash(com.dalilacom.app.data.network.AccountingCashCloseRequest(day, currency, countedCents)) }
    suspend fun reopenCash(day: String, currency: String): Result<Unit> = result { api.reopenAccountingCash(day, currency) }
    suspend fun setCashOpening(day: String, currency: String, openingCents: Long): Result<Unit> = result { api.setAccountingCashOpening(com.dalilacom.app.data.network.AccountingCashOpeningRequest(day, currency, openingCents)) }
    suspend fun stock(id: String, action: String, quantity: Int, unitCostCents: Int? = null): Result<Unit> = result { api.changeAccountingStock(id, AccountingStockRequest(action, quantity, unitCostCents = unitCostCents, note = DataLabels.NOTE_MANUAL_ENTRY)) }
    suspend fun scanInvoice(bytes: ByteArray, mime: String): Result<AccountingInvoiceDraftDto> {
        val response = safeApiCall { api.scanAccountingInvoice(bytes.toRequestBody(mime.toMediaType())) }
            ?: return Result.failure(Exception(AppStrings.get(R.string.s_89f995b3)))
        val draft = response.body()
        return if (response.isSuccessful && draft != null) Result.success(draft) else Result.failure(Exception(AppStrings.get(R.string.s_f1f017e4)))
    }
    suspend fun confirmInvoice(id: String, description: String, amountCents: Int, currency: String): Result<Unit> = result {
        api.confirmAccountingInvoice(id, AccountingInvoiceConfirmRequest(description = description, amountCents = amountCents, currency = currency))
    }

    private suspend fun result(call: suspend () -> retrofit2.Response<*>): Result<Unit> {
        val response = safeApiCall { call() } ?: return Result.failure(Exception(AppStrings.get(R.string.s_89f995b3)))
        return if (response.isSuccessful) Result.success(Unit) else Result.failure(Exception(AppStrings.get(R.string.s_0a2edd30)))
    }
}
