package com.dalilacom.app.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import com.dalilacom.app.data.AppContainer
import com.dalilacom.app.ui.auth.AuthViewModel
import com.dalilacom.app.ui.card.CardViewModel
import com.dalilacom.app.ui.cart.CartViewModel
import com.dalilacom.app.ui.discover.DiscoverViewModel
import com.dalilacom.app.ui.merchant.MerchantProfileViewModel
import com.dalilacom.app.ui.merchant.MerchantRegisterViewModel
import com.dalilacom.app.ui.merchantmode.CatalogViewModel
import com.dalilacom.app.ui.merchantmode.DiscountsViewModel
import com.dalilacom.app.ui.merchantmode.MerchantOrdersViewModel
import com.dalilacom.app.ui.merchantmode.RedeemViewModel
import com.dalilacom.app.ui.notifications.NotificationsViewModel
import com.dalilacom.app.ui.orders.OrdersViewModel
import com.dalilacom.app.ui.pricing.PricingViewModel
import com.dalilacom.app.ui.store.StoreViewModel
import com.dalilacom.app.ui.places.FavoritesViewModel
import com.dalilacom.app.ui.places.HoursViewModel
import com.dalilacom.app.ui.merchantmode.PromoViewModel
import com.dalilacom.app.ui.account.AccountSettingsViewModel
import com.dalilacom.app.ui.admin.ReviewViewModel
import com.dalilacom.app.ui.profile.ProfileEditViewModel
import com.dalilacom.app.ui.responder.ResponderViewModel
import com.dalilacom.app.ui.responder.WalletViewModel

/** Hand-rolled factory to avoid pulling in Hilt for this first slice of the app. */
class ViewModelFactory(private val container: AppContainer) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T = when (modelClass) {
        AuthViewModel::class.java -> AuthViewModel(container.authRepository) as T
        CardViewModel::class.java -> CardViewModel(container.membershipRepository) as T
        DiscoverViewModel::class.java -> DiscoverViewModel(container.discoverRepository, container.placesRepository, container.sessionStore, container.profileRepository) as T
        StoreViewModel::class.java -> StoreViewModel(container.storeRepository, container.cartRepository, container.authRepository) as T
        CartViewModel::class.java -> CartViewModel(container.cartRepository) as T
        OrdersViewModel::class.java -> OrdersViewModel(container.orderRepository) as T
        MerchantRegisterViewModel::class.java ->
            MerchantRegisterViewModel(container.merchantRepository, container.discoverRepository) as T
        MerchantProfileViewModel::class.java ->
            MerchantProfileViewModel(container.merchantRepository, container.discoverRepository) as T
        MerchantOrdersViewModel::class.java -> MerchantOrdersViewModel(container.orderRepository, container.reviewsRepository) as T
        DiscountsViewModel::class.java -> DiscountsViewModel(container.merchantRepository, container.productRepository, container.storeRepository) as T
        RedeemViewModel::class.java -> RedeemViewModel(container.merchantRepository) as T
        CatalogViewModel::class.java -> CatalogViewModel(container.merchantRepository, container.productRepository) as T
        ResponderViewModel::class.java -> ResponderViewModel(container.responderRepository) as T
        WalletViewModel::class.java -> WalletViewModel(container.responderRepository) as T
        FavoritesViewModel::class.java -> FavoritesViewModel(container.placesRepository) as T
        HoursViewModel::class.java -> HoursViewModel(container.merchantRepository, container.placesRepository) as T
        ProfileEditViewModel::class.java -> ProfileEditViewModel(container.profileRepository) as T
        NotificationsViewModel::class.java -> NotificationsViewModel(container.notificationRepository) as T
        PricingViewModel::class.java -> PricingViewModel(container.membershipRepository) as T
        ReviewViewModel::class.java -> ReviewViewModel(container.broadcastRepository) as T
        AccountSettingsViewModel::class.java -> AccountSettingsViewModel(container.accountRepository) as T
        PromoViewModel::class.java -> PromoViewModel(container.broadcastRepository, container.merchantRepository, container.productRepository) as T
        else -> throw IllegalArgumentException("Unknown ViewModel class: ${modelClass.name}")
    }
}
