package com.dalilacom.app.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import com.dalilacom.app.data.AppContainer
import com.dalilacom.app.ui.auth.AuthViewModel
import com.dalilacom.app.ui.card.CardViewModel
import com.dalilacom.app.ui.cart.CartViewModel
import com.dalilacom.app.ui.discover.DiscoverViewModel
import com.dalilacom.app.ui.merchant.MerchantRegisterViewModel
import com.dalilacom.app.ui.merchantmode.CatalogViewModel
import com.dalilacom.app.ui.merchantmode.MerchantOrdersViewModel
import com.dalilacom.app.ui.merchantmode.RedeemViewModel
import com.dalilacom.app.ui.orders.OrdersViewModel

/** Hand-rolled factory to avoid pulling in Hilt for this first slice of the app. */
class ViewModelFactory(private val container: AppContainer) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T = when (modelClass) {
        AuthViewModel::class.java -> AuthViewModel(container.authRepository) as T
        CardViewModel::class.java -> CardViewModel(container.membershipRepository) as T
        DiscoverViewModel::class.java -> DiscoverViewModel(container.discoverRepository) as T
        CartViewModel::class.java -> CartViewModel(container.cartRepository) as T
        OrdersViewModel::class.java -> OrdersViewModel(container.orderRepository) as T
        MerchantRegisterViewModel::class.java ->
            MerchantRegisterViewModel(container.merchantRepository, container.discoverRepository) as T
        MerchantOrdersViewModel::class.java -> MerchantOrdersViewModel(container.orderRepository) as T
        RedeemViewModel::class.java -> RedeemViewModel(container.merchantRepository) as T
        CatalogViewModel::class.java -> CatalogViewModel(container.merchantRepository, container.productRepository) as T
        else -> throw IllegalArgumentException("Unknown ViewModel class: ${modelClass.name}")
    }
}
