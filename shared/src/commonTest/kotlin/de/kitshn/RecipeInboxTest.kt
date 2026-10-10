package de.kitshn

import de.kitshn.ui.route.inbox.inboxAuth
import de.kitshn.ui.route.inbox.inboxKeepsInApp
import de.kitshn.ui.route.inbox.inboxPageUrl
import de.kitshn.ui.route.inbox.planPageUrl
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
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
    fun thePlanPageSitsBesideAddMonitor() {
        assertEquals("http://server.home:8092/shop/plan/", planPageUrl("http://server.home"))
        assertEquals("https://server.tail2d7086.ts.net:8443/shop/plan/", planPageUrl("https://server.tail2d7086.ts.net/"))
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

    @Test
    fun theAppLendsItsTokenElseItsSession() {
        assertEquals("Bearer abc", inboxAuth("abc", "sessionid=zzz"))
        assertEquals("Session abcdefghij0123456789xyz", inboxAuth(null, "csrftoken=x; sessionid=abcdefghij0123456789xyz; other=y"))
        assertEquals("Session abcdefghij0123456789xyz", inboxAuth("", "sessionid=abcdefghij0123456789xyz"))
        assertNull(inboxAuth(null, "sessionid=\"quoted0123456789abcdef\""))
        assertNull(inboxAuth(null, "csrftoken=x"))
        assertNull(inboxAuth(null, null))
    }
}
