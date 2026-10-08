package de.kitshn.ui.component.model.recipe.step

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ExpandMore
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import de.kitshn.api.tandoor.model.TandoorStep
import de.kitshn.ui.theme.Typography

// Menu fork: the importer names an optional part of a recipe (a garnish or topping sub-recipe)
// "Optional: Tamari almonds". The recipe screen shows such a step collapsed under an OPTIONAL
// badge, and Add to shopping marks its ingredients with the same badge. Labels are English only.

private val OPTIONAL_PREFIX = Regex("^\\s*optional\\s*:\\s*", RegexOption.IGNORE_CASE)

/** The step's name without its "Optional:" prefix, or null when the step isn't optional. */
fun TandoorStep.optionalName(): String? =
    OPTIONAL_PREFIX.find(name)?.let { name.substring(it.range.last + 1).trim().ifBlank { null } }

/** Badge, name and (when [onClick] is set) a chevron; collapsed it also counts the ingredients. */
@Composable
fun OptionalStepHeader(
    modifier: Modifier = Modifier,
    name: String,
    ingredientCount: Int?,
    expanded: Boolean,
    onClick: (() -> Unit)?
) {
    Row(
        modifier = modifier
            .then(
                if(onClick != null) Modifier.clickable(
                    role = Role.Button,
                    onClickLabel = if(expanded) "Hide $name" else "Show $name",
                    onClick = onClick
                ) else Modifier
            )
            .padding(start = 16.dp, end = 16.dp, top = 16.dp, bottom = if(expanded) 8.dp else 16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        OptionalBadge()
        Text(
            modifier = Modifier.weight(1f, false),
            text = name,
            maxLines = if(expanded) 2 else 1,
            overflow = TextOverflow.Ellipsis,
            style = if(expanded) Typography().titleLarge else Typography().titleMedium
        )
        if(ingredientCount != null && ingredientCount > 0) Text(
            text = if(ingredientCount == 1) "1 ingredient" else "$ingredientCount ingredients",
            style = Typography().labelLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 1
        )
        if(onClick != null) Icon(
            Icons.Rounded.ExpandMore,
            contentDescription = if(expanded) "Hide" else "Show",
            modifier = Modifier.rotate(if(expanded) 180f else 0f),
            tint = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

@Composable
fun OptionalBadge(
    modifier: Modifier = Modifier,
    fontSize: TextUnit = 11.sp
) {
    Text(
        text = "OPTIONAL",
        modifier = modifier
            .background(MaterialTheme.colorScheme.secondaryContainer, RoundedCornerShape(6.dp))
            .padding(horizontal = 7.dp, vertical = 1.dp),
        color = MaterialTheme.colorScheme.primary,
        fontSize = fontSize,
        fontWeight = FontWeight.Medium,
        letterSpacing = 0.6.sp,
        maxLines = 1
    )
}
