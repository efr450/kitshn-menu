package de.kitshn

import de.kitshn.api.tandoor.model.TandoorUnit
import de.kitshn.api.tandoor.model.TandoorUnitConversion
import kotlinx.serialization.Serializable
import kotlin.math.ceil

/*
 * Menu fork: "buy as" amounts on the shopping list: a second chip saying how you'd buy a food
 * ("1 half-gallon" milk, "1½ lb" beef) beside the recipe amounts, which stay in grams.
 *
 * Every rule is data in Tandoor, so new foods and aisles need no app change:
 * - A unit whose description says "package" is a container you buy (half-gallon, can, carton). A
 *   food-specific conversion "1 <unit> <food> = N g" gives that food's size; the Menu importer's
 *   `mi foods package` writes both. TandoorUnitConversionRoute.loadPackages() reads them.
 * - A supermarket category whose description says "by weight" (Meat, Fish and Seafood, Deli) is
 *   bought by the pound; the importer's `mi foods by-weight` marks one. The app caches categories,
 *   and TandoorUnitConversionRoute caches package sizes, so both work offline.
 *
 * Everything below is pure, so BuyAsTest covers it; ShoppingListEntryListItem only draws the chip.
 */

const val PACKAGE_MARKER = "package"
const val BY_WEIGHT_MARKER = "by weight"

/** True when [description] contains [marker] as its own words ("by weight", not "bye weightless"). */
fun hasMarker(description: String?, marker: String): Boolean =
    description != null &&
            Regex("(^|\\W)" + Regex.escape(marker) + "($|\\W)", RegexOption.IGNORE_CASE).containsMatchIn(description)

/** A food's package size: "1 half-gallon = 1992 g". Serializable so the list can show it offline. */
@Serializable
data class BuyPackage(
    val name: String,
    val pluralName: String?,
    val grams: Double
)

/** One shopping entry, as far as the buy amount cares. */
data class BuyLine(
    val amount: Double,
    val unitName: String?,
    val unitBaseUnit: String?,
    val checked: Boolean
)

/** The chip: its text, and whether everything it counts is ticked off (drawn struck through). */
data class BuyChip(
    val label: String,
    val checked: Boolean
)

/** The key [packagesFrom] files a food's package under; shopping entries only share the name with Tandoor. */
fun buyPackageKey(foodName: String): String = foodName.trim().lowercase()

/**
 * Food -> package size from Tandoor's unit conversions: rows for one food between a weight and a unit
 * marked [PACKAGE_MARKER], either way round. Other rows are ignored. If a food somehow has two, the
 * oldest row (lowest id) wins, so the answer doesn't flip between loads.
 */
fun packagesFrom(conversions: List<TandoorUnitConversion>): Map<String, BuyPackage> {
    fun pkg(unit: TandoorUnit, amount: Double, weight: TandoorUnit, weightAmount: Double): BuyPackage? {
        if(!hasMarker(unit.description, PACKAGE_MARKER) || amount <= 0.0) return null
        val g = gramsPerUnit(weight.base_unit, weight.name) ?: return null
        return BuyPackage(unit.name, unit.plural_name, weightAmount * g / amount)
    }
    val out = mutableMapOf<String, BuyPackage>()
    for(c in conversions.sortedBy { it.id }) {
        val food = c.food ?: continue
        val key = buyPackageKey(food.name)
        if(key in out) continue
        out[key] = pkg(c.base_unit, c.base_amount, c.converted_unit, c.converted_amount)
            ?: pkg(c.converted_unit, c.converted_amount, c.base_unit, c.base_amount)
            ?: continue
    }
    return out
}

/**
 * The buy chip for one food's entries, or null when there's nothing useful to say.
 * - Counts weighed entries and entries already in the package unit; any other measure in the mix
 *   (pieces, cups, a bare count) can't be added in, so there's no chip rather than a wrong one.
 * - Counts like the grams chips: the unchecked entries, or all of them once everything is checked.
 * - A by-weight food whose amounts are all in oz or lb gets no lb chip; they say it already.
 * - Negative amounts count: the phone page stores a lowered amount as a negative difference entry.
 */
fun buyChip(lines: List<BuyLine>, byWeight: Boolean, pkg: BuyPackage?): BuyChip? {
    val measured = lines.filter { it.amount != 0.0 }
    if(measured.isEmpty()) return null

    fun grams(line: BuyLine): Double? =
        gramsPerUnit(line.unitBaseUnit, line.unitName)?.let { line.amount * it }
            ?: if(pkg != null && line.unitName.equals(pkg.name, ignoreCase = true)) line.amount * pkg.grams else null

    if(measured.any { grams(it) == null }) return null
    if(pkg == null && measured.all { gramsPerUnit(it.unitBaseUnit, it.unitName) in US_WEIGHTS }) return null

    val allChecked = measured.all { it.checked }
    val total = measured.filter { !it.checked || allChecked }.sumOf { grams(it)!! }
    return buyAsLabel(total, byWeight, pkg)?.let { BuyChip(it, allChecked) }
}

/**
 * How you'd buy [grams] of a food, or null when no rule applies. A package size wins: whole packages,
 * rounded up (900 g milk -> "1 half-gallon"). Otherwise a by-weight food shows [pounds].
 */
fun buyAsLabel(grams: Double, byWeight: Boolean, pkg: BuyPackage?): String? {
    if(grams <= 0.0) return null
    if(pkg != null && pkg.grams > 0.0) {
        val n = ceil(grams / pkg.grams - 1e-9).toInt().coerceAtLeast(1)
        return "$n " + if(n == 1) pkg.name else (pkg.pluralName?.ifBlank { null } ?: pkg.name)
    }
    return if(byWeight) pounds(grams) else null
}

/**
 * [grams] as you'd ask at the counter: lb rounded up to the ¼ lb ("1½ lb"), ignoring the last few
 * grams so 453 g is "1 lb", not "1¼ lb"; whole oz under ¼ lb.
 */
fun pounds(grams: Double): String {
    val quarters = grams / GRAMS_PER_LB * 4
    if(quarters < 0.9) return "${ceil(grams / GRAMS_PER_OZ - 1e-9).toInt()} oz"
    val q = ceil(quarters - 0.1).toInt()
    val frac = when(q % 4) { 1 -> "¼"; 2 -> "½"; 3 -> "¾"; else -> "" }
    return (if(q / 4 == 0) frac else "${q / 4}$frac") + " lb"
}

/** Grams in one of a unit when it's a weight (by Tandoor base unit, else by name), else null. */
fun gramsPerUnit(baseUnit: String?, name: String?): Double? =
    when((baseUnit?.ifBlank { null } ?: name)?.trim()?.lowercase()) {
        "g", "gram", "grams" -> 1.0
        "kg", "kilogram", "kilograms" -> 1000.0
        "ounce", "oz", "ounces" -> GRAMS_PER_OZ
        "pound", "lb", "lbs", "pounds" -> GRAMS_PER_LB
        else -> null
    }

private const val GRAMS_PER_LB = 453.592
private const val GRAMS_PER_OZ = 28.3495
private val US_WEIGHTS = setOf(GRAMS_PER_OZ, GRAMS_PER_LB)
