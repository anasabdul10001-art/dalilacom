package com.dalilacom.app.ui.discover

import com.dalilacom.app.R
import com.dalilacom.app.data.network.RouteStepDto
import com.dalilacom.app.ui.i18n.AppStrings

/** Turns a manoeuvre of the route into a sentence in the language on screen, and an arrow for it. */
object NavText {
    fun arrow(step: RouteStepDto?): String = when {
        step == null -> "↑"
        step.type == "arrive" -> "📍"
        step.type == "depart" -> "🚩"
        step.type == "roundabout" || step.type == "rotary" -> "⟳"
        else -> when (step.modifier) {
            "left" -> "↰"
            "right" -> "↱"
            "slight left" -> "↖"
            "slight right" -> "↗"
            "sharp left" -> "⬉"
            "sharp right" -> "⬈"
            "uturn" -> "↶"
            else -> "↑"
        }
    }

    private fun ordinal(n: Int): String = when (n) {
        1 -> AppStrings.get(R.string.nav_ord_1)
        2 -> AppStrings.get(R.string.nav_ord_2)
        3 -> AppStrings.get(R.string.nav_ord_3)
        4 -> AppStrings.get(R.string.nav_ord_4)
        5 -> AppStrings.get(R.string.nav_ord_5)
        6 -> AppStrings.get(R.string.nav_ord_6)
        7 -> AppStrings.get(R.string.nav_ord_7)
        8 -> AppStrings.get(R.string.nav_ord_8)
        else -> n.toString()
    }

    /** A distance the way a person says it ("200 metres", "a kilometre and a half"), so the voice does not read "م". */
    fun spokenDistance(meters: Double): String {
        if (meters < 1000) return AppStrings.get(R.string.nav_say_m, maxOf(50, Math.round(meters / 50.0).toInt() * 50))
        val km = Math.round(meters / 500.0) / 2.0
        return when (km) {
            1.0 -> AppStrings.get(R.string.nav_say_km_1)
            1.5 -> AppStrings.get(R.string.nav_say_km_1_5)
            2.0 -> AppStrings.get(R.string.nav_say_km_2)
            2.5 -> AppStrings.get(R.string.nav_say_km_2_5)
            else -> if (km % 1.0 == 0.0) AppStrings.get(R.string.nav_say_km, km.toInt().toString()) else AppStrings.get(R.string.nav_say_km_half, km.toInt().toString())
        }
    }

    /** "In 200 metres," — said before the manoeuvre itself. */
    fun sayIn(meters: Double): String = AppStrings.get(R.string.nav_say_in, spokenDistance(meters))

    fun instruction(step: RouteStepDto?): String {
        if (step == null) return ""
        val onto = if (step.name.isNotBlank()) " " + AppStrings.get(R.string.nav_on, step.name) else ""
        val stay = if (step.name.isNotBlank()) " " + AppStrings.get(R.string.nav_stay, step.name) else ""
        val side = when {
            step.modifier.contains("left") -> "left"
            step.modifier.contains("right") -> "right"
            else -> ""
        }
        fun turn(modifier: String): String = AppStrings.get(
            when (modifier) {
                "left" -> R.string.nav_turn_left
                "right" -> R.string.nav_turn_right
                "slight left" -> R.string.nav_turn_slight_left
                "slight right" -> R.string.nav_turn_slight_right
                "sharp left" -> R.string.nav_turn_sharp_left
                "sharp right" -> R.string.nav_turn_sharp_right
                "uturn" -> R.string.nav_turn_uturn
                else -> R.string.nav_turn_straight
            },
        )
        return when (step.type) {
            "arrive" -> AppStrings.get(if (side == "left") R.string.nav_arrive_left else if (side == "right") R.string.nav_arrive_right else R.string.nav_arrive)
            "depart" -> AppStrings.get(R.string.nav_depart) + stay
            "roundabout", "rotary" -> if (step.exit != null) AppStrings.get(R.string.nav_roundabout, ordinal(step.exit)) + onto else AppStrings.get(R.string.nav_roundabout_enter)
            "exit roundabout", "exit rotary" -> AppStrings.get(R.string.nav_roundabout_exit) + onto
            "merge" -> AppStrings.get(R.string.nav_merge) + stay
            "on ramp", "off ramp" -> AppStrings.get(R.string.nav_ramp) + onto
            "fork" -> AppStrings.get(if (side == "left") R.string.nav_fork_left else if (side == "right") R.string.nav_fork_right else R.string.nav_continue) + onto
            "end of road" -> AppStrings.get(if (side == "left") R.string.nav_endofroad_left else if (side == "right") R.string.nav_endofroad_right else R.string.nav_continue) + onto
            "new name", "continue" -> if (step.modifier.isNotBlank() && step.modifier != "straight") turn(step.modifier) + onto else AppStrings.get(R.string.nav_continue) + stay
            else -> turn(step.modifier) + if (step.modifier.isBlank() || step.modifier == "straight") stay else onto
        }
    }
}
