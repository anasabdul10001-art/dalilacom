package com.dalilacom.app.ui.discover

import com.dalilacom.app.R
import com.dalilacom.app.ui.i18n.AppStrings
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.DashPathEffect
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Point
import android.graphics.drawable.BitmapDrawable
import android.graphics.drawable.GradientDrawable
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import com.dalilacom.app.data.network.MerchantDto
import com.dalilacom.app.data.repository.MapBounds
import org.osmdroid.config.Configuration
import org.osmdroid.events.MapListener
import org.osmdroid.events.ScrollEvent
import org.osmdroid.events.ZoomEvent
import org.osmdroid.tileprovider.tilesource.TileSourceFactory
import org.osmdroid.util.BoundingBox
import org.osmdroid.util.GeoPoint
import org.osmdroid.views.CustomZoomButtonsController
import org.osmdroid.views.MapView
import org.osmdroid.views.overlay.Marker
import org.osmdroid.views.overlay.Polygon
import org.osmdroid.views.overlay.Polyline
import java.io.File

private val DAMASCUS = GeoPoint(33.5138, 36.2765)

private fun dot(context: Context, fill: Int, sizeDp: Int): GradientDrawable {
    val density = context.resources.displayMetrics.density
    val px = (sizeDp * density).toInt()
    return GradientDrawable().apply {
        shape = GradientDrawable.OVAL
        setColor(fill)
        setStroke((2 * density).toInt(), Color.WHITE)
        setSize(px, px)
    }
}

/**
 * A shop's pin: a round head with its logo (or the first letter of its name) and a point at the bottom; a shop with a discount
 * wears a small yellow tag on top. The bottom tip is where the place is, so the marker is anchored there.
 */
private fun pinIcon(context: Context, name: String, logo: Bitmap?, hasDiscount: Boolean, selected: Boolean): BitmapDrawable {
    val d = context.resources.displayMetrics.density
    val head = (if (selected) 48 else 40) * d
    val ring = 3 * d
    val pad = 10 * d // room for the discount tag that sticks out
    val tail = 9 * d
    val width = (head + pad * 2).toInt()
    val height = (head + tail + pad).toInt()
    val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    val cx = width / 2f
    val cy = pad + head / 2f
    val fill = when { selected -> Color.BLACK; hasDiscount -> Color.parseColor("#BA2A34"); else -> Color.parseColor("#777777") }
    paint.color = Color.WHITE
    canvas.drawPath(Path().apply { moveTo(cx - 9 * d, cy + head / 2 - 3 * d); lineTo(cx, cy + head / 2 + tail); lineTo(cx + 9 * d, cy + head / 2 - 3 * d); close() }, paint)
    canvas.drawCircle(cx, cy, head / 2f, paint)
    paint.color = fill
    canvas.drawPath(Path().apply { moveTo(cx - 7 * d, cy + head / 2 - 2 * d); lineTo(cx, cy + head / 2 + tail - 2.5f * d); lineTo(cx + 7 * d, cy + head / 2 - 2 * d); close() }, paint)
    canvas.drawCircle(cx, cy, head / 2f - 1.5f * d, paint)
    val inner = head / 2f - ring
    if (logo != null) {
        val save = canvas.save()
        canvas.clipPath(Path().apply { addCircle(cx, cy, inner, Path.Direction.CW) })
        val side = minOf(logo.width, logo.height)
        val src = android.graphics.Rect((logo.width - side) / 2, (logo.height - side) / 2, (logo.width + side) / 2, (logo.height + side) / 2)
        canvas.drawBitmap(logo, src, android.graphics.RectF(cx - inner, cy - inner, cx + inner, cy + inner), Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG))
        canvas.restoreToCount(save)
    } else {
        paint.color = Color.WHITE
        paint.textAlign = Paint.Align.CENTER
        paint.isFakeBoldText = true
        paint.textSize = (if (selected) 22 else 18) * d
        val letter = name.trim().take(1).uppercase().ifEmpty { "?" }
        canvas.drawText(letter, cx, cy - (paint.descent() + paint.ascent()) / 2, paint)
    }
    if (hasDiscount) {
        val r = 10 * d
        val bx = cx + head / 2f - 2 * d
        val by = pad + 2 * d
        paint.color = Color.WHITE
        canvas.drawCircle(bx, by, r + 2 * d, paint)
        paint.color = Color.parseColor("#FFB300")
        canvas.drawCircle(bx, by, r, paint)
        paint.color = Color.parseColor("#111111")
        paint.textAlign = Paint.Align.CENTER
        paint.isFakeBoldText = true
        paint.textSize = 13 * d
        canvas.drawText("%", bx, by - (paint.descent() + paint.ascent()) / 2, paint)
    }
    return BitmapDrawable(context.resources, bitmap)
}

private fun clusterIcon(context: Context, count: Int): BitmapDrawable {
    val d = context.resources.displayMetrics.density
    val size = (44 * d).toInt()
    val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    paint.color = Color.WHITE
    canvas.drawCircle(size / 2f, size / 2f, size / 2f, paint)
    paint.color = Color.parseColor("#BA2A34")
    canvas.drawCircle(size / 2f, size / 2f, size / 2f - 3 * d, paint)
    paint.color = Color.WHITE
    paint.textAlign = Paint.Align.CENTER
    paint.textSize = 16 * d
    paint.isFakeBoldText = true
    canvas.drawText(count.toString(), size / 2f, size / 2f + 6 * d, paint)
    return BitmapDrawable(context.resources, bitmap)
}

/** The person's position during a trip: a blue arrow pointing the way they are heading (rotated by the marker). */
private fun arrowIcon(context: Context): BitmapDrawable {
    val d = context.resources.displayMetrics.density
    val size = (40 * d).toInt()
    val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    val c = size / 2f
    val path = Path().apply {
        moveTo(c, 4 * d)
        lineTo(c + 13 * d, c + 14 * d)
        lineTo(c, c + 7 * d)
        lineTo(c - 13 * d, c + 14 * d)
        close()
    }
    paint.color = Color.WHITE
    paint.style = Paint.Style.STROKE
    paint.strokeWidth = 5 * d
    paint.strokeJoin = Paint.Join.ROUND
    canvas.drawPath(path, paint)
    paint.color = Color.parseColor("#1E6FE0")
    paint.style = Paint.Style.FILL
    canvas.drawPath(path, paint)
    return BitmapDrawable(context.resources, bitmap)
}

private val landmarkIcons = HashMap<String, BitmapDrawable>()

/** A public place: a round badge in its kind's colour, white ring, its emoji in the middle (smaller and calmer than a shop's pin). */
private fun landmarkIcon(context: Context, emoji: String, colorHex: String): BitmapDrawable = landmarkIcons.getOrPut("$emoji|$colorHex") {
    val d = context.resources.displayMetrics.density
    val size = (32 * d).toInt()
    val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    paint.color = Color.WHITE
    canvas.drawCircle(size / 2f, size / 2f, size / 2f, paint)
    paint.color = runCatching { Color.parseColor(colorHex) }.getOrDefault(Color.DKGRAY)
    canvas.drawCircle(size / 2f, size / 2f, size / 2f - 2.5f * d, paint)
    paint.color = Color.WHITE
    paint.textAlign = Paint.Align.CENTER
    paint.textSize = 15 * d
    canvas.drawText(emoji, size / 2f, size / 2f - (paint.descent() + paint.ascent()) / 2, paint)
    BitmapDrawable(context.resources, bitmap)
}

/** The name of a street, written on a small white label in its colour. */
private fun streetLabel(context: Context, text: String, colorHex: String): BitmapDrawable {
    val d = context.resources.displayMetrics.density
    val color = runCatching { Color.parseColor(colorHex) }.getOrDefault(Color.DKGRAY)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    paint.textSize = 12 * d
    paint.isFakeBoldText = true
    val w = (paint.measureText(text) + 14 * d).toInt()
    val h = (22 * d).toInt()
    val bitmap = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    val box = android.graphics.RectF(1 * d, 1 * d, w - 1 * d, h - 1 * d)
    paint.color = Color.argb(235, 255, 255, 255)
    canvas.drawRoundRect(box, 6 * d, 6 * d, paint)
    paint.style = Paint.Style.STROKE
    paint.strokeWidth = 1.5f * d
    paint.color = color
    canvas.drawRoundRect(box, 6 * d, 6 * d, paint)
    paint.style = Paint.Style.FILL
    paint.textAlign = Paint.Align.CENTER
    canvas.drawText(text, w / 2f, h / 2f - (paint.descent() + paint.ascent()) / 2, paint)
    return BitmapDrawable(context.resources, bitmap)
}

/** How close the map must be before a kind is drawn (mosques are many, so they wait for a closer view). */
private fun landmarkMinZoom(slug: String): Double = when (slug) {
    "main_street", "hospital", "park", "neighborhood", "airport", "train_station", "university" -> 12.0
    "mosque", "church", "school", "kindergarten", "police", "fire_station", "post_office", "market" -> 14.0
    else -> 13.0
}

/**
 * OpenStreetMap view (no API key needed): the user's position, one pin per merchant, pins that
 * are close together folded into numbered clusters (tap to zoom in), and a callback when the
 * *user* (not the app) moves the map so the screen can offer "search this area".
 */
@Composable
fun MerchantsMap(
    merchants: List<MerchantDto>,
    userLocation: Pair<Double, Double>?,
    selectedId: String?,
    onSelect: (String) -> Unit,
    onUserMoved: (MapBounds) -> Unit,
    recenterTick: Int = 0,
    route: List<List<Double>>? = null,
    routeWalking: Boolean = false,
    radiusKm: Double? = null,
    radiusFitTick: Int = 0,
    /** A trip is going on: the camera follows [userLocation] and the position is drawn as an arrow when the [userBearing] is known. */
    navigating: Boolean = false,
    followUser: Boolean = false,
    userBearing: Float? = null,
    onUserPanned: () -> Unit = {},
    /** The public places in view (mosques, hospitals, parks, main streets), a tap on one, and the view each time the map settles. */
    landmarks: List<com.dalilacom.app.data.network.LandmarkDto> = emptyList(),
    onLandmark: (com.dalilacom.app.data.network.LandmarkDto) -> Unit = {},
    onView: (MapBounds, Double) -> Unit = { _, _ -> },
    /** A touch on the empty map (not on a pin). */
    onMapTap: () -> Unit = {},
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
            zoomController.setVisibility(CustomZoomButtonsController.Visibility.NEVER)
            minZoomLevel = 4.0
            controller.setZoom(11.0)
            controller.setCenter(DAMASCUS)
        }
    }
    val handler = remember { Handler(Looper.getMainLooper()) }
    val logos = remember { HashMap<String, Bitmap?>() } // shop logos for the pins, by address
    val ignoreMovesUntil = remember { LongArray(1) }
    fun programmatic(block: () -> Unit) {
        ignoreMovesUntil[0] = SystemClock.uptimeMillis() + 1500
        block()
    }

    val located = merchants.filter { it.latitude != null && it.longitude != null }
    val latestMerchants by rememberUpdatedState(located)
    val latestSelected by rememberUpdatedState(selectedId)
    val latestUser by rememberUpdatedState(userLocation)
    val latestOnSelect by rememberUpdatedState(onSelect)
    val latestOnMoved by rememberUpdatedState(onUserMoved)
    val latestRoute by rememberUpdatedState(route)
    val latestWalking by rememberUpdatedState(routeWalking)
    val latestRadius by rememberUpdatedState(radiusKm)
    val latestNavigating by rememberUpdatedState(navigating)
    val latestBearing by rememberUpdatedState(userBearing)
    val latestOnPanned by rememberUpdatedState(onUserPanned)
    val latestLandmarks by rememberUpdatedState(landmarks)
    val latestOnLandmark by rememberUpdatedState(onLandmark)
    val latestOnView by rememberUpdatedState(onView)
    val latestOnMapTap by rememberUpdatedState(onMapTap)

    fun redraw(map: MapView) {
        map.overlays.clear()
        // first, so every pin above it is tapped before it: it only hears the touches that hit nothing
        map.overlays.add(
            org.osmdroid.views.overlay.MapEventsOverlay(object : org.osmdroid.events.MapEventsReceiver {
                override fun singleTapConfirmedHelper(p: GeoPoint?): Boolean { latestOnMapTap(); return false }
                override fun longPressHelper(p: GeoPoint?): Boolean = false
            }),
        )
        // The chosen distance, as a circle around the user.
        val radius = latestRadius
        val here = latestUser
        if (radius != null && here != null) {
            map.overlays.add(
                Polygon(map).apply {
                    points = Polygon.pointsAsCircle(GeoPoint(here.first, here.second), radius * 1000.0)
                    fillPaint.color = Color.argb(18, 186, 42, 52)
                    outlinePaint.color = Color.parseColor("#BA2A34")
                    outlinePaint.strokeWidth = 2 * context.resources.displayMetrics.density
                    outlinePaint.pathEffect = DashPathEffect(floatArrayOf(16f, 12f), 0f)
                },
            )
        }
        // The road goes underneath the pins so the destination stays tappable.
        latestRoute?.takeIf { it.size >= 2 }?.let { points ->
            val density = context.resources.displayMetrics.density
            map.overlays.add(
                Polyline(map).apply {
                    setPoints(points.map { GeoPoint(it[0], it[1]) })
                    outlinePaint.color = if (latestWalking) Color.parseColor("#1E6FE0") else Color.parseColor("#BA2A34")
                    outlinePaint.strokeWidth = 6 * density
                    outlinePaint.strokeCap = Paint.Cap.ROUND
                    outlinePaint.strokeJoin = Paint.Join.ROUND
                    if (latestWalking) outlinePaint.pathEffect = DashPathEffect(floatArrayOf(1f, 12f * density), 0f)
                },
            )
        }
        // the public places go under the shops' pins
        val zoom = map.zoomLevelDouble
        for (place in latestLandmarks) {
            if (zoom < landmarkMinZoom(place.kind.slug)) continue
            val color = runCatching { Color.parseColor(place.kind.color) }.getOrDefault(Color.DKGRAY)
            val path = place.path
            if (place.kind.geometry == "LINE" && path != null) {
                for (segment in path) {
                    if (segment.size < 2) continue
                    map.overlays.add(
                        Polyline(map).apply {
                            setPoints(segment.map { GeoPoint(it[0], it[1]) })
                            outlinePaint.color = color
                            outlinePaint.alpha = 210
                            outlinePaint.strokeWidth = 5 * context.resources.displayMetrics.density
                            outlinePaint.strokeCap = Paint.Cap.ROUND
                            setOnClickListener { _, _, _ -> latestOnLandmark(place); true }
                        },
                    )
                }
                if (zoom >= 14.0) {
                    Marker(map).apply {
                        position = GeoPoint(place.latitude, place.longitude)
                        setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_CENTER)
                        icon = streetLabel(context, place.name, place.kind.color)
                        setInfoWindow(null)
                        setOnMarkerClickListener { _, _ -> latestOnLandmark(place); true }
                        map.overlays.add(this)
                    }
                }
                continue
            }
            Marker(map).apply {
                position = GeoPoint(place.latitude, place.longitude)
                setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_CENTER)
                icon = landmarkIcon(context, place.kind.icon, place.kind.color)
                title = place.name
                setInfoWindow(null)
                setOnMarkerClickListener { _, _ -> latestOnLandmark(place); true }
                map.overlays.add(this)
            }
        }
        val measured = map.width > 0
        if (!measured) map.post { if (map.width > 0) redraw(map) }
        val cell = 72 * context.resources.displayMetrics.density
        val groups = LinkedHashMap<Pair<Int, Int>, MutableList<MerchantDto>>()
        val singles = mutableListOf<MerchantDto>()
        for (merchant in latestMerchants) {
            if (!measured || merchant.id == latestSelected) {
                singles.add(merchant)
                continue
            }
            val point = Point()
            map.projection.toPixels(GeoPoint(merchant.latitude!!, merchant.longitude!!), point)
            groups.getOrPut((point.x / cell).toInt() to (point.y / cell).toInt()) { mutableListOf() }.add(merchant)
        }
        for (group in groups.values) {
            if (group.size == 1) {
                singles.add(group[0])
                continue
            }
            val points = group.map { GeoPoint(it.latitude!!, it.longitude!!) }
            Marker(map).apply {
                position = GeoPoint(points.map { it.latitude }.average(), points.map { it.longitude }.average())
                setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_CENTER)
                icon = clusterIcon(context, group.size)
                setInfoWindow(null)
                setOnMarkerClickListener { _, _ ->
                    val box = BoundingBox.fromGeoPoints(points)
                    programmatic {
                        if (box.latitudeSpan < 1e-5 && box.longitudeSpan < 1e-5) map.controller.zoomIn()
                        else map.zoomToBoundingBox(box.increaseByScale(1.4f), true, 80)
                    }
                    true
                }
                map.overlays.add(this)
            }
        }
        for (merchant in singles) {
            val hasDiscount = merchant.discounts.isNotEmpty()
            val selected = merchant.id == latestSelected
            val logoUrl = merchant.avatarUrl?.takeIf { it.isNotBlank() }?.let { if (it.startsWith("http")) it else com.dalilacom.app.data.network.absoluteUrl(it) }
            if (logoUrl != null && logoUrl !in logos) {
                logos[logoUrl] = null // asked once; the pins are drawn again when the picture arrives
                coil.Coil.imageLoader(context).enqueue(
                    coil.request.ImageRequest.Builder(context).data(logoUrl).allowHardware(false)
                        .target { drawable -> (drawable as? BitmapDrawable)?.bitmap?.let { logos[logoUrl] = it; map.post { redraw(map) } } }
                        .build(),
                )
            }
            Marker(map).apply {
                position = GeoPoint(merchant.latitude!!, merchant.longitude!!)
                setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_BOTTOM)
                icon = pinIcon(context, merchant.businessName, logoUrl?.let { logos[it] }, hasDiscount, selected)
                title = merchant.businessName
                setInfoWindow(null)
                setOnMarkerClickListener { _, _ -> latestOnSelect(merchant.id); true }
                map.overlays.add(this)
            }
        }
        latestUser?.let { (lat, lng) ->
            Marker(map).apply {
                position = GeoPoint(lat, lng)
                setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_CENTER)
                val bearing = latestBearing
                if (latestNavigating && bearing != null) {
                    icon = arrowIcon(context)
                    rotation = bearing
                } else {
                    icon = dot(context, Color.parseColor("#1E6FE0"), if (latestNavigating) 24 else 18)
                }
                title = AppStrings.get(R.string.s_a860cf2b)
                setInfoWindow(null)
                map.overlays.add(this)
            }
        }
        map.invalidate()
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
        val reportMove = Runnable {
            if (SystemClock.uptimeMillis() > ignoreMovesUntil[0]) {
                val box = mapView.boundingBox
                latestOnMoved(MapBounds(box.latNorth, box.latSouth, box.lonEast, box.lonWest))
            }
        }
        val reportView = Runnable {
            val box = mapView.boundingBox
            latestOnView(MapBounds(box.latNorth, box.latSouth, box.lonEast, box.lonWest), mapView.zoomLevelDouble)
        }
        val redrawLater = Runnable { redraw(mapView) }
        val listener = object : MapListener {
            override fun onScroll(event: ScrollEvent?): Boolean {
                // the person dragged the map during a trip: stop following them
                if (latestNavigating && SystemClock.uptimeMillis() > ignoreMovesUntil[0]) latestOnPanned()
                handler.removeCallbacks(reportMove)
                handler.postDelayed(reportMove, 500)
                handler.removeCallbacks(reportView)
                handler.postDelayed(reportView, 600)
                return false
            }

            override fun onZoom(event: ZoomEvent?): Boolean {
                handler.removeCallbacks(redrawLater)
                handler.postDelayed(redrawLater, 150)
                handler.removeCallbacks(reportMove)
                handler.postDelayed(reportMove, 500)
                handler.removeCallbacks(reportView)
                handler.postDelayed(reportView, 600)
                return false
            }
        }
        mapView.addMapListener(listener)
        handler.postDelayed(reportView, 1200) // the first view, once the map has its size
        lifecycleOwner.lifecycle.addObserver(observer)
        mapView.onResume()
        onDispose {
            handler.removeCallbacksAndMessages(null)
            mapView.removeMapListener(listener)
            lifecycleOwner.lifecycle.removeObserver(observer)
            mapView.onPause()
            mapView.onDetach()
        }
    }

    // A distance chip was tapped: frame that circle (or everything, for "any distance").
    LaunchedEffect(radiusFitTick) {
        if (radiusFitTick == 0 || latestRoute != null) return@LaunchedEffect
        val here = latestUser ?: return@LaunchedEffect
        val center = GeoPoint(here.first, here.second)
        val points = latestRadius?.let { Polygon.pointsAsCircle(center, it * 1000.0) }
            ?: (latestMerchants.map { GeoPoint(it.latitude!!, it.longitude!!) } + center)
        programmatic {
            mapView.post {
                mapView.zoomToBoundingBox(BoundingBox.fromGeoPoints(points).increaseByScale(1.5f), true, 60)
                mapView.invalidate()
            }
        }
    }

    // A new route: frame the whole way.
    LaunchedEffect(route) {
        if (latestNavigating) return@LaunchedEffect // a trip: the camera follows the person, it does not frame the road
        val points = route?.takeIf { it.size >= 2 }?.map { GeoPoint(it[0], it[1]) } ?: return@LaunchedEffect
        programmatic { mapView.post { mapView.zoomToBoundingBox(BoundingBox.fromGeoPoints(points).increaseByScale(1.3f), true, 100) } }
    }

    // During a trip: stay on the person.
    LaunchedEffect(userLocation, followUser, navigating) {
        val here = userLocation ?: return@LaunchedEffect
        if (!navigating || !followUser) return@LaunchedEffect
        programmatic {
            if (mapView.zoomLevelDouble < 16.5) mapView.controller.setZoom(17.0)
            mapView.controller.animateTo(GeoPoint(here.first, here.second))
        }
    }

    // First GPS fix (or the "my location" button): jump to the user.
    LaunchedEffect(userLocation, recenterTick) {
        if (latestRoute != null) return@LaunchedEffect // don't pull the camera off a route being shown
        userLocation?.let {
            programmatic {
                mapView.controller.setZoom(14.0)
                mapView.controller.animateTo(GeoPoint(it.first, it.second))
            }
        }
    }
    // No location (yet): frame the merchants that do exist so the map is never empty.
    LaunchedEffect(located.map { it.id }, userLocation == null) {
        if (userLocation != null || located.isEmpty()) return@LaunchedEffect
        val points = located.map { GeoPoint(it.latitude!!, it.longitude!!) }
        programmatic {
            if (points.size == 1) {
                mapView.controller.setZoom(14.0)
                mapView.controller.setCenter(points.first())
            } else {
                mapView.post { mapView.zoomToBoundingBox(BoundingBox.fromGeoPoints(points).increaseByScale(1.2f), false, 90) }
            }
        }
    }

    AndroidView(modifier = modifier, factory = { mapView }, update = { map -> redraw(map) })
}
