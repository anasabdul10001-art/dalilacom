package com.dalilacom.app.ui.store

import com.dalilacom.app.ui.common.formatCents
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.dalilacom.app.R
import androidx.compose.foundation.clickable
import androidx.compose.foundation.border
import com.dalilacom.app.data.AppContainer
import com.dalilacom.app.data.network.StoreProductDto
import com.dalilacom.app.data.repository.AuthRepository
import com.dalilacom.app.data.repository.CartRepository
import com.dalilacom.app.data.repository.StoreRepository
import com.dalilacom.app.ui.i18n.AppStrings
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class StoreProductUi(
    val loading: Boolean = true,
    val product: StoreProductDto? = null,
    val quantity: Int = 1,
    val adding: Boolean = false,
    val added: Boolean = false,
    val goToCart: Boolean = false,
    val needLogin: Boolean = false,
    val error: String? = null,
    val reviews: com.dalilacom.app.data.network.ReviewsDto? = null,
    val reviewTarget: com.dalilacom.app.ui.common.ReviewTarget? = null,
    val reviewBusy: Boolean = false,
    val reviewError: String? = null,
    val auction: com.dalilacom.app.data.network.AuctionDto? = null,
    val bidText: String = "",
    val bidding: Boolean = false,
    val shipPick: String? = null,
    val payPick: String = "COD",
    val address: String = "",
    val phone: String = "",
    val buying: Boolean = false,
    val purchased: Boolean = false,
    val placed: Boolean = false,
)

class StoreProductViewModel(
    private val store: StoreRepository,
    private val cart: CartRepository,
    private val auth: AuthRepository,
    private val reviews: com.dalilacom.app.data.repository.ReviewsRepository,
    private val productId: String,
) : ViewModel() {
    private val _ui = MutableStateFlow(StoreProductUi())
    val ui: StateFlow<StoreProductUi> = _ui.asStateFlow()

    init {
        viewModelScope.launch {
            val product = store.product(productId)
            _ui.value = StoreProductUi(loading = false, product = product, reviews = reviews.of("product", productId), auction = if (product?.auction != null) store.auction(productId) ?: product.auction else null, shipPick = product?.shipping?.singleOrNull()?.id)
            _ui.value = _ui.value.copy(bidText = "%.2f".format(java.util.Locale.US, (_ui.value.auction?.minNextBidCents ?: 0) / 100.0))
        }
    }

    /** Looks at the auction again: other people's bids, the end moving later, or the result once the time is up. */
    fun refreshAuction() {
        if (_ui.value.auction == null) return
        viewModelScope.launch {
            val next = store.auction(productId) ?: return@launch
            val old = _ui.value.auction
            val changed = old == null || old.bidCount != next.bidCount || old.endsAt != next.endsAt || old.status != next.status
            _ui.value = _ui.value.copy(auction = next, bidText = if (changed) "%.2f".format(java.util.Locale.US, next.minNextBidCents / 100.0) else _ui.value.bidText)
            if (old?.status != next.status) _ui.value = _ui.value.copy(product = store.product(productId) ?: _ui.value.product)
        }
    }

    fun setBid(v: String) { _ui.value = _ui.value.copy(bidText = v) }
    fun pickShip(id: String) { _ui.value = _ui.value.copy(shipPick = id) }
    fun pickPay(m: String) { _ui.value = _ui.value.copy(payPick = m) }
    fun setAddress(v: String) { _ui.value = _ui.value.copy(address = v) }
    fun setPhone(v: String) { _ui.value = _ui.value.copy(phone = v) }

    fun bid() {
        val cents = Math.round((_ui.value.bidText.replace(",", ".").toDoubleOrNull() ?: return) * 100).toInt()
        viewModelScope.launch {
            if (!auth.hasStoredSession()) { _ui.value = _ui.value.copy(needLogin = true); return@launch }
            _ui.value = _ui.value.copy(bidding = true, error = null, placed = false)
            store.placeBid(productId, cents)
                .onSuccess { _ui.value = _ui.value.copy(bidding = false, placed = true) }
                .onFailure { _ui.value = _ui.value.copy(bidding = false, error = it.message) }
            val next = store.auction(productId)
            if (next != null) _ui.value = _ui.value.copy(auction = next, bidText = "%.2f".format(java.util.Locale.US, next.minNextBidCents / 100.0))
        }
    }

    fun buyAuction() {
        val s = _ui.value
        val product = s.product ?: return
        when {
            product.shipping.isNotEmpty() && s.shipPick == null -> { _ui.value = s.copy(error = AppStrings.get(R.string.ship_pick_all)); return }
            s.address.trim().length < 5 || s.phone.trim().length < 6 -> { _ui.value = s.copy(error = AppStrings.get(R.string.auc_need_address)); return }
        }
        _ui.value = s.copy(buying = true, error = null)
        viewModelScope.launch {
            store.checkoutAuction(productId, com.dalilacom.app.data.network.AuctionCheckoutRequest(shippingId = s.shipPick, paymentMethod = s.payPick, address = s.address.trim(), phone = s.phone.trim()))
                .onSuccess { _ui.value = _ui.value.copy(buying = false, purchased = true, auction = store.auction(productId)) }
                .onFailure { _ui.value = _ui.value.copy(buying = false, error = it.message) }
        }
    }

    fun openReview(title: String) {
        val mine = _ui.value.reviews?.mine
        _ui.value = _ui.value.copy(reviewTarget = com.dalilacom.app.ui.common.ReviewTarget("product", productId, title, mine?.stars ?: 0, mine?.comment.orEmpty()), reviewError = null)
    }

    fun closeReview() { _ui.value = _ui.value.copy(reviewTarget = null) }

    fun sendReview(stars: Int, comment: String) {
        _ui.value = _ui.value.copy(reviewBusy = true, reviewError = null)
        viewModelScope.launch {
            reviews.send("product", productId, stars, comment)
                .onSuccess {
                    val product = store.product(productId)
                    _ui.value = _ui.value.copy(reviewBusy = false, reviewTarget = null, product = product ?: _ui.value.product, reviews = reviews.of("product", productId))
                }
                .onFailure { e -> _ui.value = _ui.value.copy(reviewBusy = false, reviewError = e.message) }
        }
    }

    fun moreReviews() {
        val current = _ui.value.reviews ?: return
        viewModelScope.launch {
            val next = reviews.of("product", productId, offset = current.items.size) ?: return@launch
            _ui.value = _ui.value.copy(reviews = current.copy(items = current.items + next.items))
        }
    }

    fun change(delta: Int) {
        val product = _ui.value.product ?: return
        val next = _ui.value.quantity + delta
        if (next in 1..product.stock) _ui.value = _ui.value.copy(quantity = next)
    }

    fun add(thenCart: Boolean) {
        viewModelScope.launch {
            if (!auth.hasStoredSession()) {
                _ui.value = _ui.value.copy(needLogin = true)
                return@launch
            }
            _ui.value = _ui.value.copy(adding = true, error = null)
            cart.addItem(productId, _ui.value.quantity)
                .onSuccess { _ui.value = _ui.value.copy(adding = false, added = true, goToCart = thenCart) }
                .onFailure { _ui.value = _ui.value.copy(adding = false, error = it.message) }
        }
    }

    fun consumeNeedLogin() {
        _ui.value = _ui.value.copy(needLogin = false)
    }

    fun consumeGoToCart() {
        _ui.value = _ui.value.copy(goToCart = false)
    }
}

/** The product pictures: swipe through them, with dots under the picture. */
@OptIn(androidx.compose.foundation.ExperimentalFoundationApi::class)
@Composable
private fun StoreGallery(product: StoreProductDto) {
    val photos = product.images.ifEmpty { listOfNotNull(product.imageUrl) }
    if (photos.size < 2) {
        StorePic(product, Modifier.fillMaxWidth().aspectRatio(1.1f), emojiSize = 130.sp)
        return
    }
    val pager = androidx.compose.foundation.pager.rememberPagerState { photos.size }
    Box(Modifier.fillMaxWidth().aspectRatio(1.1f)) {
        androidx.compose.foundation.pager.HorizontalPager(state = pager, modifier = Modifier.fillMaxSize()) { page ->
            coil.compose.AsyncImage(
                model = photos[page].let { if (it.startsWith("/")) com.dalilacom.app.data.network.absoluteUrl(it) else it },
                contentDescription = product.name,
                contentScale = androidx.compose.ui.layout.ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
            )
        }
        Row(Modifier.align(Alignment.BottomCenter).padding(bottom = 10.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            repeat(photos.size) { i ->
                Box(Modifier.size(if (i == pager.currentPage) 9.dp else 7.dp).background(androidx.compose.ui.graphics.Color.White.copy(alpha = if (i == pager.currentPage) 1f else 0.6f), androidx.compose.foundation.shape.CircleShape))
            }
        }
    }
}

@Composable
fun StoreProductScreen(
    container: AppContainer,
    productId: String,
    onBack: () -> Unit,
    onGoToCart: () -> Unit,
    onOpenProduct: (String) -> Unit,
    onOpenMerchant: (String) -> Unit,
    onLogin: () -> Unit,
) {
    val vm: StoreProductViewModel = viewModel(
        key = "store-product-$productId",
        factory = viewModelFactory { initializer { StoreProductViewModel(container.storeRepository, container.cartRepository, container.authRepository, container.reviewsRepository, productId) } },
    )
    val ui by vm.ui.collectAsState()
    LaunchedEffect(ui.needLogin) { if (ui.needLogin) { vm.consumeNeedLogin(); onLogin() } }
    ui.reviewTarget?.let { target -> com.dalilacom.app.ui.common.ReviewDialog(target, ui.reviewBusy, ui.reviewError, vm::sendReview, vm::closeReview) }
    LaunchedEffect(ui.goToCart) { if (ui.goToCart) { vm.consumeGoToCart(); onGoToCart() } }
    // while an auction is open its figures are looked at again every ten seconds
    LaunchedEffect(ui.auction?.status) { while (ui.auction?.status == "OPEN") { kotlinx.coroutines.delay(10_000); vm.refreshAuction() } }

    Column(Modifier.fillMaxSize()) {
        TextButton(onClick = onBack, modifier = Modifier.padding(start = 8.dp, top = 8.dp)) { Text("‹  " + stringResource(R.string.store_back)) }
        val product = ui.product
        when {
            ui.loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            product == null -> Text(stringResource(R.string.store_not_found), color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(16.dp))
            else -> Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                StoreGallery(product)
                Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    product.section?.let { Text("${it.icon} ${it.label()}", color = MaterialTheme.colorScheme.primary, fontSize = 13.sp) }
                    Text(product.name, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.ExtraBold)
                    StoreStars(product)
                    if (product.soldCount > 0) Text(stringResource(R.string.store_sold, product.soldCount), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp)
                    Box(Modifier.fillMaxWidth().background(androidx.compose.ui.graphics.Color(0x14FA6338), RoundedCornerShape(6.dp)).padding(12.dp)) { StorePrice(product, big = true) }
                    if (product.memberDiscountEnabled) Text("⭐ " + stringResource(R.string.store_member_price), fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                    product.description?.let { Text(it, style = MaterialTheme.typography.bodyLarge, lineHeight = 24.sp) }
                    if (product.specs.isNotEmpty() || product.condition != null) {
                        Surface(shape = RoundedCornerShape(8.dp), border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)) {
                            Column(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp)) {
                                product.condition?.let { c -> Row(Modifier.fillMaxWidth().padding(vertical = 7.dp)) { Text(stringResource(R.string.wiz_condition), Modifier.weight(1f), color = MaterialTheme.colorScheme.onSurfaceVariant); Text(stringResource(if (c == "USED") R.string.wiz_cond_used else R.string.wiz_cond_new), fontWeight = FontWeight.Bold) } }
                                product.specs.forEach { x -> Row(Modifier.fillMaxWidth().padding(vertical = 7.dp)) { Text(x.label, Modifier.weight(1f), color = MaterialTheme.colorScheme.onSurfaceVariant); Text(x.value, fontWeight = FontWeight.Bold) } }
                            }
                        }
                    }
                    // the seller: a card with the shop's logo that opens the shop
                    Row(
                        Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(MaterialTheme.colorScheme.surfaceVariant)
                            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(18.dp))
                            .clickable { onOpenMerchant(product.merchant.id) }.padding(horizontal = 14.dp, vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        com.dalilacom.app.ui.common.Avatar(product.merchant.name, size = 52.dp, imageUrl = product.merchant.avatarUrl)
                        Column(Modifier.weight(1f)) {
                            Text(stringResource(R.string.store_sold_by).trimEnd(':', '：', ' '), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
                            Text(product.merchant.name, fontWeight = FontWeight.ExtraBold, fontSize = 16.sp, maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis)
                        }
                        Text(stringResource(R.string.store_visit_shop) + (if (androidx.compose.ui.platform.LocalLayoutDirection.current == androidx.compose.ui.unit.LayoutDirection.Rtl) " ‹" else " ›"), fontWeight = FontWeight.ExtraBold, fontSize = 13.sp, color = MaterialTheme.colorScheme.onPrimary,
                            modifier = Modifier.clip(RoundedCornerShape(999.dp)).background(MaterialTheme.colorScheme.primary).padding(horizontal = 14.dp, vertical = 7.dp))
                    }
                    if (product.shipping.isNotEmpty()) {
                        Surface(shape = RoundedCornerShape(8.dp), border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)) {
                            Column(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp)) {
                                Text("🚚 " + stringResource(R.string.ship_title), fontWeight = FontWeight.Bold)
                                product.shipping.forEach { m ->
                                    Row(Modifier.fillMaxWidth().padding(top = 4.dp)) {
                                        Text(m.name, Modifier.weight(1f))
                                        Text(if (m.costCents > 0) formatCents(m.costCents) else stringResource(R.string.ship_free), fontWeight = FontWeight.Bold)
                                    }
                                }
                            }
                        }
                    }
                    if (product.auction != null) AuctionPanel(ui, product, vm)
                    else if (product.stock <= 0) Text(stringResource(R.string.store_unavailable), color = MaterialTheme.colorScheme.error)
                    else {
                        Text(
                            "✓ " + stringResource(R.string.store_stock_count, product.stock),
                            color = if (product.stock <= 5) MaterialTheme.colorScheme.error else androidx.compose.ui.graphics.Color(0xFF2E7D32),
                            fontWeight = FontWeight.Bold,
                        )
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            OutlinedButton(onClick = { vm.change(-1) }) { Text("−") }
                            Text("${ui.quantity}", modifier = Modifier.padding(horizontal = 18.dp), fontWeight = FontWeight.Bold)
                            OutlinedButton(onClick = { vm.change(1) }) { Text("+") }
                        }
                        Button(onClick = { vm.add(false) }, enabled = !ui.adding, shape = RoundedCornerShape(4.dp), colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.onSurface, contentColor = MaterialTheme.colorScheme.surface), modifier = Modifier.fillMaxWidth().height(50.dp)) { Text("🛒  " + stringResource(R.string.store_add)) }
                        OutlinedButton(onClick = { vm.add(true) }, enabled = !ui.adding, shape = RoundedCornerShape(4.dp), modifier = Modifier.fillMaxWidth().height(50.dp)) { Text(stringResource(R.string.store_buy_now)) }
                        if (ui.added) Text(stringResource(R.string.store_added_to_cart) + " ✓", color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
                    }
                    ui.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                }
                // ratings and comments: readable by anyone, writable by whoever received the product
                Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(stringResource(R.string.rv_title), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.ExtraBold)
                    ui.reviews?.let { rv ->
                        com.dalilacom.app.ui.common.ReviewSummaryView(rv.summary)
                        com.dalilacom.app.ui.common.ReviewActionView(rv.canReview, rv.mine != null) { vm.openReview(product.name) }
                        com.dalilacom.app.ui.common.ReviewListView(rv.items)
                        if (rv.items.size < rv.summary.count) OutlinedButton(onClick = vm::moreReviews, shape = RoundedCornerShape(6.dp)) { Text(stringResource(R.string.store_more)) }
                    }
                }
                StoreProductRow(stringResource(R.string.store_related), product.related, null, onOpenProduct) { onOpenProduct(it) }
            }
        }
    }
}

/** Bidding on an auction: the time left, the bid box, the latest bids; for the winner, the form that turns it into an order. */
@Composable
private fun AuctionPanel(ui: StoreProductUi, product: StoreProductDto, vm: StoreProductViewModel) {
    val a = ui.auction ?: return
    val open = a.status == "OPEN"
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        when {
            open -> {
                Text("⏳ " + stringResource(R.string.auc_ends_in) + " " + (com.dalilacom.app.ui.common.countdownText(a.endsAt) ?: ""), fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.error)
                if (a.youLead) Text("✓ " + stringResource(R.string.auc_you_lead), color = androidx.compose.ui.graphics.Color(0xFF2E7D32), fontWeight = FontWeight.Bold)
                androidx.compose.material3.OutlinedTextField(
                    value = ui.bidText, onValueChange = vm::setBid, singleLine = true,
                    label = { Text(stringResource(R.string.auc_your_bid) + " · " + stringResource(R.string.auc_min, formatCents(a.minNextBidCents))) },
                    keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = androidx.compose.ui.text.input.KeyboardType.Decimal),
                    modifier = Modifier.fillMaxWidth(),
                )
                Button(onClick = vm::bid, enabled = !ui.bidding, shape = RoundedCornerShape(4.dp), modifier = Modifier.fillMaxWidth().height(50.dp)) { Text("🔨  " + stringResource(R.string.auc_bid_btn)) }
                if (ui.placed) Text(stringResource(R.string.auc_placed) + " ✓", color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
                Text(stringResource(R.string.auc_rule), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
            }
            a.youWon && a.status == "WON" && !ui.purchased -> {
                Text("🎉 " + stringResource(R.string.auc_won), fontWeight = FontWeight.ExtraBold, color = androidx.compose.ui.graphics.Color(0xFF2E7D32))
                a.claimDeadline?.let { d -> Text(stringResource(R.string.auc_won_sub, runCatching { java.time.Instant.parse(d).atZone(java.time.ZoneId.systemDefault()).toLocalDate().toString() }.getOrDefault("")), color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp) }
                if (product.shipping.isNotEmpty()) {
                    Text("🚚 " + stringResource(R.string.auc_shipping), fontWeight = FontWeight.Bold)
                    product.shipping.forEach { m ->
                        Row(Modifier.fillMaxWidth().clickable { vm.pickShip(m.id) }, verticalAlignment = Alignment.CenterVertically) {
                            androidx.compose.material3.RadioButton(selected = ui.shipPick == m.id, onClick = { vm.pickShip(m.id) })
                            Text(m.name, Modifier.weight(1f))
                            Text(if (m.costCents > 0) formatCents(m.costCents) else stringResource(R.string.ship_free), fontWeight = FontWeight.Bold)
                        }
                    }
                }
                Text("💳 " + stringResource(R.string.auc_payment), fontWeight = FontWeight.Bold)
                val labels = mapOf("COD" to AppStrings.get(R.string.pay_cod), "BANK_ALSHAM" to AppStrings.get(R.string.s_20f44d7f), "SYRIATEL" to AppStrings.get(R.string.fit_auto_31d9b741), "MTN" to AppStrings.get(R.string.fit_auto_d79941c7))
                a.paymentMethods.ifEmpty { listOf("COD") }.forEach { m ->
                    Row(Modifier.fillMaxWidth().clickable { vm.pickPay(m) }, verticalAlignment = Alignment.CenterVertically) {
                        androidx.compose.material3.RadioButton(selected = ui.payPick == m, onClick = { vm.pickPay(m) })
                        Text(labels[m] ?: m)
                    }
                }
                androidx.compose.material3.OutlinedTextField(value = ui.address, onValueChange = vm::setAddress, label = { Text(stringResource(R.string.addr_title)) }, placeholder = { Text(stringResource(R.string.addr_ph)) }, minLines = 2, modifier = Modifier.fillMaxWidth())
                androidx.compose.material3.OutlinedTextField(value = ui.phone, onValueChange = vm::setPhone, label = { Text(stringResource(R.string.addr_phone)) }, singleLine = true, keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = androidx.compose.ui.text.input.KeyboardType.Phone), modifier = Modifier.fillMaxWidth())
                Button(onClick = vm::buyAuction, enabled = !ui.buying, shape = RoundedCornerShape(4.dp), modifier = Modifier.fillMaxWidth().height(50.dp)) { Text(stringResource(R.string.auc_buy, formatCents(a.currentBidCents))) }
            }
            a.youWon -> Text("✓ " + stringResource(R.string.auc_paid), color = androidx.compose.ui.graphics.Color(0xFF2E7D32), fontWeight = FontWeight.Bold)
            else -> Text(stringResource(if (a.bidCount > 0) R.string.auc_ended_sold else R.string.auc_ended_no_bids), color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (a.bids.isNotEmpty()) {
            Text(stringResource(R.string.auc_history), fontWeight = FontWeight.Bold)
            a.bids.forEach { b ->
                Row(Modifier.fillMaxWidth().background(if (b.mine) androidx.compose.ui.graphics.Color(0x24FA6338) else androidx.compose.ui.graphics.Color(0x14808080), RoundedCornerShape(6.dp)).padding(horizontal = 8.dp, vertical = 4.dp)) {
                    Text(formatCents(b.amountCents), Modifier.weight(1f), fontWeight = FontWeight.Bold)
                    Text((if (b.mine) stringResource(R.string.auc_you) else ""), fontSize = 12.sp)
                }
            }
        }
    }
}
