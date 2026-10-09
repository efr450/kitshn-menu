package de.kitshn.actions

import android.content.Intent
import de.kitshn.KitshnViewModel
import de.kitshn.actions.handlers.handleAppLink
import de.kitshn.actions.handlers.handleShortcut
import de.kitshn.api.tandoor.TandoorCredentials
import de.kitshn.extractUrl

/**
 * handles intents before credentials and onboarding checks
 */
fun KitshnViewModel.preHandleIntent(
    credentials: TandoorCredentials?,
    intent: Intent
): Boolean {
    if(intent.action == Intent.ACTION_MAIN) return false
    return handleAppLink(credentials, intent)
}

/**
 * handles intents after credentials and onboarding checks
 */
fun KitshnViewModel.handleIntent(intent: Intent) {
    if(intent.action == Intent.ACTION_MAIN) return
    val text = (intent.getStringExtra(Intent.EXTRA_TEXT) ?: "")

    if(handleShortcut(intent)) return
    if(handleAppLink(intent)) return

    // Menu fork: a shared recipe link goes to Add/Monitor Recipe (the recipe inbox), where Claude
    // imports it; Tandoor's own importer stays under Home's + button.
    if(intent.action == Intent.ACTION_SEND) {
        (text.extractUrl() ?: text.extractUrl("\n"))?.let { url ->
            navigateTo("recipeInbox")
            uiState.inboxShareUrl.set(url)
        }
    }
}