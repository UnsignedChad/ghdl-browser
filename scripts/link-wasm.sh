#!/usr/bin/env bash
# Link all wasm32 object archives into ghdl.wasm with codegen + runtime stubs.
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

# Compile runtime-stub bodies. AdaWebPack's prebuilt libgnat.a does NOT contain
# objects for these stubs; their sources live in adainclude/ but are never built.
# Compile each one to wasm32 and add to the link.
#
# IMPORTANT: do NOT compile g-os_lib.adb — its stub returns False from
# Is_Regular_File which shadows the JS import and breaks std library lookup.
STUBOBJDIR="$TMPDIR/stub-objs"
mkdir -p "$STUBOBJDIR"
EXTRA_OBJS=""
for f in a-strunb g-dirope a-calend a-catizo a-comlin; do
  SRC=""
  if [ -f "$ADAWP/lib/rts-native/adainclude/$f.adb" ]; then
    SRC="$ADAWP/lib/rts-native/adainclude/$f.adb"
  elif [ -f "$REPO/stubs/rts/$f.adb" ]; then
    SRC="$REPO/stubs/rts/$f.adb"
  fi
  if [ -n "$SRC" ]; then
    llvm-gcc -c --target=wasm32 -O1 -gnatg -gnatyN -gnatws \
      -I"$ADAWP/lib/rts-native/adainclude" \
      "$SRC" -o "$STUBOBJDIR/$f.o" 2>/dev/null || true
    [ -f "$STUBOBJDIR/$f.o" ] && EXTRA_OBJS="$EXTRA_OBJS $STUBOBJDIR/$f.o"
  fi
done

mkdir -p "$BUILD/link-wasm"
clang-21 --target=wasm32 \
  -nostdlib \
  -Wl,--no-entry -Wl,--export-all -Wl,--allow-undefined \
  -Wl,--whole-archive \
    "$BUILD/ghdl-wasm-full/lib/libghdl_wasm.a" \
    "$TMPDIR/libgnat_wasm.a" \
  -Wl,--no-whole-archive \
  "$BUILD/grt-c-wasm/grt-cstdio.o" \
  "$BUILD/grt-c-wasm/grt-cdynload.o" \
  "$BUILD/grt-c-wasm/grt-no_sundials_c.o" \
  $EXTRA_OBJS \
  -o "$BUILD/link-wasm/ghdl.wasm"

echo "Linked: $(ls -lh $BUILD/link-wasm/ghdl.wasm)"
echo "Exports: $(wasm-objdump -j Export --details $BUILD/link-wasm/ghdl.wasm | grep -c 'func\[')"
echo "Imports: $(wasm-objdump -x $BUILD/link-wasm/ghdl.wasm | grep 'Import\[' | head -1 | grep -oE '[0-9]+')"
