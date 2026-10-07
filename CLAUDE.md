# kitshn-menu

A fork of [kitshn](https://github.com/kitshn-app/kitshn) (Kotlin Multiplatform client for Tandoor), built as the Android app **Menu** (`io.github.efr450.menu`). Rules that are personal or specific to one machine live in `CLAUDE.local.md` (gitignored).

## Branches

- `main` mirrors `upstream/main` untouched. Never commit to it.
- `menu` holds our changes on top of upstream. Short-lived work branches merge into `menu`.
- When upstream ships a release: `git fetch upstream --tags`, fast-forward `main` to it, rebase `menu` onto the release tag, rebuild, retest.
- Keep each change small and away from upstream-churning files (translations, `.github/`) to keep rebases clean. Mark fork-only code with a `// Menu fork:` comment.

## Fork-only changes

- App ID, the "Menu" label, a periwinkle launcher background, and the `-menu.N` version suffix (`androidApp/build.gradle.kts`, release build type). Bump N for each build that ships.
- `kitshn.properties`: crash-report receiver and funding API blanked. `Acra.kt` skips the HTTP sender and `FundingBanner.kt` skips the banner when they're blank.
- Launcher shortcuts (`androidApp/src/main/res/xml/shortcuts.xml`) target our app ID.
- Meal-plan days: `isMealPlanOnDay()` / `TandoorMealPlan.isOnDay()` decide which days a plan is on, for both the meal-plan grid and Home's Today/Tomorrow. Bulk "move" keeps a plan's length.
- Meal-plan dates: `parseTandoorDate()` takes the date as Tandoor wrote it (Tandoor sends its own timezone offset) and `toStartOfDayString()` sends midnight without an offset. Do not convert to UTC or the device timezone: an 18:00-07:00 dinner is the next day in UTC. Tests: `MealPlanDateUtilsTest`.

## Build and test

Needs JDK 21 (`JAVA_HOME`) and the Android SDK (`ANDROID_HOME`) with platform `android-37.0` and build-tools 37.

- Unit tests: `./gradlew :shared:jvmTest`
- Signed release APK: `./menu-release.sh` (add `--install` to `adb install -r` it). Signing settings are read from outside the repo; see the script header.

## Secrets

The repo is public. A gitleaks pre-commit hook (`.git/hooks/pre-commit`, not versioned) runs `gitleaks git --pre-commit --staged`. `.gitleaksignore` lists only upstream's historical findings. Keystores and signing properties never go in the repo.
