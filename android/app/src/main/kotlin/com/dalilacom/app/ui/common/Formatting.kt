package com.dalilacom.app.ui.common

import androidx.compose.ui.graphics.Color

fun formatCents(cents: Int): String = "%.2f €".format(cents / 100.0)

fun orderStatusLabel(status: String): String = when (status) {
    "PENDING" -> "قيد الانتظار"
    "CONFIRMED" -> "مؤكد"
    "PREPARING" -> "قيد التحضير"
    "SHIPPED" -> "تم الشحن"
    "DELIVERED" -> "تم التسليم"
    "CANCELLED" -> "ملغى"
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
    "CONFIRMED" -> "تأكيد الطلب"
    "PREPARING" -> "بدء التحضير"
    "SHIPPED" -> "تم الشحن"
    "DELIVERED" -> "تم التسليم"
    "CANCELLED" -> "إلغاء"
    else -> nextStatus
}
