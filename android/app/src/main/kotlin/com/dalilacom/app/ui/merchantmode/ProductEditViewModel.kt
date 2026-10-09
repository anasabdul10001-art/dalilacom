package com.dalilacom.app.ui.merchantmode

import com.dalilacom.app.R
import com.dalilacom.app.ui.i18n.AppStrings
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.dalilacom.app.data.network.CreateProductRequest
import com.dalilacom.app.data.network.UpdateProductRequest
import com.dalilacom.app.data.repository.DiscoverRepository
import com.dalilacom.app.data.repository.ProductRepository
import com.dalilacom.app.ui.merchant.CategoryOption
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import com.dalilacom.app.ui.common.parseInt
import com.dalilacom.app.ui.common.parseCents

data class ProductEditUiState(
    val isNew: Boolean = true,
    val isLoading: Boolean = true,
    val name: String = "",
    val description: String = "",
    val priceText: String = "",
    val stockText: String = "",
    val sku: String = "",
    val memberDiscountEnabled: Boolean = false,
    val memberPriceText: String = "",
    val isActive: Boolean = true,
    val categoryOptions: List<CategoryOption> = emptyList(),
    val selectedCategoryId: String? = null,
    val isSaving: Boolean = false,
    val saved: Boolean = false,
    val needShipping: Boolean = false,
    val error: String? = null,
)

class ProductEditViewModel(
    private val productRepository: ProductRepository,
    private val discoverRepository: DiscoverRepository,
    private val merchantRepository: com.dalilacom.app.data.repository.MerchantRepository,
    private val productId: String?,
) : ViewModel() {
    private val _uiState = MutableStateFlow(ProductEditUiState(isNew = productId == null))
    val uiState: StateFlow<ProductEditUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            val categories = discoverRepository.getCategories()
            val options = categories.flatMap { top ->
                listOf(CategoryOption(top.id, top.name)) +
                    top.children.map { CategoryOption(it.id, "${top.name} / ${it.name}") }
            }
            if (productId == null) {
                _uiState.value = _uiState.value.copy(isLoading = false, categoryOptions = options)
                return@launch
            }
            val product = productRepository.getProduct(productId)
            if (product == null) {
                _uiState.value = _uiState.value.copy(isLoading = false, categoryOptions = options, error = AppStrings.get(R.string.s_432dc00c))
                return@launch
            }
            _uiState.value = _uiState.value.copy(
                isLoading = false,
                categoryOptions = options,
                name = product.name,
                description = product.description.orEmpty(),
                priceText = (product.priceCents / 100.0).toString(),
                stockText = product.stock.toString(),
                sku = "",
                memberDiscountEnabled = product.memberDiscountEnabled,
                memberPriceText = product.memberPriceCents?.let { (it / 100.0).toString() }.orEmpty(),
                isActive = product.isActive,
                selectedCategoryId = product.categoryId,
            )
        }
    }

    fun onNameChange(value: String) { _uiState.value = _uiState.value.copy(name = value) }
    fun onDescriptionChange(value: String) { _uiState.value = _uiState.value.copy(description = value) }
    fun onPriceChange(value: String) { _uiState.value = _uiState.value.copy(priceText = value) }
    fun onStockChange(value: String) { _uiState.value = _uiState.value.copy(stockText = value) }
    fun onSkuChange(value: String) { _uiState.value = _uiState.value.copy(sku = value) }
    fun onMemberPriceChange(value: String) { _uiState.value = _uiState.value.copy(memberPriceText = value) }
    fun onMemberDiscountToggle(enabled: Boolean) { _uiState.value = _uiState.value.copy(memberDiscountEnabled = enabled) }
    fun onActiveToggle(active: Boolean) { _uiState.value = _uiState.value.copy(isActive = active) }
    fun onCategorySelected(id: String?) { _uiState.value = _uiState.value.copy(selectedCategoryId = id) }

    fun save() {
        val state = _uiState.value
        val priceCents = state.priceText.parseCents()
        val stock = state.stockText.parseInt()
        if (state.name.isBlank() || priceCents == null || priceCents <= 0 || stock == null || stock < 0) {
            _uiState.value = state.copy(error = AppStrings.get(R.string.s_8d0496d3))
            return
        }
        var memberPriceCents: Int? = null
        if (state.memberDiscountEnabled) {
            memberPriceCents = state.memberPriceText.parseCents()
            if (memberPriceCents == null || memberPriceCents <= 0 || memberPriceCents >= priceCents) {
                _uiState.value = state.copy(error = AppStrings.get(R.string.s_746ec1bd))
                return
            }
        }

        _uiState.value = state.copy(isSaving = true, error = null, needShipping = false)
        viewModelScope.launch {
            // a new product needs the shop's shipping methods first
            if (productId == null && merchantRepository.shippingMethods().isEmpty()) {
                _uiState.value = _uiState.value.copy(isSaving = false, needShipping = true, error = AppStrings.get(R.string.ship_need))
                return@launch
            }
            val result = if (productId == null) {
                productRepository.createProduct(
                    CreateProductRequest(
                        name = state.name.trim(),
                        description = state.description.trim().ifBlank { null },
                        priceCents = priceCents,
                        categoryId = state.selectedCategoryId,
                        stock = stock,
                        sku = state.sku.trim().ifBlank { null },
                        memberDiscountEnabled = state.memberDiscountEnabled,
                        memberPriceCents = memberPriceCents,
                    ),
                )
            } else {
                productRepository.updateProduct(
                    productId,
                    UpdateProductRequest(
                        name = state.name.trim(),
                        description = state.description.trim().ifBlank { null },
                        priceCents = priceCents,
                        categoryId = state.selectedCategoryId,
                        stock = stock,
                        sku = state.sku.trim().ifBlank { null },
                        memberDiscountEnabled = state.memberDiscountEnabled,
                        memberPriceCents = memberPriceCents,
                        isActive = state.isActive,
                    ),
                )
            }
            result
                .onSuccess { _uiState.value = _uiState.value.copy(isSaving = false, saved = true) }
                .onFailure { _uiState.value = _uiState.value.copy(isSaving = false, error = it.message) }
        }
    }
}
