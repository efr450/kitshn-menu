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
- Meal-plan list (`TandoorMealPlanRoute`): never sends `to_date`, because Tandoor 2.6's `to_date` filter compares the plan's end date and drops plans still running after the window. Plans starting after the window are cut client-side.
- Amounts: only volume units (`TandoorUnit.isVolume()`) show fractions; weights, counts, servings and nutrition show decimals with at most 2 places. `{{ scale(n) }}` checks the unit word after it. Android's ICU regex rejects a quantified lookahead that the JVM accepts, so check regex changes on the device. Tests: `FormatAmountTest`.
- Ingredient amounts use Nunito SemiBold (`nunito()` in `Type.kt`, applied in `IngredientItem`, measured in `IngredientsList`); units and notes keep Playfair. Font licenses are in `licenses/fonts/`.
- Recipe toolbar: "Add to meal plan" is an icon button after Share; `RecipeDetailsDropdown` hides that item when `onAddToMealPlan` is null.
- Add to shopping: foods Tandoor marks On Hand (`TandoorFood.food_onhand`) start unchecked like `ignore_shopping` ones, dim to 60% instead of 20%, and get a sage "pantry" pill (`IngredientItem.labelSuffix`) and checkbox border. Recipes loaded from the Room cache carry no On Hand, so nothing gets the pill there.
- Navigation rail: a "Claude" item (online only, after Settings) opens `http://<Tandoor host>:8765/`, the Kitchen redirect served by `kitchen/kitchen.py` in the Menu repo, which sends it to a blank claude.ai/code/new chat (`kitchenUrl()` in `Main.kt`). On Android `rememberKitchenOpener()` passes `Browser.EXTRA_APPLICATION_ID`, so Chrome reuses one tab instead of opening a new one per tap.
- Shopping list: an empty food plural falls back to the name (upstream treated only null that way and printed a blank row), and unmeasured entries (amount 0, no unit, e.g. "some parmesan") get a "some" chip.
- Ingredient notes: `scaleNoteAmounts()` (`NoteScaling.kt`) scales measures in the note with servings, in `IngredientItem` and `{{ ingredients[i].note }}`. Only a number (or range) followed by a cooking unit scales; a hyphen before the unit (`1-inch`, `20-ounce`), a container after it (`15 oz can`) or parentheses next to a container (`(15 oz) can`, `can (15 oz)`) mark a size and stay. `1-1/2` is a mixed number, not a range. Tests: `NoteScalingTest`.
- Optional steps: a step named "Optional: <name>" (`optionalName()` in `OptionalStep.kt`) shows collapsed on the recipe screen under an OPTIONAL badge (`RecipeStepCard(collapseOptional = true)`, only from `RecipeDetails`; the editor never collapses). In Add to shopping its ingredients stay checked and wear the badge; a pantry item keeps its pantry rule (unchecked) and shows both pills.
- Add to shopping "have": with `enableHave` (only from `RecipeDetails`, whose `addToShopping` sends amounts; the meal plan's id-only path can't), tapping an amount opens "I have [__]" (`HaveEditor`); the row shows the full amount struck above what to buy and `addToShopping(buyAmounts)` posts that. The checkbox follows "have" only on state changes (none/part/all), so a hand toggle wins; rows with nothing to buy are never posted. Plumbing: `IngredientItem.amountOverride/onAmountClick/belowNote`.
- Step timers: `detectTimers()` also treats unspaced en and em dashes as range separators (a spaced one is prose) ("5–6 min", our importer's style), and tapping a range starts a timer for its first number with no picker (`MarkdownRichTextWithTimerDetection`). Tests: `TimerDetectionTest`.
- Meal-plan dates: `parseTandoorDate()` takes the date as Tandoor wrote it (Tandoor sends its own timezone offset) and `toStartOfDayString()` sends midnight without an offset. Do not convert to UTC or the device timezone: an 18:00-07:00 dinner is the next day in UTC. Tests: `MealPlanDateUtilsTest`.
- Shopping list "buy" chip: a second, outlined chip says how you'd buy a food: whole packages ("1 half-gallon") when Tandoor has a food-specific conversion to a unit whose description says `package`, else lb when the food's supermarket category description says `by weight`. All rules are pure functions in `BuyAs.kt` (tests: `BuyAsTest`); `TandoorUnitConversionRoute.loadPackages()` fills `container.buyPackages`, keyed by lowercase food name because shopping entries carry the app's local food id. The Menu importer writes the data (`mi foods package`, `mi foods by-weight`).
- Phone shopping page (`menu-web/`): a web page, not part of the app, for shopping from a phone. It is served by `menu-web/compose.yaml` (nginx on 127.0.0.1:8090), and Tailscale maps it to `https://server.tail2d7086.ts.net:8443/shop/` with `tailscale serve --bg --https=8443 --set-path /shop http://127.0.0.1:8090` plus `--https=8443 --set-path / http://localhost:80` for Tandoor's API (set `MSYS_NO_PATHCONV=1` in Git Bash). Port 8443 makes it a separate origin, so Chrome installs it as an app beside the installed Tandoor app; Android won't install two apps with nested scopes on one origin. Cookies ignore the port, so it still uses the browser's Tandoor session and Django's `csrftoken` cookie (the Origin check passes because Host carries the port); no token is stored. The older `https://server.tail2d7086.ts.net/shop/` mapping still works. Its parts:
  - `buy.js` repeats `BuyAs.kt`. Both must pass `menu-web/buy-cases.json` (`BuyCasesTest` in `shared/src/jvmTest`, `test/buy.test.js`), so change both and add a case together.
  - `list.js` groups entries into aisles (category name order, Other last).
  - `sync.js` keeps Tandoor as the only list. Ticks are absolute checked values sent through `shopping-list-entry/bulk/`, queued while offline and drawn over the fetched list until a refresh that started after Tandoor accepted them.
  - `sw.js` caches the page's own files network-first.
  - `snapshot.js` builds "Save copy".
  - Tests: `cd menu-web && npm test` (Node, no dependencies). Try it locally with `node dev-server.js --env <file with TANDOOR_URL/TANDOOR_TOKEN>`, which writes to the real list.

## Build and test

Needs JDK 21 (`JAVA_HOME`) and the Android SDK (`ANDROID_HOME`) with platform `android-37.0` and build-tools 37.

- Unit tests: `./gradlew :shared:jvmTest`
- Signed release APK: `./menu-release.sh` (add `--install` to `adb install -r` it). Signing settings are read from outside the repo; see the script header.
- On Windows Git Bash, export both first or the build fails with "SDK location not found": `JAVA_HOME="$(ls -d /c/Program\ Files/Microsoft/jdk-21* | head -1)"`, `ANDROID_HOME="$LOCALAPPDATA/Android/Sdk"`. `adb` is not on PATH; use `$ANDROID_HOME/platform-tools/adb.exe` (e.g. `exec-out screencap -p` to check the screen).

## Secrets

The repo is public. A gitleaks pre-commit hook (`.git/hooks/pre-commit`, not versioned) runs `gitleaks git --pre-commit --staged`. `.gitleaksignore` lists only upstream's historical findings. Keystores and signing properties never go in the repo.
