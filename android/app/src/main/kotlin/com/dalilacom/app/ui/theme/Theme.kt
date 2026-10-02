package com.dalilacom.app.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.platform.LocalLayoutDirection
import com.dalilacom.app.R

// Official brand colors (section 17)
val PrimaryRed = Color(0xFFBA2A34)
val DeepRed = Color(0xFF5A0E12)
val BrandBlack = Color(0xFF000000)
val BrandWhite = Color(0xFFFFFFFF)
val SoftRed = Color(0xFFFBE6E7)

private val LightColors = lightColorScheme(
    primary = PrimaryRed,
    onPrimary = BrandWhite,
    primaryContainer = SoftRed,
    onPrimaryContainer = DeepRed,
    secondary = DeepRed,
    onSecondary = BrandWhite,
    secondaryContainer = SoftRed,
    onSecondaryContainer = DeepRed,
    background = Color(0xFFFFFFFF),
    onBackground = Color(0xFF1A1111),
    surface = BrandWhite,
    onSurface = Color(0xFF1A1111),
    surfaceVariant = Color(0xFFF6F1F1),
    onSurfaceVariant = Color(0xFF675B5B),
    outline = Color(0xFFB9AAAA),
    outlineVariant = Color(0xFFEADFDF),
)

private val DarkColors = darkColorScheme(
    primary = Color(0xFFE5555F),
    onPrimary = BrandWhite,
    primaryContainer = Color(0xFF4A1519),
    onPrimaryContainer = Color(0xFFFFDADC),
    secondary = Color(0xFFFFB3B6),
    secondaryContainer = Color(0xFF4A1519),
    onSecondaryContainer = Color(0xFFFFDADC),
    background = Color(0xFF120607),
    surface = Color(0xFF1A0B0C),
    onBackground = BrandWhite,
    onSurface = BrandWhite,
    surfaceVariant = Color(0xFF2A1618),
    onSurfaceVariant = Color(0xFFD7C2C3),
    outline = Color(0xFF8E7778),
    outlineVariant = Color(0xFF4A3638),
)

private val Tajawal = FontFamily(
    Font(R.font.tajawal_regular, FontWeight.Normal),
    Font(R.font.tajawal_medium, FontWeight.Medium),
    Font(R.font.tajawal_bold, FontWeight.Bold),
)

private val base = Typography()
private val AppTypography = Typography(
    displayLarge = base.displayLarge.copy(fontFamily = Tajawal, fontWeight = FontWeight.Bold),
    displayMedium = base.displayMedium.copy(fontFamily = Tajawal, fontWeight = FontWeight.Bold),
    displaySmall = base.displaySmall.copy(fontFamily = Tajawal, fontWeight = FontWeight.Bold),
    headlineLarge = base.headlineLarge.copy(fontFamily = Tajawal, fontWeight = FontWeight.Bold),
    headlineMedium = base.headlineMedium.copy(fontFamily = Tajawal, fontWeight = FontWeight.Bold),
    headlineSmall = base.headlineSmall.copy(fontFamily = Tajawal, fontWeight = FontWeight.Bold),
    titleLarge = base.titleLarge.copy(fontFamily = Tajawal, fontWeight = FontWeight.Bold),
    titleMedium = base.titleMedium.copy(fontFamily = Tajawal, fontWeight = FontWeight.Bold),
    titleSmall = base.titleSmall.copy(fontFamily = Tajawal, fontWeight = FontWeight.Medium),
    bodyLarge = base.bodyLarge.copy(fontFamily = Tajawal),
    bodyMedium = base.bodyMedium.copy(fontFamily = Tajawal),
    bodySmall = base.bodySmall.copy(fontFamily = Tajawal),
    labelLarge = base.labelLarge.copy(fontFamily = Tajawal, fontWeight = FontWeight.Medium),
    labelMedium = base.labelMedium.copy(fontFamily = Tajawal, fontWeight = FontWeight.Medium),
    labelSmall = base.labelSmall.copy(fontFamily = Tajawal, fontWeight = FontWeight.Medium),
)

private val AppShapes = Shapes(
    extraSmall = RoundedCornerShape(8.dp),
    small = RoundedCornerShape(12.dp),
    medium = RoundedCornerShape(16.dp),
    large = RoundedCornerShape(24.dp),
    extraLarge = RoundedCornerShape(28.dp),
)

@Composable
fun DalilacomTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    val colors = if (darkTheme) DarkColors else LightColors
    // All screens are Arabic today, so the whole UI is laid out right-to-left regardless of the
    // phone's language (a later localization pass will make this follow the device locale).
    CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
        MaterialTheme(colorScheme = colors, typography = AppTypography, shapes = AppShapes, content = content)
    }
}
