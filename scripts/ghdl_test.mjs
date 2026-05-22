#!/usr/bin/env node
// ghdl.wasm Node.js test harness
// Provides all 105 wasm imports, virtual FS with GHDL std lib, tests VHDL analysis.

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WASM_PATH = '/home/chad/ghdl-browser/build/link-wasm/ghdl.wasm';
const GHDL_LIB  = '/home/chad/ghdl-wasm/ghdl/lib/ghdl';
const VPREFIX   = '/ghdl';
const VLIB      = `${VPREFIX}/lib/ghdl`;
const WORKDIR   = '/work';

// ─── Virtual Filesystem ────────────────────────────────────────────────────
class VFS {
  constructor() {
    this.files  = new Map();
    this.fds    = new Map();
    this.nextFd = 100;
  }
  add(vpath, content) {
    const bytes = typeof content === 'string'
      ? new TextEncoder().encode(content)
      : (content instanceof Uint8Array ? content : new Uint8Array(content));
    this.files.set(vpath, bytes);
  }
  addReal(vpath, realPath) { this.add(vpath, readFileSync(realPath)); }
  has(p)  { return this.files.has(p); }
  open(p) {
    const data = this.files.get(p);
    if (!data) return -1;
    const fd = this.nextFd++;
    this.fds.set(fd, { path: p, pos: 0, data });
    return fd;
  }
  close(fd)    { this.fds.delete(fd); }
  get(fd)      { return this.fds.get(fd); }
  length(fd)   { const f = this.fds.get(fd); return f ? f.data.length : -1; }
  isEOF(fd)    { const f = this.fds.get(fd); return !f || f.pos >= f.data.length; }
  read(fd, buf, n) {
    const f = this.fds.get(fd);
    if (!f) return -1;
    const avail = Math.min(n, f.data.length - f.pos);
    if (avail <= 0) return 0;
    buf.set(f.data.subarray(f.pos, f.pos + avail));
    f.pos += avail;
    return avail;
  }
}

const vfs = new VFS();

// ─── Load GHDL library files ───────────────────────────────────────────────
function loadDir(realDir, vDir) {
  for (const entry of readdirSync(realDir)) {
    const rp = join(realDir, entry);
    const vp = `${vDir}/${entry}`;
    const st = statSync(rp);
    if (st.isDirectory()) loadDir(rp, vp);
    else vfs.addReal(vp, rp);
  }
}
loadDir(GHDL_LIB, VLIB);
process.stderr.write(`[vfs] loaded ${vfs.files.size} files from ${GHDL_LIB}\n`);

// ─── Wasm memory helpers ───────────────────────────────────────────────────
let memory, instance;
const dec = new TextDecoder('latin1');
const enc = new TextEncoder();

const mem8 = () => new Uint8Array(memory.buffer);
const memV = () => new DataView(memory.buffer);

function cstr(ptr) {
  if (!ptr) return null;
  const m = mem8();
  let e = ptr; while (m[e]) e++;
  return dec.decode(m.subarray(ptr, e));
}

function adaStr(ptr, first, last) {
  if (last < first) return '';
  return dec.decode(mem8().subarray(ptr, ptr + (last - first + 1)));
}

function wstr(s) {
  const bytes = enc.encode(s);
  const ptr = instance.exports.malloc(bytes.length + 1);
  const m = mem8();
  m.set(bytes, ptr);
  m[ptr + bytes.length] = 0;
  return ptr;
}

function writeAdaStr(dataPtr, boundsPtr, s) {
  const m = mem8(); const v = memV();
  for (let i = 0; i < s.length; i++) m[dataPtr + i] = s.charCodeAt(i);
  v.setInt32(boundsPtr,     1,        true);
  v.setInt32(boundsPtr + 4, s.length, true);
}

function blockSize(ptr) {
  if (!ptr) return 0;
  const v = memV();
  const base    = ptr - 16;
  const nextRef = v.getUint32(base + 4, true);
  const nextAddr = nextRef & ~1;
  return nextAddr - base - 16;
}

function fopenPath(raw) {
  const p = raw && raw.endsWith('\0') ? raw.slice(0, -1) : (raw || '');
  return p;
}

// ─── Import object ────────────────────────────────────────────────────────
const env = {
  'gnat__directory_operations__get_current_dir':
    (d, b) => writeAdaStr(d, b, WORKDIR),
  'ada__command_line__command_name':
    (d, b) => writeAdaStr(d, b, 'ghdl'),
  'ada__command_line__argument_count': (_) => 0,
  'ada__command_line__argument': (d, b, _i) => writeAdaStr(d, b, ''),

  'ada__exceptions__exception_identity':    (_a,_b,_c)    => 0,
  'ada__exceptions__exception_name':        (_a,_b,_c)    => {},
  'ada__exceptions__exception_information': (_a,_b,_c,_d) => {},

  'strlen': (ptr) => { const m=mem8(); let n=0; while(m[ptr+n]) n++; return n; },
  'strcmp': (a, b) => {
    const m = mem8();
    for (let i = 0;;i++) {
      const d = m[a+i] - m[b+i];
      if (d) return d;
      if (!m[a+i]) return 0;
    }
  },

  'realloc': (ptr, newSz) => {
    if (!ptr)   return instance.exports.malloc(newSz);
    if (!newSz) { instance.exports.free(ptr); return 0; }
    const old = blockSize(ptr);
    const np  = instance.exports.malloc(newSz);
    if (!np) return 0;
    const m = mem8();
    for (let i = 0; i < Math.min(old, newSz); i++) m[np+i] = m[ptr+i];
    instance.exports.free(ptr);
    return np;
  },

  'fopen': (pathPtr, modePtr) => {
    const path = fopenPath(cstr(pathPtr));
    const fd   = vfs.open(path);
    if (fd < 0) process.stderr.write(`[fopen] MISS: ${path}\n`);
    return fd <= 0 ? 0 : fd;
  },
  'fclose':  (fd)           => { vfs.close(fd); return 0; },
  'fread':   (buf,sz,cnt,fd) => {
    const n = vfs.read(fd, mem8().subarray(buf, buf+sz*cnt), sz*cnt);
    return n < 0 ? 0 : Math.floor(n / sz);
  },
  'fwrite':  (buf,sz,cnt,fd) => {
    const bytes = mem8().subarray(buf, buf+sz*cnt);
    (fd===1?process.stdout:process.stderr).write(dec.decode(bytes));
    return cnt;
  },
  'fputs': (strPtr, fd) => {
    const s = cstr(strPtr) || '';
    (fd===1?process.stdout:process.stderr).write(s);
    return s.length;
  },
  'fgets': (buf, size, fd) => {
    const m = mem8(); let i = 0;
    while (i < size-1) {
      const tmp = new Uint8Array(1);
      if (vfs.read(fd, tmp, 1) <= 0) break;
      m[buf+i++] = tmp[0];
      if (tmp[0] === 0x0a) break;
    }
    if (!i) return 0;
    m[buf+i] = 0; return buf;
  },
  'fflush': (_) => 0,
  'feof':   (fd) => vfs.isEOF(fd) ? 1 : 0,
  'ftell':  (fd) => { const f=vfs.get(fd); return f?f.pos:-1; },
  'getc':   (fd) => {
    const tmp = new Uint8Array(1);
    return vfs.read(fd, tmp, 1) <= 0 ? -1 : tmp[0];
  },
  'putc':   (c, fd) => {
    (fd===1?process.stdout:process.stderr).write(String.fromCharCode(c));
    return c;
  },
  'ungetc': (c, fd) => { const f=vfs.get(fd); if(f&&f.pos>0)f.pos--; return c; },
  'setbuf': (_a,_b) => {},
  'isatty': (_) => 0,
  'fprintf': (_fd, fmt) => {
    process.stderr.write(`[ghdl]: ${cstr(fmt)||'?'}\n`); return 0;
  },
  'snprintf': (_buf, _sz, _fmt) => 0,

  'gnat__os_lib__is_regular_file':    (p,f,l) => vfs.has(adaStr(p,f,l)) ? 1 : 0,
  'gnat__os_lib__is_absolute_path':   (p,f,l) => adaStr(p,f,l).startsWith('/') ? 1 : 0,
  'gnat__os_lib__is_directory':       (_p,_f,_l) => 0,
  'gnat__os_lib__is_executable_file': (_p,_f,_l) => 0,
  'gnat__os_lib__delete_file':        (_p,_f,_l,ok) => { memV().setInt32(ok,0,true); },
  'gnat__os_lib__rename_file':        (_op,_of,_ol,_np,_nf,_nl,ok) => { memV().setInt32(ok,0,true); },
  'gnat__os_lib__file_time_stamp':    (_p,_f,_l) => BigInt(0),
  'gnat__os_lib__open_read__2': (_env, addr, _mode) => {
    const path = fopenPath(cstr(addr));
    const fd = vfs.open(path);
    if (fd < 0) process.stderr.write(`[os_lib open] MISS: ${path}\n`);
    return fd;
  },
  'gnat__os_lib__close':       (fd, _ok) => { vfs.close(fd); },
  'gnat__os_lib__create_file__2': (_e,_a,_m) => -1,
  'gnat__os_lib__file_length': (fd, _) => vfs.length(fd),
  'gnat__os_lib__read':        (fd, buf, n, _) => {
    const r = vfs.read(fd, mem8().subarray(buf, buf+n), n);
    return r < 0 ? 0 : r;
  },
  'gnat__os_lib__write':       (fd, buf, n, _) => {
    process.stdout.write(dec.decode(mem8().subarray(buf, buf+n))); return n;
  },
  'gnat__os_lib__spawn': (..._) => -1,
  'gnat__os_lib__locate_exec_on_path': (d,b,..._) => writeAdaStr(d,b,''),

  'ada__calendar__clock':                       (_)        => 0,
  'ada__calendar__time_zones__utc_time_offset': (_a,_b)    => 0,
  'ada__calendar__Osubtract':                   (_a,_b,_c) => 0,
  'ada__calendar__split':                       (_a,_b,_c) => {},

  'ada__strings__unbounded__append':    (_a,_b,_c,_d) => {},
  'ada__strings__unbounded__to_string': (_a,_b,_c)    => {},
  'ada__characters__handling__to_lower': (c) => c,

  'gnat__sha1__update':    (_a,_b,_c,_d,_e) => {},
  'gnat__sha1__digest__4': (_a,_b,_c)        => {},
  'gnat__sha1__digest__5': (_a,_b,_c,_d)     => {},

  'gnat__heap_sort_a__sort': (_a,_b,_c,_d) => {},

  'system__img_lli__impl__image_integer': (_v,_a,_b,_c) => 0,
  'system__val_lli__impl__value_integer': (_a,_b,_c)    => BigInt(0),

  '__gnat_put_exception': (_a,_b,_c) => {},
  '__gnat_put_int':    (n) => process.stderr.write(String(n)),
  '__gnat_put_char':   (c) => process.stderr.write(String.fromCharCode(c)),
  '__gnat_put_string': (p,l) => process.stderr.write(dec.decode(mem8().subarray(p,p+l))),
  '__gnat_grow':       (n)   => n,

  'ceil':  x => Math.ceil(x),  'floor': x => Math.floor(x),
  'round': x => Math.round(x), 'trunc': x => Math.trunc(x),
  'fmod':  (x,y) => x%y, 'fmin': (x,y) => Math.min(x,y),
  'fmax':  (x,y) => Math.max(x,y),
  'log10': x => Math.log10(x), 'cbrt': x => Math.cbrt(x),

  'getenv': (_) => 0,
  'exit':   (c) => { throw Object.assign(new Error(`exit(${c})`), {exitCode:c}); },
  'time':   (p) => {
    const t = BigInt(Math.floor(Date.now()/1000));
    if (p) memV().setBigInt64(p, t, true);
    return t;
  },
  'ctime': (_) => 0,

  '__ghdl_maybe_return_via_longjump':  (_)    => {},
  '__ghdl_run_through_longjump':       (fn,a) => {
    if (fn) try { instance.exports.__indirect_function_table.get(fn)(a); } catch(_) {}
    return 0;
  },
  '__ghdl_ELABORATE': () => {},
  'grt_save_backtrace': (_) => {},
  'grt_get_clk_tck':    ()  => 100,
  'grt_get_times':      (_a,_b,_c) => {},

  'backtrace_create_state': (_a,_b,_c,_d) => 0,
  'backtrace_pcinfo':       (_a,_b,_c,_d,_e) => 0,

  'loadVhpiModule': (_) => 0, 'loadVpiModule': (_) => 0,
  'Increment_p_vpi_vecval':    (_)       => {},
  'vpi_get_value_vec_helper':  (_a,_b,_c) => {},

  'fstWriterCreate': (_a,_b) => 0,  'fstWriterClose': (_) => {},
  'fstWriterSetFileType': (_a,_b) => {}, 'fstWriterSetPackType': (_a,_b) => {},
  'fstWriterSetTimescale': (_a,_b) => {}, 'fstWriterSetVersion': (_a,_b,_c) => {},
  'fstWriterSetRepackOnClose': (_a,_b) => {}, 'fstWriterSetParallelMode': (_a,_b) => {},
  'fstWriterCreateVar2': (..._) => 0,
  'fstWriterSetSourceStem': (_a,_b,_c,_d) => {},
  'fstWriterSetSourceInstantiationStem': (_a,_b,_c,_d) => {},
  'fstWriterSetScope': (_a,_b,_c,_d) => {},  'fstWriterSetUpscope': (_) => {},
  'fstWriterEmitValueChange': (_a,_b,_c) => {},
  'fstWriterEmitVariableLengthValueChange': (_a,_b,_c,_d) => {},
  'fstWriterEmitTimeChange': (_a,_b) => {},

  'gzopen': (_a,_b) => 0, 'gzwrite': (_a,_b,_c) => 0,
  'gzputc': (_a,_b) => 0, 'gzclose': (_) => {},

  '__multi3': (rp, al, ah, bl, bh) => {
    const lo = BigInt.asUintN(64, al * bl);
    const v  = memV();
    v.setBigUint64(rp,   lo,       true);
    v.setBigUint64(rp+8, BigInt(0), true);
  },
};

// ─── Instantiate ─────────────────────────────────────────────────────────────
const wasmBytes = readFileSync(WASM_PATH);
process.stderr.write(`[init] loading (${(wasmBytes.length/1024).toFixed(0)} KB)\n`);

let inst;
try {
  ({ instance: inst } = await WebAssembly.instantiate(wasmBytes, { env }));
} catch(e) {
  process.stderr.write('Instantiation failed: ' + e.message + '\n');
  process.exit(1);
}
instance = inst;
memory   = instance.exports.memory;
process.stderr.write(`[init] instantiated OK\n`);

try {
  instance.exports.__wasm_call_ctors();
  process.stderr.write(`[init] ctors OK\n`);
} catch(e) {
  process.stderr.write(`[init] ctors error: ${e.message}\n`);
}

// ─── Set exec prefix ─────────────────────────────────────────────────────────
const SET_PREFIX = instance.exports['libghdl__set_exec_prefix'];
if (SET_PREFIX) {
  const ptr = wstr(VPREFIX);
  // Try the hidden-env=0 pattern
  try { SET_PREFIX(0, ptr, VPREFIX.length); }
  catch(_) { try { SET_PREFIX(ptr, VPREFIX.length); } catch(__) {} }
  instance.exports.free(ptr);
  process.stderr.write(`[init] set_exec_prefix('${VPREFIX}')\n`);
}

// ─── Analyze init ─────────────────────────────────────────────────────────────
const INIT_STATUS = instance.exports['libghdl__analyze_init_status'];
let initOk = false;
if (INIT_STATUS) {
  let status;
  try { status = INIT_STATUS(0); }
  catch(e) { process.stderr.write(`[init] analyze_init_status threw: ${e.message}\n`); }
  initOk = (status === 0);
  process.stderr.write(`[init] analyze_init_status = ${status} (${initOk?'OK':'FAIL'})\n`);
}

// ─── Analysis helper ──────────────────────────────────────────────────────────
const ANALYZE = instance.exports['libghdl__analyze_file'];

function analyzeVHDL(label, vhdlSrc) {
  const vpath = `${WORKDIR}/${label.replace(/\W+/g,'_')}.vhd`;
  vfs.add(vpath, vhdlSrc);
  const ptr = wstr(vpath);
  let iir = null, error = null;
  try {
    // sig=7 → (i32,i32,i32)→i32 — (env=0, pathPtr, pathLen)
    iir = ANALYZE(0, ptr, vpath.length);
  } catch(e) {
    error = e.message;
  }
  instance.exports.free(ptr);
  return { ok: iir != null && iir !== 0 && iir !== -1, iir, error };
}

// ─── Run test suite ────────────────────────────────────────────────────────────
const TESTS = [
  ['AND_GATE', `
library ieee; use ieee.std_logic_1164.all;
entity AND_GATE is port(A,B:in std_logic; Y:out std_logic); end AND_GATE;
architecture RTL of AND_GATE is begin Y<=A and B; end RTL;`],

  ['OR_GATE', `
library ieee; use ieee.std_logic_1164.all;
entity OR_GATE is port(A,B:in std_logic; Y:out std_logic); end OR_GATE;
architecture RTL of OR_GATE is begin Y<=A or B; end RTL;`],

  ['NOT_Gate', `
library ieee; use ieee.std_logic_1164.all;
entity NOT_Gate is port(A:in std_logic; Y:out std_logic); end NOT_Gate;
architecture RTL of NOT_Gate is begin Y<=not A; end RTL;`],

  ['NAND_Gate', `
library ieee; use ieee.std_logic_1164.all;
entity NAND_Gate is port(A,B:in std_logic; Y:out std_logic); end NAND_Gate;
architecture RTL of NAND_Gate is begin Y<=not(A and B); end RTL;`],

  ['NOR_GATE', `
library ieee; use ieee.std_logic_1164.all;
entity NOR_GATE is port(A,B:in std_logic; Y:out std_logic); end NOR_GATE;
architecture RTL of NOR_GATE is begin Y<=not(A or B); end RTL;`],

  ['XOR_GATE', `
library ieee; use ieee.std_logic_1164.all;
entity XOR_GATE is port(A,B:in std_logic; Y:out std_logic); end XOR_GATE;
architecture RTL of XOR_GATE is begin Y<=A xor B; end RTL;`],

  ['XNOR_GATE', `
library ieee; use ieee.std_logic_1164.all;
entity XNOR_GATE is port(A,B:in std_logic; Y:out std_logic); end XNOR_GATE;
architecture RTL of XNOR_GATE is begin Y<=not(A xor B); end RTL;`],

  ['MUX_2to1', `
library ieee; use ieee.std_logic_1164.all;
entity MUX_2to1 is port(A,B,Sel:in std_logic; Y:out std_logic); end MUX_2to1;
architecture RTL of MUX_2to1 is
begin Y<=(A and not Sel) or (B and Sel); end RTL;`],

  ['HalfAdder', `
library ieee; use ieee.std_logic_1164.all;
entity HalfAdder is port(A,B:in std_logic; Sum,Carry:out std_logic); end HalfAdder;
architecture RTL of HalfAdder is begin Sum<=A xor B; Carry<=A and B; end RTL;`],

  ['FullAdder', `
library ieee; use ieee.std_logic_1164.all;
entity FullAdder is port(A,B,Cin:in std_logic; Sum,Cout:out std_logic); end FullAdder;
architecture RTL of FullAdder is begin
  Sum<=A xor B xor Cin; Cout<=(A and B) or (B and Cin) or (A and Cin); end RTL;`],

  ['Decoder2to4', `
library ieee; use ieee.std_logic_1164.all;
entity Decoder2to4 is port(A,B,En:in std_logic; Y:out std_logic_vector(3 downto 0)); end Decoder2to4;
architecture RTL of Decoder2to4 is begin
  Y(0)<=En and not A and not B; Y(1)<=En and A and not B;
  Y(2)<=En and not A and B;     Y(3)<=En and A and B; end RTL;`],

  ['Priority_Encoder', `
library ieee; use ieee.std_logic_1164.all;
entity Priority_Encoder is port(I:in std_logic_vector(3 downto 0); Y:out std_logic_vector(1 downto 0)); end Priority_Encoder;
architecture RTL of Priority_Encoder is begin
  Y<="11" when I(3)='1' else "10" when I(2)='1' else "01" when I(1)='1' else "00"; end RTL;`],

  ['Comparator4Bit', `
library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;
entity Comparator4Bit is port(A,B:in std_logic_vector(3 downto 0); EQ,GT,LT:out std_logic); end Comparator4Bit;
architecture RTL of Comparator4Bit is begin
  EQ<='1' when unsigned(A)=unsigned(B) else '0';
  GT<='1' when unsigned(A)>unsigned(B) else '0';
  LT<='1' when unsigned(A)<unsigned(B) else '0'; end RTL;`],
];

process.stdout.write('\n── VHDL Analysis Results ────────────────────────────────────────\n');
if (!ANALYZE) {
  process.stdout.write('ERROR: no libghdl__analyze_file export\n');
  process.exit(1);
}

let passed = 0, total = TESTS.length;
for (const [label, src] of TESTS) {
  const res = analyzeVHDL(label, src);
  const mark = res.ok ? 'PASS' : 'FAIL';
  process.stdout.write(`${mark}  ${label.padEnd(20)} iir=${res.iir} ${res.error||''}\n`);
  if (res.ok) passed++;
}
process.stdout.write(`\n${passed}/${total} passed\n`);
