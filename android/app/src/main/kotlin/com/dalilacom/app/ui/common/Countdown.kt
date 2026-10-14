package com.dalilacom.app.ui.common

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.ui.res.stringResource
import com.dalilacom.app.R
import kotlinx.coroutines.delay
import java.time.Instant

/** The time left until [endIso] as "2 days 03:12:45", ticking every second; null when there is no end date. */
@Composable
fun countdownText(endIso: String?): String? {
    val end = remember(endIso) { endIso?.let { runCatching { Instant.parse(it).toEpochMilli() }.getOrNull() } } ?: return null
    val left by produceState(initialValue = end - System.currentTimeMillis(), end) {
        while (true) { value = end - System.currentTimeMillis(); delay(1000) }
    }
    if (left <= 0) return stringResource(R.string.cd_ended)
    val total = left / 1000
    val days = total / 86400
    val clock = String.format("%02d:%02d:%02d", (total % 86400) / 3600, (total % 3600) / 60, total % 60)
    return if (days > 0) stringResource(R.string.cd_days, days.toInt(), clock) else clock
}
