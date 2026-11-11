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

// Brand colors: coral orange on cream, white cards, near-black text (taken from the reference page)
val BrandOrange = Color(0xFFF48050)
val BrandOrangeDeep = Color(0xFFC4552B)
val BrandBlack = Color(0xFF000000)
val BrandWhite = Color(0xFFFFFFFF)
val BrandPeach = Color(0xFFFDE6D6)
val BrandInk = Color(0xFF1C1C20)

private val LightColors = lightColorScheme(
    primary = BrandOrange,
    onPrimary = BrandInk, // dark text on the coral: white would be too faint
    primaryContainer = BrandPeach,
    onPrimaryContainer = Color(0xFF5A2410),
    secondary = BrandOrangeDeep,
    onSecondary = BrandWhite,
    secondaryContainer = BrandPeach,
    onSecondaryContainer = Color(0xFF5A2410),
    background = Color(0xFFFCF8F4),
    onBackground = BrandInk,
    surface = BrandWhite,
    onSurface = BrandInk,
    surfaceVariant = Color(0xFFFBF1E7),
    onSurfaceVariant = Color(0xFF6B6B70),
    outline = Color(0xFFD7C9BC),
    outlineVariant = Color(0xFFEFE4D8),
)

private val DarkColors = darkColorScheme(
    primary = BrandOrange,
    onPrimary = BrandInk,
    primaryContainer = Color(0xFF5A2A14),
    onPrimaryContainer = Color(0xFFFFDCCB),
    secondary = Color(0xFFFFB594),
    secondaryContainer = Color(0xFF5A2A14),
    onSecondaryContainer = Color(0xFFFFDCCB),
    background = Color(0xFF14100E),
    surface = Color(0xFF1D1815),
    onBackground = BrandWhite,
    onSurface = BrandWhite,
    surfaceVariant = Color(0xFF2A2320),
    onSurfaceVariant = Color(0xFFD9CCC2),
    outline = Color(0xFF8E7F74),
    outlineVariant = Color(0xFF4A3D36),
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

private const val MAX_FONT_SCALE = 1.2f

@Composable
fun DalilacomTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    rtl: Boolean = true,
    content: @Composable () -> Unit,
) {
    val colors = if (darkTheme) DarkColors else LightColors
    // All screens are Arabic today, so the whole UI is laid out right-to-left regardless of the
    // phone's language (a later localization pass will make this follow the device locale).
    // The phone's font size is followed only up to 1.2x: beyond it the bars and buttons are too narrow and words break letter by letter.
    val density = androidx.compose.ui.platform.LocalDensity.current
    val capped = androidx.compose.ui.unit.Density(density.density, fontScale = density.fontScale.coerceAtMost(MAX_FONT_SCALE))
    CompositionLocalProvider(
        LocalLayoutDirection provides if (rtl) LayoutDirection.Rtl else LayoutDirection.Ltr,
        androidx.compose.ui.platform.LocalDensity provides capped,
    ) {
        MaterialTheme(colorScheme = colors, typography = AppTypography, shapes = AppShapes, content = content)
    }
}
