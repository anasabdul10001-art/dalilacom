package com.dalilacom.app.data.repository

import com.dalilacom.app.data.network.ApiService
import com.dalilacom.app.data.network.StoreHomeDto
import com.dalilacom.app.data.network.StoreListDto
import com.dalilacom.app.data.network.StoreProductDto
import com.dalilacom.app.R
import com.dalilacom.app.data.network.AiDraftRequest
import com.dalilacom.app.data.network.AiDraftResponseDto
import com.dalilacom.app.data.network.PhotoSearchDto
import com.dalilacom.app.data.network.ProductPhotoDto
import com.dalilacom.app.data.network.StoreSectionDto
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import com.dalilacom.app.data.network.AdBookingDto
import com.dalilacom.app.data.network.BannerBookRequest
import com.dalilacom.app.data.network.BannerBookingDto
import com.dalilacom.app.data.network.BookAdRequest
import com.dalilacom.app.data.network.AdPackagesDto
import com.dalilacom.app.data.network.MyAdDto
import com.dalilacom.app.data.network.StoreBannersDto
import com.dalilacom.app.data.network.errorText
import com.dalilacom.app.data.network.safeApiCall
import com.dalilacom.app.ui.i18n.AppStrings
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

    suspend fun products(q: String?, section: String?, deals: Boolean, sort: String, offset: Int, s: StoreScope, merchantId: String? = null, limit: Int = 24): StoreListDto? =
        safeApiCall { api.storeProducts(q?.ifBlank { null }, section?.ifBlank { null }, if (deals) "1" else null, merchantId, sort, limit, offset, s.scope, s.cityId, s.radiusKm, s.lat, s.lng) }
            ?.takeIf { it.isSuccessful }?.body()?.also { if (it.currency.isNotBlank()) Market.currency = it.currency }

    private fun jpeg(bytes: ByteArray) = bytes.toRequestBody("image/jpeg".toMediaType())

    /** The store searched with a photo: what it shows, and the matching products. */
    suspend fun searchByImage(bytes: ByteArray): Result<PhotoSearchDto> {
        val response = safeApiCall { api.searchByImage(jpeg(bytes)) } ?: return Result.failure(Exception(AppStrings.get(R.string.photo_offline)))
        val body = response.body()
        return if (response.isSuccessful && body != null) {
            if (body.currency.isNotBlank()) Market.currency = body.currency
            Result.success(body)
        } else Result.failure(Exception(errorText(response, AppStrings.get(R.string.photo_failed))))
    }

    suspend fun allSections(): List<StoreSectionDto> = safeApiCall { api.storeSections("1") }?.takeIf { it.isSuccessful }?.body().orEmpty()

    suspend fun uploadProductPhoto(bytes: ByteArray): Result<ProductPhotoDto> {
        val response = safeApiCall { api.uploadProductPhoto(jpeg(bytes)) } ?: return Result.failure(Exception(AppStrings.get(R.string.photo_offline)))
        val body = response.body()
        return if (response.isSuccessful && body != null) Result.success(body) else Result.failure(Exception(errorText(response, AppStrings.get(R.string.photo_failed))))
    }

    /** A cleaned-up copy of an uploaded photo (white square, centred, even light) that suits Google and image-reading algorithms. */
    suspend fun enhancePhoto(photoId: String): Result<ProductPhotoDto> {
        val response = safeApiCall { api.enhanceProductPhoto(photoId) } ?: return Result.failure(Exception(AppStrings.get(R.string.photo_offline)))
        val body = response.body()
        return if (response.isSuccessful && body != null) Result.success(body) else Result.failure(Exception(errorText(response, AppStrings.get(R.string.photo_failed))))
    }

    suspend fun aiDraft(photoId: String): AiDraftResponseDto? = safeApiCall { api.aiDraft(AiDraftRequest(photoId)) }?.takeIf { it.isSuccessful }?.body()

    suspend fun banners(): StoreBannersDto? = safeApiCall { api.storeBanners() }?.takeIf { it.isSuccessful }?.body()

    suspend fun bannerClick(id: String) { safeApiCall { api.bannerClick(id) } }

    suspend fun adClick(id: String) { safeApiCall { api.adClick(id) } }

    suspend fun bookBanner(days: Int, phone: String, start: String?, whatsapp: String?, note: String?): Result<BannerBookingDto> {
        val response = safeApiCall { api.bookBanner(BannerBookRequest(days, phone, start, whatsapp?.ifBlank { null }, note?.ifBlank { null })) } ?: return Result.failure(Exception(AppStrings.get(R.string.ads_failed)))
        val body = response.body()
        return if (response.isSuccessful && body != null) Result.success(body) else Result.failure(Exception(errorText(response, AppStrings.get(R.string.ads_failed))))
    }

    suspend fun myBannerBookings(): List<BannerBookingDto> = safeApiCall { api.myBannerBookings() }?.takeIf { it.isSuccessful }?.body().orEmpty()

    suspend fun cancelBannerBooking(id: String): Result<Unit> {
        val response = safeApiCall { api.cancelBannerBooking(id) } ?: return Result.failure(Exception(AppStrings.get(R.string.ads_failed)))
        return if (response.isSuccessful) Result.success(Unit) else Result.failure(Exception(errorText(response, AppStrings.get(R.string.ads_failed))))
    }

    suspend fun adPackages(): AdPackagesDto? = safeApiCall { api.adPackages() }?.takeIf { it.isSuccessful }?.body()

    suspend fun myAds(): List<MyAdDto> = safeApiCall { api.myAds() }?.takeIf { it.isSuccessful }?.body().orEmpty()

    suspend fun cancelAd(id: String): Result<Unit> {
        val response = safeApiCall { api.cancelAd(id) } ?: return Result.failure(Exception(AppStrings.get(R.string.ads_failed)))
        return if (response.isSuccessful) Result.success(Unit) else Result.failure(Exception(errorText(response, AppStrings.get(R.string.ads_failed))))
    }

    suspend fun bookAd(productId: String, days: Int, start: String?): Result<AdBookingDto> {
        val response = safeApiCall { api.bookAd(BookAdRequest(productId, days, start)) } ?: return Result.failure(Exception(AppStrings.get(R.string.ads_failed)))
        val body = response.body()
        return if (response.isSuccessful && body != null) Result.success(body) else Result.failure(Exception(errorText(response, AppStrings.get(R.string.ads_failed))))
    }

    suspend fun product(id: String): StoreProductDto? =
        safeApiCall { api.storeProduct(id) }?.takeIf { it.isSuccessful }?.body()?.also { if (it.currency.isNotBlank()) Market.currency = it.currency }
}
