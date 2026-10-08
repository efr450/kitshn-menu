package de.kitshn

import kotlin.test.Test
import kotlin.test.assertEquals

/** Menu fork: measures inside ingredient notes scale with servings; sizes and the rest don't. */
class NoteScalingTest {

    private fun scale(note: String, factor: Double = 1.5) =
        scaleNoteAmounts(note, factor, fractional = true).replace('\u00A0', ' ')

    @Test
    fun scaledMixedNumberDoesNotWrap() {
        assertEquals("4\u00A0½ cups diced", scaleNoteAmounts("3 cups diced", 1.5, fractional = true))
    }

    @Test
    fun unchangedAtFactorOne() {
        assertEquals("about 1/3 cup", scale("about 1/3 cup", 1.0))
    }

    @Test
    fun volumesBecomeFractions() {
        assertEquals("1.5 lbs, peeled, 4 ½ cups diced", scale("1 lb, peeled, 3 cups diced"))
        assertEquals("large, 3 cups chopped", scale("large, 2 cups chopped"))
        assertEquals("1 ½ tsp", scale("1 tsp"))
        assertEquals("⅜ tsp", scale("¼ tsp"))
        assertEquals("about ½ cup", scale("about 1/3 cup"))
    }

    @Test
    fun mixedNumbers() {
        assertEquals(1.25, parseNoteNumber("1¼"))
        assertEquals(1.5, parseNoteNumber("1 ½"))
        assertEquals(1.5, parseNoteNumber("1 1/2"))
        assertEquals("1.88 lbs, peeled, 4 ½ cups diced", scale("1¼ lbs, peeled, 3 cups diced"))
    }

    @Test
    fun weightsAreDecimal() {
        assertEquals("or 90 g raisins", scale("or 60 g raisins"))
        assertEquals("4.5 oz, chopped, about 3 cups", scale("3 oz, chopped, about 2 cups"))
        assertEquals("3 l", scale("2 l"))
    }

    @Test
    fun rangesScaleBothEnds() {
        assertEquals("extra-virgin, 1 ½–3 tbsp", scale("extra-virgin, 1–2 tbsp"))
        assertEquals("¾-1 ⅛ tsp, adjust to taste", scale("½-¾ tsp, adjust to taste"))
        assertEquals("1.88–2.25 lbs", scale("1¼–1½ lb"))
        assertEquals("3 to 4 ½ cups", scale("2 to 3 cups"))
        assertEquals("2 or 4 tbsp", scale("1 or 2 tbsp", 2.0))
    }

    @Test
    fun hyphenatedMixedNumbers() {
        assertEquals("3 tsp", scale("1-1/2 tsp", 2.0))
        assertEquals("5 cups", scale("2-1/2 cups", 2.0))
        assertEquals("3 cups", scale("1-½ cups", 2.0))
        assertEquals("2–4 cups", scale("1–2 cups", 2.0))
    }

    @Test
    fun noBreakSpaceAndFractionSlashInSource() {
        assertEquals("3 cups", scale("1\u00A0½ cups", 2.0))
        assertEquals("3 cups", scale("1\u00A01/2 cups", 2.0))
        assertEquals("1 cup", scale("1⁄2 cup", 2.0))
    }

    @Test
    fun packageSizesStay() {
        assertEquals("2 (14.5 oz.) cans", scale("2 (14.5 oz.) cans", 2.0))
        assertEquals("one 14.5 oz. can", scale("one 14.5 oz. can", 2.0))
        assertEquals("2 lbs. bag", scale("2 lbs. bag", 2.0))
        assertEquals("1 (15oz/425g) can", scale("1 (15oz/425g) can", 2.0))
        assertEquals("1 (15 oz / 425 g) can", scale("1 (15 oz / 425 g) can", 2.0))
        assertEquals("1 (0.25 oz) envelope yeast", scale("1 (0.25 oz) envelope yeast", 2.0))
        assertEquals("1 oz packet", scale("1 oz packet", 2.0))
        assertEquals("1 can (15 oz), drained", scale("1 can (15 oz), drained", 2.0))
        assertEquals("2 cans (15 oz each)", scale("2 cans (15 oz each)", 2.0))
        assertEquals("drained, about 3 cups", scale("drained, about 1 ½ cups", 2.0))
        assertEquals("(about 3 cups)", scale("(about 1 ½ cups)", 2.0))
        assertEquals("1 stick (1 cup) butter", scale("1 stick (½ cup) butter", 2.0))
    }

    @Test
    fun capitalizedUnitsPluralize() {
        assertEquals("1 Cup", scale("2 Cups", 0.5))
        assertEquals("2 Cups", scale("1 Cup", 2.0))
        assertEquals("2 CUPS", scale("1 CUP", 2.0))
    }

    @Test
    fun slashPairsScaleBothSides() {
        assertEquals("4 cups/1000 ml", scale("2 cups/500 ml", 2.0))
        assertEquals("700g/24oz", scale("350g/12oz", 2.0))
    }

    @Test
    fun unitPluralFollowsAmount() {
        assertEquals("1 ½ cups", scale("1 cup"))
        assertEquals("½ cup", scale("1 cup", 0.5))
        assertEquals("1 cup", scale("2 cups", 0.5))
        assertEquals("1 tbsp", scale("2 tbsp", 0.5))
    }

    @Test
    fun sizesAndOtherNumbersStay() {
        assertEquals("1-inch, fresh, 1 ½ tbsp minced", scale("1-inch, fresh, 1 tbsp minced"))
        assertEquals("1 ½-inch, grated or minced, 3 tsp minced", scale("1 ½-inch, grated or minced, 2 tsp minced"))
        assertEquals("20-ounce, in brine", scale("20-ounce, in brine"))
        assertEquals("14.5-oz, cut up, ~2 ¼ cups used", scale("14.5-oz, cut up, ~1½ cups used"))
        assertEquals("24-30°C", scale("24-30°C"))
        assertEquals("active, 100% hydration", scale("active, 100% hydration"))
        assertEquals("1 ½ cups, rinsed 2-3 times", scale("1 cup, rinsed 2-3 times"))
        assertEquals("from Day 4 jar", scale("from Day 4 jar"))
        assertEquals("diced into 1 cm (½ in) cubes", scale("diced into 1 cm (½ in) cubes"))
        assertEquals("1 part pork to 2 parts beef", scale("1 part pork to 2 parts beef"))
        assertEquals("small, red or white", scale("small, red or white"))
        assertEquals("12–15, small", scale("12–15, small"))
        assertEquals("about 1½ medium limes", scale("about 1½ medium limes"))
        assertEquals("2 (15 oz) cans, drained", scale("2 (15 oz) cans, drained", 2.0))
        assertEquals("one 14.5 oz can diced tomatoes", scale("one 14.5 oz can diced tomatoes", 2.0))
        assertEquals("1 (12 oz) bag", scale("1 (12 oz) bag", 2.0))
    }
}
