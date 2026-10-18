package com.dalilacom.app.ui.common

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign

/** The example shown faintly inside an empty field (it tells the person what to write; it is not text already typed). */
@Composable
fun Hint(text: String, modifier: Modifier = Modifier, textAlign: TextAlign? = null) {
    Text(text, modifier = modifier, textAlign = textAlign, color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.38f), maxLines = 1)
}
