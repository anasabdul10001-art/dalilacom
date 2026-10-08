package com.dalilacom.app.data.repository

import com.dalilacom.app.data.network.ApiService
import com.dalilacom.app.data.network.StoreHomeDto
import com.dalilacom.app.data.network.StoreListDto
import com.dalilacom.app.data.network.StoreProductDto
import com.dalilacom.app.data.network.safeApiCall
import com.dalilacom.app.ui.common.Market

/** Where the shopper wants to look: the whole country, one governorate/city, or some km around a point. */
data class StoreScope(
    val scope: String = "country",
    val cityId: String? = null,
    val radiusKm: Int? = null,
    val lat: Double? = null,
    val lng: Double? = null,
)

class StoreRepository(private val api: ApiService) {
    /** The shopper's country and its currency (the account's country, else where they connect from). */
    suspend fun market(): String? = safeApiCall { api.market() }?.takeIf { it.isSuccessful }?.body()?.currencyCode?.ifBlank { null }

    suspend fun home(s: StoreScope): StoreHomeDto? =
        safeApiCall { api.storeHome(s.scope, s.cityId, s.radiusKm, s.lat, s.lng) }?.takeIf { it.isSuccessful }?.body()?.also { if (it.currency.isNotBlank()) Market.currency = it.currency }

    suspend fun products(q: String?, section: String?, deals: Boolean, sort: String, offset: Int, s: StoreScope): StoreListDto? =
        safeApiCall { api.storeProducts(q?.ifBlank { null }, section?.ifBlank { null }, if (deals) "1" else null, sort, 24, offset, s.scope, s.cityId, s.radiusKm, s.lat, s.lng) }
            ?.takeIf { it.isSuccessful }?.body()?.also { if (it.currency.isNotBlank()) Market.currency = it.currency }

    suspend fun product(id: String): StoreProductDto? =
        safeApiCall { api.storeProduct(id) }?.takeIf { it.isSuccessful }?.body()?.also { if (it.currency.isNotBlank()) Market.currency = it.currency }
}
