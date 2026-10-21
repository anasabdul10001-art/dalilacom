package com.dalilacom.app.data.repository

import com.dalilacom.app.data.network.ApiService
import com.dalilacom.app.data.network.CategoryDto
import com.dalilacom.app.data.network.MerchantDto
import com.dalilacom.app.data.network.ProductDto
import com.dalilacom.app.data.network.safeApiCall

class DiscoverRepository(private val api: ApiService) {

    /** The professions closest to what was typed, each with where it sits in the list. */
    suspend fun searchCategories(query: String): List<com.dalilacom.app.data.network.CategoryHitDto> =
        safeApiCall { api.searchCategories(query) }?.takeIf { it.isSuccessful }?.body().orEmpty()

    /** The professions a shop name points to; empty when nothing fits or the call failed. */
    suspend fun guessCategoryForName(name: String): List<com.dalilacom.app.data.network.CategoryHitDto> =
        safeApiCall { api.categoryForName(name) }?.takeIf { it.isSuccessful }?.body()?.items.orEmpty()

    /** A pinned place in words (street, area, city) for the address field; null when nothing could be read. */
    suspend fun addressFor(lat: Double, lng: Double): com.dalilacom.app.data.network.PlaceInWordsDto? =
        safeApiCall { api.reverseGeocode(lat, lng) }?.takeIf { it.isSuccessful }?.body()?.takeIf { !it.address.isNullOrBlank() }

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

    /** Public places of the same name close to where a shop is being registered (to offer "claim it" instead of a duplicate). */
    suspend fun similarLandmarks(name: String, lat: Double, lng: Double): List<com.dalilacom.app.data.network.SimilarLandmarkDto> {
        val response = safeApiCall { api.similarLandmarks(name, lat, lng) } ?: return emptyList()
        return response.body()?.items.orEmpty().takeIf { response.isSuccessful } ?: emptyList()
    }

    /** The public places inside the rectangle the map shows. */
    suspend fun landmarks(bounds: MapBounds, zoom: Double? = null): List<com.dalilacom.app.data.network.LandmarkDto> {
        val response = safeApiCall { api.landmarks(bounds.south, bounds.north, bounds.west, bounds.east, zoom) } ?: return emptyList()
        return response.body()?.items.orEmpty().takeIf { response.isSuccessful } ?: emptyList()
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
