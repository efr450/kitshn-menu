package de.kitshn.api.tandoor.model

import kotlinx.serialization.Serializable

@Serializable
data class TandoorUnit(
    val id: Int,
    val name: String,
    val plural_name: String? = null,
    val description: String? = null,
    val base_unit: String? = null,
    val open_data_slug: String? = null
) {
    // Menu fork: only volume units show fractions (½ cup); weights and counts show decimals (1.5 g)
    fun isVolume(): Boolean =
        base_unit?.lowercase() in VOLUME_BASE_UNITS || isVolumeUnitName(name)
}

// Menu fork: Tandoor's volume base units (weights are g, kg, ounce, pound)
private val VOLUME_BASE_UNITS = setOf(
    "ml", "l", "fluid_ounce", "pint", "quart", "gallon", "tbsp", "tsp", "us_cup",
    "imperial_fluid_ounce", "imperial_pint", "imperial_quart", "imperial_gallon",
    "imperial_tbsp", "imperial_tsp"
)

// Menu fork: unit words that name a volume, for text with no TandoorUnit (e.g. "{{ scale(1) }} tsp")
private val VOLUME_UNIT_NAMES = setOf(
    "ml", "l", "liter", "litre", "fl oz", "cup", "tbsp", "tablespoon", "tsp", "teaspoon",
    "pinch", "dash", "pint", "quart", "gallon"
)

fun isVolumeUnitName(name: String): Boolean {
    val word = name.trim().lowercase().removeSuffix(".")
    return word in VOLUME_UNIT_NAMES || word.removeSuffix("s") in VOLUME_UNIT_NAMES ||
            word.removeSuffix("es") in VOLUME_UNIT_NAMES
}
