package com.dalilacom.app.data.repository

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
        val response = safeApiCall { api.beginBillingCheckout(BillingRequest(planId, provider)) } ?: return Result.failure(Exception("ما قدرنا نتصل بالخدمة"))
        val body = response.body()
        return if (response.isSuccessful && body != null) Result.success(body) else Result.failure(Exception("تعذر بدء الدفع الإلكتروني"))
    }
    suspend fun trial(planId: String): Result<Unit> = result { api.beginBillingTrial(BillingRequest(planId)) }
    suspend fun activateFree(planId: String): Result<Unit> = result { api.activateFreePlan(BillingRequest(planId)) }
    suspend fun products(query: String? = null): List<AccountingProductDto> = safeApiCall { api.accountingProducts(query) }?.takeIf { it.isSuccessful }?.body().orEmpty()
    suspend fun addProduct(body: AccountingProductRequest): Result<Unit> = result { api.addAccountingProduct(body) }
    suspend fun addEntry(body: AccountingEntryRequest): Result<Unit> = result { api.addAccountingEntry(body) }
    suspend fun sell(id: String, quantity: Int): Result<Unit> = result { api.sellAccountingProduct(id, AccountingSellRequest(quantity)) }
    suspend fun stock(id: String, action: String, quantity: Int, unitCostCents: Int? = null): Result<Unit> = result { api.changeAccountingStock(id, AccountingStockRequest(action, quantity, unitCostCents = unitCostCents, note = "إدخال يدوي")) }
    suspend fun scanInvoice(bytes: ByteArray, mime: String): Result<AccountingInvoiceDraftDto> {
        val response = safeApiCall { api.scanAccountingInvoice(bytes.toRequestBody(mime.toMediaType())) }
            ?: return Result.failure(Exception("ما قدرنا نتصل بالخدمة"))
        val draft = response.body()
        return if (response.isSuccessful && draft != null) Result.success(draft) else Result.failure(Exception("تعذرت قراءة الفاتورة"))
    }
    suspend fun confirmInvoice(id: String, description: String, amountCents: Int, currency: String): Result<Unit> = result {
        api.confirmAccountingInvoice(id, AccountingInvoiceConfirmRequest(description = description, amountCents = amountCents, currency = currency))
    }

    private suspend fun result(call: suspend () -> retrofit2.Response<*>): Result<Unit> {
        val response = safeApiCall { call() } ?: return Result.failure(Exception("ما قدرنا نتصل بالخدمة"))
        return if (response.isSuccessful) Result.success(Unit) else Result.failure(Exception("ما قدرنا نحفظ الحركة"))
    }
}
