package com.dalilacom.app.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

// Official brand colors (section 17)
val PrimaryRed = Color(0xFFBA2A34)
val DeepRed = Color(0xFF5A0E12)
val BrandBlack = Color(0xFF000000)
val BrandWhite = Color(0xFFFFFFFF)

private val LightColors = lightColorScheme(
    primary = PrimaryRed,
    onPrimary = BrandWhite,
    secondary = DeepRed,
    background = BrandWhite,
    surface = BrandWhite,
    onBackground = BrandBlack,
    onSurface = BrandBlack,
)

private val DarkColors = darkColorScheme(
    primary = PrimaryRed,
    onPrimary = BrandWhite,
    secondary = DeepRed,
    background = Color(0xFF120607),
    surface = Color(0xFF1A0B0C),
    onBackground = BrandWhite,
    onSurface = BrandWhite,
)

@Composable
fun DalilacomTheme(
    darkTheme: Boolean = androidx.compose.foundation.isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    val colors = if (darkTheme) DarkColors else LightColors
    MaterialTheme(colorScheme = colors, content = content)
}
