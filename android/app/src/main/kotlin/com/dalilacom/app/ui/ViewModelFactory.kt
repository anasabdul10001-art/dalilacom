package com.dalilacom.app.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import com.dalilacom.app.data.AppContainer
import com.dalilacom.app.ui.auth.AuthViewModel
import com.dalilacom.app.ui.card.CardViewModel
import com.dalilacom.app.ui.discover.DiscoverViewModel

/** Hand-rolled factory to avoid pulling in Hilt for this first slice of the app. */
class ViewModelFactory(private val container: AppContainer) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T = when (modelClass) {
        AuthViewModel::class.java -> AuthViewModel(container.authRepository) as T
        CardViewModel::class.java -> CardViewModel(container.membershipRepository) as T
        DiscoverViewModel::class.java -> DiscoverViewModel(container.discoverRepository) as T
        else -> throw IllegalArgumentException("Unknown ViewModel class: ${modelClass.name}")
    }
}
