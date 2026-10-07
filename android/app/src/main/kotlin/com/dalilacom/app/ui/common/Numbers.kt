package com.dalilacom.app.ui.common

import java.math.BigDecimal
import java.math.RoundingMode

/**
 * A phone set to Arabic (or Persian) types digits as ٠١٢٣٤٥٦٧٨٩ / ۰۱۲۳۴۵۶۷۸۹, which `toInt()` / `toDouble()` reject —
 * so a perfectly good "٢٠٠" used to be reported as an invalid number. Everything typed into a number field goes
 * through here first. (Code points, not literals, so no user-facing Arabic text lives in the code.)
 */
fun String.toLatinDigits(): String = buildString(length) {
    for (c in this@toLatinDigits.trim()) {
        when (c.code) {
            in 0x0660..0x0669 -> append('0' + (c.code - 0x0660))
            in 0x06F0..0x06F9 -> append('0' + (c.code - 0x06F0))
            0x066B, 0x060C, ','.code -> append('.') // Arabic decimal separator, Arabic comma, comma
            0x066C, ' '.code, 0xA0 -> Unit // thousands separator / spaces
            else -> append(c)
        }
    }
}

fun String.parseInt(): Int? = toLatinDigits().toIntOrNull()

fun String.parseDecimal(): Double? = toLatinDigits().toDoubleOrNull()

/** "19.99" -> 1999, exactly (a double would give 1998). Null when it is not a number. */
fun String.parseCents(): Int? =
    toLatinDigits().toBigDecimalOrNull()?.multiply(BigDecimal(100))?.setScale(0, RoundingMode.HALF_UP)?.toInt()
