package de.kitshn

import de.kitshn.api.tandoor.model.isVolumeUnitName

// Menu fork: ingredient notes keep the source's own measures ("1 lb, peeled, 3 cups diced").
// When servings change, scale each number that is followed by a cooking unit and leave the
// rest alone: sizes ("1-inch", "14.5-oz can"), temperatures, "rinsed 2-3 times", "Day 4 jar".

private const val FRACTIONS = "½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞"

private const val NUMBER =
    "(?:\\d+\\s+\\d+/\\d+|\\d+/\\d+|\\d+(?:\\.\\d+)?(?: ?[$FRACTIONS])?|[$FRACTIONS])"

private const val UNIT =
    "fl\\.? ?oz|tablespoons?|teaspoons?|tbsps?|tsps?|cups?|pounds?|lbs?|ounces?|oz|grams?|kg|g|" +
            "ml|liters?|litres?|l|pinch(?:es)?|dash(?:es)?|pints?|quarts?|gallons?"

private const val CONTAINER =
    "cans?|bags?|packages?|packs?|jars?|box(?:es)?|bottles?|containers?|cartons?|tins?|blocks?"

// number, optional range ("1–2", "½-¾", "1 to 2", "1 or 2"), then the unit. A hyphen between
// number and unit ("1-inch", "20-ounce") marks a size, so only whitespace may sit there, and a
// unit followed by a container ("15 oz can", "(15 oz) cans") is a package size. A number right
// after digit-slash is a fraction's bottom, but "2 cups/500 ml" scales both sides.
private val NOTE_AMOUNT = Regex(
    "(?<![\\d.,\\-–—$FRACTIONS])(?<!\\d/)($NUMBER)" +
            "(?:(\\s*[-–—]\\s*|\\s+(?:to|or)\\s+)($NUMBER))?" +
            "(\\s*)($UNIT)(?![\\w\\-])(?!\\)?\\s*(?:$CONTAINER)\\b)",
    RegexOption.IGNORE_CASE
)

private val FRACTION_VALUES = mapOf(
    '½' to 1.0 / 2, '⅓' to 1.0 / 3, '⅔' to 2.0 / 3, '¼' to 1.0 / 4, '¾' to 3.0 / 4,
    '⅕' to 1.0 / 5, '⅖' to 2.0 / 5, '⅗' to 3.0 / 5, '⅘' to 4.0 / 5, '⅙' to 1.0 / 6,
    '⅚' to 5.0 / 6, '⅛' to 1.0 / 8, '⅜' to 3.0 / 8, '⅝' to 5.0 / 8, '⅞' to 7.0 / 8
)

private val UNIT_PLURALS = mapOf(
    "cup" to "cups", "tablespoon" to "tablespoons", "teaspoon" to "teaspoons",
    "pound" to "pounds", "ounce" to "ounces", "gram" to "grams", "liter" to "liters",
    "litre" to "litres", "pint" to "pints", "quart" to "quarts", "gallon" to "gallons",
    "pinch" to "pinches", "dash" to "dashes", "lb" to "lbs"
)

fun scaleNoteAmounts(note: String, factor: Double, fractional: Boolean): String {
    if(factor == 1.0) return note

    return NOTE_AMOUNT.replace(note) { match ->
        val (low, separator, high, space, unit) = match.destructured
        val isVolume = isVolumeUnitName(unit) || unit.startsWith("fl", ignoreCase = true)

        val lowValue = parseNoteNumber(low) ?: return@replace match.value
        val highValue = if(high.isEmpty()) null else parseNoteNumber(high) ?: return@replace match.value

        // a no-break space keeps "4 ½" on one line when the note wraps
        fun format(value: Double) = (value * factor).formatAmount(fractional, isVolume).replace(' ', ' ')

        buildString {
            append(format(lowValue))
            if(highValue != null) {
                append(separator)
                append(format(highValue))
            }
            append(space)
            append(pluralizeUnit(unit, (highValue ?: lowValue) * factor))
        }
    }
}

internal fun parseNoteNumber(text: String): Double? {
    var rest = text.trim()
    var value = 0.0

    rest.lastOrNull()?.let { FRACTION_VALUES[it] }?.let {
        value += it
        rest = rest.dropLast(1).trim()
    }

    for(part in rest.split(Regex("\\s+")).filter { it.isNotEmpty() }) {
        value += if('/' in part) {
            val (numerator, denominator) = part.split('/')
            val d = denominator.toDoubleOrNull()?.takeIf { it != 0.0 } ?: return null
            (numerator.toDoubleOrNull() ?: return null) / d
        } else {
            part.toDoubleOrNull() ?: return null
        }
    }

    return value
}

// Same rule as TandoorIngredient.getUnitLabel: plural above 1. Only touches lowercase words it knows.
private fun pluralizeUnit(unit: String, amount: Double): String {
    if(unit != unit.lowercase()) return unit
    val singular = UNIT_PLURALS.entries.firstOrNull { it.key == unit || it.value == unit }?.key
        ?: return unit
    return if(amount > 1) UNIT_PLURALS.getValue(singular) else singular
}
