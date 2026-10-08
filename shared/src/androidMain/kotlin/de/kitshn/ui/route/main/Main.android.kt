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

// Menu fork: the Claude app opens a new Code chat; it remembers the Kitchen environment.
private const val CLAUDE_APP = "com.anthropic.claude"
private const val CLAUDE_NEW_CHAT = "https://claude.ai/code/new"

// Menu fork: the Claude app first. Without it, the Kitchen redirect in the browser, where
// EXTRA_APPLICATION_ID makes Chrome reuse Menu's tab instead of opening a new one per tap.
@Composable
actual fun rememberKitchenOpener(): (String) -> Unit {
    val context = androidx.compose.ui.platform.LocalContext.current
    return remember(context) {
        { url ->
            val view = { uri: String ->
                android.content.Intent(android.content.Intent.ACTION_VIEW, android.net.Uri.parse(uri))
                    .addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            try {
                context.startActivity(view(CLAUDE_NEW_CHAT).setPackage(CLAUDE_APP))
            } catch(e: RuntimeException) {
                // not installed or disabled (ActivityNotFoundException), or refused (SecurityException)
                try {
                    context.startActivity(
                        view(url).putExtra(android.provider.Browser.EXTRA_APPLICATION_ID, context.packageName)
                    )
                } catch(e: android.content.ActivityNotFoundException) {
                    android.widget.Toast.makeText(context, "No browser to open Claude in", android.widget.Toast.LENGTH_LONG).show()
                }
            }
        }
    }
}
