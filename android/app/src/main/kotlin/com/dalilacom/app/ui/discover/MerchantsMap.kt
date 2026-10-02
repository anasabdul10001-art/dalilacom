package com.dalilacom.app.ui.discover

import android.content.Context
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import com.dalilacom.app.data.network.MerchantDto
import org.osmdroid.config.Configuration
import org.osmdroid.tileprovider.tilesource.TileSourceFactory
import org.osmdroid.util.BoundingBox
import org.osmdroid.util.GeoPoint
import org.osmdroid.views.MapView
import org.osmdroid.views.overlay.Marker
import java.io.File

private val DAMASCUS = GeoPoint(33.5138, 36.2765)

private fun dot(context: Context, fill: Int, sizeDp: Int): GradientDrawable {
    val px = (sizeDp * context.resources.displayMetrics.density).toInt()
    return GradientDrawable().apply {
        shape = GradientDrawable.OVAL
        setColor(fill)
        setStroke((2 * context.resources.displayMetrics.density).toInt(), Color.WHITE)
        setSize(px, px)
    }
}

/** OpenStreetMap view (no API key needed) with the user's position and one pin per merchant. */
@Composable
fun MerchantsMap(
    merchants: List<MerchantDto>,
    userLocation: Pair<Double, Double>?,
    selectedId: String?,
    onSelect: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val mapView = remember {
        Configuration.getInstance().apply {
            userAgentValue = context.packageName
            osmdroidBasePath = File(context.cacheDir, "osmdroid")
            osmdroidTileCache = File(context.cacheDir, "osmdroid/tiles")
        }
        MapView(context).apply {
            setTileSource(TileSourceFactory.MAPNIK)
            setMultiTouchControls(true)
            minZoomLevel = 4.0
            controller.setZoom(11.0)
            controller.setCenter(DAMASCUS)
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

    val located = merchants.filter { it.latitude != null && it.longitude != null }

    // First GPS fix: jump to the user.
    LaunchedEffect(userLocation) {
        userLocation?.let {
            mapView.controller.setZoom(14.0)
            mapView.controller.animateTo(GeoPoint(it.first, it.second))
        }
    }
    // No location (yet): frame the merchants that do exist so the map is never empty.
    LaunchedEffect(located.map { it.id }, userLocation == null) {
        if (userLocation != null || located.isEmpty()) return@LaunchedEffect
        val points = located.map { GeoPoint(it.latitude!!, it.longitude!!) }
        if (points.size == 1) {
            mapView.controller.setZoom(14.0)
            mapView.controller.setCenter(points.first())
        } else {
            mapView.post { mapView.zoomToBoundingBox(BoundingBox.fromGeoPoints(points), false, 90) }
        }
    }

    AndroidView(
        modifier = modifier,
        factory = { mapView },
        update = { map ->
            map.overlays.clear()
            located.forEach { merchant ->
                val hasDiscount = merchant.discounts.isNotEmpty()
                val selected = merchant.id == selectedId
                Marker(map).apply {
                    position = GeoPoint(merchant.latitude!!, merchant.longitude!!)
                    setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_CENTER)
                    icon = dot(
                        context,
                        when {
                            selected -> Color.BLACK
                            hasDiscount -> Color.parseColor("#BA2A34")
                            else -> Color.parseColor("#777777")
                        },
                        if (selected) 26 else 20,
                    )
                    title = merchant.businessName
                    setOnMarkerClickListener { _, _ -> onSelect(merchant.id); true }
                    map.overlays.add(this)
                }
            }
            userLocation?.let { (lat, lng) ->
                Marker(map).apply {
                    position = GeoPoint(lat, lng)
                    setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_CENTER)
                    icon = dot(context, Color.parseColor("#1E6FE0"), 18)
                    title = "موقعي"
                    setInfoWindow(null)
                    map.overlays.add(this)
                }
            }
            map.invalidate()
        },
    )
}
