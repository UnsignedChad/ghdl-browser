// GHDL-WASM offline-compile test
// Loads the new ghdl.wasm (with codegen), analyzes half_adder + tb,
// then calls libghdl__compile_elab to emit WAT to stdout (captured to a buffer).
import { readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { join } from 'path';

const WASM     = '/home/chad/ghdl-browser/build/link-wasm/ghdl.wasm';
const GHDL_LIB = '/home/chad/ghdl-wasm/ghdl/lib/ghdl';
const VLIB     = '/ghdl/lib/ghdl';
const VPREFIX  = '/ghdl';
const WORKDIR  = '/work';
const OUT_WAT  = '/tmp/fresh_browser.wat';

// ── VFS ──────────────────────────────────────────────────────────────────────
function normalizePath(p) {
  // Resolve '..' / '.' segments without losing the leading slash.
  const isAbs = p.startsWith('/');
  const parts = p.split('/');
  const out = [];
  for (const seg of parts) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') { if (out.length) out.pop(); continue; }
    out.push(seg);
  }
  return (isAbs ? '/' : '') + out.join('/');
}

class VFS {
  constructor() { this.files=new Map(); this.fds=new Map(); this.nfd=100; }
  addReal(p,r) { this.files.set(normalizePath(p), readFileSync(r)); }
  add(p,c) { this.files.set(normalizePath(p), Buffer.isBuffer(c)?c:Buffer.from(c,'utf8')); }
  has(p) { return this.files.has(normalizePath(p)); }
  open(p) {
    const np = normalizePath(p);
    const d=this.files.get(np); if(!d) return -1;
    const fd=this.nfd++; this.fds.set(fd,{p:np,pos:0,d}); return fd;
  }
  close(fd) { this.fds.delete(fd); }
  get(fd) { return this.fds.get(fd); }
  len(fd) { const f=this.fds.get(fd); return f?f.d.length:-1; }
  eof(fd) { const f=this.fds.get(fd); return !f||f.pos>=f.d.length; }
  read(fd,buf,n) { const f=this.fds.get(fd); if(!f) return -1; const av=Math.min(n,f.d.length-f.pos); if(av<=0)return 0; buf.set(f.d.subarray(f.pos,f.pos+av)); f.pos+=av; return av; }
}

const vfs = new VFS();
function loadDir(rd,vd) {
  for (const e of readdirSync(rd)) {
    const rp=join(rd,e), vp=`${vd}/${e}`;
    if (statSync(rp).isDirectory()) loadDir(rp,vp);
    else vfs.addReal(vp,rp);
  }
}
loadDir(GHDL_LIB, VLIB);

// ── Stdout capture ───────────────────────────────────────────────────────────
let captureMode = false;        // when true, ALL text output accumulates into watChunks
const watChunks = [];
function emit(buf) {
  if (captureMode) watChunks.push(buf);
  else process.stdout.write(buf);
}
// During capture mode we route stderr-bound output to the same buffer too —
// the codegen prints the WAT module via grt-astdio which on this build resolves
// to fputs/__gnat_put_string with fd=2.  Outside capture mode it stays on stderr.
function emitMaybeStderr(buf) {
  if (captureMode) watChunks.push(buf);
  else process.stderr.write(buf);
}

// ── Wasm setup ───────────────────────────────────────────────────────────────
let mem, inst;
const DEC = new TextDecoder('latin1');
const u8  = () => new Uint8Array(mem.buffer);
const dv  = () => new DataView(mem.buffer);
function cstr(p) { if (!p) return ''; const m=u8(); let e=p; while(m[e]) e++; return DEC.decode(m.subarray(p,e)); }
function astr_fat(p,bp) {
  const v=dv();
  const first=v.getInt32(bp,true), last=v.getInt32(bp+4,true);
  return last<first ? '' : DEC.decode(u8().subarray(p, p+(last-first+1)));
}
function wads(dp,bp,s) {
  const m=u8(); const v=dv();
  for (let i=0;i<s.length;i++) m[dp+i]=s.charCodeAt(i);
  v.setInt32(bp,1,true); v.setInt32(bp+4,s.length,true);
}
function bsz(p) {
  if (!p) return 0;
  const v=dv(); const base=p-16;
  const nr=v.getUint32(base+4,true);
  return (nr&~1)-base-16;
}

const env = {
  gnat__directory_operations__get_current_dir: (d,b) => wads(d,b,WORKDIR),
  ada__command_line__command_name:             (d,b) => wads(d,b,'ghdl'),
  ada__command_line__argument_count:           (_)   => 0,
  ada__command_line__argument:                 (d,b,_)=> wads(d,b,''),
  ada__exceptions__exception_identity:         (_a,_b,_c)    => 0,
  ada__exceptions__exception_name:             (_a,_b,_c)    => {},
  ada__exceptions__exception_information:      (_a,_b,_c,_d) => {},
  strlen: (p) => { const m=u8(); let n=0; while(m[p+n]) n++; return n; },
  strcmp: (a,b) => { const m=u8(); for(let i=0;;i++){ const d=m[a+i]-m[b+i]; if(d) return d; if(!m[a+i]) return 0; } },
  realloc: (p,n) => {
    if (!p) return inst.exports.malloc(n);
    if (!n) { inst.exports.free(p); return 0; }
    const o=bsz(p); const np=inst.exports.malloc(n); if(!np) return 0;
    const m=u8(); for(let i=0;i<Math.min(o,n);i++) m[np+i]=m[p+i];
    inst.exports.free(p); return np;
  },
  fopen: (pp,_mp) => { const path=cstr(pp); const fd=vfs.open(path); return fd<=0 ? 0 : fd; },
  fclose:  (fd)          => { vfs.close(fd); return 0; },
  fread:   (buf,sz,cnt,fd)=> { const n=vfs.read(fd,u8().subarray(buf,buf+sz*cnt),sz*cnt); return n<0?0:Math.floor(n/sz); },
  fwrite:  (buf,sz,cnt,fd)=> {
    const bytes = u8().subarray(buf,buf+sz*cnt);
    if (fd === 1) emit(Buffer.from(bytes));
    else process.stderr.write(DEC.decode(bytes));
    return cnt;
  },
  fputs:   (sp,fd) => {
    const s=cstr(sp)||'';
    if (fd === 1) emit(Buffer.from(s, 'latin1'));
    else process.stderr.write(s);
    return s.length;
  },
  fgets: (buf,size,fd) => {
    const m=u8(); let i=0;
    while (i<size-1) {
      const t=new Uint8Array(1);
      if(vfs.read(fd,t,1)<=0) break;
      m[buf+i++]=t[0];
      if(t[0]===0x0a) break;
    }
    if (!i) return 0;
    m[buf+i]=0; return buf;
  },
  fflush:  (_)   => 0,
  feof:    (fd)  => vfs.eof(fd) ? 1 : 0,
  ftell:   (fd)  => { const f=vfs.get(fd); return f?f.pos:-1; },
  getc:    (fd)  => { const t=new Uint8Array(1); return vfs.read(fd,t,1)<=0 ? -1 : t[0]; },
  putc:    (c,fd)=> {
    if (fd === 1) emit(Buffer.from([c & 0xff]));
    else process.stderr.write(String.fromCharCode(c));
    return c;
  },
  ungetc:  (c,fd)=> { const f=vfs.get(fd); if(f&&f.pos>0)f.pos--; return c; },
  setbuf:  (_a,_b)=> {},
  isatty:  (_)   => 0,
  fprintf: (_fd,_fmt) => 0,
  snprintf:(_b,_s,_f) => 0,
  gnat__os_lib__is_regular_file: (p,f,_l) => vfs.has(astr_fat(p,f)) ? 1 : 0,
  gnat__os_lib__is_absolute_path:(p,f,_l) => astr_fat(p,f).startsWith('/') ? 1 : 0,
  gnat__os_lib__is_directory:    (_p,_f,_l) => 0,
  gnat__os_lib__is_executable_file: (_p,_f,_l) => 0,
  gnat__os_lib__delete_file: (_p,_f,_l,ok) => { if(ok) dv().setInt32(ok,0,true); },
  gnat__os_lib__rename_file: (_a,_b,_c,_d,_e,_f,ok) => { if(ok) dv().setInt32(ok,0,true); },
  gnat__os_lib__file_time_stamp: (_p,_f,_l) => BigInt(0),
  gnat__os_lib__open_read__2: (path_ptr,_mode,_len) => vfs.open(cstr(path_ptr)),
  gnat__os_lib__close:       (fd, _ok) => { vfs.close(fd); },
  gnat__os_lib__create_file__2: (_e,_a,_m) => -1,
  gnat__os_lib__file_length: (fd, _) => vfs.len(fd),
  gnat__os_lib__read:  (fd,buf,n,_) => { const r=vfs.read(fd,u8().subarray(buf,buf+n),n); return r<0?0:r; },
  gnat__os_lib__write: (fd,buf,n,_) => {
    const bytes = u8().subarray(buf,buf+n);
    if (fd === 1) emit(Buffer.from(bytes));
    else process.stderr.write(DEC.decode(bytes));
    return n;
  },
  gnat__os_lib__spawn: (..._) => -1,
  gnat__os_lib__locate_exec_on_path: (d,b,..._) => wads(d,b,''),
  ada__calendar__clock:                       (_)     => 0,
  ada__calendar__time_zones__utc_time_offset: (_a,_b) => 0,
  ada__calendar__Osubtract:                   (_a,_b,_c) => 0,
  ada__calendar__split:                       (_a,_b,_c) => {},
  ada__characters__handling__to_lower: (c) => c,
  gnat__sha1__update:    (_a,_b,_c,_d,_e) => {},
  gnat__sha1__digest__4: (_a,_b,_c)        => {},
  gnat__sha1__digest__5: (_a,_b,_c,_d)     => {},
  gnat__heap_sort_a__sort: (_a,_b,_c,_d) => {},
  system__img_lli__impl__image_integer: (_v,_a,_b,_c) => 0,
  system__val_lli__impl__value_integer: (_a,_b,_c)    => BigInt(0),
  __gnat_put_exception: (_a,_b,_c) => {},
  __gnat_put_int:    (n) => emit(Buffer.from(`${n}`, 'latin1')),
  __gnat_put_char:   (c) => emit(Buffer.from([c & 0xff])),
  __gnat_put_string: (p,l) => emit(Buffer.from(u8().subarray(p,p+l))),
  __gnat_grow:       (n) => n,
  ceil:  x=>Math.ceil(x), floor: x=>Math.floor(x),
  round: x=>Math.round(x), trunc: x=>Math.trunc(x),
  fmod: (x,y)=>x%y, fmin:(x,y)=>Math.min(x,y), fmax:(x,y)=>Math.max(x,y),
  log10: x=>Math.log10(x), cbrt: x=>Math.cbrt(x),
  getenv: (_) => 0,
  exit: (c) => { throw Object.assign(new Error(`exit(${c})`), {exitCode:c, isExit:true}); },
  time:   (p) => { const t=BigInt(Math.floor(Date.now()/1000)); if(p) dv().setBigInt64(p,t,true); return t; },
  ctime:  (_) => 0,
  __ghdl_maybe_return_via_longjump: (_) => {},
  __ghdl_run_through_longjump: (fn,a) => {
    if(fn) try{inst.exports.__indirect_function_table.get(fn)(a);}catch(_){}
    return 0;
  },
  __ghdl_ELABORATE: () => {},
  grt_save_backtrace: (_) => {},
  grt_get_clk_tck: () => 100,
  grt_get_times: (_a,_b,_c) => {},
  backtrace_create_state: (_a,_b,_c,_d) => 0,
  backtrace_pcinfo: (_a,_b,_c,_d,_e) => 0,
  loadVhpiModule: (_) => 0, loadVpiModule: (_) => 0,
  Increment_p_vpi_vecval: (_) => {},
  vpi_get_value_vec_helper: (_a,_b,_c) => {},
  fstWriterCreate: (_a,_b) => 0, fstWriterClose: (_) => {},
  fstWriterSetFileType: (_a,_b) => {}, fstWriterSetPackType: (_a,_b) => {},
  fstWriterSetTimescale: (_a,_b) => {}, fstWriterSetVersion: (_a,_b,_c) => {},
  fstWriterSetRepackOnClose: (_a,_b) => {}, fstWriterSetParallelMode: (_a,_b) => {},
  fstWriterCreateVar2: (..._) => 0,
  fstWriterSetSourceStem: (_a,_b,_c,_d) => {},
  fstWriterSetSourceInstantiationStem: (_a,_b,_c,_d) => {},
  fstWriterSetScope: (_a,_b,_c,_d) => {}, fstWriterSetUpscope: (_) => {},
  fstWriterEmitValueChange: (_a,_b,_c) => {},
  fstWriterEmitVariableLengthValueChange: (_a,_b,_c,_d) => {},
  fstWriterEmitTimeChange: (_a,_b) => {},
  gzopen: (_a,_b) => 0, gzwrite: (_a,_b,_c) => 0,
  gzputc: (_a,_b) => 0, gzclose: (_) => {},
  __multi3: (rp, al, ah, bl, bh) => {
    // 128-bit multiply: a = (ah<<64|al), b = (bh<<64|bl), result.low128 -> *rp
    const a = (BigInt.asUintN(64, ah) << 64n) | BigInt.asUintN(64, al);
    const b = (BigInt.asUintN(64, bh) << 64n) | BigInt.asUintN(64, bl);
    const r = BigInt.asUintN(128, a * b);
    const v = dv();
    v.setBigUint64(rp,   r & ((1n << 64n) - 1n), true);
    v.setBigUint64(rp+8, r >> 64n, true);
  },
};

// ── Instantiate ──────────────────────────────────────────────────────────────
const bytes = readFileSync(WASM);
let i2;
try { ({instance:i2} = await WebAssembly.instantiate(bytes, {env})); }
catch(e) { process.stderr.write(`FAIL instantiate: ${e.message}\n`); process.exit(1); }
inst=i2; mem=inst.exports.memory;
inst.exports.memory.grow(1024 - Math.ceil(inst.exports.memory.buffer.byteLength/65536));
try { inst.exports.__wasm_call_ctors(); } catch(_) {}
const E = inst.exports;

// (no DynTable base patching — dyn_tables.adb has the self-healing fix now)

// ── Init GHDL ────────────────────────────────────────────────────────────────
try { E.options__initialize(0); }
catch(e) { process.stderr.write(`options__initialize FAILED: ${e.message}\n`); process.exit(1); }

{
  const libPath = VPREFIX + '/lib/ghdl/';
  const b = Buffer.from(libPath, 'latin1');
  const dp = E.malloc(b.length + 1);
  u8().set(b, dp); u8()[dp + b.length] = 0;
  const bp = E.malloc(8);
  dv().setInt32(bp, 1, true); dv().setInt32(bp + 4, b.length, true);
  E.libraries__add_library_path(dp, bp, 0);
  E.free(dp); E.free(bp);
}
const stdOk = E.libraries__load_std_library(1, 0);
if (!stdOk) { process.stderr.write('load_std_library FAILED\n'); process.exit(1); }
E.libraries__load_work_library(1, 0);
process.stderr.write('GHDL initialized\n');

// ── Helpers ──────────────────────────────────────────────────────────────────
function analyzeVhdl(filename, src) {
  vfs.add(filename, src);
  const b = Buffer.from(filename, 'latin1');
  const fp = E.malloc(b.length + 1);
  u8().set(b, fp); u8()[fp + b.length] = 0;
  try {
    const iir = E['libghdl__analyze_file'](fp, b.length, 0);
    E.free(fp);
    return { ok: iir > 0, iir };
  } catch(e) {
    E.free(fp);
    return { ok: false, error: e.isExit ? `EXIT(${e.exitCode})` : e.message };
  }
}

function compileElab(topName) {
  const b = Buffer.from(topName, 'latin1');
  const tp = E.malloc(b.length + 1);
  u8().set(b, tp); u8()[tp + b.length] = 0;
  try {
    const result = E['libghdl__compile_elab'](tp, b.length, 0, 0);
    E.free(tp);
    return { ok: result === 0, code: result };
  } catch(e) {
    E.free(tp);
    return { ok: false, error: e.isExit ? `EXIT(${e.exitCode})` : e.message };
  }
}

// ── Test sources ─────────────────────────────────────────────────────────────
const HALF_ADDER = `library IEEE;
use IEEE.STD_LOGIC_1164.ALL;

entity half_adder is
  port (
    a, b  : in  std_logic;
    sum   : out std_logic;
    carry : out std_logic
  );
end entity;

architecture rtl of half_adder is
begin
  sum   <= a xor b;
  carry <= a and b;
end architecture;
`;

const HALF_ADDER_TB = `library IEEE;
use IEEE.STD_LOGIC_1164.ALL;

entity half_adder_tb is
end entity;

architecture sim of half_adder_tb is
  signal a, b, sum, carry : std_logic := '0';
begin
  uut: entity work.half_adder port map (a=>a, b=>b, sum=>sum, carry=>carry);
  process
  begin
    a <= '0'; b <= '0'; wait for 10 ns;
    a <= '0'; b <= '1'; wait for 10 ns;
    a <= '1'; b <= '0'; wait for 10 ns;
    a <= '1'; b <= '1'; wait for 10 ns;
    wait;
  end process;
end architecture;
`;

// ── Run ──────────────────────────────────────────────────────────────────────
process.stderr.write('\n--- analyze half_adder.vhd ---\n');
const r1 = analyzeVhdl('half_adder.vhd', HALF_ADDER);
process.stderr.write(r1.ok ? `  OK iir=${r1.iir}\n` : `  FAIL ${r1.error || r1.iir}\n`);
if (!r1.ok) process.exit(1);

process.stderr.write('\n--- analyze half_adder_tb.vhd ---\n');
const r2 = analyzeVhdl('half_adder_tb.vhd', HALF_ADDER_TB);
process.stderr.write(r2.ok ? `  OK iir=${r2.iir}\n` : `  FAIL ${r2.error || r2.iir}\n`);
if (!r2.ok) process.exit(1);

process.stderr.write('\n--- compile_elab half_adder_tb ---\n');
// Save the real stderr writer and replace it so any stderr output during the
// codegen also lands in the WAT capture buffer.
const realStderrWrite = process.stderr.write.bind(process.stderr);
const realStdoutWrite = process.stdout.write.bind(process.stdout);
process.stderr.write = (chunk, ...rest) => {
  if (captureMode) {
    watChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    return true;
  }
  return realStderrWrite(chunk, ...rest);
};
process.stdout.write = (chunk, ...rest) => {
  if (captureMode) {
    watChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    return true;
  }
  return realStdoutWrite(chunk, ...rest);
};

captureMode = true;
const r3 = compileElab('half_adder_tb');
captureMode = false;

// restore
process.stderr.write = realStderrWrite;
process.stdout.write = realStdoutWrite;

const watRaw = Buffer.concat(watChunks).toString('latin1');

// ── Post-process: extract module, strip noise, dedupe definitions ──────────
function cleanWat(raw) {
  const lines = raw.split('\n');
  const out = [];
  let inModule = false;
  const seenFuncs = new Set();
  const seenGlobals = new Set();
  const seenLocals = new Set();
  let currentFunc = null;

  for (const ln of lines) {
    if (!inModule) {
      if (ln.startsWith('(module')) { inModule = true; out.push(ln); }
      continue;
    }
    // End-of-module marker on its own line.
    if (ln === ')') { out.push(ln); break; }

    // Filter debug noise lines that don't look like WAT.
    const trimmed = ln.trimStart();
    if (trimmed === '' || trimmed.startsWith('(') || trimmed.startsWith(';;')) {
      // dedupe top-level func / global definitions
      const funcMatch = /^\s+\(func \$(\S+)/.exec(ln);
      if (funcMatch) {
        if (seenFuncs.has(funcMatch[1])) {
          currentFunc = funcMatch[1];     // entering a duplicate; skip until close
          continue;
        }
        seenFuncs.add(funcMatch[1]);
        currentFunc = null;
      }
      const globMatch = /^\s+\(global \$(\S+)/.exec(ln);
      if (globMatch) {
        if (seenGlobals.has(globMatch[1])) continue;
        seenGlobals.add(globMatch[1]);
      }
      // dedupe (local $name ...) within a kept function
      const locMatch = /^\s+\(local \$(\S+)/.exec(ln);
      if (locMatch && currentFunc === null) {
        const key = (out.length - 1) + ':' + locMatch[1];
        if (seenLocals.has(key)) continue;
        seenLocals.add(key);
      }

      // if we're inside a skipped duplicate func, drop until matching ')'
      if (currentFunc !== null) {
        if (ln.match(/^\s+\)\s*$/)) currentFunc = null;
        continue;
      }
      out.push(ln);
    }
  }
  return out.join('\n') + '\n';
}

const wat = cleanWat(watRaw);
writeFileSync(OUT_WAT, wat);
writeFileSync(OUT_WAT + '.raw', watRaw);  // keep raw for diagnostics

if (r3.ok) {
  process.stderr.write(`  OK  → ${OUT_WAT}  (${wat.length} bytes)\n`);
} else {
  process.stderr.write(`  FAIL  code=${r3.code} err=${r3.error || ''}\n`);
  process.stderr.write(`  partial WAT written to ${OUT_WAT}  (${wat.length} bytes)\n`);
  process.exit(1);
}
