package com.dalilacom.app.ui.auth

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.dalilacom.app.R
import com.dalilacom.app.data.network.absoluteUrl
import com.dalilacom.app.ui.ViewModelFactory
import com.dalilacom.app.ui.i18n.AppStrings

/**
 * "Continue with Google / Facebook". The server runs the sign-in in the phone's browser and sends the browser back to
 * dalilacom://auth/social with a one-time ticket (see SocialReturnScreen). Only providers the server has keys for show.
 */
@Composable
fun SocialButtons(viewModel: AuthViewModel) {
    val providers by viewModel.socialProviders.collectAsState()
    if (!providers.google && !providers.facebook) return
    val context = LocalContext.current
    fun open(provider: String) {
        val url = absoluteUrl("/auth/social/$provider/start?platform=app&lang=${AppStrings.language}")
        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
    }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Text(AppStrings.get(R.string.social_or), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (providers.google) {
            OutlinedButton(onClick = { open("google") }, shape = RoundedCornerShape(14.dp), modifier = Modifier.fillMaxWidth().height(48.dp)) {
                Text(AppStrings.get(R.string.social_google))
            }
        }
        if (providers.facebook) {
            OutlinedButton(onClick = { open("facebook") }, shape = RoundedCornerShape(14.dp), modifier = Modifier.fillMaxWidth().height(48.dp)) {
                Text(AppStrings.get(R.string.social_facebook))
            }
        }
    }
}

/** What the provider's page sent the browser back with: a ticket to trade for a session, or the reason it failed. */
@Composable
fun SocialReturnScreen(factory: ViewModelFactory, ticket: String?, error: String?, onSignedIn: () -> Unit, onBack: () -> Unit) {
    val viewModel: AuthViewModel = viewModel(factory = factory)
    val state by viewModel.uiState.collectAsState()
    LaunchedEffect(ticket) { if (!ticket.isNullOrBlank()) viewModel.exchangeTicket(ticket) }
    LaunchedEffect(state) { if (state is AuthUiState.Success) onSignedIn() }

    val message = when {
        state is AuthUiState.Error -> (state as AuthUiState.Error).message
        ticket.isNullOrBlank() -> when (error) {
            "CANCELLED" -> AppStrings.get(R.string.social_error_cancelled)
            "EMAIL_IN_USE" -> AppStrings.get(R.string.social_error_email_in_use)
            "NO_EMAIL" -> AppStrings.get(R.string.social_error_no_email)
            "ACCOUNT_DISABLED" -> AppStrings.get(R.string.social_error_disabled)
            else -> AppStrings.get(R.string.social_failed)
        }
        else -> null
    }
    Box(Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) {
        if (message == null) {
            CircularProgressIndicator()
        } else {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(message, color = MaterialTheme.colorScheme.error, textAlign = TextAlign.Center)
                Spacer(Modifier.height(16.dp))
                Button(onClick = onBack) { Text(AppStrings.get(R.string.social_back_to_login)) }
            }
        }
    }
}
