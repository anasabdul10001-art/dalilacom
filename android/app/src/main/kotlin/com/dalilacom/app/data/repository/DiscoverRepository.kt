package com.dalilacom.app.data.repository

import com.dalilacom.app.data.network.ApiService
import com.dalilacom.app.data.network.CategoryDto
import com.dalilacom.app.data.network.MerchantDto
import com.dalilacom.app.data.network.ProductDto

class DiscoverRepository(private val api: ApiService) {

    suspend fun getCategories(): List<CategoryDto> {
        val response = api.getCategories()
        return response.body().orEmpty().takeIf { response.isSuccessful } ?: emptyList()
    }

    suspend fun searchMerchants(
        query: String? = null,
        categoryId: String? = null,
        lat: Double? = null,
        lng: Double? = null,
        radiusKm: Double? = null,
    ): List<MerchantDto> {
        val response = api.searchMerchants(query, categoryId, lat, lng, radiusKm)
        return response.body().orEmpty().takeIf { response.isSuccessful } ?: emptyList()
    }

    suspend fun getProducts(merchantId: String): List<ProductDto> {
        val response = api.getProducts(merchantId)
        return response.body().orEmpty().takeIf { response.isSuccessful } ?: emptyList()
    }
}
