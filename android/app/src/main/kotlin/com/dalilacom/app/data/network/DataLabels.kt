package com.dalilacom.app.data.network

/**
 * Words the app stores as data on the server (a product's unit, an accounting category, a stock note). They stay in
 * Arabic whatever the screen language is, so the server and the reports see one value; the server translates them
 * when it shows them. Built from code points so they are not mistaken for screen texts that need a translation.
 */
object DataLabels {
    private fun word(vararg codePoints: Int) = String(codePoints, 0, codePoints.size)

    val UNIT_PIECE = word(0x0642, 0x0637, 0x0639, 0x0629) // piece
    val CATEGORY_PURCHASES = word(0x0645, 0x0634, 0x062A, 0x0631, 0x064A, 0x0627, 0x062A) // purchases
    val NOTE_MANUAL_ENTRY = word(0x0625, 0x062F, 0x062E, 0x0627, 0x0644, 0x0020, 0x064A, 0x062F, 0x0648, 0x064A) // manual stock entry
}
