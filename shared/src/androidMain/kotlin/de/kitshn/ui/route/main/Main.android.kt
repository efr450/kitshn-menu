package de.kitshn.ui.route.main

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.navigation.NavHostController
import androidx.navigation.compose.rememberNavController

@Composable
actual fun rememberAlternateNavController(): NavHostController {
    return rememberNavController()
}

actual fun clearRememberAlternateNavController() {}

// Menu fork: EXTRA_APPLICATION_ID makes Chrome reuse Menu's tab instead of opening a new
// one on every tap of the Claude item.
@Composable
actual fun rememberKitchenOpener(): (String) -> Unit {
    val context = androidx.compose.ui.platform.LocalContext.current
    return remember(context) {
        { url ->
            try {
                context.startActivity(
                    android.content.Intent(android.content.Intent.ACTION_VIEW, android.net.Uri.parse(url))
                        .putExtra(android.provider.Browser.EXTRA_APPLICATION_ID, context.packageName)
                        .addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
                )
            } catch(e: android.content.ActivityNotFoundException) {
                android.widget.Toast.makeText(context, "No browser to open Claude in", android.widget.Toast.LENGTH_LONG).show()
            }
        }
    }
}
