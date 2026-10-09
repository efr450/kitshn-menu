package de.kitshn

import de.kitshn.ui.route.inbox.inboxKeepsInApp
import de.kitshn.ui.route.inbox.inboxPageUrl
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class RecipeInboxTest {
    @Test
    fun tabletOnTheLanUsesTheLanPort() {
        assertEquals("http://server.home:8092/shop/add/", inboxPageUrl("http://server.home"))
        assertEquals("http://192.168.50.196:8092/shop/add/", inboxPageUrl("http://192.168.50.196:80/"))
    }

    @Test
    fun phonesOnTailscaleUseThePageOrigin() {
        assertEquals("https://server.tail2d7086.ts.net:8443/shop/add/", inboxPageUrl("https://server.tail2d7086.ts.net"))
    }

    @Test
    fun aSharedLinkIsEncoded() {
        assertEquals(
            "http://server.home:8092/shop/add/?url=https%3A%2F%2Fsite.test%2Fr%3Fa%3D1%26b%3D2",
            inboxPageUrl("http://server.home", "https://site.test/r?a=1&b=2")
        )
        assertEquals("http://server.home:8092/shop/add/", inboxPageUrl("http://server.home", " "))
    }

    @Test
    fun onlyThePageOriginStaysInTheApp() {
        val page = "http://server.home:8092/shop/add/"
        assertTrue(inboxKeepsInApp(page, "http://server.home:8092/shop/add/?url=x"))
        assertTrue(inboxKeepsInApp(page, "http://SERVER.home:8092/shop/"))
        assertFalse(inboxKeepsInApp(page, "http://server.home/recipe/3/"))
        assertFalse(inboxKeepsInApp(page, "https://server.home:8092/shop/add/"))
        assertFalse(inboxKeepsInApp(page, "https://www.budgetbytes.com/x/"))
        assertFalse(inboxKeepsInApp(page, "http://server.home:8092@evil.test/"))
    }
}
