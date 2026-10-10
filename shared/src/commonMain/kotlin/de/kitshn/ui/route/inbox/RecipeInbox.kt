package de.kitshn.ui.route.inbox

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import de.kitshn.ui.route.RouteParameters
import io.ktor.http.encodeURLParameter

// Menu fork: Add/Monitor Recipe, the recipe inbox (Menu repo, importer/menu_import/inbox.py) in the
// app. The screens are the phone page (menu-web/public/add/); the app only hosts it in a web view,
// lends it the app's Tandoor token, and opens finished recipes itself.

/**
 * The Add/Monitor Recipe page for this Tandoor address, with a shared link to start from.
 * https (Tailscale, phones): the page's own origin, port 8443. http (the tablet on the LAN):
 * menu-web's LAN port 8092, where nginx serves the same /shop/ paths.
 */
fun inboxPageUrl(instanceUrl: String, shared: String? = null): String {
    val base = menuWebUrl(instanceUrl, "add/")
    return if(shared.isNullOrBlank()) base else base + "?url=" + shared.encodeURLParameter()
}

/** Menu fork: the Plan chat page (menu-web/public/plan/), at the same origin as Add/Monitor. */
fun planPageUrl(instanceUrl: String): String = menuWebUrl(instanceUrl, "plan/")

private fun menuWebUrl(instanceUrl: String, screen: String): String {
    val https = instanceUrl.startsWith("https://", ignoreCase = true)
    val host = instanceUrl.substringAfter("://").substringBefore("/").substringBefore(":")
    return if(https) "https://$host:8443/shop/$screen" else "http://$host:8092/shop/$screen"
}

/**
 * The app's Tandoor sign-in as the page's Authorization value: "Bearer <token>" when it signed in
 * with a token, "Session <sessionid>" when it signed in with a password (kept as a cookie), else null.
 */
fun inboxAuth(token: String?, cookie: String?): String? {
    if(!token.isNullOrBlank()) return "Bearer $token"
    // only what inbox.py accepts, so an odd cookie means "sign in again" here, not a puzzling 401 there
    val sid = Regex("""(?:^|;\s*)sessionid=([\w.-]{20,200})(?:;|$)""").find(cookie ?: "")?.groupValues?.get(1)
    return sid?.let { "Session $it" }
}

/** Whether the web view may load [url] itself: only the page's own origin; anything else goes to the browser. */
fun inboxKeepsInApp(pageUrl: String, url: String): Boolean = origin(url) == origin(pageUrl)

private fun origin(url: String): String {
    val scheme = url.substringBefore("://", "").lowercase()
    val authority = url.substringAfter("://", "").substringBefore("/").substringBefore("?").substringBefore("#").lowercase()
    return "$scheme://$authority"
}

@Composable
fun RouteRecipeInbox(p: RouteParameters) {
    val credentials = p.vm.tandoorClient?.credentials ?: return
    var page by remember { mutableStateOf(inboxPageUrl(credentials.instanceUrl)) }
    var loads by remember { mutableStateOf(0) }

    // a link shared to Menu (IntentHandler) opens the page's Add now / preview choice for it,
    // even when it is the same link again
    p.vm.uiState.inboxShareUrl.WatchAndConsume {
        page = inboxPageUrl(credentials.instanceUrl, it)
        loads++
    }

    InboxPage(
        url = page,
        load = loads,
        auth = { p.vm.tandoorClient?.credentials?.let { inboxAuth(it.token?.token, it.cookie) } },
        onRecipe = { p.vm.viewRecipe(it) },
        onBack = { p.onBack?.invoke() }
    )
}

/** Menu fork: Plan with Claude, the Plan chat page (Menu repo, importer/menu_import/plan_chat.py) in
 *  the same web view as Add/Monitor, signed in the same way. */
@Composable
fun RoutePlan(p: RouteParameters) {
    val credentials = p.vm.tandoorClient?.credentials ?: return
    InboxPage(
        url = planPageUrl(credentials.instanceUrl),
        load = 0,
        auth = { p.vm.tandoorClient?.credentials?.let { inboxAuth(it.token?.token, it.cookie) } },
        onRecipe = { p.vm.viewRecipe(it) },
        onBack = { p.onBack?.invoke() }
    )
}

/** The page in a web view (Android); elsewhere, the browser. A new [load] number reloads [url];
 *  [auth] (an Authorization value, see [inboxAuth]) is read on every request. */
@Composable
expect fun InboxPage(url: String, load: Int, auth: () -> String?, onRecipe: (Int) -> Unit, onBack: () -> Unit)
