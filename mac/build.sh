#!/bin/sh
# GridHub の Mac のアプリを組み立てる（CONTRACTS §72.3）。大工の縄張り。Xcode は要らない（Command Line Tools の swiftc だけ）。
#
#   npm run mac                  # = sh mac/build.sh → dist/GridHub.app
#   GRIDHUB_DIST=<dir>           # 置き場所を変える（既定は dist）
#   GRIDHUB_SKIP_SWIFT=1         # Swift・アイコン・署名を飛ばし、中身（GridHub 本体）だけを詰める（Mac でない所の判定のため）
set -eu

cd "$(dirname "$0")/.."
ROOT=$(pwd)
DIST=${GRIDHUB_DIST:-dist}
case "$DIST" in /*) ;; *) DIST="$ROOT/$DIST" ;; esac
APP="$DIST/GridHub.app"

need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "[mac/build.sh] $1 が見つかりません。$2" >&2
    exit 1
  fi
}

need node "Node.js 22 以上を入れてください（https://nodejs.org または brew install node）。"
need npm "Node.js に付いてくる npm が要ります。"
VERSION=$(node -p "require('./package.json').version")

TMP=$(mktemp -d "${TMPDIR:-/tmp}/gridhub-mac.XXXXXX")
trap 'rm -rf "$TMP"' EXIT INT TERM

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

# 1. GridHub 本体: npm pack と同じ中身（§62.4）を Contents/Resources/gridhub に
echo "GridHub $VERSION の中身を詰めています…"
npm pack --silent --ignore-scripts --pack-destination "$TMP" >/dev/null
tar -xzf "$TMP"/gridhub-*.tgz -C "$TMP"
mv "$TMP/package" "$APP/Contents/Resources/gridhub"

# 2. Info.plist（版は package.json から）
sed "s/__VERSION__/$VERSION/g" mac/Info.plist > "$APP/Contents/Info.plist"
printf 'APPL????' > "$APP/Contents/PkgInfo"

if [ "${GRIDHUB_SKIP_SWIFT:-}" = "1" ]; then
  echo "GRIDHUB_SKIP_SWIFT=1 なので、Swift の組み立て・アイコン・署名は飛ばしました: $APP"
  exit 0
fi

# 3. Swift（Xcode の xcodebuild は使わない）
need swiftc "Xcode の Command Line Tools を入れてください（ターミナルで xcode-select --install）。"
echo "Swift を組み立てています…"
# 組む先の OS は Info.plist の LSMinimumSystemVersion（13.0）にそろえる。CPU はこの Mac のもの（arm64 か x86_64）
swiftc -O -swift-version 5 -parse-as-library \
  -target "$(uname -m)-apple-macos13.0" \
  -framework AppKit -framework WebKit \
  -o "$APP/Contents/MacOS/GridHub" mac/GridHub.swift

# 4. アイコン: mac/AppIcon.png（今の絵から作った 1024×1024）→ AppIcon.icns
if command -v sips >/dev/null 2>&1 && command -v iconutil >/dev/null 2>&1; then
  SET="$TMP/AppIcon.iconset"
  mkdir -p "$SET"
  for size in 16 32 128 256 512; do
    sips -z "$size" "$size" mac/AppIcon.png --out "$SET/icon_${size}x${size}.png" >/dev/null
    double=$((size * 2))
    sips -z "$double" "$double" mac/AppIcon.png --out "$SET/icon_${size}x${size}@2x.png" >/dev/null
  done
  iconutil -c icns "$SET" -o "$APP/Contents/Resources/AppIcon.icns"
else
  echo "[mac/build.sh] sips か iconutil が無いので、アイコンを入れずに組み立てます。" >&2
fi

# 5. アドホック署名（配らないので、だれの名前でもない署名）
need codesign "macOS の codesign が要ります。"
codesign --force --deep --sign - "$APP"

echo ""
echo "できました: $APP"
echo "Finder で開いて、GridHub.app をダブルクリックしてください。"
echo "はじめて開くときに「開けません」と出たら、GridHub.app を右クリックして「開く」を選んでください（署名していないため）。"
