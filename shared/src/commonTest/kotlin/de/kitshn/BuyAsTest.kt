package de.kitshn

import de.kitshn.api.tandoor.model.TandoorUnit
import de.kitshn.api.tandoor.model.TandoorUnitConversion
import de.kitshn.api.tandoor.model.TandoorUnitConversionFood
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class BuyAsTest {
    private val milk = BuyPackage("half-gallon", "half-gallons", 1992.0)

    private fun g(amount: Double, checked: Boolean = false) = BuyLine(amount, "g", "g", checked)
    private fun line(amount: Double, unit: String?, base: String? = null, checked: Boolean = false) =
        BuyLine(amount, unit, base, checked)

    // --- packages

    @Test
    fun packagesRoundUp() {
        assertEquals("1 half-gallon", buyAsLabel(332.0, false, milk))
        assertEquals("1 half-gallon", buyAsLabel(1992.0, false, milk))
        assertEquals("2 half-gallons", buyAsLabel(1993.0, false, milk))
    }

    @Test
    fun packageWinsOverByWeight() {
        assertEquals("1 box", buyAsLabel(300.0, true, BuyPackage("box", "boxes", 454.0)))
    }

    @Test
    fun packageWithoutPluralKeepsName() {
        assertEquals("3 Bottle", buyAsLabel(2000.0, false, BuyPackage("Bottle", null, 761.0)))
    }

    // --- by weight

    @Test
    fun poundsRoundUpToTheQuarter() {
        assertEquals("1 lb", pounds(453.3))
        assertEquals("1½ lb", pounds(680.0))
        assertEquals("¾ lb", pounds(340.0))
        assertEquals("¼ lb", pounds(113.0))
        assertEquals("2¼ lb", pounds(1020.0))
        assertEquals("1¼ lb", pounds(508.0))
    }

    @Test
    fun ouncesUnderAQuarterPound() {
        assertEquals("2 oz", pounds(50.0))
        assertEquals("4 oz", pounds(100.0))
    }

    @Test
    fun noRuleNoLabel() {
        assertNull(buyAsLabel(681.0, false, null))
        assertNull(buyAsLabel(0.0, true, null))
    }

    // --- one food's entries

    @Test
    fun sumsWeighedEntries() {
        assertEquals(BuyChip("1½ lb", false), buyChip(listOf(g(400.0), line(0.28, "kg", "kg")), true, null))
    }

    @Test
    fun countsEntriesAlreadyInThePackageUnit() {
        assertEquals("2 half-gallons", buyChip(listOf(g(500.0), line(1.0, "half-gallon")), false, milk)?.label)
    }

    @Test
    fun otherMeasuresInTheMixMeanNoChip() {
        assertNull(buyChip(listOf(g(400.0), line(2.0, "piece")), true, null))
        assertNull(buyChip(listOf(line(1.0, "cup", "us_cup")), false, milk))
        // a bare count ("4" chicken thighs) can't be weighed either
        assertNull(buyChip(listOf(g(500.0), line(4.0, null)), true, null))
    }

    @Test
    fun unmeasuredEntriesAreIgnored() {
        assertEquals("1 lb", buyChip(listOf(g(450.0), line(0.0, null)), true, null)?.label)
        assertNull(buyChip(listOf(line(0.0, null)), true, null))
    }

    @Test
    fun countsUncheckedUntilEverythingIsChecked() {
        assertEquals(BuyChip("1 lb", false), buyChip(listOf(g(450.0), g(450.0, checked = true)), true, null))
        assertEquals(BuyChip("2 lb", true), buyChip(listOf(g(450.0, true), g(450.0, true)), true, null))
    }

    @Test
    fun amountsAlreadyInPoundsGetNoPoundChip() {
        assertNull(buyChip(listOf(line(1.0, "lb", "pound"), line(4.0, "oz", "ounce")), true, null))
        // but pounds and grams together are summed
        assertEquals("2½ lb", buyChip(listOf(line(1.0, "lb", "pound"), g(600.0)), true, null)?.label)
        // a package still applies
        assertEquals("1 box", buyChip(listOf(line(8.0, "oz", "ounce")), false, BuyPackage("box", "boxes", 340.0))?.label)
    }

    // --- package sizes from Tandoor's conversions

    private val gram = TandoorUnit(13, "g", "g", null, "g")
    private val cup = TandoorUnit(3, "cup", "cups", null, "us_cup")
    private val halfGallon = TandoorUnit(19, "half-gallon", "half-gallons", "package")
    private val can = TandoorUnit(1, "can", "cans", "package")

    private fun conv(id: Int, food: String?, a: Double, au: TandoorUnit, b: Double, bu: TandoorUnit) =
        TandoorUnitConversion(id, a, au, b, bu, food?.let { TandoorUnitConversionFood(id, it) })

    @Test
    fun packagesComeFromPackageToWeightRows() {
        val got = packagesFrom(listOf(
            conv(1, "Milk, whole", 1.0, halfGallon, 1992.0, gram),
            conv(2, "Milk, coconut", 382.0, gram, 1.0, can),   // either way round
            conv(3, "Milk, whole", 1.0, cup, 249.0, gram),     // a density, not a package
            conv(4, null, 1.0, can, 400.0, gram),              // not food-specific
            conv(5, "Pecan", 1.0, cup, 109.0, gram)            // matched the "can" query by name
        ))
        assertEquals(mapOf(
            "milk, whole" to BuyPackage("half-gallon", "half-gallons", 1992.0),
            "milk, coconut" to BuyPackage("can", "cans", 382.0)
        ), got)
    }

    @Test
    fun packageSizesConvertFromAnyWeight() {
        assertEquals(793.786, packagesFrom(listOf(conv(1, "Tomato, canned", 1.0, can, 28.0, TandoorUnit(9, "oz", null, null, "ounce"))))
            .getValue("tomato, canned").grams, 0.001)
    }

    @Test
    fun oldestPackageWinsAndKeysIgnoreCase() {
        val got = packagesFrom(listOf(
            conv(9, "Milk, Whole", 1.0, can, 400.0, gram),
            conv(2, "Milk, whole", 1.0, halfGallon, 1992.0, gram)
        ))
        assertEquals("half-gallon", got[buyPackageKey(" MILK, WHOLE ")]?.name)
    }

    // --- markers and units

    @Test
    fun markersMatchWholeWords() {
        assertTrue(hasMarker("package", PACKAGE_MARKER))
        assertTrue(hasMarker("Sold by weight at the counter", BY_WEIGHT_MARKER))
        assertFalse(hasMarker("packaged goods", PACKAGE_MARKER))
        assertFalse(hasMarker(null, PACKAGE_MARKER))
    }

    @Test
    fun weights() {
        assertEquals(1.0, gramsPerUnit("g", "g"))
        assertEquals(453.592, gramsPerUnit("pound", "lb"))
        assertEquals(28.3495, gramsPerUnit(null, "oz"))
        assertNull(gramsPerUnit(null, "can"))
        assertNull(gramsPerUnit("us_cup", "cup"))
    }
}
