package com.dalilacom.app.ui.common

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CreditCard
import androidx.compose.material.icons.filled.LocalOffer
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SmallFloatingActionButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringArrayResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.dalilacom.app.R
import kotlinx.coroutines.delay

/** Sign-in and the card itself have no floating buttons; a shop's discount button is not shown on the store screens either. */
private val AUTH_AND_CARD = listOf("splash", "socialReturn", "login", "register", "card", "merchantRegister")
private val STORE_SCREENS = listOf("store", "product/")

fun showCardFabOn(route: String?): Boolean = route != null && AUTH_AND_CARD.none { route.startsWith(it) }
fun showMerchantFabOn(route: String?): Boolean = route != null && (AUTH_AND_CARD + STORE_SCREENS).none { route.startsWith(it) }

/** Screens that have a bottom bar: the buttons stand above it, where the map's own round buttons stand. */
private fun hasBottomBar(route: String?) = route == "home" || route?.startsWith("merchantMode") == true

/**
 * The round floating buttons, like the map's own: the member card for everyone and, for a shop, the discount button
 * (add a discount, or give a customer a discount). On the map they take the place of the language and theme buttons.
 */
@Composable
fun BoxScope.FloatingButtons(route: String?, merchant: Boolean, onCard: () -> Unit, onAddDiscount: () -> Unit, onGiveDiscount: () -> Unit) {
    val showCard = showCardFabOn(route)
    val showDisc = merchant && showMerchantFabOn(route)
    if (!showCard && !showDisc) return
    var menuOpen by remember { mutableStateOf(false) }
    // every so often a short hint says why a discount is good for the shop (the true reasons), until the shop closes it
    val tips = stringArrayResource(R.array.fab_tips)
    var tipIndex by remember { mutableStateOf(0) }
    var tipVisible by remember { mutableStateOf(false) }
    var tipsOff by remember { mutableStateOf(false) }
    LaunchedEffect(tipsOff, showDisc) {
        if (tipsOff || !showDisc) return@LaunchedEffect
        delay(5_000)
        while (true) {
            if (!menuOpen) { tipVisible = true; delay(9_000); tipVisible = false; tipIndex++ }
            delay(38_000)
        }
    }
    val container = MaterialTheme.colorScheme.surface.copy(alpha = 0.92f)
    Column(
        Modifier.align(Alignment.BottomStart).navigationBarsPadding().padding(start = 16.dp, bottom = if (hasBottomBar(route)) 152.dp else 24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        if (showDisc) Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            androidx.compose.foundation.layout.Box {
                SmallFloatingActionButton(onClick = { menuOpen = true; tipVisible = false }, containerColor = container, contentColor = MaterialTheme.colorScheme.primary) {
                    Icon(Icons.Filled.LocalOffer, contentDescription = stringResource(R.string.fab_discount))
                }
                DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                    DropdownMenuItem(text = { Text("➕  " + stringResource(R.string.fab_add_discount)) }, onClick = { menuOpen = false; onAddDiscount() })
                    DropdownMenuItem(text = { Text("🎟️  " + stringResource(R.string.fab_give_discount)) }, onClick = { menuOpen = false; onGiveDiscount() })
                }
            }
            if (tipVisible && !menuOpen && tips.isNotEmpty()) {
                Surface(
                    shape = RoundedCornerShape(topStart = 4.dp, topEnd = 16.dp, bottomStart = 16.dp, bottomEnd = 16.dp),
                    color = Color(0xFFFFF8E1), contentColor = Color(0xFF3B2F0B),
                    border = BorderStroke(1.5.dp, Color(0xFFF3C969)),
                    modifier = Modifier.padding(end = 16.dp).shadow(8.dp, RoundedCornerShape(16.dp)),
                    onClick = { tipVisible = false; onAddDiscount() },
                ) {
                    Row(Modifier.padding(start = 14.dp, top = 8.dp, bottom = 8.dp, end = 4.dp), verticalAlignment = Alignment.Top) {
                        Text(tips[tipIndex % tips.size], fontSize = 13.5.sp, lineHeight = 19.sp, modifier = Modifier.weight(1f, fill = false))
                        IconButton(onClick = { tipVisible = false; tipsOff = true }, modifier = Modifier.size(28.dp)) { Text("✕", fontSize = 12.sp) }
                    }
                }
            }
        }
        if (showCard) SmallFloatingActionButton(onClick = onCard, containerColor = container, contentColor = MaterialTheme.colorScheme.primary) {
            Icon(Icons.Filled.CreditCard, contentDescription = stringResource(R.string.deals_my_card))
        }
    }
}
