package com.dalilacom.app.ui.store

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.dalilacom.app.R
import com.dalilacom.app.data.AppContainer
import com.dalilacom.app.data.network.AdPackageDto
import com.dalilacom.app.data.network.MyAdDto
import com.dalilacom.app.data.network.ProductDto
import com.dalilacom.app.data.repository.ProductRepository
import com.dalilacom.app.data.repository.StoreRepository
import com.dalilacom.app.ui.i18n.AppStrings
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.ZoneId

/* ---------------- renting a space ---------------- */

data class AdBookUi(
    val loading: Boolean = true,
    val packages: List<AdPackageDto> = emptyList(),
    val creditName: String = "",
    val balance: Int = 0,
    val autoApprove: Boolean = false,
    val products: List<ProductDto> = emptyList(),
    val productId: String = "",
    val days: Int = 0,
    val startDay: Int = 0, // 0 = now, 1 = tomorrow ...
    val busy: Boolean = false,
    val error: String? = null,
    val done: Boolean = false,
)

class AdBookViewModel(private val store: StoreRepository, private val products: ProductRepository) : ViewModel() {
    private val _ui = MutableStateFlow(AdBookUi())
    val ui: StateFlow<AdBookUi> = _ui.asStateFlow()

    init {
        viewModelScope.launch {
            val pk = store.adPackages()
            val mine = products.getMyProducts().filter { it.isActive && it.stock > 0 }
            _ui.value = AdBookUi(
                loading = false,
                packages = pk?.packages?.sortedBy { it.days }.orEmpty(),
                creditName = pk?.creditName.orEmpty(),
                balance = pk?.balance ?: 0,
                autoApprove = pk?.autoApprove ?: false,
                products = mine,
                days = pk?.packages?.minByOrNull { it.days }?.days ?: 0,
            )
        }
    }

    fun pickProduct(id: String) = _ui.update { it.copy(productId = id) }
    fun pickDays(days: Int) = _ui.update { it.copy(days = days) }
    fun pickStart(day: Int) = _ui.update { it.copy(startDay = day) }

    fun book() {
        val s = _ui.value
        if (s.productId.isBlank() || s.days == 0 || s.busy) return
        _ui.update { it.copy(busy = true, error = null) }
        val start = if (s.startDay == 0) null else LocalDate.now().plusDays(s.startDay.toLong()).atStartOfDay(ZoneId.systemDefault()).toInstant().toString()
        viewModelScope.launch {
            store.bookAd(s.productId, s.days, start)
                .onSuccess { _ui.update { it.copy(busy = false, done = true) } }
                .onFailure { e -> _ui.update { it.copy(busy = false, error = e.message) } }
        }
    }
}

@Composable
fun AdBookScreen(container: AppContainer, onBack: () -> Unit, onWallet: () -> Unit, onMyAds: () -> Unit) {
    val vm: AdBookViewModel = viewModel(factory = viewModelFactory { initializer { AdBookViewModel(container.storeRepository, container.productRepository) } })
    val ui by vm.ui.collectAsState()
    Column(Modifier.fillMaxSize()) {
        TextButton(onClick = onBack, modifier = Modifier.padding(start = 8.dp, top = 8.dp)) { Text("‹  " + stringResource(R.string.store_back)) }
        if (ui.loading) { Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }; return@Column }
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp).padding(bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(stringResource(R.string.ads_book_title), style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.ExtraBold)
            if (ui.done) {
                Surface(shape = RoundedCornerShape(10.dp), color = MaterialTheme.colorScheme.primaryContainer) {
                    Text(stringResource(if (ui.autoApprove) R.string.ads_done_live else R.string.ads_done_waiting), modifier = Modifier.padding(14.dp), color = MaterialTheme.colorScheme.onPrimaryContainer)
                }
                Button(onClick = onMyAds, shape = RoundedCornerShape(4.dp), modifier = Modifier.fillMaxWidth().height(48.dp)) { Text(stringResource(R.string.profile_my_ads)) }
                return@Column
            }
            Text(stringResource(R.string.ads_book_sub), color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (ui.products.isEmpty()) { Text(stringResource(R.string.ads_no_products), color = MaterialTheme.colorScheme.error); return@Column }

            Text(stringResource(R.string.ads_pick_product), fontWeight = FontWeight.Bold)
            var productOpen by remember { mutableStateOf(false) }
            Box {
                OutlinedButton(onClick = { productOpen = true }, shape = RoundedCornerShape(8.dp), modifier = Modifier.fillMaxWidth()) {
                    Text(ui.products.firstOrNull { it.id == ui.productId }?.name ?: "—", maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                DropdownMenu(expanded = productOpen, onDismissRequest = { productOpen = false }) {
                    ui.products.forEach { p -> DropdownMenuItem(text = { Text(p.name) }, onClick = { vm.pickProduct(p.id); productOpen = false }) }
                }
            }

            Text(stringResource(R.string.ads_pick_days), fontWeight = FontWeight.Bold)
            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                items(ui.packages, key = { it.days }) { p ->
                    val on = ui.days == p.days
                    Surface(
                        onClick = { vm.pickDays(p.days) },
                        shape = RoundedCornerShape(10.dp),
                        border = BorderStroke(2.dp, if (on) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant),
                        color = if (on) MaterialTheme.colorScheme.primary.copy(alpha = 0.08f) else MaterialTheme.colorScheme.surface,
                    ) {
                        Column(Modifier.padding(horizontal = 18.dp, vertical = 12.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                            Text(stringResource(R.string.ads_days_n, p.days), fontWeight = FontWeight.ExtraBold)
                            Text("${p.credits} ${ui.creditName}", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }

            Text(stringResource(R.string.ads_pick_start), fontWeight = FontWeight.Bold)
            var startOpen by remember { mutableStateOf(false) }
            Box {
                OutlinedButton(onClick = { startOpen = true }, shape = RoundedCornerShape(8.dp), modifier = Modifier.fillMaxWidth()) { Text(startLabel(ui.startDay)) }
                DropdownMenu(expanded = startOpen, onDismissRequest = { startOpen = false }) {
                    (0..7).forEach { d -> DropdownMenuItem(text = { Text(startLabel(d)) }, onClick = { vm.pickStart(d); startOpen = false }) }
                }
            }

            val chosen = ui.packages.firstOrNull { it.days == ui.days }
            val enough = chosen == null || ui.balance >= chosen.credits
            Surface(shape = RoundedCornerShape(10.dp), color = MaterialTheme.colorScheme.surface, border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)) {
                Column(Modifier.fillMaxWidth().padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Row { Text(stringResource(R.string.ads_your_balance), Modifier.weight(1f)); Text("${ui.balance} ${ui.creditName}", fontWeight = FontWeight.Bold) }
                    if (chosen != null) Row { Text(stringResource(R.string.ads_price), Modifier.weight(1f)); Text("${chosen.credits} ${ui.creditName}", fontWeight = FontWeight.ExtraBold, color = MaterialTheme.colorScheme.primary) }
                    if (!ui.autoApprove) Text(stringResource(R.string.ads_review_note), fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            ui.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            if (!enough) OutlinedButton(onClick = onWallet, shape = RoundedCornerShape(4.dp), modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.ads_top_up)) }
            Button(
                onClick = vm::book,
                enabled = ui.productId.isNotBlank() && ui.days != 0 && !ui.busy && enough,
                shape = RoundedCornerShape(4.dp),
                modifier = Modifier.fillMaxWidth().height(50.dp),
            ) { Text(stringResource(if (ui.busy) R.string.ads_booking else R.string.ads_book)) }
        }
    }
}

@Composable
private fun startLabel(day: Int): String = when (day) {
    0 -> stringResource(R.string.ads_start_now)
    1 -> stringResource(R.string.ads_tomorrow)
    else -> LocalDate.now().plusDays(day.toLong()).let { d -> d.dayOfWeek.getDisplayName(java.time.format.TextStyle.FULL, java.util.Locale(AppStrings.language)) + " " + d.dayOfMonth + "/" + d.monthValue }
}

/* ---------------- my ads ---------------- */

data class MyAdsUi(val loading: Boolean = true, val ads: List<MyAdDto> = emptyList(), val message: String? = null)

class MyAdsViewModel(private val store: StoreRepository) : ViewModel() {
    private val _ui = MutableStateFlow(MyAdsUi())
    val ui: StateFlow<MyAdsUi> = _ui.asStateFlow()

    init { load() }

    fun load() {
        viewModelScope.launch { _ui.value = MyAdsUi(loading = false, ads = store.myAds()) }
    }

    fun cancel(id: String) {
        viewModelScope.launch {
            store.cancelAd(id).onFailure { e -> _ui.update { it.copy(message = e.message) } }
            load()
        }
    }
}

@Composable
fun MyAdsScreen(container: AppContainer, onBack: () -> Unit, onBook: () -> Unit) {
    val vm: MyAdsViewModel = viewModel(factory = viewModelFactory { initializer { MyAdsViewModel(container.storeRepository) } })
    val ui by vm.ui.collectAsState()
    Column(Modifier.fillMaxSize()) {
        TextButton(onClick = onBack, modifier = Modifier.padding(start = 8.dp, top = 8.dp)) { Text("‹  " + stringResource(R.string.store_back)) }
        Text(stringResource(R.string.profile_my_ads), style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.ExtraBold, modifier = Modifier.padding(horizontal = 16.dp))
        Button(onClick = onBook, shape = RoundedCornerShape(4.dp), modifier = Modifier.padding(16.dp).fillMaxWidth().height(46.dp)) { Text("📢  " + stringResource(R.string.ads_book_cta)) }
        if (ui.loading) { Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }; return@Column }
        ui.message?.let { Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(horizontal = 16.dp)) }
        if (ui.ads.isEmpty()) Text(stringResource(R.string.ads_none), color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(16.dp))
        LazyColumn(contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 16.dp, vertical = 4.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            items(ui.ads, key = { it.id }) { ad ->
                Surface(shape = RoundedCornerShape(12.dp), border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)) {
                    Column(Modifier.fillMaxWidth().padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(ad.product.name, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(adStateLabel(ad.state), fontSize = 12.sp, fontWeight = FontWeight.Bold, color = if (ad.state == "LIVE") androidx.compose.ui.graphics.Color(0xFF1E8A3A) else MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        Text(stringResource(R.string.ads_days_n, ad.days) + " · " + ad.startsAt.take(10) + " → " + ad.endsAt.take(10) + " · ${ad.credits}", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text("👁 ${ad.impressions}   👆 ${ad.clicks}", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        ad.rejectionReason?.let { Text(it, fontSize = 12.sp) }
                        if (ad.state == "PENDING") OutlinedButton(onClick = { vm.cancel(ad.id) }, shape = RoundedCornerShape(4.dp)) { Text(stringResource(R.string.ads_cancel)) }
                    }
                }
            }
        }
    }
}

@Composable
private fun adStateLabel(state: String): String = stringResource(
    when (state) {
        "LIVE" -> R.string.ads_state_live
        "SCHEDULED" -> R.string.ads_state_scheduled
        "ENDED" -> R.string.ads_state_ended
        "REJECTED" -> R.string.ads_state_rejected
        "CANCELLED" -> R.string.ads_state_cancelled
        else -> R.string.ads_state_pending
    },
)
