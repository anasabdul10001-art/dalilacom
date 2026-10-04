package com.dalilacom.app.ui.profile

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.dalilacom.app.data.repository.ProfileRepository
import com.dalilacom.app.ui.ViewModelFactory
import com.dalilacom.app.ui.common.Avatar
import com.dalilacom.app.ui.common.ImageUtil
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

data class ProfileEditUiState(
    val isLoading: Boolean = true,
    val isBusy: Boolean = false,
    val fullName: String = "",
    val bio: String = "",
    val avatarUrl: String? = null,
    val message: String? = null,
    val isError: Boolean = false,
)

class ProfileEditViewModel(private val profiles: ProfileRepository) : ViewModel() {
    private val _uiState = MutableStateFlow(ProfileEditUiState())
    val uiState: StateFlow<ProfileEditUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            val me = profiles.me()
            _uiState.value = if (me == null) {
                ProfileEditUiState(isLoading = false, message = "تعذّر تحميل ملفك الشخصي", isError = true)
            } else {
                ProfileEditUiState(isLoading = false, fullName = me.fullName, bio = me.bio.orEmpty(), avatarUrl = me.avatarUrl)
            }
        }
    }

    fun onName(value: String) = _uiState.update { it.copy(fullName = value, message = null) }
    fun onBio(value: String) = _uiState.update { it.copy(bio = value.take(500), message = null) }

    fun save() {
        val s = _uiState.value
        if (s.fullName.trim().length < 2) {
            _uiState.update { it.copy(message = "اكتب اسمك", isError = true) }
            return
        }
        viewModelScope.launch {
            _uiState.update { it.copy(isBusy = true, message = null) }
            val result = profiles.update(s.fullName, s.bio)
            _uiState.update { it.copy(isBusy = false, isError = result.isFailure, message = result.exceptionOrNull()?.message ?: "✅ انحفظ ملفك الشخصي") }
        }
    }

    fun uploadPhoto(jpeg: ByteArray?) {
        if (jpeg == null) {
            _uiState.update { it.copy(message = "تعذّرت قراءة الصورة — جرّب صورة ثانية", isError = true) }
            return
        }
        viewModelScope.launch {
            _uiState.update { it.copy(isBusy = true, message = null) }
            val result = profiles.uploadAvatar(jpeg)
            _uiState.update {
                it.copy(isBusy = false, isError = result.isFailure, avatarUrl = result.getOrNull()?.avatarUrl ?: it.avatarUrl, message = result.exceptionOrNull()?.message ?: "✅ انحفظت الصورة")
            }
        }
    }

    fun removePhoto() {
        viewModelScope.launch {
            _uiState.update { it.copy(isBusy = true, message = null) }
            val result = profiles.removeAvatar()
            _uiState.update { it.copy(isBusy = false, isError = result.isFailure, avatarUrl = if (result.isSuccess) null else it.avatarUrl, message = result.exceptionOrNull()?.message) }
        }
    }
}

@Composable
fun ProfileEditScreen(factory: ViewModelFactory, onBack: () -> Unit) {
    val viewModel: ProfileEditViewModel = viewModel(factory = factory)
    val state by viewModel.uiState.collectAsState()
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    val picker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) scope.launch { viewModel.uploadPhoto(withContext(Dispatchers.Default) { ImageUtil.squareJpeg(context, uri) }) }
    }

    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = onBack) { Text("‹ رجوع") }
            Text("ملفي الشخصي", style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.primary)
        }
        if (state.isLoading) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            return@Column
        }
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Avatar(state.fullName, size = 112.dp, imageUrl = state.avatarUrl)
            Spacer(Modifier.height(12.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = { picker.launch("image/*") }, enabled = !state.isBusy, shape = RoundedCornerShape(12.dp)) {
                    Text(if (state.avatarUrl == null) "📷 إضافة صورة" else "📷 تغيير الصورة")
                }
                if (state.avatarUrl != null) {
                    OutlinedButton(onClick = viewModel::removePhoto, enabled = !state.isBusy, shape = RoundedCornerShape(12.dp)) { Text("حذف الصورة") }
                }
            }
            Spacer(Modifier.height(16.dp))
            OutlinedTextField(value = state.fullName, onValueChange = viewModel::onName, label = { Text("الاسم") }, modifier = Modifier.fillMaxWidth())
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(
                value = state.bio,
                onValueChange = viewModel::onBio,
                label = { Text("نبذة عنك أو عن محلك (بتظهر للزبائن وعلى الفواتير)") },
                minLines = 3,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(16.dp))
            Button(onClick = viewModel::save, enabled = !state.isBusy, shape = RoundedCornerShape(14.dp), modifier = Modifier.fillMaxWidth().height(52.dp)) { Text("حفظ") }
            state.message?.let {
                Spacer(Modifier.height(8.dp))
                Text(it, color = if (state.isError) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary)
            }
        }
    }
}
