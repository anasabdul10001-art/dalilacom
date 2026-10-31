package com.dalilacom.app.data.repository

import com.dalilacom.app.R
import com.dalilacom.app.data.network.AddShopAffiliateRequest
import com.dalilacom.app.data.network.ApiService
import com.dalilacom.app.data.network.ShopAffiliateDto
import com.dalilacom.app.data.network.UpdateShopAffiliateRequest
import com.dalilacom.app.data.network.errorText
import com.dalilacom.app.data.network.safeApiCall
import com.dalilacom.app.ui.i18n.AppStrings

class ShopAffiliateRepository(private val api: ApiService) {
    suspend fun list(): Result<List<ShopAffiliateDto>> {
        val response = safeApiCall { api.getMyMarketingTeam() }
            ?: return Result.failure(Exception(AppStrings.get(R.string.affiliate_team_network_error)))
        return if (response.isSuccessful) Result.success(response.body().orEmpty())
        else Result.failure(Exception(errorText(response, AppStrings.get(R.string.affiliate_team_load_error))))
    }

    suspend fun add(email: String, type: String, value: Int): Result<Unit> {
        val response = safeApiCall { api.addShopAffiliate(AddShopAffiliateRequest(email, type, value)) }
            ?: return Result.failure(Exception(AppStrings.get(R.string.affiliate_team_network_error)))
        return if (response.isSuccessful) Result.success(Unit)
        else Result.failure(Exception(errorText(response, AppStrings.get(R.string.affiliate_team_add_error))))
    }

    suspend fun setActive(id: String, active: Boolean): Result<Unit> {
        val response = safeApiCall { api.updateShopAffiliate(id, UpdateShopAffiliateRequest(active)) }
            ?: return Result.failure(Exception(AppStrings.get(R.string.affiliate_team_network_error)))
        return if (response.isSuccessful) Result.success(Unit)
        else Result.failure(Exception(errorText(response, AppStrings.get(R.string.affiliate_team_update_error))))
    }
}
