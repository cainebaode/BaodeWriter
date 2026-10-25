#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WRITER_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
WEB_DIST="${WRITER_WEB_DIST:-$WRITER_DIR/build/web}"
BUILD_DIR="$WRITER_DIR/.build/native"
OUTPUT_DIR="$WRITER_DIR/dist"
APP="$OUTPUT_DIR/饱得写作.app"
SDK="$(xcrun --sdk macosx --show-sdk-path)"

mkdir -p "$BUILD_DIR" "$OUTPUT_DIR"
SOURCES=("$WRITER_DIR/native/App.swift" "$WRITER_DIR/native/Store.swift" "$WRITER_DIR/native/NativeTests.swift")
xcrun swiftc -swift-version 5 -O -parse-as-library -module-cache-path "$BUILD_DIR/ModuleCache" -sdk "$SDK" -target arm64-apple-macos13.0 -framework AppKit -framework WebKit -framework CryptoKit "${SOURCES[@]}" -o "$BUILD_DIR/BaodeWriter-arm64"
"$BUILD_DIR/BaodeWriter-arm64" --self-test
xcrun swiftc -swift-version 5 -O -parse-as-library -module-cache-path "$BUILD_DIR/ModuleCache" -sdk "$SDK" -target x86_64-apple-macos13.0 -framework AppKit -framework WebKit -framework CryptoKit "${SOURCES[@]}" -o "$BUILD_DIR/BaodeWriter-x86_64"

if [[ ! -f "$WEB_DIST/index.html" ]]; then
  echo "Native code compiled and tested. Build the frontend at $WEB_DIST before packaging." >&2
  exit 2
fi

mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
xcrun lipo -create "$BUILD_DIR/BaodeWriter-arm64" "$BUILD_DIR/BaodeWriter-x86_64" -output "$APP/Contents/MacOS/BaodeWriter"
cp "$WRITER_DIR/native/Info.plist" "$APP/Contents/Info.plist"
if [[ -d "$APP/Contents/Resources/Web" ]]; then rm -rf "$APP/Contents/Resources/Web"; fi
cp -R "$WEB_DIST" "$APP/Contents/Resources/Web"
if [[ ! -d "$WRITER_DIR/build/licenses" ]]; then
  echo "Missing reviewed third-party license files in writer/build/licenses." >&2
  exit 2
fi
if [[ -d "$APP/Contents/Resources/licenses" ]]; then rm -rf "$APP/Contents/Resources/licenses"; fi
cp -R "$WRITER_DIR/build/licenses" "$APP/Contents/Resources/licenses"
cp "$WRITER_DIR/LICENSES.md" "$APP/Contents/Resources/licenses/LICENSES.md"

xcrun swift -module-cache-path "$BUILD_DIR/ModuleCache" "$WRITER_DIR/native/MakeIcon.swift" "$BUILD_DIR/AppIcon.png"
ICONSET="$BUILD_DIR/AppIcon.iconset"
mkdir -p "$ICONSET"
for SIZE in 16 32 128 256 512; do
  sips -z "$SIZE" "$SIZE" "$BUILD_DIR/AppIcon.png" --out "$ICONSET/icon_${SIZE}x${SIZE}.png" >/dev/null
  DOUBLE=$((SIZE * 2))
  sips -z "$DOUBLE" "$DOUBLE" "$BUILD_DIR/AppIcon.png" --out "$ICONSET/icon_${SIZE}x${SIZE}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/AppIcon.icns"
for NOTICE in THIRD-PARTY-NOTICES.md LICENSES.md README.md; do
  if [[ ! -f "$WRITER_DIR/$NOTICE" ]]; then echo "Missing release document: $NOTICE" >&2; exit 2; fi
  cp "$WRITER_DIR/$NOTICE" "$APP/Contents/Resources/$NOTICE"
done
codesign --force --deep --sign - "$APP"
codesign --verify --deep --strict "$APP"
plutil -lint "$APP/Contents/Info.plist"

STAGING="$BUILD_DIR/dmg-root"
mkdir -p "$STAGING"
if [[ -e "$STAGING/饱得写作.app" ]]; then rm -rf "$STAGING/饱得写作.app"; fi
cp -R "$APP" "$STAGING/饱得写作.app"
ln -sfn /Applications "$STAGING/Applications"
if [[ -f "$WRITER_DIR/README.md" ]]; then cp "$WRITER_DIR/README.md" "$STAGING/使用说明.md"; fi
hdiutil create -volname "饱得写作" -srcfolder "$STAGING" -format UDZO -ov "$OUTPUT_DIR/BaodeWriter-0.1.0-universal.dmg"
shasum -a 256 "$OUTPUT_DIR/BaodeWriter-0.1.0-universal.dmg" > "$OUTPUT_DIR/SHA256SUMS.txt"
du -sh "$APP" "$OUTPUT_DIR/BaodeWriter-0.1.0-universal.dmg"
echo "Built universal macOS 13+ app and DMG with an ad-hoc signature (not notarized)."
