#!/usr/bin/env bash
# Builds the Rust engine for iOS, the iOS Simulator and macOS, generates the Swift bindings,
# and packages everything as apple/CasinoGhostCore (CasinoGhostCoreFFI.xcframework + Swift).
#
#   scripts/build-core-apple.sh            # skips the build when the engine hasn't changed
#   scripts/build-core-apple.sh --force
#
# Needs Xcode and Rust (https://rustup.rs). Xcode runs this automatically before each build
# (a pre-action in the CasinoGhost scheme).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENGINE="$ROOT/engine"
PKG="$ROOT/apple/CasinoGhostCore"
export PATH="$HOME/.cargo/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
export IPHONEOS_DEPLOYMENT_TARGET=17.0
export MACOSX_DEPLOYMENT_TARGET=14.0

if ! command -v cargo >/dev/null; then
  echo "error: Rust is not installed. Install it from https://rustup.rs, then build again." >&2
  exit 1
fi

STAMP="$PKG/.core-stamp"
HASH="$(cd "$ENGINE" && find core/src ffi/src ffi/uniffi.toml Cargo.toml Cargo.lock core/Cargo.toml ffi/Cargo.toml -type f -print0 | sort -z | xargs -0 shasum | shasum | cut -d' ' -f1)"
if [[ "${1:-}" != "--force" && -f "$STAMP" && "$(cat "$STAMP")" == "$HASH" && -d "$PKG/CasinoGhostCoreFFI.xcframework" && -f "$PKG/Sources/CasinoGhostCore/CasinoGhostCore.swift" ]]; then
  echo "CasinoGhost engine is up to date."
  exit 0
fi

TARGETS=(aarch64-apple-ios aarch64-apple-ios-sim aarch64-apple-darwin)
rustup target add "${TARGETS[@]}" >/dev/null

cd "$ENGINE"
for t in "${TARGETS[@]}"; do
  echo "Building engine for $t"
  cargo build --release --locked -p casinoghost-ffi --target "$t"
done
cargo build --release --locked -p uniffi-bindgen

GEN="$(mktemp -d)"
trap 'rm -rf "$GEN"' EXIT
./target/release/uniffi-bindgen generate \
  --library target/aarch64-apple-darwin/release/libcasinoghost_ffi.dylib \
  --language swift --out-dir "$GEN" 2>&1 | grep -v "swift-format" || true
mkdir -p "$GEN/include"
cp "$GEN/CasinoGhostCoreFFI.h" "$GEN/include/"
cp "$GEN/CasinoGhostCoreFFI.modulemap" "$GEN/include/module.modulemap"

rm -rf "$PKG/CasinoGhostCoreFFI.xcframework"
xcodebuild -create-xcframework \
  -library target/aarch64-apple-ios/release/libcasinoghost_ffi.a -headers "$GEN/include" \
  -library target/aarch64-apple-ios-sim/release/libcasinoghost_ffi.a -headers "$GEN/include" \
  -library target/aarch64-apple-darwin/release/libcasinoghost_ffi.a -headers "$GEN/include" \
  -output "$PKG/CasinoGhostCoreFFI.xcframework" >/dev/null

mkdir -p "$PKG/Sources/CasinoGhostCore"
cp "$GEN/CasinoGhostCore.swift" "$PKG/Sources/CasinoGhostCore/CasinoGhostCore.swift"
echo "$HASH" > "$STAMP"
echo "Built CasinoGhostCoreFFI.xcframework and Swift bindings."
