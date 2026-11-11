package com.dalilacom.app.data.repository

import com.dalilacom.app.ui.i18n.AppStrings
import com.dalilacom.app.R
import com.dalilacom.app.data.network.ApiService
import com.dalilacom.app.data.network.CreateMarketplaceListingRequest
import com.dalilacom.app.data.network.MarketplaceListingsDto
import com.dalilacom.app.data.network.MarketplaceSettingsDto
import com.dalilacom.app.data.network.MyMarketplaceDto
import com.dalilacom.app.data.network.safeApiCall
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody

class MarketplaceRepository(private val api: ApiService) {
    suspend fun settings(): MarketplaceSettingsDto? = safeApiCall { api.marketplaceSettings() }?.takeIf { it.isSuccessful }?.body()
    suspend fun listings(q: String? = null): MarketplaceListingsDto? = safeApiCall { api.marketplaceListings(q?.ifBlank { null }) }?.takeIf { it.isSuccessful }?.body()
    suspend fun mine(): MyMarketplaceDto? = safeApiCall { api.myMarketplace() }?.takeIf { it.isSuccessful }?.body()
    suspend fun saveStore(name: String, description: String?): com.dalilacom.app.data.network.MarketplaceStoreDto? = safeApiCall { api.saveMarketplaceStore(mapOf("name" to name, "description" to description)) }?.takeIf { it.isSuccessful }?.body()?.store
    suspend fun store(id: String) = safeApiCall { api.marketplaceStore(id) }?.takeIf { it.isSuccessful }?.body()
    suspend fun uploadPhoto(bytes: ByteArray): String? = safeApiCall { api.uploadMarketplacePhoto(bytes.toRequestBody("image/jpeg".toMediaType())) }?.takeIf { it.isSuccessful }?.body()?.url
    suspend fun create(body: CreateMarketplaceListingRequest): Result<Unit> {
        val response = safeApiCall { api.createMarketplaceListing(body) } ?: return Result.failure(Exception(AppStrings.get(R.string.s_89f995b3)))
        return if (response.isSuccessful) Result.success(Unit) else Result.failure(Exception(com.dalilacom.app.data.network.errorText(response, AppStrings.get(R.string.s_364be4bc))))
    }
    suspend fun markSold(id: String): Boolean = safeApiCall { api.updateMarketplaceListing(id, mapOf("status" to "SOLD")) }?.isSuccessful == true
    suspend fun subscribe(id: String): Result<Unit> {
        val response = safeApiCall { api.subscribeMarketplace(mapOf("planId" to id)) } ?: return Result.failure(Exception(AppStrings.get(R.string.s_89f995b3)))
        return if (response.isSuccessful) Result.success(Unit) else Result.failure(Exception(com.dalilacom.app.data.network.errorText(response, AppStrings.get(R.string.s_37f81884))))
    }
}
