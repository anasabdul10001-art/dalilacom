package com.dalilacom.app.data.repository

import com.dalilacom.app.data.network.*
import com.dalilacom.app.ui.i18n.AppStrings

class FitnessPlansRepository(private val api: ApiService) {
    suspend fun coachPlans(): Result<List<FitnessPlanDto>> {
        val r = safeApiCall { api.fitnessCoachPlans() } ?: return Result.failure(Exception("Network error"))
        return if (r.isSuccessful) Result.success(r.body()?.items.orEmpty()) else Result.failure(Exception(errorText(r, "Could not load plans")))
    }
    suspend fun myPlans(): Result<List<FitnessPlanDto>> {
        val r = safeApiCall { api.myFitnessPlans() } ?: return Result.failure(Exception("Network error"))
        return if (r.isSuccessful) Result.success(r.body()?.items.orEmpty()) else Result.failure(Exception(errorText(r, "Could not load plans")))
    }
    suspend fun create(body: FitnessPlanBody): Result<FitnessPlanDto> {
        val r = safeApiCall { api.createFitnessPlan(body) } ?: return Result.failure(Exception("Network error"))
        val item = r.body()
        return if (r.isSuccessful && item != null) Result.success(item) else Result.failure(Exception(errorText(r, "Could not save plan")))
    }
    suspend fun progress(id: String, body: FitnessProgressBody): Result<Unit> {
        val r = safeApiCall { api.addFitnessProgress(id, body) } ?: return Result.failure(Exception("Network error"))
        return if (r.isSuccessful) Result.success(Unit) else Result.failure(Exception(errorText(r, "Could not save progress")))
    }
}
