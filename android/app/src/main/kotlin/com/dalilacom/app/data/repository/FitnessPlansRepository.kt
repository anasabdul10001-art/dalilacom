package com.dalilacom.app.data.repository

import com.dalilacom.app.data.network.*
import com.dalilacom.app.ui.i18n.AppStrings

class FitnessPlansRepository(private val api: ApiService) {
    suspend fun coachPlans(): Result<List<FitnessPlanDto>> {
        val r = safeApiCall { api.fitnessCoachPlans() } ?: return Result.failure(Exception("Network error"))
        return if (r.isSuccessful) Result.success(r.body()?.items.orEmpty()) else Result.failure(Exception(errorText(r, "Could not load plans")))
    }
    suspend fun coachTrainees(): Result<List<FitnessTraineeSummaryDto>> {
        val r = safeApiCall { api.fitnessCoachTrainees() } ?: return Result.failure(Exception("Network error"))
        return if (r.isSuccessful) Result.success(r.body()?.items.orEmpty()) else Result.failure(Exception(errorText(r, "Could not load trainees")))
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
    suspend fun update(id: String, body: FitnessPlanUpdateBody): Result<FitnessPlanDto> {
        val r = safeApiCall { api.updateFitnessPlan(id, body) } ?: return Result.failure(Exception("Network error"))
        val item = r.body()
        return if (r.isSuccessful && item != null) Result.success(item) else Result.failure(Exception(errorText(r, "Could not update plan")))
    }
    suspend fun progress(id: String, body: FitnessProgressBody): Result<Unit> {
        val r = safeApiCall { api.addFitnessProgress(id, body) } ?: return Result.failure(Exception("Network error"))
        return if (r.isSuccessful) Result.success(Unit) else Result.failure(Exception(errorText(r, "Could not save progress")))
    }
    suspend fun myEnrollments(): Result<List<FitnessEnrollmentDto>> {
        val r = safeApiCall { api.myFitnessEnrollments() } ?: return Result.failure(Exception("Network error"))
        return if (r.isSuccessful) Result.success(r.body()?.items.orEmpty()) else Result.failure(Exception(errorText(r, "Could not load package requests")))
    }
    suspend fun coachEnrollments(): Result<List<FitnessEnrollmentDto>> {
        val r = safeApiCall { api.coachFitnessEnrollments() } ?: return Result.failure(Exception("Network error"))
        return if (r.isSuccessful) Result.success(r.body()?.items.orEmpty()) else Result.failure(Exception(errorText(r, "Could not load trainees")))
    }
    suspend fun requestEnrollment(offerId: String): Result<FitnessEnrollmentDto> {
        val r = safeApiCall { api.requestFitnessEnrollment(offerId) } ?: return Result.failure(Exception("Network error"))
        val item = r.body()
        return if (r.isSuccessful && item != null) Result.success(item) else Result.failure(Exception(errorText(r, "Could not request this package")))
    }
    suspend fun cancelEnrollment(id: String): Result<Unit> {
        val r = safeApiCall { api.cancelFitnessEnrollment(id) } ?: return Result.failure(Exception("Network error"))
        return if (r.isSuccessful) Result.success(Unit) else Result.failure(Exception(errorText(r, "Could not cancel request")))
    }
    suspend fun updateEnrollment(id: String, status: String): Result<FitnessEnrollmentDto> {
        val r = safeApiCall { api.updateFitnessEnrollment(id, FitnessEnrollmentStatusBody(status)) } ?: return Result.failure(Exception("Network error"))
        val item = r.body()
        return if (r.isSuccessful && item != null) Result.success(item) else Result.failure(Exception(errorText(r, "Could not update package request")))
    }
}
