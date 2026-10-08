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

    fun instruction(step: RouteStepDto?): String {
        if (step == null) return ""
        val on = if (step.name.isNotBlank()) " " + AppStrings.get(R.string.nav_on, step.name) else ""
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
            "arrive" -> AppStrings.get(R.string.nav_arrive)
            "depart" -> AppStrings.get(R.string.nav_depart) + on
            "roundabout", "rotary" -> if (step.exit != null) AppStrings.get(R.string.nav_roundabout, step.exit) else AppStrings.get(R.string.nav_roundabout_enter)
            "exit roundabout", "exit rotary" -> AppStrings.get(R.string.nav_roundabout_exit) + on
            "merge" -> AppStrings.get(R.string.nav_merge) + on
            "on ramp", "off ramp" -> AppStrings.get(R.string.nav_ramp) + on
            "fork" -> AppStrings.get(if (side == "left") R.string.nav_fork_left else if (side == "right") R.string.nav_fork_right else R.string.nav_continue) + on
            "end of road" -> AppStrings.get(if (side == "left") R.string.nav_endofroad_left else if (side == "right") R.string.nav_endofroad_right else R.string.nav_continue) + on
            "new name", "continue" -> (if (step.modifier.isNotBlank() && step.modifier != "straight") turn(step.modifier) else AppStrings.get(R.string.nav_continue)) + on
            else -> turn(step.modifier) + on
        }
    }
}
