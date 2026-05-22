# ghdl-browser

Experimental port of GHDL to WebAssembly.

## Status

Work in progress. The GHDL runtime kernel (`grt`) compiles to wasm32 using the AdaWebPack toolchain. The front-end (parser, elaborator, driver) does not yet build — it depends on standard Ada library facilities (`Ada.Text_IO`, `Ada.Calendar`, `GNAT.OS_Lib`, etc.) that the bare-board runtime omits and would need to be stubbed.

There is no usable `ghdl.wasm` yet. Don't use this for anything.

## Limitations

- Front-end not yet building for wasm
- VHPI dynamic loading not supported in browsers; will need stubs
- File I/O needs to be wired through Emscripten MEMFS
- Not yet tested in a browser

## License

GPL-2.0, inherited from GHDL upstream.
