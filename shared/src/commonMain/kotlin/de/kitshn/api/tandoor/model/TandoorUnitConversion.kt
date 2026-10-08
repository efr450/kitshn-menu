package de.kitshn.api.tandoor.model

import kotlinx.serialization.Serializable

// Menu fork: a row of /api/unit-conversion/ ("1 cup Milk, whole = 249 g"); food is null for general ones
@Serializable
data class TandoorUnitConversion(
    val id: Int,
    val base_amount: Double,
    val base_unit: TandoorUnit,
    val converted_amount: Double,
    val converted_unit: TandoorUnit,
    val food: TandoorUnitConversionFood? = null
)

@Serializable
data class TandoorUnitConversionFood(
    val id: Int,
    val name: String
)
