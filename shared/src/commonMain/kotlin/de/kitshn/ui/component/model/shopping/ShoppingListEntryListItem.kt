package de.kitshn.ui.component.model.shopping

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ExpandMore
import androidx.compose.material3.AssistChipDefaults
import androidx.compose.material3.ElevatedAssistChip
import androidx.compose.material3.ExperimentalMaterial3ExpressiveApi
import androidx.compose.material3.FilledTonalIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.mutableStateSetOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.sp
import de.kitshn.TestTagRepository
import de.kitshn.api.tandoor.model.TandoorMealPlan
import de.kitshn.api.tandoor.model.shopping.TandoorShoppingList
import de.kitshn.api.tandoor.model.shopping.TandoorShoppingListEntry
import de.kitshn.api.tandoor.model.shopping.TandoorShoppingListEntryFood
import de.kitshn.BY_WEIGHT_MARKER
import de.kitshn.BuyChip
import de.kitshn.BuyLine
import de.kitshn.BuyPackage
import de.kitshn.buyChip
import de.kitshn.formatAmount
import de.kitshn.hasMarker
import de.kitshn.ui.modifier.loadingPlaceHolder
import de.kitshn.ui.selectionMode.SelectionModeState
import de.kitshn.ui.selectionMode.values.selectionModeListItemColors
import de.kitshn.ui.state.ErrorLoadingSuccessState
import de.kitshn.ui.theme.Typography
import de.kitshn.ui.theme.playfairDisplay
import kitshn.shared.generated.resources.Res
import kitshn.shared.generated.resources.action_more
import kitshn.shared.generated.resources.lorem_ipsum_short
import org.jetbrains.compose.resources.stringResource

@Composable
fun ShoppingListEntryListItemPlaceholder(
    modifier: Modifier = Modifier,
    loadingState: ErrorLoadingSuccessState = ErrorLoadingSuccessState.LOADING,
    enlarge: Boolean = false
) {
    ListItem(
        modifier = modifier.fillMaxWidth(),
        colors = ListItemDefaults.colors(
            supportingColor = MaterialTheme.colorScheme.primary
        ),
        headlineContent = {
            if (enlarge) {
                Text(
                    text = stringResource(Res.string.lorem_ipsum_short) + stringResource(Res.string.lorem_ipsum_short),
                    modifier = Modifier.loadingPlaceHolder(loadingState),
                    style = Typography().headlineMedium,
                    fontFamily = playfairDisplay()
                )
            } else {
                Text(
                    text = stringResource(Res.string.lorem_ipsum_short) + stringResource(Res.string.lorem_ipsum_short),
                    modifier = Modifier.loadingPlaceHolder(loadingState)
                )
            }
        },
        supportingContent = {
            Row(
                modifier = Modifier.horizontalScroll(
                    rememberScrollState()
                ),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                ElevatedAssistChip(
                    label = {
                        if (enlarge) {
                            Text(
                                text = stringResource(Res.string.lorem_ipsum_short).substring(5),
                                modifier = Modifier.loadingPlaceHolder(loadingState),
                                fontSize = 20.sp,
                                lineHeight = 20.sp,
                                fontWeight = FontWeight.SemiBold
                            )
                        } else {
                            Text(
                                text = stringResource(Res.string.lorem_ipsum_short).substring(5),
                                modifier = Modifier.loadingPlaceHolder(loadingState)
                            )
                        }
                    },
                    colors = AssistChipDefaults.elevatedAssistChipColors(
                        containerColor = MaterialTheme.colorScheme.surfaceContainerHigh
                    ),
                    elevation = AssistChipDefaults.elevatedAssistChipElevation(0.dp),
                    onClick = { }
                )
            }
        }
    )
}

@OptIn(ExperimentalMaterial3ExpressiveApi::class)
@Composable
fun ShoppingListEntryListItem(
    modifier: Modifier = Modifier,

    food: TandoorShoppingListEntryFood,
    entries: List<TandoorShoppingListEntry>,

    selectionState: SelectionModeState<Int>? = null,

    showFractionalValues: Boolean,

    // Menu fork: the food's package size, for the "buy" chip (client.container.buyPackages)
    buyPackage: BuyPackage? = null,

    enlarge: Boolean = false,

    onClick: (() -> Unit)? = null,
    onClickExpand: (() -> Unit)? = null,
    onDoubleClick: (() -> Unit)? = null
) {
    val amountChips = remember { mutableStateListOf<Pair<String, Boolean>>() }
    val mealplans =
        remember { mutableStateListOf<TandoorMealPlan>() }

    val shoppingLists = remember { mutableStateListOf<TandoorShoppingList>() }

    var usePluralName by remember { mutableStateOf(false) }

    // Menu fork: how you'd buy it (lb, or whole packages) beside the recipe amounts; rules in BuyAs.kt
    var buyAs by remember { mutableStateOf<BuyChip?>(null) }

    LaunchedEffect(entries, buyPackage) {
        amountChips.clear()
        amountChips.addAll(
            entries.filter { it.amount != 0.0 || it.unit != null }
                .groupBy { it.unit?.id ?: -100 }
                .values
                .map { entryList ->
                    val allItemsChecked = entryList.all { it.checked }

                    val sharedAmount =
                        entryList.filter { (!it.checked || allItemsChecked) }.sumOf { it.amount }
                    val sharedUnit = entryList[0].unit

                    if(sharedAmount > 1.0) usePluralName = true

                    val value = StringBuilder()
                    value.append(sharedAmount.formatAmount(showFractionalValues, sharedUnit))
                    if((sharedUnit?.name ?: "").isNotBlank()) value.append(" ${sharedUnit!!.name}")

                    Pair(
                        value.toString(),
                        allItemsChecked
                    )
                }
        )
        // Menu fork: unmeasured amounts ("some parmesan") are stored as 0 with no unit; say so
        // instead of showing no amount at all.
        val unmeasured = entries.filter { it.amount == 0.0 && it.unit == null }
        if(unmeasured.isNotEmpty())
            amountChips.add(Pair("some", unmeasured.all { it.checked }))

        // Menu fork
        buyAs = buyChip(
            lines = entries.map { BuyLine(it.amount, it.unit?.name, it.unit?.base_unit, it.checked) },
            byWeight = hasMarker(food.supermarket_category?.description, BY_WEIGHT_MARKER),
            pkg = buyPackage
        )

        mealplans.clear()
        mealplans.addAll(
            entries.filter { it.list_recipe_data?.meal_plan_data != null }
                .map { it.list_recipe_data!!.meal_plan_data!! }
        )

        val shoppingListIds = mutableStateSetOf<Long>()

        shoppingLists.clear()
        for(entry in entries) {
            for(shoppingList in entry.shopping_lists) {
                if(shoppingListIds.contains(shoppingList.id))
                    continue

                shoppingLists.add(shoppingList)
                shoppingListIds.add(shoppingList.id)
            }
        }
    }

    val allChecked = entries.all { it.checked }

    val hapticFeedback = LocalHapticFeedback.current

    val colors = ListItemDefaults.selectionModeListItemColors(
        defaultColors = ListItemDefaults.colors(
            supportingColor = MaterialTheme.colorScheme.primary
        ),
        selected = selectionState?.selectedItems?.contains(food.id) ?: false,
    )

    val isSelectionModeEnabled = selectionState?.isSelectionModeEnabled() == true

    ListItem(
        modifier = modifier.fillMaxWidth()
            .alpha(if(allChecked) 0.7f else 1f).run {
                if(onClick != null) {
                    combinedClickable(
                        onClick = {
                            if(isSelectionModeEnabled) {
                                hapticFeedback.performHapticFeedback(HapticFeedbackType.LongPress)
                                selectionState.selectToggle(food.id)
                            } else {
                                onClick()
                            }
                        },
                        onLongClick = {
                            hapticFeedback.performHapticFeedback(HapticFeedbackType.LongPress)
                            selectionState?.selectToggle(food.id)
                        },
                        onDoubleClick = if(isSelectionModeEnabled || onDoubleClick == null) {
                            null
                        } else {
                            { onDoubleClick() }
                        }
                    )
                } else {
                    this
                }
            }
            .testTag(TestTagRepository.LIST_ITEM_SHOPPING_LIST_ENTRY.name),
        colors = colors,
        leadingContent = if(entries.size > 1 && onClickExpand != null) {
            {
                FilledTonalIconButton(
                    onClick = onClickExpand,
                    modifier =
                        Modifier.minimumInteractiveComponentSize()
                            .size(
                                IconButtonDefaults.smallContainerSize(
                                    IconButtonDefaults.IconButtonWidthOption.Narrow
                                )
                            )
                ) {
                    Icon(
                        Icons.Rounded.ExpandMore,
                        contentDescription = stringResource(Res.string.action_more),
                        modifier = Modifier.size(IconButtonDefaults.smallIconSize)
                    )
                }
            }
        } else {
            null
        },
        headlineContent = {
            if (enlarge) {
                Text(
                    text = if(usePluralName) food.plural_name?.ifBlank { null } ?: food.name else food.name,
                    style = Typography().headlineMedium,
                    fontFamily = playfairDisplay(),
                    textDecoration = if(allChecked) {
                        TextDecoration.LineThrough
                    } else {
                        TextDecoration.None
                    }
                )
            } else {
                Text(
                    text = if(usePluralName)
                        food.plural_name?.ifBlank { null } ?: food.name
                    else
                        food.name,
                    textDecoration = if(allChecked) {
                        TextDecoration.LineThrough
                    } else {
                        TextDecoration.None
                    }
                )
            }
        },
        supportingContent = {
            Row(
                modifier = Modifier.horizontalScroll(
                    rememberScrollState()
                ).height(48.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                amountChips.forEach {
                    Box(
                        Modifier
                            .padding(top = 8.dp, bottom = 8.dp)
                            .height(32.dp)
                            .clip(RoundedCornerShape(8.dp))
                            .background(
                                MaterialTheme.colorScheme.surfaceContainerHigh
                            )
                            .padding(start = 16.dp, end = 16.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        if (enlarge) {
                            Text(
                                text = it.first,
                                textDecoration = if(it.second) {
                                    TextDecoration.LineThrough
                                } else {
                                    TextDecoration.None
                                },
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                fontSize = 20.sp,
                                lineHeight = 20.sp,
                                fontWeight = FontWeight.SemiBold,
                            )
                        } else {
                            Text(
                                text = it.first,
                                textDecoration = if(it.second) {
                                    TextDecoration.LineThrough
                                } else {
                                    TextDecoration.None
                                },
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                fontWeight = FontWeight.Medium
                            )
                        }
                    }
                }

                // Menu fork: the "buy" chip, outlined in the accent color
                buyAs?.let { (label, checked) ->
                    Box(
                        Modifier
                            .padding(top = 8.dp, bottom = 8.dp)
                            .height(32.dp)
                            .border(1.dp, MaterialTheme.colorScheme.primary, RoundedCornerShape(8.dp))
                            .padding(start = 16.dp, end = 16.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = label,
                            textDecoration = if(checked) TextDecoration.LineThrough else TextDecoration.None,
                            color = MaterialTheme.colorScheme.primary,
                            fontSize = if(enlarge) 20.sp else TextUnit.Unspecified,
                            lineHeight = if(enlarge) 20.sp else TextUnit.Unspecified,
                            fontWeight = if(enlarge) FontWeight.SemiBold else FontWeight.Medium
                        )
                    }
                }
            }
        },
        trailingContent = if(shoppingLists.isNotEmpty()) {
            {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    repeat(shoppingLists.size) {
                        ShoppingListColorPill(
                            shoppingList = shoppingLists[it]
                        )
                    }
                }
            }
        } else null
    )
}