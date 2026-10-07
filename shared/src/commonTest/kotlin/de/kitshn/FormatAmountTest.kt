package de.kitshn

import de.kitshn.api.tandoor.model.TandoorUnit
import de.kitshn.api.tandoor.model.isVolumeUnitName
import kotlin.test.Test
import kotlin.test.assertEquals

/** Menu fork: fractions only for volume units, decimals (max 2 places) for everything else. */
class FormatAmountTest {

    private val gram = TandoorUnit(id = 13, name = "g", base_unit = "g")
    private val cup = TandoorUnit(id = 12, name = "cup", base_unit = "us_cup")
    private val tbsp = TandoorUnit(id = 8, name = "tbsp", base_unit = "tbsp")
    private val clove = TandoorUnit(id = 16, name = "clove")

    @Test
    fun weight_isDecimal() {
        assertEquals("1.5", 1.5.formatAmount(unit = gram))
        assertEquals("0.33", (1.0 / 3).formatAmount(unit = gram))
        assertEquals("2", 2.0.formatAmount(unit = gram))
        assertEquals("10", 10.0.formatAmount(unit = gram))
        assertEquals("100", 100.0.formatAmount(unit = gram))
        assertEquals("250.25", 250.25.formatAmount(unit = gram))
        assertEquals("1.2", 1.199.formatAmount(unit = gram))
    }

    @Test
    fun countsAndNoUnit_areDecimal() {
        assertEquals("1.5", 1.5.formatAmount(unit = clove))
        assertEquals("0.5", 0.5.formatAmount())
    }

    @Test
    fun volume_isFraction() {
        assertEquals("1 ½", 1.5.formatAmount(unit = cup))
        assertEquals("¼", 0.25.formatAmount(unit = tbsp))
        assertEquals("2", 2.0.formatAmount(unit = cup))
    }

    @Test
    fun volume_respectsFractionSetting() {
        assertEquals("1.5", 1.5.formatAmount(fractional = false, unit = cup))
    }

    @Test
    fun unitNames() {
        assertEquals(true, isVolumeUnitName("cups"))
        assertEquals(true, isVolumeUnitName("Tbsp"))
        assertEquals(false, isVolumeUnitName("g"))
        assertEquals(false, isVolumeUnitName("cloves"))
    }
}
