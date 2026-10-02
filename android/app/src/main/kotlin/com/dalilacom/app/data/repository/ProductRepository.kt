package com.dalilacom.app.data.repository

import com.dalilacom.app.data.network.errorText
import com.dalilacom.app.data.network.ApiService
import com.dalilacom.app.data.network.CreateProductRequest
import com.dalilacom.app.data.network.ProductDto
import com.dalilacom.app.data.network.UpdateProductRequest
import com.dalilacom.app.data.network.safeApiCall

class ProductRepository(private val api: ApiService) {

    /** Returns null when the product doesn't exist or isn't active — a normal "not found" state. */
    suspend fun getProduct(id: String): ProductDto? {
        val response = safeApiCall { api.getProduct(id) } ?: return null
        return if (response.isSuccessful) response.body() else null
    }

    suspend fun getProducts(merchantId: String): List<ProductDto> {
        val response = safeApiCall { api.getProducts(merchantId) } ?: return emptyList()
        return response.body().orEmpty().takeIf { response.isSuccessful } ?: emptyList()
    }

    /** The merchant's own full catalog, including inactive/out-of-stock items. */
    suspend fun getMyProducts(): List<ProductDto> {
        val response = safeApiCall { api.getMyProducts() } ?: return emptyList()
        return response.body().orEmpty().takeIf { response.isSuccessful } ?: emptyList()
    }

    suspend fun createProduct(body: CreateProductRequest): Result<ProductDto> {
        val response = safeApiCall { api.createProduct(body) }
            ?: return Result.failure(Exception("تعذّر الاتصال بالسيرفر، تحقق من الإنترنت"))
        val result = response.body()
        return if (response.isSuccessful && result != null) {
            Result.success(result)
        } else {
            Result.failure(Exception(errorText(response, "تعذّرت إضافة المنتج")))
        }
    }

    suspend fun updateProduct(id: String, body: UpdateProductRequest): Result<ProductDto> {
        val response = safeApiCall { api.updateProduct(id, body) }
            ?: return Result.failure(Exception("تعذّر الاتصال بالسيرفر، تحقق من الإنترنت"))
        val result = response.body()
        return if (response.isSuccessful && result != null) {
            Result.success(result)
        } else {
            Result.failure(Exception(errorText(response, "تعذّر حفظ المنتج")))
        }
    }
}
