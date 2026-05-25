# ghdl-browser

Port of GHDL to WebAssembly. A user's browser can now analyze, elaborate,
and compile VHDL → sim.wasm without any server round trip.

**Try it without building anything:** [vhdl.ai/vhdlive](https://vhdl.ai/vhdlive) hosts a live deployment — open in any modern browser, write VHDL, hit Simulate.

> **Looking for the backend?** This repo is the *user-facing* port — it drives `analyze → elaborate → compile` inside the browser via `libghdl`. The Ada compiler backend that emits WebAssembly text (WAT) lives at **[UnsignedChad/ghdl-wasm](https://github.com/UnsignedChad/ghdl-wasm)**. Most users want *this* repo; modify *that* one only if you need to change how VHDL is lowered to WebAssembly (case statements, signal assignments, etc.).

## Status

**Compile pipeline works end-to-end** for combinational and basic sequential
designs using `std_logic_1164`. The browser-side build does not yet match
native `ghdl_wasm` on `IEEE.NUMERIC_STD` designs — see test results below.
The produced sim.wasm validates with `wat2wasm`, and a small JS host can
drive elaboration and capture signal-assignment events.

### Test results: VHDL-100-Projects Stage 1

Browser: **20/26** pass.  Native `ghdl_wasm` for comparison: **26/26** pass.
Run `scripts/ghdl_batch_test.sh` to reproduce. Each project goes through the
full pipeline in a fresh subprocess:

```
analyze (libghdl__analyze_file)
  → compile_elab (libghdl__compile_elab)
    → wat2wasm validation
      → sim.wasm
```

```
─── VHDL-100-Projects Stage 1: 26 projects ───
  ✓ 01_AND_GATE                              2019L  10857B
  ✓ 02_OR_GATE                               2019L  10857B
  ✓ 03_NOT_Gate                              1999L  10717B
  ✓ 04_NAND_Gate                             2031L  10896B
  ✓ 05_NOR_GATE                              2031L  10896B
  ✓ 06_XOR_GATE                              2019L  10857B
  ✓ 07_XNOR_GATE                             2031L  10896B
  ✓ 08_2to1_MUX                              2017L  10929B
  ✓ 09_4to1_MUX                              2198L  11728B
  ✓ 10_8to1_MUX                              2317L  12091B
  ✓ 11_1to2_deMUX                            2319L  12001B
  ✓ 12_1to4_deMUX                            2248L  11958B
  ✓ 13_Decoder2to4                           2369L  12104B
  ✓ 14_Decoder3to8                           2494L  12600B
  ✗ 15_Priority_Encoder         numeric_std codegen bug
  ✓ 16_SevenSeg_Driver                       2510L  12625B
  ✓ 17_Binary_to_Gray_Code_Converter         2304L  12315B
  ✓ 18_Gray_Code_to_Binary_Converter         2366L  12607B
  ✗ 19_Comparator4Bit           numeric_std codegen bug
  ✗ 20_Comparator8Bit           numeric_std codegen bug
  ✓ 21_HalfAdder                             2081L  11179B
  ✓ 22_FullAdder                             2139L  11527B
  ✓ 23_Ripple_Carry_Adder_4_Bit              2423L  13149B
  ✗ 24_Subtractor_4Bit          multi-file (refs FullSubtractor)
  ✗ 25_Adder_Subtractor_4Bit    multi-file (refs FullAdder)
  ✗ 26_CascadableNbitComparator numeric_std + generic codegen

━━ 20/26 pass  (6 fail) ━━
```

All 6 browser failures pass on native `ghdl_wasm`, so this is a real
functional gap, not a test harness artifact:

- **4** use `IEEE.NUMERIC_STD.ALL` → "memory access out of bounds" during
  compile in the wasm-host build, but produce ~16k-line WAT natively.
  This is the main known codegen gap.
- **2** are structural designs (24, 25) — they reference component
  declarations (`FullSubtractor`, `FullAdder`) defined in other files. The
  browser batch test only fetches one file per project; native is more
  permissive about un-bound components and still produces output.

### Execution

The produced sim.wasm exports `memory` and `__ghdl_ELABORATE`. With a small
JS GRT shim, the half_adder testbench actually runs:

```
signals created: 4                            ← a, b, sum, carry
processes registered: 3
  - fn=f258  instance=0x10140  sensitized     ← sum <= a xor b
  - fn=f259  instance=0x10140  sensitized     ← carry <= a and b
  - fn=f267  instance=0x10000  unsensitized   ← testbench process
step 0: now=10000000fs  transitions=2         ← time advances 10 ns,
step 1: now=20000000fs  transitions=4         ←   both combinational
step 2: now=30000000fs  transitions=6         ←   processes fire each
step 3: now=40000000fs  transitions=8         ←   step
```

Reproduce with `scripts/ghdl_runsim.mjs` after running the compile test.

## How it's built

The wasm-host build of `ghdl.wasm` is roughly:

1. **AdaWebPack** + GNAT-LLVM compile the Ada front-end (parser, semantic
   analyzer, elaborator, translation chapters) to `wasm32`.
2. The WASM ortho backend from `UnsignedChad/ghdl-wasm` is pulled in as
   `patches/wasm-codegen/` and overlaid on the build tree.
3. Runtime stub bodies (`a-strunb.adb`, `g-dirope.adb`, etc.) live in
   `stubs/rts/` and are linked manually because AdaWebPack's prebuilt
   libgnat omits them.
4. `scripts/setup-frontend-build.sh` does the source copy & patching.
   `scripts/link-wasm.sh` produces the final `build/link-wasm/ghdl.wasm`.

Result: a ~4.5 MB `ghdl.wasm` that exports the libghdl API (`analyze_file`,
`compile_elab`, etc.) callable from JS.

## Patches not yet upstream

These live in `patches/wasm-codegen/` because they're either wasm32-target-
specific or workarounds for `GNAT-LLVM` bugs:

- `Ada.Text_IO` → `Simple_IO` swap (AdaWebPack doesn't provide Text_IO)
- Manual `I64_Img` replacing `Long_Long_Integer'Image` (`'Image` returns
  empty under AdaWebPack)
- `pragma Suppress (All_Checks)` on translation files (GNAT-LLVM has a
  mutable-discriminant assignment bug that breaks `Info.S := Aggregate`
  for variant records)
- Self-healing `Dyn_Tables` so statically-zero-initialized instances
  don't infinite-loop in `Expand`'s `Length := Length * 2` doubling

The portable codegen improvements (memory export, missing GRT helper
imports, function-buffer reordering, param dedup) live upstream in
[ghdl-wasm](https://github.com/UnsignedChad/ghdl-wasm) so the native
binary produces wat2wasm-valid output without VHDLive's `patchWat`
post-processing.

## Known issues

- `IEEE.NUMERIC_STD` compile path crashes — 4 of 6 batch failures
- Process functions get called repeatedly from JS scheduler because state
  isn't preserved correctly across invocations (testbench re-runs from
  start each time it's called)
- Signal values aren't decoded yet — `__ghdl_signal_direct_assign` is
  observed as an event but the assigned byte isn't being read
- VHPI dynamic loading not supported in browsers (stubbed)
- `Ada.Calendar` is stubbed — `Set_Analysis_Time_Stamp` is skipped at
  compile time
- SHA-1 file checksums are bypassed; the codegen doesn't verify that
  cached `.cf` files match their sources

## Layout

```
build/                       # gitignored — produced by setup-frontend-build.sh
patches/wasm-codegen/        # patched ortho_wasm + trans-* sources
scripts/
  setup-frontend-build.sh    # install adawebpack stubs, copy GHDL src, apply patches
  link-wasm.sh               # final clang link → ghdl.wasm
  ghdl_compile_test.mjs      # single-project compile test
  ghdl_batch_test.sh         # batch runner across all Stage 1 projects
  ghdl_runsim.mjs            # JS host that instantiates produced sim.wasm
  ghdl_test.mjs              # analyzer-only smoke test (pre-codegen)
stubs/                       # Ada runtime stubs (libghdl, simple_io, etc.)
  rts/                       # GNAT runtime stubs (a-strunb, g-dirope, etc.)
vendor/                      # gitignored — adawebpack-bin + ghdl source
```

## Building

Prerequisites: Debian 13, GNAT 14.2, llvm-21-dev, clang-21, lld-21, the
AdaWebPack prebuilt at `vendor/adawebpack-bin/adawebpack/`, GHDL 5.0.1
source at `vendor/ghdl/`.

```bash
bash scripts/setup-frontend-build.sh
cd build/ghdl-wasm-full && gprbuild -p -P ghdl_wasm.gpr -j$(nproc)
bash scripts/link-wasm.sh
```

Produces `build/link-wasm/ghdl.wasm` (~4.5 MB, ~95 imports, ~8000 exports).

## License

GPL-2.0, inherited from GHDL upstream.
