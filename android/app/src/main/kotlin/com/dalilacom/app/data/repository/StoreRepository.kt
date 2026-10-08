package com.dalilacom.app.data.repository

import com.dalilacom.app.data.network.ApiService
import com.dalilacom.app.data.network.StoreHomeDto
import com.dalilacom.app.data.network.StoreListDto
import com.dalilacom.app.data.network.StoreProductDto
import com.dalilacom.app.data.network.safeApiCall

/** Where the shopper wants to look: the whole country, one governorate/city, or some km around a point. */
data class StoreScope(
    val scope: String = "country",
    val cityId: String? = null,
    val radiusKm: Int? = null,
    val lat: Double? = null,
    val lng: Double? = null,
)

class StoreRepository(private val api: ApiService) {
    suspend fun home(s: StoreScope): StoreHomeDto? =
        safeApiCall { api.storeHome(s.scope, s.cityId, s.radiusKm, s.lat, s.lng) }?.takeIf { it.isSuccessful }?.body()

    suspend fun products(q: String?, section: String?, sort: String, offset: Int, s: StoreScope): StoreListDto? =
        safeApiCall { api.storeProducts(q?.ifBlank { null }, section?.ifBlank { null }, sort, 24, offset, s.scope, s.cityId, s.radiusKm, s.lat, s.lng) }
            ?.takeIf { it.isSuccessful }?.body()

    suspend fun product(id: String): StoreProductDto? = safeApiCall { api.storeProduct(id) }?.takeIf { it.isSuccessful }?.body()
}
