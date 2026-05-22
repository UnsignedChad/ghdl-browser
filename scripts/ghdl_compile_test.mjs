// Single-project test runner: invoked as `node single_test.mjs <dir> <file> <top>`
// Returns JSON line summarizing analyze + compile + wat2wasm result.
import { readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const https = require('https');

const [,, projDir, vhdFile, topName] = process.argv;

const WASM     = '/home/chad/ghdl-browser/build/link-wasm/ghdl.wasm';
const GHDL_LIB = '/home/chad/ghdl-wasm/ghdl/lib/ghdl';
const VLIB     = '/ghdl/lib/ghdl';
const VPREFIX  = '/ghdl';
const WORKDIR  = '/work';

function normalizePath(p) {
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
  add(p,c)     { this.files.set(normalizePath(p), Buffer.isBuffer(c)?c:Buffer.from(c,'utf8')); }
  has(p)       { return this.files.has(normalizePath(p)); }
  open(p)      { const np=normalizePath(p); const d=this.files.get(np); if(!d) return -1; const fd=this.nfd++; this.fds.set(fd,{p:np,pos:0,d}); return fd; }
  close(fd)    { this.fds.delete(fd); }
  get(fd)      { return this.fds.get(fd); }
  len(fd)      { const f=this.fds.get(fd); return f?f.d.length:-1; }
  eof(fd)      { const f=this.fds.get(fd); return !f||f.pos>=f.d.length; }
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

function fetchText(url) {
  return new Promise((r,e) => https.get(url, {headers:{'User-Agent':'b/1'}}, res => {
    if (res.statusCode===301||res.statusCode===302) return fetchText(res.headers.location).then(r,e);
    let d=''; res.on('data',c=>d+=c); res.on('end',()=>r(d)); res.on('error',e);
  }).on('error',e));
}

let mem, inst;
const DEC = new TextDecoder('latin1');
const u8 = () => new Uint8Array(mem.buffer);
const dv = () => new DataView(mem.buffer);
function cstr(p) { if (!p) return ''; const m=u8(); let e=p; while(m[e]) e++; return DEC.decode(m.subarray(p,e)); }
function astr_fat(p,bp) { const v=dv(); const first=v.getInt32(bp,true), last=v.getInt32(bp+4,true); return last<first?'':DEC.decode(u8().subarray(p, p+(last-first+1))); }
function wads(dp,bp,s) { const m=u8(); const v=dv(); for(let i=0;i<s.length;i++) m[dp+i]=s.charCodeAt(i); v.setInt32(bp,1,true); v.setInt32(bp+4,s.length,true); }
function bsz(p) { if (!p) return 0; const v=dv(); const base=p-16; const nr=v.getUint32(base+4,true); return (nr&~1)-base-16; }

let captureMode = false;
const watChunks = [];
function emit(buf) { if (captureMode) watChunks.push(buf); /* drop in non-capture */ }

const env = {
  gnat__directory_operations__get_current_dir: (d,b) => wads(d,b,WORKDIR),
  ada__command_line__command_name: (d,b)=>wads(d,b,'ghdl'),
  ada__command_line__argument_count: ()=>0,
  ada__command_line__argument: (d,b,_)=>wads(d,b,''),
  ada__exceptions__exception_identity:()=>0, ada__exceptions__exception_name:()=>{}, ada__exceptions__exception_information:()=>{},
  strlen: (p)=>{const m=u8();let n=0;while(m[p+n])n++;return n;},
  strcmp: (a,b)=>{const m=u8();for(let i=0;;i++){const d=m[a+i]-m[b+i];if(d)return d;if(!m[a+i])return 0;}},
  realloc: (p,n)=>{if(!p)return inst.exports.malloc(n);if(!n){inst.exports.free(p);return 0;}const o=bsz(p);const np=inst.exports.malloc(n);if(!np)return 0;const m=u8();for(let i=0;i<Math.min(o,n);i++)m[np+i]=m[p+i];inst.exports.free(p);return np;},
  fopen: (pp,_)=>{const fd=vfs.open(cstr(pp));return fd<=0?0:fd;},
  fclose:(fd)=>{vfs.close(fd);return 0;},
  fread: (buf,sz,cnt,fd)=>{const n=vfs.read(fd,u8().subarray(buf,buf+sz*cnt),sz*cnt);return n<0?0:Math.floor(n/sz);},
  fwrite:(buf,sz,cnt,fd)=>{const bytes=u8().subarray(buf,buf+sz*cnt);if(captureMode)watChunks.push(Buffer.from(bytes));return cnt;},
  fputs: (sp)=>{const s=cstr(sp)||'';if(captureMode)watChunks.push(Buffer.from(s,'latin1'));return s.length;},
  fgets: (buf,size,fd)=>{const m=u8();let i=0;while(i<size-1){const t=new Uint8Array(1);if(vfs.read(fd,t,1)<=0)break;m[buf+i++]=t[0];if(t[0]===0x0a)break;}if(!i)return 0;m[buf+i]=0;return buf;},
  fflush:()=>0, feof:(fd)=>vfs.eof(fd)?1:0, ftell:(fd)=>{const f=vfs.get(fd);return f?f.pos:-1;},
  getc:(fd)=>{const t=new Uint8Array(1);return vfs.read(fd,t,1)<=0?-1:t[0];},
  putc:(c)=>{if(captureMode)watChunks.push(Buffer.from([c&0xff]));return c;},
  ungetc:(c,fd)=>{const f=vfs.get(fd);if(f&&f.pos>0)f.pos--;return c;},
  setbuf:()=>{}, isatty:()=>0, fprintf:()=>0, snprintf:()=>0,
  gnat__os_lib__is_regular_file: (p,f)=>vfs.has(astr_fat(p,f))?1:0,
  gnat__os_lib__is_absolute_path:(p,f)=>astr_fat(p,f).startsWith('/')?1:0,
  gnat__os_lib__is_directory:()=>0, gnat__os_lib__is_executable_file:()=>0,
  gnat__os_lib__delete_file:(_a,_b,_c,ok)=>{if(ok)dv().setInt32(ok,0,true);},
  gnat__os_lib__rename_file:(...a)=>{const ok=a[a.length-1];if(ok)dv().setInt32(ok,0,true);},
  gnat__os_lib__file_time_stamp:()=>BigInt(0),
  gnat__os_lib__open_read__2:(path_ptr)=>vfs.open(cstr(path_ptr)),
  gnat__os_lib__close:(fd)=>{vfs.close(fd);},
  gnat__os_lib__create_file__2:()=>-1,
  gnat__os_lib__file_length:(fd)=>vfs.len(fd),
  gnat__os_lib__read:(fd,buf,n)=>{const r=vfs.read(fd,u8().subarray(buf,buf+n),n);return r<0?0:r;},
  gnat__os_lib__write:(fd,buf,n)=>{const bytes=u8().subarray(buf,buf+n);if(captureMode)watChunks.push(Buffer.from(bytes));return n;},
  gnat__os_lib__spawn:()=>-1,
  gnat__os_lib__locate_exec_on_path:(d,b)=>wads(d,b,''),
  ada__calendar__clock:()=>0, ada__calendar__time_zones__utc_time_offset:()=>0,
  ada__calendar__Osubtract:()=>0, ada__calendar__split:()=>{},
  ada__characters__handling__to_lower:(c)=>c,
  gnat__sha1__update:()=>{}, gnat__sha1__digest__4:()=>{}, gnat__sha1__digest__5:()=>{},
  gnat__heap_sort_a__sort:()=>{},
  system__img_lli__impl__image_integer:()=>0,
  system__val_lli__impl__value_integer:()=>BigInt(0),
  __gnat_put_exception:()=>{},
  __gnat_put_int:(n)=>{if(captureMode)watChunks.push(Buffer.from(`${n}`,'latin1'));},
  __gnat_put_char:(c)=>{if(captureMode)watChunks.push(Buffer.from([c&0xff]));},
  __gnat_put_string:(p,l)=>{if(captureMode)watChunks.push(Buffer.from(u8().subarray(p,p+l)));},
  __gnat_grow:(n)=>n,
  ceil:Math.ceil, floor:Math.floor, round:Math.round, trunc:Math.trunc,
  fmod:(x,y)=>x%y, fmin:Math.min, fmax:Math.max, log10:Math.log10, cbrt:Math.cbrt,
  getenv:()=>0,
  exit:(c)=>{throw Object.assign(new Error(`exit(${c})`),{exitCode:c,isExit:true});},
  time:(p)=>{const t=BigInt(Math.floor(Date.now()/1000));if(p)dv().setBigInt64(p,t,true);return t;},
  ctime:()=>0,
  __ghdl_maybe_return_via_longjump:()=>{},
  __ghdl_run_through_longjump:(fn,a)=>{if(fn)try{inst.exports.__indirect_function_table.get(fn)(a);}catch(_){}return 0;},
  __ghdl_ELABORATE:()=>{},
  grt_save_backtrace:()=>{}, grt_get_clk_tck:()=>100, grt_get_times:()=>{},
  backtrace_create_state:()=>0, backtrace_pcinfo:()=>0,
  loadVhpiModule:()=>0, loadVpiModule:()=>0,
  Increment_p_vpi_vecval:()=>{}, vpi_get_value_vec_helper:()=>{},
  fstWriterCreate:()=>0, fstWriterClose:()=>{}, fstWriterSetFileType:()=>{},
  fstWriterSetPackType:()=>{}, fstWriterSetTimescale:()=>{}, fstWriterSetVersion:()=>{},
  fstWriterSetRepackOnClose:()=>{}, fstWriterSetParallelMode:()=>{},
  fstWriterCreateVar2:()=>0,
  fstWriterSetSourceStem:()=>{}, fstWriterSetSourceInstantiationStem:()=>{},
  fstWriterSetScope:()=>{}, fstWriterSetUpscope:()=>{},
  fstWriterEmitValueChange:()=>{}, fstWriterEmitVariableLengthValueChange:()=>{}, fstWriterEmitTimeChange:()=>{},
  gzopen:()=>0, gzwrite:()=>0, gzputc:()=>0, gzclose:()=>{},
  __multi3:(rp,al,ah,bl,bh)=>{
    const a = (BigInt.asUintN(64, ah) << 64n) | BigInt.asUintN(64, al);
    const b = (BigInt.asUintN(64, bh) << 64n) | BigInt.asUintN(64, bl);
    const r = BigInt.asUintN(128, a * b);
    const v = dv();
    v.setBigUint64(rp,   r & ((1n << 64n) - 1n), true);
    v.setBigUint64(rp+8, r >> 64n, true);
  },
};

const bytes = readFileSync(WASM);
const { instance } = await WebAssembly.instantiate(bytes, { env });
inst = instance; mem = inst.exports.memory;
mem.grow(1024 - Math.ceil(mem.buffer.byteLength/65536));
try { inst.exports.__wasm_call_ctors(); } catch(_) {}
const E = inst.exports;
u8()[E.vhdl__canon__canon_flag_add_labels.value] = 1;
E.options__initialize(0);
{
  const libPath = VPREFIX + '/lib/ghdl/';
  const b = Buffer.from(libPath, 'latin1');
  const dp = E.malloc(b.length + 1);
  u8().set(b, dp); u8()[dp + b.length] = 0;
  const bp = E.malloc(8);
  dv().setInt32(bp,1,true); dv().setInt32(bp+4,b.length,true);
  E.libraries__add_library_path(dp, bp, 0);
  E.free(dp); E.free(bp);
}
if (!E.libraries__load_std_library(1, 0)) { console.log(JSON.stringify({dir:projDir, stage:'init', err:'std lib'})); process.exit(0); }
E.libraries__load_work_library(1, 0);

const BASE = 'https://raw.githubusercontent.com/TheChipMaker/VHDL-100-Projects/main/Stage%201%20-%20Combinational%20Basics';
const url = `${BASE}/${encodeURIComponent(projDir)}/${vhdFile}`;

let src;
try {
  src = await fetchText(url);
  if (src.startsWith('<!DOCTYPE') || src.includes('404: Not Found')) throw new Error('not found');
} catch (e) {
  console.log(JSON.stringify({dir:projDir, stage:'fetch', err:e.message}));
  process.exit(0);
}

// Stage A: analyze
vfs.add(vhdFile, src);
const b = Buffer.from(vhdFile, 'latin1');
const fp = E.malloc(b.length + 1);
u8().set(b, fp); u8()[fp + b.length] = 0;
let iir = 0, err = null;
try { iir = E['libghdl__analyze_file'](fp, b.length, 0); }
catch(e) { err = e.isExit?`EXIT(${e.exitCode})`:e.message; }
E.free(fp);
if (err || iir <= 0) {
  console.log(JSON.stringify({dir:projDir, stage:'A', err: err || `iir=${iir}`}));
  process.exit(0);
}

// Stage C: compile_elab — VHDL identifiers are case-insensitive; the name
// table stores them lowercased, so look up the lowercase form.
const tb = Buffer.from(topName.toLowerCase(), 'latin1');
const tp = E.malloc(tb.length + 1);
u8().set(tb, tp); u8()[tp + tb.length] = 0;
captureMode = true;
let cResult, cErr;
try { cResult = E['libghdl__compile_elab'](tp, tb.length, 0, 0); }
catch(e) { cErr = e.message; }
captureMode = false;
E.free(tp);
if (cErr || cResult !== 0) {
  console.log(JSON.stringify({dir:projDir, stage:'C', err: cErr || `result=${cResult}`}));
  process.exit(0);
}

// Stage W: wat2wasm
const raw = Buffer.concat(watChunks).toString('latin1');
function cleanWat(raw) {
  const lines = raw.split('\n');
  const out = [];
  let inModule = false;
  const seenFuncs = new Set();
  const seenGlobals = new Set();
  let skipDepth = 0;
  function countParens(s) { const noC = s.replace(/;;.*$/, ''); let o=0,c=0; for (const ch of noC) { if(ch==='(')o++; else if(ch===')')c++; } return [o,c]; }
  for (const ln of lines) {
    if (!inModule) { if (ln.startsWith('(module')) { inModule=true; out.push(ln); } continue; }
    if (ln === ')') { out.push(ln); break; }
    const trimmed = ln.trimStart();
    if (!(trimmed === '' || trimmed.startsWith('(') || trimmed.startsWith(';;') || trimmed.startsWith(')'))) continue;
    if (skipDepth > 0) { const [o,c]=countParens(ln); skipDepth+=o-c; continue; }
    const fm = /^  \(func \$(\S+)/.exec(ln);
    if (fm) { if (seenFuncs.has(fm[1])) { const [o,c]=countParens(ln); skipDepth=Math.max(0,o-c); continue; } seenFuncs.add(fm[1]); }
    const gm = /^  \(global \$(\S+)/.exec(ln);
    if (gm) { if (seenGlobals.has(gm[1])) continue; seenGlobals.add(gm[1]); }
    out.push(ln);
  }
  return out.join('\n') + '\n';
}
const cleaned = cleanWat(raw);
const watPath = `/tmp/single_${projDir}.wat`;
const wasmPath = `/tmp/single_${projDir}.wasm`;
writeFileSync(watPath, cleaned);
try {
  execSync(`wat2wasm ${watPath} -o ${wasmPath}`, { stdio: ['ignore','ignore','pipe'] });
  const wasmSize = statSync(wasmPath).size;
  console.log(JSON.stringify({dir:projDir, stage:'W', ok:true, watLines:cleaned.split('\n').length, wasmSize}));
} catch (e) {
  const stderr = (e.stderr ? e.stderr.toString() : e.message).split('\n')[0];
  console.log(JSON.stringify({dir:projDir, stage:'W', err: stderr, watLines:cleaned.split('\n').length}));
}
