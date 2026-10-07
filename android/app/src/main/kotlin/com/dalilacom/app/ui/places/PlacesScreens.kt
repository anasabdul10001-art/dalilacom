package com.dalilacom.app.ui.places

import com.dalilacom.app.R
import com.dalilacom.app.ui.i18n.AppStrings
import android.app.TimePickerDialog
import android.widget.Toast
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.dalilacom.app.data.network.HourRangeDto
import com.dalilacom.app.data.network.MerchantDto
import com.dalilacom.app.data.repository.MerchantRepository
import com.dalilacom.app.data.repository.PlacesRepository
import com.dalilacom.app.ui.ViewModelFactory
import com.dalilacom.app.ui.common.Avatar
import com.dalilacom.app.ui.common.DAY_LABEL
import com.dalilacom.app.ui.common.DAY_ORDER
import com.dalilacom.app.ui.common.OpenBadge
import com.dalilacom.app.ui.common.formatClock
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/* ---------------- saved places ---------------- */

data class FavoritesUiState(val isLoading: Boolean = true, val places: List<MerchantDto> = emptyList())

class FavoritesViewModel(private val places: PlacesRepository) : ViewModel() {
    private val _uiState = MutableStateFlow(FavoritesUiState())
    val uiState: StateFlow<FavoritesUiState> = _uiState.asStateFlow()

    init {
        refresh()
    }

    fun refresh() {
        viewModelScope.launch { _uiState.value = FavoritesUiState(isLoading = false, places = places.favorites()) }
    }

    fun remove(id: String) {
        _uiState.update { state -> state.copy(places = state.places.filterNot { it.id == id }) }
        viewModelScope.launch { places.setSaved(id, false) }
    }
}

@Composable
fun FavoritesScreen(factory: ViewModelFactory, onBack: () -> Unit, onMerchantClick: (String) -> Unit) {
    val viewModel: FavoritesViewModel = viewModel(factory = factory)
    val state by viewModel.uiState.collectAsState()
    LaunchedEffect(Unit) { viewModel.refresh() }

    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = onBack) { Text(AppStrings.get(R.string.s_69c86923)) }
            Text(AppStrings.get(R.string.s_0e1bedb9), style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.primary)
        }
        when {
            state.isLoading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            state.places.isEmpty() -> Text(
                AppStrings.get(R.string.s_f90ad780),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(24.dp),
            )
            else -> LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                items(state.places, key = { it.id }) { place ->
                    Surface(
                        shape = RoundedCornerShape(18.dp),
                        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                        modifier = Modifier.fillMaxWidth().clickable { onMerchantClick(place.id) },
                    ) {
                        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                            Avatar(place.businessName, imageUrl = place.avatarUrl)
                            Spacer(Modifier.width(12.dp))
                            Column(Modifier.weight(1f)) {
                                Text(place.businessName, style = MaterialTheme.typography.titleMedium)
                                place.category?.let { Text(it.name, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                                if (place.openStatus?.hasHours == true) {
                                    Spacer(Modifier.height(6.dp))
                                    OpenBadge(place.openStatus)
                                }
                            }
                            IconButton(onClick = { viewModel.remove(place.id) }) {
                                Icon(Icons.Filled.Favorite, contentDescription = AppStrings.get(R.string.s_b257b4e1), tint = MaterialTheme.colorScheme.primary)
                            }
                        }
                    }
                }
            }
        }
    }
}

/* ---------------- merchant: opening hours ---------------- */

data class DayEdit(val on: Boolean = false, val open: String = "09:00", val close: String = "22:00")

data class HoursUiState(
    val isLoading: Boolean = true,
    val isSaving: Boolean = false,
    val days: Map<String, DayEdit> = DAY_ORDER.associateWith { DayEdit() },
    val message: String? = null,
)

class HoursViewModel(private val merchants: MerchantRepository, private val places: PlacesRepository) : ViewModel() {
    private val _uiState = MutableStateFlow(HoursUiState())
    val uiState: StateFlow<HoursUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            val stored = merchants.getMerchantMe()?.openingHours.orEmpty()
            val days = DAY_ORDER.associateWith { day ->
                val first = stored[day]?.firstOrNull()
                if (first != null) DayEdit(true, first.open, first.close) else DayEdit()
            }
            _uiState.value = HoursUiState(isLoading = false, days = days)
        }
    }

    private fun change(day: String, edit: (DayEdit) -> DayEdit) =
        _uiState.update { it.copy(days = it.days + (day to edit(it.days.getValue(day))), message = null) }

    fun setOn(day: String, on: Boolean) = change(day) { it.copy(on = on) }
    fun setOpen(day: String, time: String) = change(day) { it.copy(open = time) }
    fun setClose(day: String, time: String) = change(day) { it.copy(close = time) }

    fun copyFirstOpenDayToAll() {
        val first = DAY_ORDER.map { _uiState.value.days.getValue(it) }.firstOrNull { it.on }
        if (first == null) {
            _uiState.update { it.copy(message = AppStrings.get(R.string.s_f1b27ce2)) }
            return
        }
        _uiState.update { it.copy(days = DAY_ORDER.associateWith { first.copy(on = true) }, message = null) }
    }

    fun save() {
        val hours = DAY_ORDER.mapNotNull { day ->
            val x = _uiState.value.days.getValue(day)
            if (x.on) day to listOf(HourRangeDto(x.open, x.close)) else null
        }.toMap()
        viewModelScope.launch {
            _uiState.update { it.copy(isSaving = true, message = null) }
            val result = places.setHours(hours.ifEmpty { null })
            _uiState.update { it.copy(isSaving = false, message = result.exceptionOrNull()?.message ?: AppStrings.get(R.string.s_e172f208)) }
        }
    }
}

@Composable
fun HoursScreen(factory: ViewModelFactory, onBack: () -> Unit) {
    val viewModel: HoursViewModel = viewModel(factory = factory)
    val state by viewModel.uiState.collectAsState()
    val context = LocalContext.current

    fun pickTime(current: String, onPicked: (String) -> Unit) {
        TimePickerDialog(
            context,
            { _, hour, minute -> onPicked("%02d:%02d".format(hour, minute)) },
            current.take(2).toIntOrNull() ?: 9,
            current.drop(3).take(2).toIntOrNull() ?: 0,
            true,
        ).show()
    }

    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = onBack) { Text(AppStrings.get(R.string.s_69c86923)) }
            Text(AppStrings.get(R.string.s_0be90459), style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.primary)
        }
        if (state.isLoading) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            return@Column
        }
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp)) {
            Text(
                AppStrings.get(R.string.s_2f1a3ab7),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(12.dp))
            DAY_ORDER.forEach { day ->
                val x = state.days.getValue(day)
                Surface(
                    shape = RoundedCornerShape(16.dp),
                    border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                    modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                ) {
                    Column(Modifier.padding(12.dp)) {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                            Text(DAY_LABEL[day].orEmpty(), style = MaterialTheme.typography.titleSmall)
                            Switch(checked = x.on, onCheckedChange = { viewModel.setOn(day, it) })
                        }
                        if (x.on) {
                            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.padding(top = 6.dp)) {
                                OutlinedButton(onClick = { pickTime(x.open) { viewModel.setOpen(day, it) } }, modifier = Modifier.weight(1f)) { Text(AppStrings.get(R.string.fmt_from, formatClock(x.open))) }
                                OutlinedButton(onClick = { pickTime(x.close) { viewModel.setClose(day, it) } }, modifier = Modifier.weight(1f)) { Text(AppStrings.get(R.string.fmt_to, formatClock(x.close))) }
                            }
                        } else {
                            Text(AppStrings.get(R.string.s_d59687ba), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }
            Spacer(Modifier.height(12.dp))
            OutlinedButton(onClick = viewModel::copyFirstOpenDayToAll, modifier = Modifier.fillMaxWidth()) { Text(AppStrings.get(R.string.s_bb31982c)) }
            Spacer(Modifier.height(8.dp))
            Button(onClick = viewModel::save, enabled = !state.isSaving, shape = RoundedCornerShape(14.dp), modifier = Modifier.fillMaxWidth().height(52.dp)) {
                Text(AppStrings.get(R.string.s_222d012d))
            }
            state.message?.let {
                Spacer(Modifier.height(8.dp))
                Text(it, color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.bodyMedium)
            }
        }
    }
}
