// Run the browser-compiled sim.wasm with a real scheduler.
// Each emitted function is exported as `f<Idx>`, where Idx is the integer
// the codegen passes to __ghdl_process_register.  So we can resolve the
// process function from the registration call and invoke it directly.
import { readFileSync } from 'fs';

const bytes = readFileSync('/tmp/fresh_browser.wasm');

let mem, inst;
const u8 = () => new Uint8Array(mem.buffer);
const dv = () => new DataView(mem.buffer);

// ── Bump allocator into wasm memory ──────────────────────────────────────
let bumpPtr = 0x10000;
function malloc(n) {
  bumpPtr = (bumpPtr + 15) & ~15;
  const p = bumpPtr;
  bumpPtr += n;
  return p;
}

// ── Simulation state ─────────────────────────────────────────────────────
const transitions = [];                // signal_direct_assign events
let now = 0n;                          // simulated time (fs to match GHDL)
const signalTable = new Map();         // signal_ptr → {idx, kind, value}
let nextSignalIdx = 0;
const processes = [];                  // [{instance, fnIdx, sensitized}]
let registering = true;                // true during ELABORATE
const pendingWaits = [];               // [{procIdx, wakeTime}]

// ── GRT import stubs ─────────────────────────────────────────────────────
const env = {
  __ghdl_malloc0: (n)  => { const m = malloc(n); u8().fill(0, m, m+n); return m; },
  __ghdl_stack2_allocate: (n) => malloc(n),
  __ghdl_stack2_mark:    ()   => bumpPtr,
  __ghdl_stack2_release: (mk) => { bumpPtr = mk; },
  __ghdl_check_stack_allocation: () => {},
  __ghdl_memcpy: (dst, src, n) => u8().copyWithin(dst, src, src+n),

  __ghdl_rti_add_top:       (a,b,c,d) => {},
  __ghdl_rti_add_package:   (p)       => {},
  __ghdl_init_top_generics: ()        => {},
  __ghdl_signal_name_rti:   ()        => {},
  __ghdl_signal_merge_rti:  ()        => {},

  __ghdl_create_signal_e8: (init_ptr, resolv, instance) => {
    const sigPtr = malloc(64);
    signalTable.set(sigPtr, { idx: nextSignalIdx++, kind: 'std_logic', value: 0 });
    return sigPtr;
  },
  __ghdl_signal_init_e8:           () => {},
  __ghdl_signal_add_direct_driver: () => {},

  __ghdl_process_register: (instance, fnIdx, ctxt, addr) => {
    processes.push({ instance, fnIdx, sensitized: false });
  },
  __ghdl_sensitized_process_register: (instance, fnIdx, ctxt, addr) => {
    processes.push({ instance, fnIdx, sensitized: true });
  },
  __ghdl_process_add_sensitivity: (sig) => {},

  __ghdl_signal_direct_assign: (sig_ptr) => {
    const info = signalTable.get(sig_ptr);
    transitions.push({ t: now, sigIdx: info?.idx ?? -1, sigPtr: sig_ptr });
  },
  __ghdl_signal_read_driver: () => 0,
  __ghdl_signal_read_port:   () => 0,

  __ghdl_process_wait_exit: () => {
    throw new Error('__ghdl_process_wait_exit');
  },
  __ghdl_process_wait_timeout: (delay_lo, delay_hi, _unit) => {
    // delay is i64 in femtoseconds
    const delay = (BigInt(delay_hi) << 32n) | BigInt(delay_lo);
    now += delay;
  },

  __ghdl_bound_check_failed:            () => { throw new Error('bound_check'); },
  __ghdl_integer_index_check_failed:    () => { throw new Error('integer_index'); },
  __ghdl_integer_32_index_check_failed: () => { throw new Error('integer_32_index'); },
  __ghdl_program_error:                 () => { throw new Error('program_error'); },
  __ghdl_ieee_assert_failed:            () => { throw new Error('ieee_assert'); },
  __ghdl_assert_failed: () => {},
  __ghdl_report:        () => {},
  __ghdl_i32_mod: (a, b) => b === 0 ? 0 : a % b,
};

// ── Instantiate ──────────────────────────────────────────────────────────
console.log('size:', bytes.length);
const mod = await WebAssembly.compile(bytes);
const result = await WebAssembly.instantiate(mod, { env });
inst = result;
mem = inst.exports.memory;
mem.grow(256 - mem.buffer.byteLength/65536);
console.log('memory pages:', mem.buffer.byteLength/65536);

// ── Elaborate (registers all processes) ──────────────────────────────────
console.log('\n--- ELABORATE ---');
try { inst.exports.__ghdl_ELABORATE(); }
catch(e) { console.log('ELABORATE threw:', e.message); }

console.log('signals created:', signalTable.size);
console.log('processes registered:', processes.length);
for (const p of processes) {
  console.log(`  - fn=f${p.fnIdx}  instance=0x${p.instance.toString(16)}  sensitized=${p.sensitized}`);
}

// ── Run scheduler ───────────────────────────────────────────────────────
// VHDL semantics:
//   1. Each process runs from start until it hits a wait
//   2. wait_timeout suspends the process for N fs
//   3. After advancing time, any process whose wait expired resumes
//
// For now, just call each process repeatedly until no more time advances.
// Process functions act like coroutines — they remember their state via the
// instance struct and pick up where they left off on the next call.
registering = false;
console.log('\n--- INVOKE PROCESSES ---');
const MAX_STEPS = 4;
for (let step = 0; step < MAX_STEPS; step++) {
  let progress = false;
  for (const p of processes) {
    const fname = `f${p.fnIdx}`;
    const fn = inst.exports[fname];
    if (!fn) continue;
    const beforeTime = now;
    const beforeTx = transitions.length;
    try {
      fn(p.instance);
    } catch (e) {
      console.log(`  ${fname} step ${step}: threw ${e.message}`);
    }
    if (now > beforeTime || transitions.length > beforeTx) {
      progress = true;
    }
  }
  if (!progress) {
    console.log(`  no progress at step ${step}, halting`);
    break;
  }
  console.log(`  step ${step}: now=${now}fs  transitions=${transitions.length}`);
}

console.log('\n--- FINAL STATE ---');
console.log('total transitions:', transitions.length);
for (const t of transitions.slice(0, 20)) {
  console.log(`  t=${t.t}  sig${t.sigIdx} (ptr=0x${t.sigPtr.toString(16)})`);
}
console.log('sim time:', now, 'fs');
