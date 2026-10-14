package com.dalilacom.app.ui.common

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CreditCard
import androidx.compose.material.icons.filled.LocalOffer
import androidx.compose.material3.Icon
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.foundation.layout.Column
import androidx.compose.material3.IconButton
import androidx.compose.foundation.layout.size
import kotlinx.coroutines.delay
import androidx.compose.ui.res.stringArrayResource
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.dalilacom.app.R

/** Screens where the floating card button would be in the way (sign-in, the shop's own tools, the card itself). */
private val CARD_FAB_HIDDEN = listOf(
    "splash", "socialReturn", "login", "register", "card", "merchantMode", "merchantProduct", "merchantHours", "merchantProfile",
    "merchantRegister", "productWizard", "discounts", "shipping", "branches", "aiPlans", "adminReview", "adBook", "myAds", "pricing",
)

/** A shop keeps both floating buttons on every page except sign-in and the card itself. */
private val AUTH_AND_CARD = listOf("splash", "socialReturn", "login", "register", "card", "merchantRegister")

fun showCardFabOn(route: String?, merchant: Boolean = false): Boolean =
    route != null && (if (merchant) AUTH_AND_CARD else CARD_FAB_HIDDEN).none { route.startsWith(it) }

fun showMerchantFabOn(route: String?): Boolean = route != null && AUTH_AND_CARD.none { route.startsWith(it) }

/** A little credit card in the brand red with a gold edge, floating over every page: one tap opens the member card. */
@Composable
fun BoxScope.CardFab(onClick: () -> Unit) {
    Surface(
        onClick = onClick,
        shape = RoundedCornerShape(50),
        color = Color.Transparent,
        contentColor = Color.White,
        border = BorderStroke(2.dp, Color(0xFFF3C969)),
        modifier = Modifier
            .align(Alignment.BottomStart)
            .navigationBarsPadding()
            .padding(start = 14.dp, bottom = 92.dp)
            .shadow(10.dp, RoundedCornerShape(50), ambientColor = Color(0xFF8F101C), spotColor = Color(0xFF8F101C)),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .background(Brush.linearGradient(listOf(Color(0xFF8F101C), Color(0xFFC8283A), Color(0xFFE3566A))))
                .padding(horizontal = 16.dp, vertical = 10.dp),
        ) {
            Icon(Icons.Filled.CreditCard, contentDescription = null, modifier = Modifier.padding(end = 0.dp))
            Spacer(Modifier.width(8.dp))
            Text(stringResource(R.string.deals_my_card), fontSize = 14.sp, fontWeight = FontWeight.ExtraBold)
        }
    }
}

/** The shop's own floating button: add a discount, or give a customer a discount (scan the card or type the member number). */
@Composable
fun BoxScope.MerchantFab(raised: Boolean, onAddDiscount: () -> Unit, onGiveDiscount: () -> Unit) {
    var open by remember { mutableStateOf(false) }
    // every so often a short hint says why a discount is good for the shop (the true reasons), until the shop closes it
    val tips = stringArrayResource(R.array.fab_tips)
    var tipIndex by remember { mutableStateOf(0) }
    var tipVisible by remember { mutableStateOf(false) }
    var tipsOff by remember { mutableStateOf(false) }
    LaunchedEffect(tipsOff) {
        if (tipsOff) return@LaunchedEffect
        delay(5_000)
        while (true) {
            if (!open) { tipVisible = true; delay(9_000); tipVisible = false; tipIndex++ }
            delay(38_000)
        }
    }
    Column(
        Modifier.align(Alignment.BottomEnd).navigationBarsPadding().padding(end = 14.dp, bottom = if (raised) 176.dp else 92.dp),
        horizontalAlignment = Alignment.End,
        verticalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(10.dp),
    ) {
        if (tipVisible && !open && tips.isNotEmpty()) {
            Surface(
                shape = RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp, bottomStart = 16.dp, bottomEnd = 4.dp),
                color = Color(0xFFFFF8E1), contentColor = Color(0xFF3B2F0B),
                border = BorderStroke(1.5.dp, Color(0xFFF3C969)),
                modifier = Modifier.padding(start = 40.dp).shadow(8.dp, RoundedCornerShape(16.dp)),
                onClick = { tipVisible = false; onAddDiscount() },
            ) {
                Row(Modifier.padding(start = 14.dp, top = 8.dp, bottom = 8.dp, end = 4.dp), verticalAlignment = Alignment.Top) {
                    Text(tips[tipIndex % tips.size], fontSize = 13.5.sp, lineHeight = 19.sp, modifier = Modifier.weight(1f, fill = false))
                    IconButton(onClick = { tipVisible = false; tipsOff = true }, modifier = Modifier.size(28.dp)) { Text("✕", fontSize = 12.sp) }
                }
            }
        }
        androidx.compose.foundation.layout.Box {
            Surface(
                onClick = { open = true; tipVisible = false },
                shape = RoundedCornerShape(50),
                color = Color.Transparent,
                contentColor = Color(0xFFFFE7A3),
                border = BorderStroke(2.dp, Color(0xFFF3C969)),
                modifier = Modifier.shadow(10.dp, RoundedCornerShape(50)),
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.background(Brush.linearGradient(listOf(Color(0xFF1D1D22), Color(0xFF34343C)))).padding(horizontal = 16.dp, vertical = 10.dp),
                ) {
                    Icon(Icons.Filled.LocalOffer, contentDescription = null)
                    Spacer(Modifier.width(8.dp))
                    Text(stringResource(R.string.fab_discount), fontSize = 14.sp, fontWeight = FontWeight.ExtraBold)
                }
            }
            androidx.compose.material3.DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
                androidx.compose.material3.DropdownMenuItem(text = { Text("➕  " + stringResource(R.string.fab_add_discount)) }, onClick = { open = false; onAddDiscount() })
                androidx.compose.material3.DropdownMenuItem(text = { Text("🎟️  " + stringResource(R.string.fab_give_discount)) }, onClick = { open = false; onGiveDiscount() })
            }
        }
    }
}
