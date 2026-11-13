package com.dalilacom.app.data.repository

import com.dalilacom.app.R
import com.dalilacom.app.data.network.ApiService
import com.dalilacom.app.data.network.errorText
import com.dalilacom.app.data.network.safeApiCall
import com.dalilacom.app.ui.i18n.AppStrings
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject

/** Human resources, inside DALILACOM. The server side is the hr area (the same routes the website uses). */
class HrRepository(private val api: ApiService) {
    /** A GET; a failure comes back as the server's own message. */
    suspend fun get(path: String): Result<JsonElement> {
        val response = safeApiCall { api.hrGet(path) } ?: return Result.failure(Exception(AppStrings.get(R.string.hr_error)))
        val body = response.body()
        return if (response.isSuccessful && body != null) Result.success(body) else Result.failure(Exception(errorText(response, AppStrings.get(R.string.hr_error))))
    }

    suspend fun post(path: String, body: JsonObject = JsonObject(emptyMap())): Result<JsonElement> {
        val response = safeApiCall { api.hrPost(path, body) } ?: return Result.failure(Exception(AppStrings.get(R.string.hr_error)))
        val data = response.body()
        return if (response.isSuccessful && data != null) Result.success(data) else Result.failure(Exception(errorText(response, AppStrings.get(R.string.hr_error))))
    }

    suspend fun put(path: String, body: JsonObject): Result<JsonElement> = send { api.hrPut(path, body) }
    suspend fun patch(path: String, body: JsonObject): Result<JsonElement> = send { api.hrPatch(path, body) }
    suspend fun delete(path: String): Result<JsonElement> = send { api.hrDelete(path) }

    private suspend fun send(call: suspend () -> retrofit2.Response<JsonElement>): Result<JsonElement> {
        val response = safeApiCall { call() } ?: return Result.failure(Exception(AppStrings.get(R.string.hr_error)))
        val data = response.body()
        return if (response.isSuccessful && data != null) Result.success(data) else Result.failure(Exception(errorText(response, AppStrings.get(R.string.hr_error))))
    }
}
