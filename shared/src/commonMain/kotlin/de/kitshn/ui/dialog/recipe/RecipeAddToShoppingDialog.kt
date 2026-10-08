package de.kitshn.ui.dialog.recipe

import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SuggestionChip
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import kotlin.math.floor
import kotlin.math.round
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableDoubleStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import de.kitshn.api.tandoor.model.TandoorIngredient
import de.kitshn.api.tandoor.model.recipe.TandoorRecipe
import de.kitshn.ui.component.model.ingredient.IngredientsList
import de.kitshn.ui.component.model.recipe.step.OptionalBadge
import de.kitshn.ui.component.model.recipe.step.optionalName
import de.kitshn.ui.component.model.servings.ServingsSelector
import de.kitshn.ui.dialog.AdaptiveFullscreenDialog
import kitshn.shared.generated.resources.Res
import kitshn.shared.generated.resources.action_add
import kitshn.shared.generated.resources.action_add_to_shopping
import org.jetbrains.compose.resources.stringResource

@Composable
fun rememberRecipeAddToShoppingDialogState(): RecipeAddToShoppingDialogState {
    return remember {
        RecipeAddToShoppingDialogState()
    }
}

class RecipeAddToShoppingDialogState(
    val shown: MutableState<Boolean> = mutableStateOf(false),
    val recipe: MutableState<TandoorRecipe?> = mutableStateOf(null)
) {
    val servings = mutableDoubleStateOf(1.0)

    val ingredients = mutableStateListOf<TandoorIngredient>()
    val selectedIngredients = mutableStateListOf<TandoorIngredient>()

    // Menu fork: ingredients of "Optional: …" steps; still checked by default, marked with a badge
    var optionalIngredientIds: Set<Int> = emptySet()
        private set

    // Menu fork: how much of each ingredient you already have (ingredient id -> amount at the dialog's
    // servings); only the shortfall is added. editingHave is the row whose "I have" editor is open.
    val have = mutableStateMapOf<Int, Double>()
    var editingHave by mutableStateOf<Int?>(null)

    // The checkbox follows "have" only when a row changes state, so a hand-made uncheck sticks:
    // fullyHad = rows we unchecked because you have all of it, hadSome = rows with part of it,
    // initiallyChecked = how rows started, restored when a fully-had row drops back to nothing.
    private val fullyHad = mutableSetOf<Int>()
    private val hadSome = mutableSetOf<Int>()
    private val initiallyChecked = mutableSetOf<Int>()

    fun setHave(ingredient: TandoorIngredient, value: Double, servingsFactor: Double, applySelection: Boolean = true) {
        val v = value.coerceIn(0.0, ingredient.amount * servingsFactor)
        if(v <= 0.0) have.remove(ingredient.id) else have[ingredient.id] = v
        if(applySelection) applySelection(ingredient, servingsFactor)
    }

    // all of it unchecks the row; part of it checks it; back to none restores how it started
    fun applySelection(ingredient: TandoorIngredient, servingsFactor: Double) {
        val id = ingredient.id
        val need = ingredient.amount * servingsFactor
        val v = have[id] ?: 0.0
        val wasFull = id in fullyHad
        val wasSome = id in hadSome
        when {
            need > 0.0 && v >= need -> {
                fullyHad.add(id); hadSome.remove(id)
                if(!wasFull) selectedIngredients.remove(ingredient)
            }
            v > 0.0 -> {
                hadSome.add(id); fullyHad.remove(id)
                if((wasFull || !wasSome) && ingredient !in selectedIngredients) selectedIngredients.add(ingredient)
            }
            else -> {
                hadSome.remove(id)
                if(fullyHad.remove(id) && id in initiallyChecked && ingredient !in selectedIngredients)
                    selectedIngredients.add(ingredient)
            }
        }
    }

    // servings changed: what you have stays (not clamped, so going back restores it), the need moves
    fun reconcile(servingsFactor: Double) {
        for(id in have.keys.toList()) {
            ingredients.firstOrNull { it.id == id }?.let { applySelection(it, servingsFactor) }
        }
    }

    fun closeHaveEditor(servingsFactor: Double) {
        val id = editingHave ?: return
        ingredients.firstOrNull { it.id == id }?.let { applySelection(it, servingsFactor) }
        editingHave = null
    }

    // checking a row you have all of by hand means "buy it anyway": forget the have
    fun toggle(ingredient: TandoorIngredient, checked: Boolean, servingsFactor: Double) {
        if(checked) {
            if(fullyHad.remove(ingredient.id) || buy(ingredient, servingsFactor) <= 0.0) {
                have.remove(ingredient.id)
                hadSome.remove(ingredient.id)
            }
            if(ingredient !in selectedIngredients) selectedIngredients.add(ingredient)
        } else {
            selectedIngredients.remove(ingredient)
        }
        // the hand-set checkbox wins: record the current have state so closing the editor won't redo it
        val v = have[ingredient.id] ?: 0.0
        val need = ingredient.amount * servingsFactor
        fullyHad.remove(ingredient.id)
        hadSome.remove(ingredient.id)
        if(need > 0.0 && v >= need) fullyHad.add(ingredient.id) else if(v > 0.0) hadSome.add(ingredient.id)
    }

    fun open(recipe: TandoorRecipe, servings: Double) {
        ingredients.clear()
        selectedIngredients.clear()
        have.clear()
        fullyHad.clear()
        hadSome.clear()
        initiallyChecked.clear()
        editingHave = null

        ingredients.addAll(recipe.steps.flatMap { it.ingredients })
        optionalIngredientIds = recipe.steps.filter { it.optionalName() != null }
            .flatMap { step -> step.ingredients.map { it.id } }.toSet()
        // Menu fork: pantry (On Hand) foods start unchecked too
        selectedIngredients.addAll(ingredients.filter { it.food?.ignore_shopping != true && !it.isPantry() })
        initiallyChecked.addAll(selectedIngredients.map { it.id })

        this.recipe.value = recipe
        this.servings.value = servings
        this.shown.value = true
    }

    fun dismiss() {
        this.shown.value = false
        this.recipe.value = null
    }
}

@Composable
fun RecipeAddToShoppingDialog(
    state: RecipeAddToShoppingDialogState,
    showFractionalValues: Boolean,
    // Menu fork: offer the "I have" editor; onSubmit then gets the amount to buy per ingredient id
    // for rows with a "have" set. Only for callers that send amounts (not the meal plan's id-only path).
    enableHave: Boolean = false,
    onSubmit: (ingredients: List<TandoorIngredient>, servings: Double, buyAmounts: Map<Int, Double>) -> Unit
) {
    if(!state.shown.value) return

    val servingsFactor = state.servings.value / (state.recipe.value?.servings ?: 1).toDouble()
    // Menu fork: re-check "have" rows against the new need
    LaunchedEffect(servingsFactor) { state.reconcile(servingsFactor) }

    AdaptiveFullscreenDialog(
        onDismiss = { state.dismiss() },
        title = {
            Text(
                text = stringResource(Res.string.action_add_to_shopping)
            )
        },
        actions = {
            Button(
                onClick = {
                    state.closeHaveEditor(servingsFactor)
                    // never add a row with nothing left to buy
                    val selected = state.selectedIngredients
                        .filter { it.id !in state.have || state.buy(it, servingsFactor) > 0.0 }
                    val buyAmounts = selected.filter { it.id in state.have }
                        .associate { it.id to state.buy(it, servingsFactor) }
                    val servings = state.servings.value
                    state.dismiss()
                    onSubmit(selected, servings, buyAmounts)
                }
            ) {
                Text(
                    text = stringResource(Res.string.action_add)
                )
            }
        }
    ) { nsc, _, _ ->
        LazyColumn(
            Modifier.nestedScroll(nsc)
        ) {
            item {
                Box(
                    Modifier.fillMaxWidth(),
                    contentAlignment = Alignment.Center
                ) {
                    ServingsSelector(
                        value = state.servings.value,
                        label = state.recipe.value?.servings_text ?: ""
                    ) { value ->
                        state.servings.value = value
                    }
                }
            }

            item {
                Box(Modifier.padding(16.dp)) {
                    IngredientsList(
                        list = state.ingredients,

                        itemModifier = {
                            Modifier
                                .alpha(
                                    if(state.selectedIngredients.contains(it)) {
                                        1f
                                    } else if(it.isPantry()) {
                                        0.6f // Menu fork: dim less than an item unchecked by hand
                                    } else {
                                        0.2f
                                    }
                                )
                                .clickable { state.toggle(it, !state.selectedIngredients.contains(it), servingsFactor) }
                        },
                        itemAmountOverride = { if(it.id in state.have) state.buy(it, servingsFactor) else null },
                        itemOnAmountClick = if(enableHave) { ingredient ->
                            val reopen = state.editingHave != ingredient.id
                            state.closeHaveEditor(servingsFactor)
                            if(reopen) state.editingHave = ingredient.id
                        } else null,
                        itemBelowNote = { ingredient ->
                            val had = state.have[ingredient.id]
                            if(state.editingHave == ingredient.id) {
                                {
                                    HaveEditor(
                                        ingredient = ingredient,
                                        need = ingredient.amount * servingsFactor,
                                        have = had ?: 0.0,
                                        onSet = { value, apply -> state.setHave(ingredient, value, servingsFactor, apply) },
                                        onDone = { state.closeHaveEditor(servingsFactor) }
                                    )
                                }
                            } else if(had != null) {
                                {
                                    val unit = ingredient.getUnitLabel(had)
                                    Text(
                                        text = "have " + ingredient.formatAmount(had, fractional = showFractionalValues) +
                                                (if(unit.isBlank()) "" else " $unit"),
                                        style = MaterialTheme.typography.labelMedium,
                                        color = MaterialTheme.colorScheme.primary
                                    )
                                }
                            } else null
                        },
                        itemLabelSuffix = {
                            // Menu fork: an optional pantry item shows both; pantry decides the checkbox
                            if(it.id in state.optionalIngredientIds) OptionalBadge(Modifier.padding(start = 8.dp))
                            if(it.isPantry()) PantryPill()
                        },
                        itemTrailingContent = {
                            Checkbox(
                                colors = if(it.isPantry()) {
                                    CheckboxDefaults.colors(uncheckedColor = PantrySage)
                                } else {
                                    CheckboxDefaults.colors()
                                },
                                checked = state.selectedIngredients.contains(it),
                                onCheckedChange = { value -> state.toggle(it, value, servingsFactor) }
                            )
                        },

                        colors = ListItemDefaults.colors(
                            containerColor = MaterialTheme.colorScheme.surfaceContainer
                        ),

                        factor = servingsFactor,
                        showFractionalValues = showFractionalValues,
                        onOpenRecipe = { },
                        onNotEnoughSpace = { }
                    )
                }
            }
        }
    }
}

// Menu fork: what's left to buy after what you have, at the dialog's servings
fun RecipeAddToShoppingDialogState.buy(ingredient: TandoorIngredient, servingsFactor: Double): Double =
    (ingredient.amount * servingsFactor - (have[ingredient.id] ?: 0.0)).coerceAtLeast(0.0)

// Menu fork: a plain number for the text field (formatAmount groups thousands: "1,500")
private fun plainAmount(value: Double): String {
    val r = round(value * 100) / 100
    return if(r == floor(r)) r.toLong().toString() else r.toString()
}

// Menu fork: "I have [__] unit" with none / half / all-of-it shortcuts, under the row's note
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun HaveEditor(
    ingredient: TandoorIngredient,
    need: Double,
    have: Double,
    // typing only records the amount; the row's checkbox follows on done (applySelection = true)
    onSet: (value: Double, applySelection: Boolean) -> Unit,
    onDone: () -> Unit
) {
    var text by remember(ingredient.id) {
        mutableStateOf(if(have > 0.0) plainAmount(have) else "")
    }
    fun set(value: Double) {
        text = if(value > 0.0) plainAmount(value) else ""
        onSet(value, true)
    }

    val half = when {
        ingredient.unit?.isVolume() == true -> need / 2
        ingredient.unit?.name == "g" -> round(need / 2)
        else -> floor(need / 2)
    }

    FlowRow(
        modifier = Modifier.padding(top = 6.dp),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
        itemVerticalAlignment = Alignment.CenterVertically
    ) {
        Text("I have", style = MaterialTheme.typography.labelLarge)
        OutlinedTextField(
            modifier = Modifier.width(96.dp),
            value = text,
            onValueChange = { value ->
                val parsed = value.replace(',', '.').toDoubleOrNull()
                // more than the recipe needs: keep (and show) the full amount
                text = if(parsed != null && parsed > need) plainAmount(need) else value
                if(parsed != null) onSet(parsed.coerceAtMost(need), false) else if(value.isBlank()) onSet(0.0, false)
            },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal, imeAction = ImeAction.Done),
            keyboardActions = KeyboardActions(onDone = { onDone() })
        )
        val unit = ingredient.getUnitLabel(need)
        if(unit.isNotBlank()) Text(unit, style = MaterialTheme.typography.labelLarge)
        SuggestionChip(onClick = { set(0.0) }, label = { Text("none") })
        if(half > 0.0) SuggestionChip(onClick = { set(half) }, label = { Text("half") })
        SuggestionChip(onClick = { set(need); onDone() }, label = { Text("all of it") })
        SuggestionChip(onClick = onDone, label = { Text("done") })
    }
}

// Menu fork: foods marked On Hand in Tandoor are probably stocked; they start unchecked and wear a pill
private fun TandoorIngredient.isPantry() = food?.food_onhand == true

private val PantrySage = Color(0xFF7FA38A)

@Composable
private fun PantryPill() {
    Text(
        text = "pantry",
        modifier = Modifier
            .padding(start = 8.dp)
            .border(1.dp, PantrySage, RoundedCornerShape(50))
            .padding(horizontal = 7.dp),
        color = Color(0xFF9CC4A6),
        fontSize = 11.sp,
        letterSpacing = 0.4.sp,
        maxLines = 1
    )
}
