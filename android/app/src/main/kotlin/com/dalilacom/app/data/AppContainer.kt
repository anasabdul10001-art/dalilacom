package com.dalilacom.app.data

import android.content.Context
import com.dalilacom.app.data.network.ApiClient
import com.dalilacom.app.data.repository.AuthRepository
import com.dalilacom.app.data.repository.DiscoverRepository
import com.dalilacom.app.data.repository.MembershipRepository
import com.dalilacom.app.data.store.TokenStore

/** Simple hand-rolled DI container — one instance shared across the app via MainActivity. */
class AppContainer(context: Context) {
    val tokenStore = TokenStore(context.applicationContext)
    private val api = ApiClient.create(tokenStore)

    val authRepository = AuthRepository(api, tokenStore)
    val membershipRepository = MembershipRepository(api)
    val discoverRepository = DiscoverRepository(api)
}
