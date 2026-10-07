#!/bin/sh
# Build the signed Menu release APK and, with --install, put it on the connected device.
# Signing settings come from $MENU_SIGNING (default ~/.android/menu-release.properties):
#   SIGNING_STORE_FILE, SIGNING_STORE_PASSWORD, SIGNING_KEY_ALIAS, SIGNING_KEY_PASSWORD
set -e
cd "$(dirname "$0")"

props="${MENU_SIGNING:-$HOME/.android/menu-release.properties}"
[ -f "$props" ] || { echo "No signing properties at $props"; exit 1; }
# read KEY=VALUE lines literally (no shell expansion of the values)
while IFS='=' read -r key value; do
    case "$key" in
        SIGNING_STORE_FILE|SIGNING_STORE_PASSWORD|SIGNING_KEY_ALIAS|SIGNING_KEY_PASSWORD)
            export "$key=$(printf '%s' "$value" | tr -d '\r')" ;;
    esac
done < "$props"

./gradlew :androidApp:assembleRelease --console=plain

apk="androidApp/build/outputs/apk/release/androidApp-release.apk"
echo "Built $apk"

if [ "$1" = "--install" ]; then
    adb="$(command -v adb || echo "$ANDROID_HOME/platform-tools/adb")"
    "$adb" install -r "$apk"
fi
