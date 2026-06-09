'use strict';

/* ============================================================
   RISC-NPU Article — Interactive Visuals
   Visual 1: ROM Grid Race
   Visual 2: State Ribbon
   Visual 3: Scaling Chart
   ============================================================ */

const HW_COLOR   = '#c47d0e';
const SW_COLOR   = '#1d63b7';
const FETCH_C    = '#6b8cba';
const DECODE_C   = '#5b9e6b';
const EXEC_C     = '#e07b3a';
const WAIT_C     = '#c47d0e';
const ADD_C      = '#bbbbbb';
const BOOK_C     = '#6b8cba';
const DONE_C     = '#4caf88';
const BG_C       = '#f7f7f7';
const LINE_C     = '#d6d6d6';

/* ── DPI helpers ── */
function dpi(canvas) {
  const r = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (canvas.width !== w * r || canvas.height !== h * r) {
    canvas.width  = w * r;
    canvas.height = h * r;
    canvas.getContext('2d').scale(r, r);
  }
  return { w, h, r };
}

/* ══════════════════════════════════════════════════════════════
   VISUAL 1 — ROM GRID RACE
   SW program: LDIA, LDIB, ADD×50, STA, LDIA, LDIB, MAC, STA = 56 words
   HW program: LDIA, LDIB, STA, LDIA, LDIB, MAC, STA           =  7 words
   ══════════════════════════════════════════════════════════════ */

const ROM_SW = [];  // 56 instructions
ROM_SW.push({ type: 'book', label: 'LDIA 0' });
ROM_SW.push({ type: 'book', label: 'LDIB 50' });
for (let i = 0; i < 50; i++) ROM_SW.push({ type: 'add', label: 'ADD' });
ROM_SW.push({ type: 'book', label: 'STA 0' });
ROM_SW.push({ type: 'book', label: 'LDIA 50' });
ROM_SW.push({ type: 'book', label: 'LDIB 50' });
ROM_SW.push({ type: 'mac', label: 'MAC' });
ROM_SW.push({ type: 'book', label: 'STA 1' });

const ROM_HW = [];
ROM_HW.push({ type: 'book', label: 'LDIA 0' });
ROM_HW.push({ type: 'book', label: 'LDIB 50' });
ROM_HW.push({ type: 'book', label: 'STA 0' });
ROM_HW.push({ type: 'book', label: 'LDIA 50' });
ROM_HW.push({ type: 'book', label: 'LDIB 50' });
ROM_HW.push({ type: 'mac', label: 'MAC' });
ROM_HW.push({ type: 'book', label: 'STA 1' });

let raceRunning = false;
let raceCycle   = 0;   // 0..160 (each ADD = 3 cycles, bookkeeping = 3 each)
let raceRaf     = null;

// map cycle → instruction index for SW (each instr = 3 cycles, MAC = 13)
function swCycleToIdx(c) {
  let sum = 0;
  for (let i = 0; i < ROM_SW.length; i++) {
    const dur = ROM_SW[i].type === 'mac' ? 13 : 3;
    sum += dur;
    if (c < sum) return i;
  }
  return ROM_SW.length;
}

function hwCycleToIdx(c) {
  let sum = 0;
  for (let i = 0; i < ROM_HW.length; i++) {
    const dur = ROM_HW[i].type === 'mac' ? 13 : 3;
    sum += dur;
    if (c < sum) return i;
  }
  return ROM_HW.length;
}

// total cycles
const SW_TOTAL = 2 * 3 + 50 * 3 + 2 * 3 + 13 + 3; // =  3+3+150+3+3+3+13+3 = 181? let me recalc
// LDIA(3) + LDIB(3) + 50×ADD(150) + STA(3) + LDIA(3) + LDIB(3) + MAC(13) + STA(3) = 181
const HW_TOTAL = 3 + 3 + 3 + 3 + 3 + 13 + 3; // = 31

function drawRomGrid(canvas) {
  const { w, h } = dpi(canvas);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);

  // Layout: two grids side by side with labels
  const pad = 16;
  const midX = w / 2;
  const labelH = 26;
  const gridH = h - labelH - pad * 2;

  // ── helpers ──
  function drawGrid(rom, x0, gw, activeIdx, done) {
    const n = rom.length;
    const cols = Math.ceil(Math.sqrt(n * 2.5)) | 0 || 8;
    const rows = Math.ceil(n / cols);
    const cellW = (gw - pad) / cols;
    const cellH = Math.min(cellW * 0.65, gridH / rows);
    const totalGridH = cellH * rows;
    const startY = labelH + pad + (gridH - totalGridH) / 2;

    for (let i = 0; i < n; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cx = x0 + pad / 2 + col * cellW + 1;
      const cy = startY + row * cellH + 1;
      const cw = cellW - 2;
      const ch = cellH - 2;

      let fill = ADD_C;
      if (rom[i].type === 'book') fill = BOOK_C;
      if (rom[i].type === 'mac')  fill = HW_COLOR;

      if (done) fill = DONE_C;
      else if (i === activeIdx) fill = '#f0f0f0';
      else if (i < activeIdx) fill = done ? DONE_C : (rom[i].type === 'add' ? '#dedede' : '#9ab0cc');

      ctx.fillStyle = fill;
      ctx.fillRect(cx, cy, cw, ch);

      // active pulse border
      if (i === activeIdx && !done) {
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(cx, cy, cw, ch);
      }

      // label on non-add small cells
      if (rom[i].type !== 'add' && cellW > 40) {
        ctx.fillStyle = i <= activeIdx || done ? '#fff' : '#fff';
        ctx.font = `bold ${Math.max(8, cellW * 0.18)}px "Helvetica Neue", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(rom[i].label, cx + cw / 2, cy + ch / 2);
      }
    }
  }

  // Labels
  ctx.font = '600 12px "Helvetica Neue", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#555';

  const swActiveIdx = Math.min(swCycleToIdx(raceCycle), ROM_SW.length - 1);
  const hwActiveIdx = Math.min(hwCycleToIdx(raceCycle), ROM_HW.length - 1);
  const swDone = raceCycle >= SW_TOTAL;
  const hwDone = raceCycle >= HW_TOTAL;

  // Divider
  ctx.strokeStyle = LINE_C;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(midX, pad);
  ctx.lineTo(midX, h - pad);
  ctx.stroke();

  // SW side
  const swCycText = swDone ? 'DONE' : `Cycle ${Math.min(raceCycle, SW_TOTAL)}`;
  ctx.fillStyle = '#333';
  ctx.fillText(`Software  — ${ROM_SW.length} instructions  (${swCycText})`, pad + (midX - pad) / 2, pad);
  drawGrid(ROM_SW, 0, midX, swActiveIdx, swDone);

  // HW side
  const hwCycText = hwDone ? `DONE at cycle ${HW_TOTAL}` : `Cycle ${Math.min(raceCycle, HW_TOTAL)}`;
  ctx.fillStyle = hwDone ? DONE_C : '#333';
  ctx.fillText(`Hardware  — ${ROM_HW.length} instructions  (${hwCycText})`, midX + (midX - pad) / 2, pad);
  drawGrid(ROM_HW, midX, midX, hwActiveIdx, hwDone);

  // Cycle progress bar at bottom
  const barY = h - pad - 6;
  const barW = w - pad * 2;
  ctx.fillStyle = '#eee';
  ctx.fillRect(pad, barY, barW, 4);
  const frac = Math.min(raceCycle / SW_TOTAL, 1);
  ctx.fillStyle = swDone ? DONE_C : SW_COLOR;
  ctx.fillRect(pad, barY, barW * frac, 4);
  // HW marker
  const hwX = pad + barW * (HW_TOTAL / SW_TOTAL);
  ctx.fillStyle = HW_COLOR;
  ctx.fillRect(hwX - 1, barY - 3, 2, 10);
}

function raceStep() {
  const canvas = document.getElementById('rom-canvas');
  drawRomGrid(canvas);
  if (raceCycle < SW_TOTAL) {
    raceCycle += 2;
    raceRaf = requestAnimationFrame(raceStep);
  } else {
    raceRunning = false;
    document.getElementById('race-btn').textContent = '↺ Replay';
  }
}

function raceToggle() {
  const btn = document.getElementById('race-btn');
  if (raceRunning) {
    cancelAnimationFrame(raceRaf);
    raceRunning = false;
    btn.textContent = '▶ Resume';
    return;
  }
  if (raceCycle >= SW_TOTAL) {
    raceCycle = 0;
    btn.textContent = '▶ Run';
  }
  raceRunning = true;
  btn.textContent = '⏸ Pause';
  raceStep();
}

/* ══════════════════════════════════════════════════════════════
   VISUAL 2 — STATE RIBBON
   Top row: SW path — 160 cycles of Fetch/Decode/Execute × 50 ADDs
   Bottom row: HW path — Fetch/Decode/MAC_WAIT(13)/Execute for MAC
   ══════════════════════════════════════════════════════════════ */

// Build SW state sequence (cycle by cycle for first 160 cycles shown)
// Each instruction: F(1 cycle), D(1), E(1) → 3 cycles total
// We show the first 3 + 3 + 50×3 = 156 cycles (LDIA+LDIB+50×ADD) + 4 more
function buildSwStates(nInstr, extraInstr) {
  const states = [];
  // LDIA, LDIB
  for (let k = 0; k < 2; k++) {
    states.push({ s: '001', c: FETCH_C });
    states.push({ s: '010', c: DECODE_C });
    states.push({ s: '100', c: EXEC_C });
  }
  for (let i = 0; i < nInstr; i++) {
    states.push({ s: '001', c: FETCH_C });
    states.push({ s: '010', c: DECODE_C });
    states.push({ s: '100', c: EXEC_C });
  }
  return states;
}

function buildHwStates() {
  const states = [];
  // LDIA (3) + LDIB (3)
  for (let k = 0; k < 2; k++) {
    states.push({ s: '001', c: FETCH_C });
    states.push({ s: '010', c: DECODE_C });
    states.push({ s: '100', c: EXEC_C });
  }
  // MAC: Fetch, Decode, 13 MAC_WAIT, Execute (writeback)
  states.push({ s: '001', c: FETCH_C });
  states.push({ s: '010', c: DECODE_C });
  for (let i = 0; i < 13; i++) states.push({ s: '111', c: WAIT_C });
  states.push({ s: '100', c: EXEC_C });
  return states;
}

const SW_STATES = buildSwStates(50);
const HW_STATES = buildHwStates();

let ribbonRunning = false;
let ribbonCycle   = 0;
let ribbonRaf     = null;
const RIBBON_MAX  = SW_STATES.length;

function drawRibbon(canvas) {
  const { w, h } = dpi(canvas);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);

  const pad = 16;
  const labelW = 72;
  const totalW = w - pad * 2 - labelW;
  const rowH = 36;
  const rowGap = 24;
  const row1Y = pad + 20;
  const row2Y = row1Y + rowH + rowGap;
  const cellW = Math.max(1, totalW / RIBBON_MAX);

  // Row labels
  ctx.font = '600 11px "Helvetica Neue", sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = SW_COLOR;
  ctx.fillText('SOFTWARE', pad + labelW - 8, row1Y + rowH / 2);
  ctx.fillStyle = HW_COLOR;
  ctx.fillText('HARDWARE', pad + labelW - 8, row2Y + rowH / 2);

  const xOff = pad + labelW;

  // SW ribbon
  const swVisible = Math.min(ribbonCycle, SW_STATES.length);
  for (let i = 0; i < swVisible; i++) {
    ctx.fillStyle = SW_STATES[i].c;
    ctx.fillRect(xOff + i * cellW, row1Y, Math.max(cellW, 1) + 0.5, rowH);
  }

  // HW ribbon
  const hwVisible = Math.min(ribbonCycle, HW_STATES.length);
  for (let i = 0; i < hwVisible; i++) {
    ctx.fillStyle = HW_STATES[i].c;
    ctx.fillRect(xOff + i * cellW, row2Y, Math.max(cellW, 1) + 0.5, rowH);
  }

  // HW done marker
  if (ribbonCycle >= HW_STATES.length) {
    const doneX = xOff + HW_STATES.length * cellW + 6;
    ctx.fillStyle = DONE_C;
    ctx.font = 'bold 11px "Helvetica Neue", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`✓ Done (${HW_STATES.length} cycles)`, doneX, row2Y + rowH / 2);
  }

  // Cycle counter
  ctx.fillStyle = '#999';
  ctx.font = '11px "Helvetica Neue", sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(`Cycle ${Math.min(ribbonCycle, RIBBON_MAX)} / ${RIBBON_MAX}`, xOff, h - pad);

  // border outlines
  ctx.strokeStyle = LINE_C;
  ctx.lineWidth = 1;
  ctx.strokeRect(xOff, row1Y, totalW, rowH);
  ctx.strokeRect(xOff, row2Y, totalW, rowH);
}

function ribbonStep() {
  const canvas = document.getElementById('ribbon-canvas');
  drawRibbon(canvas);
  if (ribbonCycle < RIBBON_MAX) {
    ribbonCycle += 3;
    ribbonRaf = requestAnimationFrame(ribbonStep);
  } else {
    ribbonRunning = false;
    document.getElementById('ribbon-btn').textContent = '↺ Replay';
  }
}

function ribbonToggle() {
  const btn = document.getElementById('ribbon-btn');
  if (ribbonRunning) {
    cancelAnimationFrame(ribbonRaf);
    ribbonRunning = false;
    btn.textContent = '▶ Resume';
    return;
  }
  if (ribbonCycle >= RIBBON_MAX) {
    ribbonCycle = 0;
    btn.textContent = '▶ Animate';
  }
  ribbonRunning = true;
  btn.textContent = '⏸ Pause';
  ribbonStep();
}

/* ══════════════════════════════════════════════════════════════
   VISUAL 3 — SCALING CHART
   Verified data from bench_multi_tb.vhd
   ══════════════════════════════════════════════════════════════ */

const BENCH_DATA = [
  { n: 10,  sw: 40,  hw: 13 },
  { n: 25,  sw: 85,  hw: 13 },
  { n: 50,  sw: 160, hw: 13 },
  { n: 100, sw: 310, hw: 13 },
];

function drawChart(canvas) {
  const { w, h } = dpi(canvas);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);

  const pad = { top: 20, right: 60, bottom: 36, left: 52 };
  const gw = w - pad.left - pad.right;
  const gh = h - pad.top - pad.bottom;

  const maxSW = 340;
  const maxN  = 110;

  function px(n)    { return pad.left + (n / maxN) * gw; }
  function py(cyc)  { return pad.top + gh - (cyc / maxSW) * gh; }

  // Grid
  ctx.strokeStyle = '#ececec';
  ctx.lineWidth = 1;
  for (let c = 0; c <= maxSW; c += 50) {
    ctx.beginPath();
    ctx.moveTo(pad.left, py(c));
    ctx.lineTo(pad.left + gw, py(c));
    ctx.stroke();
    ctx.fillStyle = '#aaa';
    ctx.font = '10px "Helvetica Neue", sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(c, pad.left - 6, py(c));
  }

  // Axes
  ctx.strokeStyle = '#999';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad.left, pad.top);
  ctx.lineTo(pad.left, pad.top + gh);
  ctx.lineTo(pad.left + gw, pad.top + gh);
  ctx.stroke();

  // Axis labels
  ctx.fillStyle = '#777';
  ctx.font = '11px "Helvetica Neue", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('N (operand size)', pad.left + gw / 2, h - 14);

  ctx.save();
  ctx.translate(12, pad.top + gh / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('Cycles', 0, 0);
  ctx.restore();

  // SW line — 3N+10
  ctx.beginPath();
  ctx.strokeStyle = SW_COLOR;
  ctx.lineWidth = 2;
  for (let n = 0; n <= maxN; n += 2) {
    const cyc = 10 + 3 * n;
    if (n === 0) ctx.moveTo(px(n), py(cyc));
    else         ctx.lineTo(px(n), py(cyc));
  }
  ctx.stroke();

  // HW line — constant 13
  ctx.beginPath();
  ctx.strokeStyle = HW_COLOR;
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 3]);
  ctx.moveTo(px(0), py(13));
  ctx.lineTo(px(maxN), py(13));
  ctx.stroke();
  ctx.setLineDash([]);

  // Data points + labels
  BENCH_DATA.forEach(d => {
    // SW point
    ctx.beginPath();
    ctx.arc(px(d.n), py(d.sw), 5, 0, Math.PI * 2);
    ctx.fillStyle = SW_COLOR;
    ctx.fill();

    // HW point
    ctx.beginPath();
    ctx.arc(px(d.n), py(d.hw), 5, 0, Math.PI * 2);
    ctx.fillStyle = HW_COLOR;
    ctx.fill();

    // Speedup label between points
    const spd = (d.sw / d.hw).toFixed(1);
    const midY = (py(d.sw) + py(d.hw)) / 2;
    ctx.fillStyle = '#555';
    ctx.font = 'bold 11px "Helvetica Neue", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${spd}×`, px(d.n) + 18, midY);

    // N label on axis
    ctx.fillStyle = '#999';
    ctx.font = '10px "Helvetica Neue", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(d.n, px(d.n), pad.top + gh + 6);
  });

  // Formula annotations
  ctx.fillStyle = SW_COLOR;
  ctx.font = 'italic 11px Georgia, serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('SW = 3N + 10', px(55), py(10 + 3 * 55) - 12);

  ctx.fillStyle = HW_COLOR;
  ctx.fillText('HW = 13  (constant)', px(55), py(13) - 10);
}

/* ══════════════════════════════════════════════════════════════
   INIT — draw static states on load
   ══════════════════════════════════════════════════════════════ */

window.addEventListener('load', () => {
  // ROM grid — static initial
  const romCanvas = document.getElementById('rom-canvas');
  if (romCanvas) drawRomGrid(romCanvas);

  // Ribbon — static initial
  const ribbonCanvas = document.getElementById('ribbon-canvas');
  if (ribbonCanvas) drawRibbon(ribbonCanvas);

  // Chart — always static
  const chartCanvas = document.getElementById('chart-canvas');
  if (chartCanvas) drawChart(chartCanvas);
});

// Redraw on resize
window.addEventListener('resize', () => {
  const romCanvas = document.getElementById('rom-canvas');
  if (romCanvas) { if (raceRunning) return; drawRomGrid(romCanvas); }

  const ribbonCanvas = document.getElementById('ribbon-canvas');
  if (ribbonCanvas) { if (ribbonRunning) return; drawRibbon(ribbonCanvas); }

  const chartCanvas = document.getElementById('chart-canvas');
  if (chartCanvas) drawChart(chartCanvas);
});
