package com.dalilacom.app.ui.common

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.dalilacom.app.DalilacomApp
import com.dalilacom.app.ui.i18n.AppLanguages
import kotlinx.coroutines.launch

/**
 * The languages as a row of buttons, for the places where a visitor starts (sign-in, register, the city question).
 * The choice is kept on the phone, so it works without an account; a signed-in person also finds it in the account settings.
 * [onColor] is for a coloured header (the sign-in page), where the buttons are white.
 */
@Composable
fun LanguageChips(modifier: Modifier = Modifier, onColor: Boolean = false) {
    val container = (LocalContext.current.applicationContext as DalilacomApp).container
    val scope = rememberCoroutineScope()
    val saved by container.sessionStore.languageFlow.collectAsState(initial = null)
    val current = AppLanguages.find(saved).code
    Row(modifier, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        AppLanguages.all.forEach { language ->
            val pick: () -> Unit = { scope.launch { container.sessionStore.saveLanguage(language.code) } }
            val small = Modifier.height(36.dp)
            val padding = PaddingValues(horizontal = 16.dp, vertical = 4.dp)
            if (language.code == current) {
                Button(
                    onClick = pick, modifier = small, contentPadding = padding,
                    colors = if (onColor) ButtonDefaults.buttonColors(containerColor = Color.White, contentColor = MaterialTheme.colorScheme.primary) else ButtonDefaults.buttonColors(),
                ) { Text(language.nativeName) }
            } else {
                OutlinedButton(
                    onClick = pick, modifier = small, contentPadding = padding,
                    colors = if (onColor) ButtonDefaults.outlinedButtonColors(contentColor = Color.White) else ButtonDefaults.outlinedButtonColors(),
                    border = BorderStroke(1.dp, if (onColor) Color.White.copy(alpha = 0.7f) else MaterialTheme.colorScheme.outline),
                ) { Text(language.nativeName) }
            }
        }
    }
}
