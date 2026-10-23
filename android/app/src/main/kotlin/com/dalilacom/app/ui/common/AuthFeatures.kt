package com.dalilacom.app.ui.common

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedCard
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.dalilacom.app.R

/** What an account gives today (discount card, offering discounts, online store, place on the map): only what is built. */
@Composable
fun AuthFeatures(modifier: Modifier = Modifier) {
    val rows = listOf(
        Triple(R.string.auth_feat_1_icon, R.string.auth_feat_1_t, R.string.auth_feat_1_s),
        Triple(R.string.auth_feat_2_icon, R.string.auth_feat_2_t, R.string.auth_feat_2_s),
        Triple(R.string.auth_feat_3_icon, R.string.auth_feat_3_t, R.string.auth_feat_3_s),
        Triple(R.string.auth_feat_4_icon, R.string.auth_feat_4_t, R.string.auth_feat_4_s),
    )
    OutlinedCard(modifier = modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(stringResource(R.string.auth_feat_title), style = MaterialTheme.typography.titleSmall)
            rows.forEach { (icon, title, sub) ->
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.Top) {
                    Text(stringResource(icon), fontSize = 22.sp)
                    Column {
                        Text(stringResource(title), style = MaterialTheme.typography.titleSmall)
                        Text(stringResource(sub), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }
    }
}
