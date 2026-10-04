package com.dalilacom.app.data.repository

import com.dalilacom.app.data.network.ApiService
import com.dalilacom.app.data.network.CategoryDto
import com.dalilacom.app.data.network.MerchantDto
import com.dalilacom.app.data.network.ProductDto
import com.dalilacom.app.data.network.safeApiCall

class DiscoverRepository(private val api: ApiService) {

    suspend fun getCategories(): List<CategoryDto> {
        val response = safeApiCall { api.getCategories() } ?: return emptyList()
        return response.body().orEmpty().takeIf { response.isSuccessful } ?: emptyList()
    }

    suspend fun searchMerchants(
        query: String? = null,
        categoryId: String? = null,
        lat: Double? = null,
        lng: Double? = null,
        radiusKm: Double? = null,
        bounds: MapBounds? = null,
    ): List<MerchantDto> {
        val response = safeApiCall {
            api.searchMerchants(query, categoryId, lat, lng, radiusKm, bounds?.south, bounds?.north, bounds?.west, bounds?.east)
        } ?: return emptyList()
        return response.body().orEmpty().takeIf { response.isSuccessful } ?: emptyList()
    }

    suspend fun getProducts(merchantId: String): List<ProductDto> {
        val response = safeApiCall { api.getProducts(merchantId) } ?: return emptyList()
        return response.body().orEmpty().takeIf { response.isSuccessful } ?: emptyList()
    }

    /** Returns null when the merchant doesn't exist or isn't approved yet — a normal "not found" state. */
    suspend fun getMerchant(id: String): MerchantDto? {
        val response = safeApiCall { api.getMerchant(id) } ?: return null
        return if (response.isSuccessful) response.body() else null
    }
}

/** The rectangle the map is showing — used for "search this area". */
data class MapBounds(val north: Double, val south: Double, val east: Double, val west: Double)
