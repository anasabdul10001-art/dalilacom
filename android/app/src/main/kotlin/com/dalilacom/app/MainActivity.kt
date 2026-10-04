package com.dalilacom.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import com.dalilacom.app.data.AppContainer
import com.dalilacom.app.ui.nav.DalilacomNavGraph
import com.dalilacom.app.ui.theme.DalilacomTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val container = AppContainer(applicationContext)

        setContent {
            val savedTheme by container.sessionStore.themeFlow.collectAsState(initial = null)
            val dark = when (savedTheme) {
                "dark" -> true
                "light" -> false
                else -> isSystemInDarkTheme()
            }
            DalilacomTheme(darkTheme = dark) {
                Surface(modifier = Modifier.fillMaxSize()) {
                    DalilacomNavGraph(container)
                }
            }
        }
    }
}
