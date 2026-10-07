package de.kitshn

import kotlinx.datetime.LocalDate
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/** Regression tests for the meal-plan day-shift bugs (#337, #398, #423). */
class MealPlanDateUtilsTest {

    @Test
    fun parseTandoorDate_eveningInServerTimezone_keepsServerDay() {
        // a dinner at 18:00 in America/Los_Angeles is already the next day in UTC
        assertEquals(
            LocalDate(2026, 10, 7),
            "2026-10-07T18:00:00-07:00".parseTandoorDate()
        )
    }

    @Test
    fun parseTandoorDate_earlyMorningInServerTimezone_keepsServerDay() {
        // 00:30 in UTC+2 is still the previous day in UTC
        assertEquals(
            LocalDate(2026, 5, 6),
            "2026-05-06T00:30:00+02:00".parseTandoorDate()
        )
    }

    @Test
    fun parseTandoorDate_fromUtcMidnight_returnsSameCalendarDay() {
        assertEquals(
            LocalDate(2026, 5, 6),
            "2026-05-06T00:00:00Z".parseTandoorDate()
        )
    }

    @Test
    fun parseTandoorDate_fromLegacyDateString_returnsSameDay() {
        assertEquals(
            LocalDate(2026, 5, 6),
            "2026-05-06".parseTandoorDate()
        )
    }

    @Test
    fun toStartOfDayString_sendsMidnightWithoutOffset() {
        assertEquals(
            "2026-05-13T00:00:00",
            LocalDate(2026, 5, 13).toStartOfDayString()
        )
    }

    @Test
    fun mealPlanDate_roundTrip_preservesPickedDay() {
        val picked = LocalDate(2026, 5, 13)
        val sent = picked.toStartOfDayString()
        assertEquals(picked, sent.parseTandoorDate())
    }

    @Test
    fun mealPlanDayFilter_multiDayPlan_coversEveryDayInRange() {
        fun isShownOn(day: LocalDate) =
            isMealPlanOnDay("2026-10-07T18:00:00-07:00", "2026-10-09T18:00:00-07:00", day)

        assertFalse(isShownOn(LocalDate(2026, 10, 6)))
        assertTrue(isShownOn(LocalDate(2026, 10, 7)))
        assertTrue(isShownOn(LocalDate(2026, 10, 8)))
        assertTrue(isShownOn(LocalDate(2026, 10, 9)))
        assertFalse(isShownOn(LocalDate(2026, 10, 10)))
    }
}
