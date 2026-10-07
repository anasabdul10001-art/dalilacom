package com.dalilacom.app.ui.merchantmode

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.dalilacom.app.R
import com.dalilacom.app.data.network.BroadcastDto
import com.dalilacom.app.data.network.BroadcastRequest
import com.dalilacom.app.data.network.DiscountDto
import com.dalilacom.app.data.network.ProductDto
import com.dalilacom.app.data.repository.BroadcastRepository
import com.dalilacom.app.data.repository.MerchantRepository
import com.dalilacom.app.data.repository.ProductRepository
import com.dalilacom.app.ui.ViewModelFactory
import com.dalilacom.app.ui.common.parseDecimal
import com.dalilacom.app.ui.i18n.AppStrings
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class PromoUiState(
    val isLoading: Boolean = true,
    val followers: Boolean = false,
    val radius: String = "5",
    val title: String = "",
    val body: String = "",
    val productId: String? = null,
    val discountId: String? = null,
    val products: List<ProductDto> = emptyList(),
    val discounts: List<DiscountDto> = emptyList(),
    val history: List<BroadcastDto> = emptyList(),
    val info: String? = null,
    /** Set after the first press when this announcement is paid: the second press confirms the charge. */
    val confirmPrice: Int? = null,
    val error: String? = null,
    val busy: Boolean = false,
)

class PromoViewModel(
    private val broadcasts: BroadcastRepository,
    private val merchants: MerchantRepository,
    private val products: ProductRepository,
) : ViewModel() {
    private val _uiState = MutableStateFlow(PromoUiState())
    val uiState: StateFlow<PromoUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            val me = merchants.getMerchantMe()
            _uiState.update {
                it.copy(
                    isLoading = false,
                    discounts = me?.discounts.orEmpty(),
                    products = products.getMyProducts().filter { p -> p.isActive },
                    history = broadcasts.history(),
                )
            }
        }
    }

    fun onRadius(value: String) = _uiState.update { it.copy(radius = value, error = null) }
    fun onFollowers(on: Boolean) = _uiState.update { it.copy(followers = on, error = null, info = null) }
    fun onTitle(value: String) = _uiState.update { it.copy(title = value, error = null) }
    fun onBody(value: String) = _uiState.update { it.copy(body = value, error = null) }
    fun pickProduct(id: String?) = _uiState.update { it.copy(productId = if (it.productId == id) null else id) }
    fun pickDiscount(id: String?) = _uiState.update { it.copy(discountId = if (it.discountId == id) null else id) }

    private fun radiusKm(): Double? = _uiState.value.radius.parseDecimal()?.takeIf { it > 0 }

    /** Followers need no distance; around the shop does. */
    private fun distanceMissing(): Boolean = !_uiState.value.followers && radiusKm() == null

    fun preview() {
        if (distanceMissing()) return _uiState.update { it.copy(error = AppStrings.get(R.string.promo_enter_radius)) }
        viewModelScope.launch {
            _uiState.update { it.copy(busy = true, error = null) }
            broadcasts.preview(radiusKm(), _uiState.value.followers)
                .onSuccess { r ->
                    val cost = if (r.price > 0) " — " + AppStrings.get(R.string.fmt_promo_cost, r.price, r.balance ?: 0) else ""
                    _uiState.update { it.copy(busy = false, info = AppStrings.get(R.string.fmt_promo_count, r.count, r.remainingThisMonth ?: 0, r.limit ?: 0) + cost) }
                }
                .onFailure { e -> _uiState.update { it.copy(busy = false, info = null, error = e.message) } }
        }
    }

    fun send() {
        val state = _uiState.value
        if (distanceMissing()) return _uiState.update { it.copy(error = AppStrings.get(R.string.promo_enter_radius)) }
        if (state.title.isBlank() || state.body.isBlank()) return _uiState.update { it.copy(error = AppStrings.get(R.string.promo_enter_text)) }
        viewModelScope.launch {
            _uiState.update { it.copy(busy = true, error = null) }
            // Beyond the plan's included announcements each one is paid from the wallet: say so, and charge on the second press.
            val price = broadcasts.preview(radiusKm(), state.followers).getOrNull()?.price ?: 0
            if (price > 0 && state.confirmPrice != price) {
                _uiState.update { it.copy(busy = false, confirmPrice = price, info = AppStrings.get(R.string.fmt_promo_confirm_pay, price)) }
                return@launch
            }
            _uiState.update { it.copy(confirmPrice = null) }
            broadcasts.send(BroadcastRequest(state.title.trim(), state.body.trim(), radiusKm = if (state.followers) null else radiusKm(), followers = if (state.followers) true else null, productId = state.productId, discountId = state.discountId))
                .onSuccess { r ->
                    val rejected = r.status == "REJECTED"
                    _uiState.update {
                        it.copy(
                            busy = false,
                            info = if (rejected) AppStrings.get(R.string.fmt_promo_rejected_now, r.reasons.joinToString(" — ")) else AppStrings.get(R.string.promo_sent_for_review),
                            title = if (rejected) it.title else "",
                            body = if (rejected) it.body else "",
                            productId = if (rejected) it.productId else null,
                            discountId = if (rejected) it.discountId else null,
                            history = emptyList(),
                        )
                    }
                    _uiState.update { it.copy(history = broadcasts.history()) }
                }
                .onFailure { e -> _uiState.update { it.copy(busy = false, info = null, error = e.message) } }
        }
    }
}

@Composable
fun PromoScreen(factory: ViewModelFactory) {
    val viewModel: PromoViewModel = viewModel(factory = factory)
    val state by viewModel.uiState.collectAsState()

    LazyColumn(Modifier.fillMaxSize(), contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item {
            Text(AppStrings.get(R.string.promo_title), style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.primary)
            Text(AppStrings.get(R.string.promo_sub), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChip(selected = !state.followers, onClick = { viewModel.onFollowers(false) }, label = { Text(AppStrings.get(R.string.promo_audience_radius)) })
                FilterChip(selected = state.followers, onClick = { viewModel.onFollowers(true) }, label = { Text(AppStrings.get(R.string.promo_audience_followers)) })
            }
        }
        if (!state.followers) item {
            OutlinedTextField(
                state.radius, viewModel::onRadius, label = { Text(AppStrings.get(R.string.promo_radius)) }, singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), modifier = Modifier.fillMaxWidth(),
            )
        }
        item { OutlinedTextField(state.title, viewModel::onTitle, label = { Text(AppStrings.get(R.string.promo_title_label)) }, singleLine = true, modifier = Modifier.fillMaxWidth()) }
        item { OutlinedTextField(state.body, viewModel::onBody, label = { Text(AppStrings.get(R.string.promo_body_label)) }, minLines = 3, modifier = Modifier.fillMaxWidth()) }
        if (state.products.isNotEmpty()) item {
            Text(AppStrings.get(R.string.promo_attach_product), style = MaterialTheme.typography.labelLarge)
            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                items(state.products, key = { it.id }) { p -> FilterChip(selected = state.productId == p.id, onClick = { viewModel.pickProduct(p.id) }, label = { Text(p.name) }) }
            }
        }
        if (state.discounts.isNotEmpty()) item {
            Text(AppStrings.get(R.string.promo_attach_offer), style = MaterialTheme.typography.labelLarge)
            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                items(state.discounts, key = { it.id }) { d -> FilterChip(selected = state.discountId == d.id, onClick = { viewModel.pickDiscount(d.id) }, label = { Text("${d.title} — ${d.percent}%") }) }
            }
        }
        item {
            state.info?.let { Text(it, color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.bodyMedium) }
            state.error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium) }
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = viewModel::preview, enabled = !state.busy) { Text(AppStrings.get(R.string.promo_preview_btn)) }
                Button(onClick = viewModel::send, enabled = !state.busy) { Text(AppStrings.get(R.string.promo_send_btn)) }
            }
        }
        item { Text(AppStrings.get(R.string.promo_history), style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 10.dp)) }
        if (state.history.isEmpty()) item { Text(AppStrings.get(R.string.promo_empty), color = MaterialTheme.colorScheme.onSurfaceVariant) }
        items(state.history, key = { it.id }) { b -> HistoryRow(b) }
    }
}

@Composable
private fun HistoryRow(b: BroadcastDto) {
    val status = when (b.status) {
        "SENT" -> AppStrings.get(R.string.promo_status_sent)
        "REJECTED" -> AppStrings.get(R.string.promo_status_rejected)
        else -> AppStrings.get(R.string.promo_status_pending)
    }
    Surface(shape = RoundedCornerShape(14.dp), border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant), modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(b.title, style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f))
                Text(status, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
            }
            Text(b.body, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (b.status == "SENT") Text(AppStrings.get(R.string.fmt_promo_reached, b.delivered), style = MaterialTheme.typography.bodySmall)
            if (b.creditsCharged > 0) Text(AppStrings.get(if (b.status == "REJECTED") R.string.fmt_promo_refunded else R.string.fmt_promo_paid, b.creditsCharged), style = MaterialTheme.typography.bodySmall)
            if (b.status == "REJECTED" && !b.reviewNote.isNullOrBlank()) {
                Spacer(Modifier.height(2.dp))
                Text(AppStrings.get(R.string.fmt_promo_reason, b.reviewNote), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
            }
        }
    }
}
