#!/usr/bin/env bash
# Set up the wasm32 frontend build directory for GHDL's front-end.
# Run from the repo root: bash scripts/setup-frontend-build.sh
#
# Prerequisites: Debian 13, GNAT 14.2, llvm-21-dev, clang-21, lld-21
# AdaWebPack prebuilt 24.0.0 at vendor/adawebpack-bin/adawebpack/
# GHDL 5.0.1 source at vendor/ghdl/ (native configure already run once)

set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
BUILD="$REPO/build/ghdl-wasm-full"
ADAWP="$REPO/vendor/adawebpack-bin/adawebpack"
ADAINC="$ADAWP/lib/rts-native/adainclude"
GHDL_SRC="$REPO/vendor/ghdl/src"

# 1. AdaWebPack wrapper scripts (gprbuild expects versioned -14 names)
echo "=== Creating AdaWebPack toolchain wrappers ==="
for t in gcc gnat gnatbind gnatlink gnatls gnatmake gnatchop gnatname \
         gnatprep gnatclean gnatkr; do
  wrapper="$ADAWP/bin/llvm-${t}-14"
  if [[ ! -f "$wrapper" ]]; then
    printf '#!/bin/bash\nexec "$(dirname "$0")/llvm-%s" "$@"\n' "$t" > "$wrapper"
    chmod +x "$wrapper"
    echo "  created $wrapper"
  fi
done

# 2. Install our custom Ada runtime stubs
echo "=== Installing wasm32 Ada runtime stubs ==="
for f in "$REPO/stubs/rts/"*; do
  dest="$ADAINC/$(basename "$f")"
  cp "$f" "$dest"
  echo "  installed $(basename "$f")"
done

# 3. Set up build directory
echo "=== Setting up build directory ==="
mkdir -p "$BUILD/.objs" "$BUILD/lib" "$BUILD/_excluded"

# 4. Copy GHDL source files
echo "=== Copying GHDL source files ==="
for dir in "$GHDL_SRC/vhdl" "$GHDL_SRC/synth" "$GHDL_SRC/ghdldrv" "$GHDL_SRC/psl" "$GHDL_SRC"; do
  [[ -d "$dir" ]] && cp "$dir"/*.ad? "$BUILD/" 2>/dev/null || true
done
# Also copy grt.ads (needed by some front-end units)
[[ -f "$GHDL_SRC/grt/grt.ads" ]] && cp "$GHDL_SRC/grt/grt.ads" "$BUILD/"

# 5. Apply patches
echo "=== Applying patches ==="
if [[ -f "$REPO/patches/dyn_htables.patch" ]]; then
  patch -N -r - "$BUILD/dyn_htables.ads" "$REPO/patches/dyn_htables.patch" \
    && echo "  dyn_htables.ads patched" || echo "  dyn_htables.ads already patched"
fi

# 6. Install version stub
cp "$REPO/stubs/version.ads" "$BUILD/version.ads"
echo "  installed version.ads"

# 7. Install GPR file
cp "$REPO/scripts/ghdl_wasm.gpr" "$BUILD/ghdl_wasm.gpr"

# 8. Move excluded files
echo "=== Moving excluded files to _excluded/ ==="
EXCLUDED=(
  # verilog front-end: gnat-llvm internal compiler error
  verilog-allocates.ad?
  # simul: bare-board restrictions (exception handling)
  simul-*.ad?
  # driver: uses Ada.Text_IO, exception handling
  ghdlmain.ad? ghdlcomp.ad? ghdlcov.ad? ghdlcovout.ad?
  ghdldrv.ad? ghdllib.ad? ghdllocal.ad? ghdlprint.ad? ghdlrun.ad?
  ghdlsimul.ad? ghdlsynth.ad? ghdlverilog.ad? ghdlvpi.ad? ghdlxml.ad?
  ghdl_gcc.ad? ghdl_jit.ad? ghdl_llvm.ad? ghdl_rust.ad? ghdl_simul.ad?
  ghdl_main.ad? ghdlnull.ads libghdl.ad? main.ad?
  # psl-tprint: hidden operator issue
  psl-tprint.ad?
  # synthesis entry: needs ortho_front wiring
  synthesis.adb trans.ad? trans-*.ad? trans_*.ad? translation.ad?
)
for pat in "${EXCLUDED[@]}"; do
  for f in "$BUILD"/$pat; do
    [[ -f "$f" ]] && mv "$f" "$BUILD/_excluded/" 2>/dev/null || true
  done
done

echo ""
echo "Build dir ready. Run:"
echo "  export PATH=$ADAWP/bin:\$PATH"
echo "  cd $BUILD && gprbuild -p -P ghdl_wasm.gpr 2>&1 | tee build.log"
