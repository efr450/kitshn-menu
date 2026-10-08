package de.kitshn

import de.kitshn.api.tandoor.model.TandoorUnit
import de.kitshn.api.tandoor.model.TandoorUnitConversion
import de.kitshn.api.tandoor.model.TandoorUnitConversionFood
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.double
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Menu fork: the cases in menu-web/buy-cases.json, which the phone page's buy.js must pass too
 * (menu-web/test/buy.test.js). A failure here after a change to BuyAs.kt means the page needs the
 * same change; add a case to the file for any new rule.
 */
class BuyCasesTest {
    private val cases = Json.parseToJsonElement(File("../menu-web/buy-cases.json").readText()).jsonObject
    private val units = cases.getValue("units").jsonObject.mapValues { (name, u) ->
        val o = u.jsonObject
        TandoorUnit(0, name, o.str("plural_name"), o.str("description"), o.str("base_unit"))
    }

    private fun JsonObject.str(key: String) = get(key)?.jsonPrimitive?.contentOrNull
    private fun JsonElement.str() = if(this is JsonNull) null else jsonPrimitive.content

    private fun pkg(e: JsonElement?): BuyPackage? = (e as? JsonObject)?.let {
        BuyPackage(it.str("name")!!, it.str("pluralName"), it.getValue("grams").jsonPrimitive.double)
    }

    @Test
    fun buyChipCases() {
        for(c in cases.getValue("buyChip").jsonArray.map { it.jsonObject }) {
            val lines = c.getValue("lines").jsonArray.map {
                val l = it.jsonArray
                BuyLine(l[0].jsonPrimitive.double, l[1].str(), l[2].str(), l[3].jsonPrimitive.boolean)
            }
            val want = (c["expect"] as? JsonObject)?.let {
                BuyChip(it.str("label")!!, it.getValue("checked").jsonPrimitive.boolean)
            }
            assertEquals(want, buyChip(lines, c.getValue("byWeight").jsonPrimitive.boolean, pkg(c["pkg"])), c.str("name"))
        }
    }

    @Test
    fun packagesFromCases() {
        for(c in cases.getValue("packagesFrom").jsonArray.map { it.jsonObject }) {
            val got = packagesFrom(c.getValue("conversions").jsonArray.map {
                val r = it.jsonArray
                val id = r[0].jsonPrimitive.int
                TandoorUnitConversion(
                    id, r[2].jsonPrimitive.double, units.getValue(r[3].str()!!),
                    r[4].jsonPrimitive.double, units.getValue(r[5].str()!!),
                    r[1].str()?.let { TandoorUnitConversionFood(id, it) }
                )
            })
            val want = c.getValue("expect").jsonObject
            assertEquals(want.keys, got.keys, c.str("name"))
            for((key, w) in want) {
                val p = got.getValue(key)
                val e = pkg(w)!!
                assertEquals(e.name, p.name, key)
                assertEquals(e.pluralName, p.pluralName, key)
                assertTrue(kotlin.math.abs(e.grams - p.grams) < 0.001, "$key: ${p.grams} g")
            }
        }
    }

    @Test
    fun hasMarkerCases() {
        for(c in cases.getValue("hasMarker").jsonArray.map { it.jsonArray }) {
            assertEquals(c[2].jsonPrimitive.booleanOrNull, hasMarker(c[0].str(), c[1].str()!!), c.toString())
        }
    }

    @Test
    fun everySectionHasCases() {
        for(key in listOf("buyChip", "packagesFrom", "hasMarker"))
            assertTrue((cases[key] as? JsonArray)?.isNotEmpty() == true, key)
    }
}
