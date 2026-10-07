package com.dalilacom.app.ui.nav

import android.content.Intent
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * Where tapping a notification should take the person: the order, the product, the shop, the renewal page, the shop's
 * own orders — whichever the notification is about. The same rule serves the inbox (data arrives as JSON) and a push
 * tapped in the tray (data arrives as intent extras), so both lead to the same place.
 */
object NotificationRoutes {
    const val INBOX = "notifications"

    /** Ids go into a route string, so only plain id characters are accepted. */
    private val safeId = Regex("^[A-Za-z0-9_-]{1,64}$")

    fun routeFor(type: String?, data: Map<String, String>): String {
        fun id(key: String): String? = data[key]?.takeIf { safeId.matches(it) }
        val merchantSide = data["audience"] == "MERCHANT"
        val product = id("productId")?.let { "product/$it" }
        val shop = id("merchantId")?.let { "merchant/$it" }
        return when (type) {
            "ORDER_PLACED", "ORDER_STATUS" -> when {
                merchantSide -> "merchantMode"
                else -> id("orderId")?.let { "order/$it" } ?: INBOX
            }
            "MEMBERSHIP_EXPIRING" -> "pricing"
            "DISCOUNT_RECEIVED" -> shop ?: INBOX
            "NEW_PRODUCT", "NEW_OFFER" -> product ?: shop ?: INBOX
            else -> INBOX
        }
    }

    /** The data of an inbox row (a JSON object of mixed values) as the plain strings a push carries. */
    fun dataOf(element: JsonElement?): Map<String, String> =
        (element as? JsonObject)?.mapNotNull { (key, value) -> (value as? JsonPrimitive)?.content?.let { key to it } }?.toMap().orEmpty()

    /** A tapped push puts the server's data keys in the launch intent's extras; `type` is always one of them. */
    fun fromIntent(intent: Intent?): String? {
        val extras = intent?.extras ?: return null
        val type = extras.getString("type") ?: return null
        val data = extras.keySet().mapNotNull { key -> extras.getString(key)?.let { key to it } }.toMap()
        return routeFor(type, data)
    }

    /** Forgets the extras once they have been used, so a rotation or language switch does not navigate again. */
    fun consume(intent: Intent?) {
        intent?.extras?.keySet()?.toList()?.forEach { intent.removeExtra(it) }
    }
}
