package de.kitshn.ui.route.inbox

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.platform.LocalUriHandler

// Menu fork: only Android hosts the page; here it opens in the browser (signed in with Tandoor there).
@Composable
actual fun InboxPage(url: String, load: Int, auth: () -> String?, onRecipe: (Int) -> Unit, onBack: () -> Unit) {
    val uri = LocalUriHandler.current
    LaunchedEffect(url, load) {
        uri.openUri(url)
        onBack()
    }
}
