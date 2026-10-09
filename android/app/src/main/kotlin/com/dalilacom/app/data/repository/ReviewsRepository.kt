package com.dalilacom.app.data.repository

import com.dalilacom.app.R
import com.dalilacom.app.data.network.ApiService
import com.dalilacom.app.data.network.ReviewRequest
import com.dalilacom.app.data.network.ReviewsDto
import com.dalilacom.app.data.network.errorText
import com.dalilacom.app.data.network.safeApiCall
import com.dalilacom.app.ui.i18n.AppStrings

/** Ratings and comments: anyone reads them, only someone whose order was delivered writes (the server decides). */
class ReviewsRepository(private val api: ApiService) {
    suspend fun of(kind: String, id: String, offset: Int = 0): ReviewsDto? =
        safeApiCall { if (kind == "shop") api.shopReviews(id, 10, offset) else api.productReviews(id, 10, offset) }?.takeIf { it.isSuccessful }?.body()

    suspend fun send(kind: String, id: String, stars: Int, comment: String): Result<Unit> {
        val body = ReviewRequest(stars, comment.ifBlank { null })
        val response = safeApiCall {
            when (kind) {
                "shop" -> api.reviewShop(id, body)
                "customer" -> api.reviewCustomer(id, body)
                else -> api.reviewProduct(id, body)
            }
        } ?: return Result.failure(Exception(AppStrings.get(R.string.rv_failed)))
        return if (response.isSuccessful) Result.success(Unit) else Result.failure(Exception(errorText(response, AppStrings.get(R.string.rv_failed))))
    }
}
