package com.dalilacom.app.ui.store

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
import com.dalilacom.app.data.AppContainer
import com.dalilacom.app.data.network.StoreProductDto
import com.dalilacom.app.data.repository.AuthRepository
import com.dalilacom.app.data.repository.CartRepository
import com.dalilacom.app.data.repository.StoreRepository
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
        viewModelScope.launch { _ui.value = StoreProductUi(loading = false, product = store.product(productId), reviews = reviews.of("product", productId)) }
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
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(stringResource(R.string.store_sold_by), color = MaterialTheme.colorScheme.onSurfaceVariant)
                        TextButton(onClick = { onOpenMerchant(product.merchant.id) }) { Text(product.merchant.name, fontWeight = FontWeight.Bold) }
                    }
                    if (product.stock <= 0) Text(stringResource(R.string.store_unavailable), color = MaterialTheme.colorScheme.error)
                    else {
                        Text(
                            if (product.stock <= 5) stringResource(R.string.store_last_pieces, product.stock) else "✓ " + stringResource(R.string.store_in_stock),
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
