package com.dalilacom.app.ui.common

import android.annotation.SuppressLint
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.view.MotionEvent
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.MyLocation
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import com.dalilacom.app.ui.discover.LocationHelper
import kotlinx.coroutines.launch
import org.osmdroid.config.Configuration
import org.osmdroid.events.MapEventsReceiver
import org.osmdroid.tileprovider.tilesource.TileSourceFactory
import org.osmdroid.util.GeoPoint
import org.osmdroid.views.CustomZoomButtonsController
import org.osmdroid.views.MapView
import org.osmdroid.views.overlay.MapEventsOverlay
import org.osmdroid.views.overlay.Marker
import java.io.File

private val DAMASCUS = GeoPoint(33.5138, 36.2765)

/**
 * "Where is your shop?" — tap the map to drop the pin, or use the current position. This is what
 * puts a merchant on everyone else's map, so it sits right in the registration and listing forms.
 */
@SuppressLint("ClickableViewAccessibility")
@Composable
fun LocationPicker(
    value: Pair<Double, Double>?,
    onChange: (Pair<Double, Double>) -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val latestOnChange by rememberUpdatedState(onChange)
    var recenterTick by remember { mutableIntStateOf(0) }

    val mapView = remember {
        Configuration.getInstance().apply {
            userAgentValue = context.packageName
            osmdroidBasePath = File(context.cacheDir, "osmdroid")
            osmdroidTileCache = File(context.cacheDir, "osmdroid/tiles")
        }
        MapView(context).apply {
            setTileSource(TileSourceFactory.MAPNIK)
            setMultiTouchControls(true)
            zoomController.setVisibility(CustomZoomButtonsController.Visibility.SHOW_AND_FADEOUT)
            minZoomLevel = 4.0
            controller.setZoom(12.0)
            controller.setCenter(DAMASCUS)
            // The picker sits inside a scrolling form: while a finger is on the map, the map gets the drag.
            setOnTouchListener { view, event ->
                if (event.actionMasked == MotionEvent.ACTION_DOWN) view.parent?.requestDisallowInterceptTouchEvent(true)
                if (event.actionMasked == MotionEvent.ACTION_UP || event.actionMasked == MotionEvent.ACTION_CANCEL) {
                    view.parent?.requestDisallowInterceptTouchEvent(false)
                }
                false
            }
        }
    }

    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner, mapView) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_RESUME -> mapView.onResume()
                Lifecycle.Event.ON_PAUSE -> mapView.onPause()
                else -> Unit
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        mapView.onResume()
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
            mapView.onPause()
            mapView.onDetach()
        }
    }

    // Frame the existing pin when the form opens, and again whenever "my location" is used.
    LaunchedEffect(recenterTick) {
        value?.let {
            mapView.controller.setZoom(16.0)
            mapView.controller.animateTo(GeoPoint(it.first, it.second))
        }
    }

    fun useCurrentLocation() {
        scope.launch {
            val here = LocationHelper.current(context)
            if (here == null) {
                Toast.makeText(context, "ما قدرنا نحدد موقعك — اضغط على الخريطة لتحدده بإيدك", Toast.LENGTH_LONG).show()
            } else {
                latestOnChange(here)
                recenterTick++
            }
        }
    }

    val permissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { grants ->
        if (grants.values.any { it }) useCurrentLocation()
        else Toast.makeText(context, "ما أعطيت إذن الموقع — اضغط على الخريطة لتحدد مكان المحل", Toast.LENGTH_LONG).show()
    }

    Column(modifier) {
        Text("مكان محلك على الخريطة", style = MaterialTheme.typography.titleSmall)
        Text(
            "بهالطريقة بيلاقيك الزبائن — اضغط على الخريطة لتضع الدبّوس مكان محلك.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(8.dp))
        Surface(
            shape = RoundedCornerShape(16.dp),
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
            modifier = Modifier.fillMaxWidth().height(240.dp),
        ) {
            AndroidView(
                modifier = Modifier.fillMaxWidth().height(240.dp),
                factory = { mapView },
                update = { map ->
                    map.overlays.clear()
                    map.overlays.add(
                        MapEventsOverlay(object : MapEventsReceiver {
                            override fun singleTapConfirmedHelper(p: GeoPoint): Boolean {
                                latestOnChange(p.latitude to p.longitude)
                                return true
                            }

                            override fun longPressHelper(p: GeoPoint): Boolean = false
                        }),
                    )
                    value?.let { (lat, lng) ->
                        val density = context.resources.displayMetrics.density
                        val px = (28 * density).toInt()
                        map.overlays.add(
                            Marker(map).apply {
                                position = GeoPoint(lat, lng)
                                setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_CENTER)
                                icon = GradientDrawable().apply {
                                    shape = GradientDrawable.OVAL
                                    setColor(Color.parseColor("#BA2A34"))
                                    setStroke((3 * density).toInt(), Color.WHITE)
                                    setSize(px, px)
                                }
                                setInfoWindow(null)
                            },
                        )
                    }
                    map.invalidate()
                },
            )
        }
        Spacer(Modifier.height(8.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            OutlinedButton(
                onClick = {
                    if (LocationHelper.hasPermission(context)) useCurrentLocation() else permissionLauncher.launch(LocationHelper.PERMISSIONS)
                },
                shape = RoundedCornerShape(12.dp),
            ) {
                Icon(Icons.Filled.MyLocation, contentDescription = null, modifier = Modifier.padding(end = 6.dp))
                Text("استخدم موقعي الحالي")
            }
            Spacer(Modifier.width(10.dp))
            Text(
                value?.let { "%.5f، %.5f".format(it.first, it.second) } ?: "لسا ما حدّدت المكان",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
