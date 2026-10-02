package com.dalilacom.app.ui.card

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.dalilacom.app.ui.ViewModelFactory
import com.dalilacom.app.ui.common.QrCodeImage
import com.dalilacom.app.ui.theme.DeepRed
import com.dalilacom.app.ui.theme.PrimaryRed

@Composable
fun CardScreen(factory: ViewModelFactory) {
    val viewModel: CardViewModel = viewModel(factory = factory)
    val state by viewModel.uiState.collectAsState()

    Box(modifier = Modifier.fillMaxSize()) {
        when {
            state.isLoading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
            state.memberNumber == null -> NoMembershipContent(state, onSubscribe = viewModel::subscribe)
            else -> MembershipCardContent(state)
        }
    }
}

@Composable
private fun NoMembershipContent(state: CardUiState, onSubscribe: (String) -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text("ما عندك عضوية بعد", style = MaterialTheme.typography.titleLarge)
        Spacer(Modifier.height(8.dp))
        Text("اشترك بخطة عشان تفعّل بطاقتك الرقمية", style = MaterialTheme.typography.bodyMedium)
        Spacer(Modifier.height(20.dp))

        LazyColumn(modifier = Modifier.fillMaxWidth()) {
            items(state.availablePlans) { plan ->
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 6.dp),
                ) {
                    Column(Modifier.padding(16.dp)) {
                        Text(plan.name, style = MaterialTheme.typography.titleMedium)
                        Text("${plan.durationDays} يوم — ${plan.priceCents / 100.0} ${plan.currency}")
                        Spacer(Modifier.height(8.dp))
                        Button(onClick = { onSubscribe(plan.id) }) { Text("اشترك") }
                    }
                }
            }
        }

        state.error?.let {
            Spacer(Modifier.height(12.dp))
            Text(it, color = MaterialTheme.colorScheme.error)
        }
    }
}

@Composable
private fun MembershipCardContent(state: CardUiState) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(20.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Top,
    ) {
        Text("بطاقتي", style = MaterialTheme.typography.headlineSmall, color = PrimaryRed)
        Spacer(Modifier.height(16.dp))

        Card(
            shape = RoundedCornerShape(20.dp),
            elevation = CardDefaults.cardElevation(defaultElevation = 6.dp),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Column(
                modifier = Modifier
                    .background(Brush.verticalGradient(listOf(DeepRed, PrimaryRed)))
                    .fillMaxWidth()
                    .padding(24.dp),
            ) {
                Text("DALILACOM MEMBER", color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(20.dp))
                Text("Member ID", color = Color.White.copy(alpha = 0.7f), fontSize = 11.sp)
                Text(state.memberNumber.orEmpty(), color = Color.White, fontSize = 20.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(12.dp))
                Text("Valid Until", color = Color.White.copy(alpha = 0.7f), fontSize = 11.sp)
                Text(state.validUntil?.take(10).orEmpty(), color = Color.White, fontSize = 14.sp)
            }
        }

        Spacer(Modifier.height(28.dp))

        state.code?.let { code ->
            QrCodeImage(
                content = "${state.memberNumber.orEmpty()}:$code",
                modifier = Modifier.size(200.dp),
            )
            Spacer(Modifier.height(16.dp))
            Text("الكود الحالي", style = MaterialTheme.typography.bodyMedium)
            Spacer(Modifier.height(8.dp))
            Text(
                text = code.chunked(1).joinToString(" "),
                fontSize = 36.sp,
                fontWeight = FontWeight.Bold,
                color = PrimaryRed,
            )
            Spacer(Modifier.height(8.dp))
            Text("بيتجدد خلال ${state.secondsRemaining} ثانية", style = MaterialTheme.typography.bodySmall)
        }

        state.error?.let {
            Spacer(Modifier.height(12.dp))
            Text(it, color = MaterialTheme.colorScheme.error)
        }
    }
}
