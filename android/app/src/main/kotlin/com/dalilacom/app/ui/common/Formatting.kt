package com.dalilacom.app.ui.common

import com.dalilacom.app.R
import com.dalilacom.app.ui.i18n.AppStrings
import androidx.compose.ui.graphics.Color

fun formatCents(cents: Int): String = "%.2f €".format(cents / 100.0)

fun orderStatusLabel(status: String): String = when (status) {
    "PENDING" -> AppStrings.get(R.string.s_8aed060f)
    "CONFIRMED" -> AppStrings.get(R.string.s_44048fac)
    "PREPARING" -> AppStrings.get(R.string.s_a6a44b5b)
    "SHIPPED" -> AppStrings.get(R.string.s_f79140d3)
    "DELIVERED" -> AppStrings.get(R.string.s_ea16c0e6)
    "CANCELLED" -> AppStrings.get(R.string.s_5f05466a)
    else -> status
}

fun orderStatusColor(status: String): Color = when (status) {
    "DELIVERED" -> Color(0xFF2E7D32)
    "CANCELLED" -> Color(0xFFB00020)
    "SHIPPED" -> Color(0xFF1565C0)
    "PREPARING" -> Color(0xFFEF6C00)
    else -> Color(0xFF9E7B00)
}

/** Mirrors the server's ALLOWED_TRANSITIONS in order.routes.ts — the server enforces this for
 * real, this copy only decides which buttons make sense to show. */
val ORDER_STATUS_TRANSITIONS: Map<String, List<String>> = mapOf(
    "PENDING" to listOf("CONFIRMED", "CANCELLED"),
    "CONFIRMED" to listOf("PREPARING", "CANCELLED"),
    "PREPARING" to listOf("SHIPPED", "CANCELLED"),
    "SHIPPED" to listOf("DELIVERED"),
    "DELIVERED" to emptyList(),
    "CANCELLED" to emptyList(),
)

fun orderActionLabel(nextStatus: String): String = when (nextStatus) {
    "CONFIRMED" -> AppStrings.get(R.string.s_d1feb875)
    "PREPARING" -> AppStrings.get(R.string.s_8a3cd750)
    "SHIPPED" -> AppStrings.get(R.string.s_f79140d3)
    "DELIVERED" -> AppStrings.get(R.string.s_ea16c0e6)
    "CANCELLED" -> AppStrings.get(R.string.s_e776b020)
    else -> nextStatus
}
