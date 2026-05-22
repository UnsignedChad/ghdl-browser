#!/usr/bin/env bash
# Set up the wasm32 frontend build for GHDL (parser + elaborator + synth).
# Run from the repo root: bash scripts/setup-frontend-build.sh
#
# Prerequisites: Debian 13, GNAT 14.2, llvm-21-dev, clang-21, lld-21
# AdaWebPack prebuilt 24.0.0 at vendor/adawebpack-bin/adawebpack/
# GHDL 5.0.1 source at vendor/ghdl/ (native configure already run once)
# GCC Ada runtime at /usr/lib/gcc/x86_64-linux-gnu/14/adainclude/

set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
BUILD="$REPO/build/ghdl-wasm-full"
ADAWP="$REPO/vendor/adawebpack-bin/adawebpack"
ADAINC="$ADAWP/lib/rts-native/adainclude"
GHDL_SRC="$REPO/vendor/ghdl/src"
GCC_ADA="/usr/lib/gcc/x86_64-linux-gnu/14/adainclude"

# 1. AdaWebPack wrapper scripts (gprbuild expects versioned -14 names)
echo "=== Creating AdaWebPack toolchain wrappers ==="
for t in gcc gnat gnatbind gnatlink gnatls gnatmake gnatchop gnatname          gnatprep gnatclean gnatkr; do
  wrapper="$ADAWP/bin/llvm-${t}-14"
  if [[ ! -f "$wrapper" ]]; then
    printf '#!/bin/bash\nexec "$(dirname "$0")/llvm-%s" "$@"\n' "$t" > "$wrapper"
    chmod +x "$wrapper"
    echo "  created $wrapper"
  fi
done

# 2. Install wasm32 Ada runtime stubs from this repo
echo "=== Installing wasm32 Ada runtime stubs ==="
for f in "$REPO/stubs/rts/"*; do
  cp "$f" "$ADAINC/$(basename "$f")"
  echo "  installed $(basename "$f")"
done

# 3. Copy needed units from system GCC Ada runtime (pure Ada, no OS deps)
echo "=== Copying GCC Ada runtime units ==="
for f in a-chahan.ads a-chahan.adb a-charac.ads          s-vallli.ads s-vallli.adb s-valllli.ads s-vallllu.ads s-valllf.ads; do
  [[ -f "$GCC_ADA/$f" ]] && cp "$GCC_ADA/$f" "$ADAINC/" && echo "  copied $f"
done

# 4. Set up build directory
echo "=== Setting up build directory ==="
mkdir -p "$BUILD/.objs" "$BUILD/lib" "$BUILD/_excluded"

# 5. Copy GHDL source files
echo "=== Copying GHDL source files ==="
for dir in "$GHDL_SRC/vhdl" "$GHDL_SRC/synth" "$GHDL_SRC/ghdldrv" "$GHDL_SRC/psl" "$GHDL_SRC"; do
  [[ -d "$dir" ]] && cp "$dir"/*.ad? "$BUILD/" 2>/dev/null || true
done
[[ -f "$GHDL_SRC/grt/grt.ads" ]] && cp "$GHDL_SRC/grt/grt.ads" "$BUILD/"
# libghdl lives in a subdirectory
[[ -f "$GHDL_SRC/vhdl/libghdl/libghdl.adb" ]] && cp "$GHDL_SRC/vhdl/libghdl/libghdl.adb" "$BUILD/"
cp "$REPO/vendor/ghdl/ghdlsynth_maybe.ads" "$BUILD/" 2>/dev/null || true

# 6. Apply patches to GHDL source
echo "=== Applying patches ==="
if [[ -f "$REPO/patches/dyn_htables.patch" ]]; then
  patch -N -r - "$BUILD/dyn_htables.ads" <(grep -A2 -B2 'Table_Low_Bound' "$REPO/patches/dyn_htables.patch" | head -6) 2>/dev/null || true
  # Fix dyn_htables.adb Init call
  sed -i 's/Wrapper_Tables.Init (HT.Els);/Wrapper_Tables.Init (HT.Els, 128);/' "$BUILD/dyn_htables.adb" || true
fi

# 7. Install stubs and version
cp "$REPO/stubs/version.ads" "$BUILD/version.ads"
cp "$REPO/scripts/ghdl_wasm.gpr" "$BUILD/ghdl_wasm.gpr"

# 8. Install stub bodies for packages with excluded driver dependencies
cp "$REPO/stubs/libghdl.adb"     "$BUILD/" 2>/dev/null || true
cp "$REPO/stubs/ghdlsynth.adb"   "$BUILD/" 2>/dev/null || true
cp "$REPO/stubs/simple_io.adb"   "$BUILD/" 2>/dev/null || true
cp "$REPO/stubs/synthesis.adb"   "$BUILD/" 2>/dev/null || true

# 9. Move excluded files
echo "=== Moving excluded files to _excluded/ ==="
for pat in   ghdlcomp.ad? ghdlcov.ad? ghdlcovout.ad? ghdldrv.ad? ghdllib.ad?   ghdllocal.ad? ghdl_main.ad? ghdlmain.ad? ghdlnull.ads ghdlprint.ad?   ghdlrun.ad? ghdlsimul.ad? ghdlsynth.ads ghdlverilog.ad? ghdlvpi.ad?   ghdlxml.ad? ghdl_gcc.ad? ghdl_jit.ad? ghdl_llvm.ad? ghdl_rust.ad?   ghdl_simul.ad? libghdl.ads main.ad? psl-tprint.ad?   simul-*.ad? synthesis.ads trans.ad? trans-*.ad? trans_*.ad? translation.ad?   verilog-allocates.ad? ortho_front.ad?; do
  for f in "$BUILD"/$pat; do
    [[ -f "$f" ]] && mv "$f" "$BUILD/_excluded/" 2>/dev/null || true
  done
done

echo ""
echo "Build dir ready. Run:"
echo "  export PATH=$ADAWP/bin:\/c/Users/Chad/bin:/mingw64/bin:/usr/local/bin:/usr/bin:/bin:/mingw64/bin:/usr/bin:/c/Users/Chad/bin:/c/Program Files/NVIDIA GPU Computing Toolkit/CUDA/v13.2/bin/x64:/c/Program Files/NVIDIA GPU Computing Toolkit/CUDA/v13.2/bin:/c/WINDOWS/system32:/c/WINDOWS:/c/WINDOWS/System32/Wbem:/c/WINDOWS/System32/WindowsPowerShell/v1.0:/c/WINDOWS/System32/OpenSSH:/c/Program Files (x86)/NVIDIA Corporation/PhysX/Common:/c/Program Files/dotnet:/c/Program Files/NVIDIA Corporation/Nsight Compute 2026.1.1:/c/Program Files (x86)/Windows Kits/10/Windows Performance Toolkit:/c/Program Files/Mullvad VPN/resources:/cmd:/c/Program Files/Docker/Docker/resources/bin:/c/Users/Chad/AppData/Local/Microsoft/WindowsApps:/c/Program Files (x86)/Nmap:/c/Users/Chad/.dotnet/tools:/mingw64/bin:/usr/bin/vendor_perl:/usr/bin/core_perl:/c/Users/Chad/AppData/Roaming/Claude/local-agent-mode-sessions/skills-plugin/e0d4032c-71dd-40f9-a359-1f4a1380822d/4b6053c0-c19e-4b50-85ab-2065d19805f6/bin:/c/Users/Chad/AppData/Roaming/Claude/local-agent-mode-sessions/4b6053c0-c19e-4b50-85ab-2065d19805f6/e0d4032c-71dd-40f9-a359-1f4a1380822d/rpm/plugin_0155zZVATbJU3jHUmPP9NvMC/bin"
echo "  cd $BUILD && gprbuild -p -P ghdl_wasm.gpr 2>&1 | tee build.log"
