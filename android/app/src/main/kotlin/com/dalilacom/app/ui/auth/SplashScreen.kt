package com.dalilacom.app.ui.auth

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import com.dalilacom.app.data.repository.AuthRepository

@Composable
fun SplashScreen(
    authRepository: AuthRepository,
    onHasSession: () -> Unit,
    onNoSession: () -> Unit,
) {
    LaunchedEffect(Unit) {
        if (authRepository.hasStoredSession()) onHasSession() else onNoSession()
    }

    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
    }
}
