package de.kitshn.ui.route.main

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.PostAdd
import androidx.compose.material.icons.outlined.Book
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.ShoppingCart
import androidx.compose.material.icons.rounded.Book
import androidx.compose.material.icons.rounded.CalendarMonth
import androidx.compose.material.icons.rounded.Home
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material.icons.rounded.ShoppingCart
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.adaptive.navigationsuite.NavigationSuiteDefaults
import androidx.compose.material3.adaptive.navigationsuite.NavigationSuiteScaffold
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.style.TextOverflow
import androidx.navigation.NavHostController
import androidx.navigation.compose.currentBackStackEntryAsState
import de.kitshn.saveBreadcrumb
import de.kitshn.ui.dialog.version.TandoorBetaInfoDialog
import de.kitshn.ui.dialog.version.TandoorServerVersionCompatibilityDialog
import de.kitshn.ui.route.RouteParameters
import de.kitshn.ui.route.main.subroute.MainSubrouteNavigation
import kitshn.shared.generated.resources.Res
import kitshn.shared.generated.resources.navigation_books
import kitshn.shared.generated.resources.navigation_home
import kitshn.shared.generated.resources.navigation_meal_plan
import kitshn.shared.generated.resources.navigation_settings
import kitshn.shared.generated.resources.navigation_shopping
import org.jetbrains.compose.resources.StringResource
import org.jetbrains.compose.resources.stringResource

enum class AppDestinations(
    val label: StringResource,
    val activeIcon: ImageVector,
    val icon: ImageVector,
    val route: String,
    val offlineReady: Boolean
) {
    HOME(Res.string.navigation_home, Icons.Rounded.Home, Icons.Outlined.Home, "home", false),
    MEAL_PLAN(
        Res.string.navigation_meal_plan,
        Icons.Rounded.CalendarMonth,
        Icons.Outlined.CalendarMonth,
        "mealplan",
        false
    ),
    SHOPPING(
        Res.string.navigation_shopping,
        Icons.Rounded.ShoppingCart,
        Icons.Outlined.ShoppingCart,
        "shopping",
        true
    ),
    BOOKS(Res.string.navigation_books, Icons.Rounded.Book, Icons.Outlined.Book, "books", false),
    SETTINGS(
        Res.string.navigation_settings,
        Icons.Rounded.Settings,
        Icons.Outlined.Settings,
        "settings",
        true
    ),
}

@Composable
fun RouteMain(p: RouteParameters) {
    if(p.vm.tandoorClient == null) return

    var currentDestination by rememberSaveable { mutableStateOf(AppDestinations.HOME) }
    val mainSubNavHostController = rememberAlternateNavController()

    val destination by mainSubNavHostController.currentBackStackEntryAsState()
    LaunchedEffect(destination) {
        val route = destination?.destination?.route ?: ""
        saveBreadcrumb("subNavRoute", route)

        AppDestinations.entries.forEach {
            if(!route.startsWith(it.route)) return@forEach
            currentDestination = it
        }
    }

    val isOnline by p.vm.isOnline.collectAsState()
    val isOffline = !isOnline
    val openKitchen = rememberKitchenOpener()
    val instanceUrl = p.vm.tandoorClient?.credentials?.instanceUrl

    NavigationSuiteScaffold(
        navigationSuiteColors = NavigationSuiteDefaults.colors(
            navigationRailContainerColor = MaterialTheme.colorScheme.surfaceContainerHighest
        ),
        navigationSuiteItems = {
            AppDestinations.entries.forEach {
                // don't display when in offline mode and destination isn't offline ready
                if(isOffline && !it.offlineReady) return@forEach

                item(
                    icon = {
                        Icon(
                            imageVector = if(it == currentDestination) it.activeIcon else it.icon,
                            contentDescription = stringResource(it.label)
                        )
                    },
                    label = {
                        Text(
                            text = stringResource(it.label),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                    },
                    selected = it == currentDestination,
                    onClick = {
                        currentDestination = it
                        mainSubNavHostController.navigate(it.route)
                    }
                )
            }

            // Menu fork: "Claude" opens a fresh Kitchen chat, in the Claude app on Android. The
            // fallback: the desktop running Tandoor serves port 8765 as a redirect to
            // claude.ai/code/new (Menu repo, kitchen/).
            if(isOnline && instanceUrl != null) item(
                icon = { Icon(Icons.Outlined.AutoAwesome, contentDescription = "Claude") },
                label = { Text(text = "Claude", maxLines = 1) },
                selected = false,
                onClick = { openKitchen(kitchenUrl(instanceUrl)) }
            )

            // Menu fork: Add/Monitor Recipe, the recipe inbox page in a web view (ui/route/inbox)
            if(isOnline) item(
                icon = { Icon(Icons.Outlined.PostAdd, contentDescription = "Add/Monitor Recipe") },
                label = { Text(text = "Add/Monitor", maxLines = 1) },
                selected = false,
                onClick = { p.vm.navigateTo("recipeInbox") }
            )
        },
        containerColor = MaterialTheme.colorScheme.surfaceContainer
    ) {
        MainSubrouteNavigation(p.vm, mainSubNavHostController)
    }

    TandoorServerVersionCompatibilityDialog(vm = p.vm)
    TandoorBetaInfoDialog(vm = p.vm)
}

// Menu fork: the Kitchen redirect on the Tandoor host, e.g. http://192.168.50.196 -> http://192.168.50.196:8765/
internal fun kitchenUrl(instanceUrl: String): String {
    val host = instanceUrl.substringAfter("://").substringBefore("/").substringBefore(":")
    return "http://$host:8765/"
}

// Menu fork: opens a Kitchen chat. Android tries the Claude app first and falls back to this
// URL in the browser, reusing one tab for it.
@Composable
expect fun rememberKitchenOpener(): (String) -> Unit

// alternate saving method because multiple rememberNavController() cause problem at jvmMain and iosMain
@Composable
expect fun rememberAlternateNavController(): NavHostController

expect fun clearRememberAlternateNavController()