package com.dalilacom.app.ui.common

import androidx.compose.foundation.Image
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import com.dalilacom.app.R

/**
 * The full logo (the mark above the word «دليلكم» with the arrows on its letters). On a dark screen the white-lettered one is used,
 * because the word is black. [wide] is the mark and the word side by side, for narrow headers.
 */
@Composable
fun BrandLogo(modifier: Modifier = Modifier, wide: Boolean = false, onColor: Boolean = false) {
    val dark = MaterialTheme.colorScheme.background.luminance() < 0.5f
    val res = when {
        onColor || dark -> R.drawable.brand_logo_full_white // on the red header, or on a dark screen
        wide -> R.drawable.brand_logo_wide
        else -> R.drawable.brand_logo_full
    }
    Image(painterResource(res), contentDescription = "DALILACOM", modifier = modifier, contentScale = ContentScale.Fit)
}
