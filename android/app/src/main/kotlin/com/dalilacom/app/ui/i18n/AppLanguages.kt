package com.dalilacom.app.ui.i18n

import android.content.Context
import android.content.ContextWrapper
import android.content.res.Configuration
import android.content.res.Resources
import androidx.annotation.StringRes
import java.util.Locale

/** One language the app can be shown in. [rtl] decides the layout direction of the whole UI. */
data class AppLanguage(val code: String, val nativeName: String, val rtl: Boolean)

/**
 * To add a language: add a line here and create res/values-<code>/strings.xml with the same keys as
 * res/values/strings.xml (Arabic, the default). Category names come from the server in the same language.
 */
object AppLanguages {
    const val DEFAULT = "ar"

    val all = listOf(
        AppLanguage("ar", "العربية", rtl = true),
        AppLanguage("en", "English", rtl = false),
    )

    fun find(code: String?): AppLanguage = all.firstOrNull { it.code == code } ?: all.first { it.code == DEFAULT }
}

/** The strings of the language currently on screen, for code that runs outside a composable. */
object AppStrings {
    @Volatile
    var resources: Resources? = null

    fun get(@StringRes id: Int, vararg args: Any): String {
        val res = resources ?: return ""
        return if (args.isEmpty()) res.getString(id) else res.getString(id, *args)
    }
}

/** A Context whose resources speak [language] — everything else (Activity services, printing...) is untouched. */
class LocalizedContext(base: Context, language: AppLanguage) : ContextWrapper(base) {
    private val localizedConfiguration = Configuration(base.resources.configuration).apply {
        val locale = Locale.Builder().setLanguage(language.code).setUnicodeLocaleKeyword("nu", "latn").build()
        setLocale(locale)
        setLayoutDirection(locale)
    }
    private val localizedResources: Resources = base.createConfigurationContext(localizedConfiguration).resources

    override fun getResources(): Resources = localizedResources
    val configuration: Configuration get() = localizedConfiguration
}
