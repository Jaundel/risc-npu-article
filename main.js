'use strict';

/*
   RISC-NPU article visuals
   Visual 1: software loop vs MAC instruction latency
   Visual 2: control-state ribbon
   Visual 3: scaling chart
*/

const HW_COLOR = '#c47d0e';
const SW_COLOR = '#1d63b7';
const FETCH_C = '#6b8cba';
const DECODE_C = '#5b9e6b';
const EXEC_C = '#e07b3a';
const WAIT_C = '#c47d0e';
const ADD_C = '#bbbbbb';
const BOOK_C = '#6b8cba';
const DONE_C = '#4caf88';
const SETUP_C = '#d0d0d0';
const LINE_C = '#d6d6d6';

function prepareCanvas(canvas) {
  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.floor(canvas.clientWidth || Number(canvas.getAttribute('width')) || 600));
  const height = Math.max(1, Math.floor(canvas.clientHeight || Number(canvas.getAttribute('height')) || 220));
  const backingWidth = Math.round(width * ratio);
  const backingHeight = Math.round(height * ratio);

  if (canvas.width !== backingWidth || canvas.height !== backingHeight) {
    canvas.width = backingWidth;
    canvas.height = backingHeight;
  }

  const ctx = canvas.getContext('2d');
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { ctx, width, height };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function sumDurations(program) {
  return program.reduce((sum, item) => sum + item.dur, 0);
}

function cycleToIndex(program, cycle) {
  let elapsed = 0;
  for (let i = 0; i < program.length; i += 1) {
    elapsed += program[i].dur;
    if (cycle < elapsed) return i;
  }
  return program.length;
}

function buttonText(id, text) {
  const button = document.getElementById(id);
  if (button) button.textContent = text;
}

/* Visual 1: execution trace */

const ROM_SW = [
  { type: 'setup', label: 'RST', dur: 1 },
  { type: 'book', label: 'LDIA 0', dur: 3 },
  { type: 'book', label: 'LDIB 50', dur: 3 },
];

for (let i = 0; i < 50; i += 1) {
  ROM_SW.push({ type: 'add', label: 'ADD', dur: 3 });
}

ROM_SW.push({ type: 'book', label: 'STA 0', dur: 3 });

const ROM_HW = [
  { type: 'mac', label: 'MAC', dur: 13 },
];

const SW_TOTAL = sumDurations(ROM_SW);
const HW_TOTAL = sumDurations(ROM_HW);

let raceRunning = false;
let raceCycle = 0;
let raceRaf = null;

function colorForInstruction(item, done, active, alreadyDone) {
  if (done) return DONE_C;
  if (active) return '#f4f4f4';
  if (alreadyDone) return item.type === 'add' ? '#dedede' : '#9ab0cc';
  if (item.type === 'mac') return HW_COLOR;
  if (item.type === 'add') return ADD_C;
  if (item.type === 'setup') return SETUP_C;
  return BOOK_C;
}

function drawProgramGrid(ctx, program, x0, y0, gridWidth, gridHeight, activeIndex, done) {
  const count = program.length;
  const cols = count <= 4 ? count : Math.ceil(Math.sqrt(count * 2.2));
  const rows = Math.ceil(count / cols);
  const gap = 2;
  const cellWidth = Math.min(88, (gridWidth - gap * (cols - 1)) / cols);
  const cellHeight = Math.min(40, (gridHeight - gap * (rows - 1)) / rows);
  const totalWidth = cellWidth * cols + gap * (cols - 1);
  const totalHeight = cellHeight * rows + gap * (rows - 1);
  const startX = x0 + (gridWidth - totalWidth) / 2;
  const startY = y0 + (gridHeight - totalHeight) / 2;

  for (let i = 0; i < count; i += 1) {
    const item = program[i];
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = startX + col * (cellWidth + gap);
    const y = startY + row * (cellHeight + gap);
    const active = i === activeIndex && !done;
    const alreadyDone = i < activeIndex;

    ctx.fillStyle = colorForInstruction(item, done, active, alreadyDone);
    ctx.fillRect(x, y, cellWidth, cellHeight);

    if (active) {
      ctx.strokeStyle = '#222';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x, y, cellWidth, cellHeight);
    }

    const canLabel = item.type !== 'add' && cellWidth >= 34 && cellHeight >= 16;
    if (canLabel) {
      ctx.fillStyle = active ? '#333' : '#fff';
      ctx.font = `bold ${Math.max(8, Math.min(12, cellWidth * 0.16))}px Helvetica, Arial, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(item.label, x + cellWidth / 2, y + cellHeight / 2);
    }
  }
}

function drawRomGrid(canvas) {
  const { ctx, width, height } = prepareCanvas(canvas);
  ctx.clearRect(0, 0, width, height);

  const pad = 16;
  const titleY = pad;
  const gridY = 48;
  const barY = height - pad - 8;
  const gridHeight = barY - gridY - 16;
  const midX = width / 2;
  const columnWidth = midX - pad * 1.5;

  const swDone = raceCycle >= SW_TOTAL;
  const hwDone = raceCycle >= HW_TOTAL;
  const swIndex = clamp(cycleToIndex(ROM_SW, raceCycle), 0, ROM_SW.length - 1);
  const hwIndex = clamp(cycleToIndex(ROM_HW, raceCycle), 0, ROM_HW.length - 1);

  ctx.strokeStyle = LINE_C;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(midX, pad);
  ctx.lineTo(midX, height - pad);
  ctx.stroke();

  ctx.font = '600 12px Helvetica, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  ctx.fillStyle = '#333';
  ctx.fillText(`Software loop - cycle ${Math.min(raceCycle, SW_TOTAL)} / ${SW_TOTAL}`, midX / 2, titleY);

  ctx.fillStyle = hwDone ? DONE_C : '#333';
  const hwLabel = hwDone ? `MAC done at cycle ${HW_TOTAL}` : `MAC wait - cycle ${Math.min(raceCycle, HW_TOTAL)} / ${HW_TOTAL}`;
  ctx.fillText(hwLabel, midX + midX / 2, titleY);

  drawProgramGrid(ctx, ROM_SW, pad, gridY, columnWidth, gridHeight, swIndex, swDone);
  drawProgramGrid(ctx, ROM_HW, midX + pad / 2, gridY, columnWidth, gridHeight, hwIndex, hwDone);

  const barX = pad;
  const barWidth = width - pad * 2;
  ctx.fillStyle = '#eeeeee';
  ctx.fillRect(barX, barY, barWidth, 4);

  const swFrac = clamp(raceCycle / SW_TOTAL, 0, 1);
  ctx.fillStyle = swDone ? DONE_C : SW_COLOR;
  ctx.fillRect(barX, barY, barWidth * swFrac, 4);

  const hwX = barX + barWidth * (HW_TOTAL / SW_TOTAL);
  ctx.fillStyle = HW_COLOR;
  ctx.fillRect(hwX - 1, barY - 4, 2, 12);
}

function raceStep() {
  const canvas = document.getElementById('rom-canvas');
  if (!canvas) return;

  drawRomGrid(canvas);

  if (raceCycle < SW_TOTAL) {
    raceCycle += 2;
    raceRaf = requestAnimationFrame(raceStep);
    return;
  }

  raceRunning = false;
  raceCycle = SW_TOTAL;
  drawRomGrid(canvas);
  buttonText('race-btn', 'Replay');
}

function resetRace() {
  cancelAnimationFrame(raceRaf);
  raceRunning = false;
  raceCycle = 0;
  buttonText('race-btn', 'Run');
  const canvas = document.getElementById('rom-canvas');
  if (canvas) drawRomGrid(canvas);
}

function startRaceAuto() {
  cancelAnimationFrame(raceRaf);
  raceCycle = 0;
  raceRunning = true;
  buttonText('race-btn', 'Pause');
  raceStep();
}

function raceToggle() {
  if (raceRunning) {
    cancelAnimationFrame(raceRaf);
    raceRunning = false;
    buttonText('race-btn', 'Resume');
    return;
  }

  if (raceCycle >= SW_TOTAL) raceCycle = 0;
  raceRunning = true;
  buttonText('race-btn', 'Pause');
  raceStep();
}

/* Visual 2: control-state ribbon */

function pushInstructionStates(states) {
  states.push({ s: '001', c: FETCH_C });
  states.push({ s: '010', c: DECODE_C });
  states.push({ s: '100', c: EXEC_C });
}

function buildSwStates() {
  const states = [{ s: 'rst', c: SETUP_C }];
  pushInstructionStates(states);
  pushInstructionStates(states);
  for (let i = 0; i < 50; i += 1) pushInstructionStates(states);
  pushInstructionStates(states);
  return states;
}

function buildHwStates() {
  const states = [];
  states.push({ s: '001', c: FETCH_C });
  states.push({ s: '010', c: DECODE_C });
  for (let i = 0; i < 13; i += 1) states.push({ s: '111', c: WAIT_C });
  states.push({ s: '100', c: EXEC_C });
  return states;
}

const SW_STATES = buildSwStates();
const HW_STATES = buildHwStates();
const RIBBON_MAX = SW_STATES.length;

let ribbonRunning = false;
let ribbonCycle = 0;
let ribbonRaf = null;

function drawRibbon(canvas) {
  const { ctx, width, height } = prepareCanvas(canvas);
  ctx.clearRect(0, 0, width, height);

  const pad = 16;
  const labelWidth = 76;
  const x0 = pad + labelWidth;
  const totalWidth = width - pad * 2 - labelWidth;
  const rowHeight = 36;
  const row1Y = 38;
  const row2Y = 98;
  const cellWidth = totalWidth / RIBBON_MAX;

  ctx.font = '600 11px Helvetica, Arial, sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = SW_COLOR;
  ctx.fillText('SOFTWARE', pad + labelWidth - 8, row1Y + rowHeight / 2);
  ctx.fillStyle = HW_COLOR;
  ctx.fillText('HARDWARE', pad + labelWidth - 8, row2Y + rowHeight / 2);

  const swVisible = clamp(ribbonCycle, 0, SW_STATES.length);
  for (let i = 0; i < swVisible; i += 1) {
    ctx.fillStyle = SW_STATES[i].c;
    ctx.fillRect(x0 + i * cellWidth, row1Y, Math.max(cellWidth, 1), rowHeight);
  }

  const hwVisible = clamp(ribbonCycle, 0, HW_STATES.length);
  for (let i = 0; i < hwVisible; i += 1) {
    ctx.fillStyle = HW_STATES[i].c;
    ctx.fillRect(x0 + i * cellWidth, row2Y, Math.max(cellWidth, 1), rowHeight);
  }

  if (ribbonCycle >= HW_STATES.length) {
    ctx.fillStyle = DONE_C;
    ctx.font = 'bold 11px Helvetica, Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('Done: 13 MAC_WAIT cycles', x0 + HW_STATES.length * cellWidth + 8, row2Y + rowHeight / 2);
  }

  ctx.strokeStyle = LINE_C;
  ctx.lineWidth = 1;
  ctx.strokeRect(x0, row1Y, totalWidth, rowHeight);
  ctx.strokeRect(x0, row2Y, totalWidth, rowHeight);

  ctx.fillStyle = '#777';
  ctx.font = '11px Helvetica, Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(`Cycle ${Math.min(ribbonCycle, RIBBON_MAX)} / ${RIBBON_MAX}`, x0, height - pad);
}

function ribbonStep() {
  const canvas = document.getElementById('ribbon-canvas');
  if (!canvas) return;

  drawRibbon(canvas);

  if (ribbonCycle < RIBBON_MAX) {
    ribbonCycle += 3;
    ribbonRaf = requestAnimationFrame(ribbonStep);
    return;
  }

  ribbonRunning = false;
  ribbonCycle = RIBBON_MAX;
  drawRibbon(canvas);
  buttonText('ribbon-btn', 'Replay');
}

function resetRibbon() {
  cancelAnimationFrame(ribbonRaf);
  ribbonRunning = false;
  ribbonCycle = 0;
  buttonText('ribbon-btn', 'Animate');
  const canvas = document.getElementById('ribbon-canvas');
  if (canvas) drawRibbon(canvas);
}

function startRibbonAuto() {
  cancelAnimationFrame(ribbonRaf);
  ribbonCycle = 0;
  ribbonRunning = true;
  buttonText('ribbon-btn', 'Pause');
  ribbonStep();
}

function ribbonToggle() {
  if (ribbonRunning) {
    cancelAnimationFrame(ribbonRaf);
    ribbonRunning = false;
    buttonText('ribbon-btn', 'Resume');
    return;
  }

  if (ribbonCycle >= RIBBON_MAX) ribbonCycle = 0;
  ribbonRunning = true;
  buttonText('ribbon-btn', 'Pause');
  ribbonStep();
}

/* Visual 3: scaling chart */

const BENCH_DATA = [
  { n: 10, sw: 40, hw: 13 },
  { n: 25, sw: 85, hw: 13 },
  { n: 50, sw: 160, hw: 13 },
  { n: 100, sw: 310, hw: 13 },
];

let chartProgress = 0;
let chartRunning = false;
let chartRaf = null;
let chartStart = 0;

function drawChart(canvas, progress = chartProgress) {
  const { ctx, width, height } = prepareCanvas(canvas);
  ctx.clearRect(0, 0, width, height);

  const pad = { top: 20, right: 60, bottom: 36, left: 52 };
  const graphWidth = width - pad.left - pad.right;
  const graphHeight = height - pad.top - pad.bottom;
  const maxCycles = 340;
  const maxN = 110;
  const visibleN = maxN * clamp(progress, 0, 1);

  const px = (n) => pad.left + (n / maxN) * graphWidth;
  const py = (cycles) => pad.top + graphHeight - (cycles / maxCycles) * graphHeight;

  ctx.strokeStyle = '#ececec';
  ctx.lineWidth = 1;
  for (let cycles = 0; cycles <= maxCycles; cycles += 50) {
    ctx.beginPath();
    ctx.moveTo(pad.left, py(cycles));
    ctx.lineTo(pad.left + graphWidth, py(cycles));
    ctx.stroke();

    ctx.fillStyle = '#999';
    ctx.font = '10px Helvetica, Arial, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(cycles, pad.left - 6, py(cycles));
  }

  ctx.strokeStyle = '#999';
  ctx.beginPath();
  ctx.moveTo(pad.left, pad.top);
  ctx.lineTo(pad.left, pad.top + graphHeight);
  ctx.lineTo(pad.left + graphWidth, pad.top + graphHeight);
  ctx.stroke();

  ctx.fillStyle = '#777';
  ctx.font = '11px Helvetica, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('N', pad.left + graphWidth / 2, height - 14);

  ctx.save();
  ctx.translate(12, pad.top + graphHeight / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('Cycles', 0, 0);
  ctx.restore();

  if (visibleN > 0) {
    ctx.beginPath();
    ctx.strokeStyle = SW_COLOR;
    ctx.lineWidth = 2;
    const swSteps = Math.max(1, Math.floor(visibleN));
    for (let n = 0; n <= swSteps; n += 1) {
      const cycles = 10 + 3 * n;
      if (n === 0) ctx.moveTo(px(n), py(cycles));
      else ctx.lineTo(px(n), py(cycles));
    }
    ctx.lineTo(px(visibleN), py(10 + 3 * visibleN));
    ctx.stroke();

    ctx.beginPath();
    ctx.strokeStyle = HW_COLOR;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 3]);
    ctx.moveTo(px(0), py(13));
    ctx.lineTo(px(visibleN), py(13));
    ctx.stroke();
    ctx.setLineDash([]);
  }

  BENCH_DATA.forEach((point) => {
    ctx.fillStyle = '#999';
    ctx.font = '10px Helvetica, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(point.n, px(point.n), pad.top + graphHeight + 6);

    if (point.n > visibleN) return;

    ctx.beginPath();
    ctx.arc(px(point.n), py(point.sw), 5, 0, Math.PI * 2);
    ctx.fillStyle = SW_COLOR;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(px(point.n), py(point.hw), 5, 0, Math.PI * 2);
    ctx.fillStyle = HW_COLOR;
    ctx.fill();

    const speedup = (point.sw / point.hw).toFixed(1);
    const midY = (py(point.sw) + py(point.hw)) / 2;
    ctx.fillStyle = '#555';
    ctx.font = 'bold 11px Helvetica, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${speedup}x`, px(point.n) + 20, midY);
  });

  if (progress > 0.85) {
    ctx.fillStyle = SW_COLOR;
    ctx.font = 'italic 11px Georgia, serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('SW = 3N + 10', px(55), py(10 + 3 * 55) - 12);

    ctx.fillStyle = HW_COLOR;
    ctx.fillText('HW = 13', px(55), py(13) - 10);
  }
}

function chartStep(timestamp) {
  const canvas = document.getElementById('chart-canvas');
  if (!canvas) return;

  if (!chartStart) chartStart = timestamp;
  chartProgress = clamp((timestamp - chartStart) / 1400, 0, 1);
  drawChart(canvas, chartProgress);

  if (chartProgress < 1) {
    chartRaf = requestAnimationFrame(chartStep);
    return;
  }

  chartRunning = false;
}

function resetChart() {
  cancelAnimationFrame(chartRaf);
  chartRunning = false;
  chartStart = 0;
  chartProgress = 0;
  const canvas = document.getElementById('chart-canvas');
  if (canvas) drawChart(canvas, chartProgress);
}

function startChartAuto() {
  cancelAnimationFrame(chartRaf);
  chartRunning = true;
  chartStart = 0;
  chartProgress = 0;
  chartRaf = requestAnimationFrame(chartStep);
}

/* Scroll replay */

function setupAutoReplay() {
  if (!('IntersectionObserver' in window)) return;

  const players = [
    {
      selector: '#rom-canvas',
      isDone: () => !raceRunning && raceCycle >= SW_TOTAL,
      isRunning: () => raceRunning,
      start: startRaceAuto,
    },
    {
      selector: '#ribbon-canvas',
      isDone: () => !ribbonRunning && ribbonCycle >= RIBBON_MAX,
      isRunning: () => ribbonRunning,
      start: startRibbonAuto,
    },
    {
      selector: '#chart-canvas',
      isDone: () => !chartRunning && chartProgress >= 1,
      isRunning: () => chartRunning,
      start: startChartAuto,
    },
  ];

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;

      const player = players.find(p => entry.target === document.querySelector(p.selector));
      if (!player) return;

      // Start if never played (done=false, running=false, cycle=0) or if already finished
      if (!player.isRunning()) {
        player.start();
      }
    });
  }, {
    threshold: 0.15,
    rootMargin: '0px 0px -5% 0px',
  });

  players.forEach((player) => {
    const element = document.querySelector(player.selector);
    if (element) observer.observe(element);
  });
}

window.addEventListener('load', () => {
  resetRace();
  resetRibbon();
  resetChart();
  setupAutoReplay();
});

window.addEventListener('resize', () => {
  const romCanvas = document.getElementById('rom-canvas');
  if (romCanvas && !raceRunning) drawRomGrid(romCanvas);

  const ribbonCanvas = document.getElementById('ribbon-canvas');
  if (ribbonCanvas && !ribbonRunning) drawRibbon(ribbonCanvas);

  const chartCanvas = document.getElementById('chart-canvas');
  if (chartCanvas && !chartRunning) drawChart(chartCanvas, chartProgress);
});

window.raceToggle = raceToggle;
window.ribbonToggle = ribbonToggle;
