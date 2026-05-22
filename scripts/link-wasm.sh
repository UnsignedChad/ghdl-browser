#!/usr/bin/env bash
# Link all wasm32 object archives into ghdl.wasm.
# Run from repo root after running scripts/setup-frontend-build.sh and building.

set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
BUILD="$REPO/build"
ADAWP="$REPO/vendor/adawebpack-bin/adawebpack"

# Extract wasm-valid objects from AdaWebPack's libgnat.a
TMPDIR="/tmp/libgnat-wasm-objs"
mkdir -p "$TMPDIR"
pushd "$TMPDIR" > /dev/null
llvm-ar-21 x "$ADAWP/lib/rts-native/adalib/libgnat.a" 2>/dev/null
for f in *.o; do
  file "$f" 2>/dev/null | grep -q 'WebAssembly' || rm -f "$f"
done
llvm-ar-21 rcs libgnat_wasm.a *.o 2>/dev/null
popd > /dev/null

mkdir -p "$BUILD/link-wasm"
clang-21 --target=wasm32   -nostdlib   -Wl,--no-entry   -Wl,--export-all   -Wl,--allow-undefined   -Wl,--whole-archive     "$BUILD/ghdl-wasm-full/lib/libghdl_wasm.a"     "$TMPDIR/libgnat_wasm.a"   -Wl,--no-whole-archive   -o "$BUILD/link-wasm/ghdl.wasm"

echo "Linked: $(ls -lh $BUILD/link-wasm/ghdl.wasm)"
echo "Exports: $(wasm-objdump -j Export --details $BUILD/link-wasm/ghdl.wasm | grep -c 'func\[')"
