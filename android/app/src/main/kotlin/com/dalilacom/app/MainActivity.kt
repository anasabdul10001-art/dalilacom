package com.dalilacom.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import com.dalilacom.app.data.AppContainer
import com.dalilacom.app.ui.i18n.AppLanguages
import com.dalilacom.app.ui.i18n.AppStrings
import com.dalilacom.app.ui.i18n.LocalizedContext
import com.dalilacom.app.ui.nav.DalilacomNavGraph
import com.dalilacom.app.ui.theme.DalilacomTheme
import kotlinx.coroutines.runBlocking

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val container = AppContainer(applicationContext)
        // Read the saved language before the first frame so the app never flashes in the wrong one.
        val initialLanguage = runBlocking { container.sessionStore.getLanguage() }

        setContent {
            val savedTheme by container.sessionStore.themeFlow.collectAsState(initial = null)
            val dark = when (savedTheme) {
                "dark" -> true
                "light" -> false
                else -> isSystemInDarkTheme()
            }

            val savedLanguage by container.sessionStore.languageFlow.collectAsState(initial = initialLanguage)
            val language = AppLanguages.find(savedLanguage)
            val baseContext = LocalContext.current
            val localized = remember(language.code) { LocalizedContext(baseContext, language) }
            AppStrings.resources = localized.resources

            // Switching language rebuilds the UI tree (key) so every screen and helper picks up the new texts and direction.
            key(language.code) {
                CompositionLocalProvider(LocalContext provides localized, LocalConfiguration provides localized.configuration) {
                    DalilacomTheme(darkTheme = dark, rtl = language.rtl) {
                        Surface(modifier = Modifier.fillMaxSize()) {
                            DalilacomNavGraph(container)
                        }
                    }
                }
            }
        }
    }
}
