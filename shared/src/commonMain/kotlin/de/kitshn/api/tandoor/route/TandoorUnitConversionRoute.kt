package de.kitshn.api.tandoor.route

import com.russhwolf.settings.Settings
import de.kitshn.BuyPackage
import de.kitshn.PACKAGE_MARKER
import de.kitshn.api.tandoor.TandoorClient
import de.kitshn.api.tandoor.model.TandoorUnitConversion
import de.kitshn.hasMarker
import de.kitshn.json
import de.kitshn.maybeDecodeFromString
import de.kitshn.packagesFrom
import kotlinx.coroutines.sync.Mutex

// Menu fork: package sizes for the shopping list's "buy" chips (rules in BuyAs.kt)
class TandoorUnitConversionRoute(client: TandoorClient) : TandoorBaseRoute(client) {

    private val settings = Settings()
    private val loading = Mutex()

    /** Fills client.container.buyPackages from the last successful load, if it's still empty. */
    fun restorePackages() {
        if(client.container.buyPackages.isNotEmpty()) return
        val saved = settings.getStringOrNull(KEY_BUY_PACKAGES) ?: return
        json.maybeDecodeFromString<Map<String, BuyPackage>>(saved)?.let { client.container.buyPackages.putAll(it) }
    }

    /**
     * Reloads the package sizes into client.container.buyPackages and the offline copy. A load already
     * in flight (the screen opening and its first refresh land together) makes this one a no-op.
     */
    suspend fun loadPackages() {
        if(!loading.tryLock()) return
        try {
            // every conversion embeds its whole food, so all of them is ~0.5 MB; ask per package unit
            // instead (the query also matches food names; packagesFrom drops those rows)
            val units = client.unit.listAll().results.filter { hasMarker(it.description, PACKAGE_MARKER) }
            val rows = units.flatMap { unit ->
                listAllPages<TandoorUnitConversion>(path = "unit-conversion/", pageSize = 200, query = unit.name) { false }.results
            }
            val packages = packagesFrom(rows)
            client.container.buyPackages.clear()
            client.container.buyPackages.putAll(packages)
            settings.putString(KEY_BUY_PACKAGES, json.encodeToString(packages))
        } finally {
            loading.unlock()
        }
    }

    private companion object {
        const val KEY_BUY_PACKAGES = "menu_buy_packages"
    }
}
