package com.dalilacom.app.data

import android.content.Context
import com.dalilacom.app.data.network.ApiClient
import com.dalilacom.app.data.repository.AuthRepository
import com.dalilacom.app.data.repository.CartRepository
import com.dalilacom.app.data.repository.DiscoverRepository
import com.dalilacom.app.data.repository.MembershipRepository
import com.dalilacom.app.data.repository.MerchantRepository
import com.dalilacom.app.data.repository.OrderRepository
import com.dalilacom.app.data.repository.PlacesRepository
import com.dalilacom.app.data.repository.ProductRepository
import com.dalilacom.app.data.repository.ResponderRepository
import com.dalilacom.app.data.store.SessionStore
import com.dalilacom.app.data.store.TokenStore

/** Simple hand-rolled DI container — one instance shared across the app via MainActivity. */
class AppContainer(context: Context) {
    val tokenStore = TokenStore(context.applicationContext)
    val sessionStore = SessionStore(context.applicationContext)
    private val api = ApiClient.create(tokenStore)

    val authRepository = AuthRepository(api, tokenStore, sessionStore)
    val membershipRepository = MembershipRepository(api)
    val discoverRepository = DiscoverRepository(api)
    val productRepository = ProductRepository(api)
    val cartRepository = CartRepository(api)
    val orderRepository = OrderRepository(api)
    val merchantRepository = MerchantRepository(api, sessionStore)
    val responderRepository = ResponderRepository(api)
    val placesRepository = PlacesRepository(api)
}
