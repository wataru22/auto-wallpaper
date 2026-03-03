import { Resvg } from '@resvg/resvg-js';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

type PhoneModel = {
  label: string;
  width: number;
  height: number;
};

const PHONE_MODELS: Record<string, PhoneModel> = {
  iphone15: { label: 'iPhone 15 / 15 Pro / 16', width: 1179, height: 2556 },
  iphone15proMax: { label: 'iPhone 15 Pro Max / 16 Pro Max', width: 1290, height: 2796 },
  iphone14: { label: 'iPhone 14 / 13 / 12', width: 1170, height: 2532 },
  iphone14plus: { label: 'iPhone 14 Plus / 15 Plus', width: 1284, height: 2778 },
  iphoneSE: { label: 'iPhone SE (3rd gen)', width: 750, height: 1334 },
};

const DEFAULT_MODEL_KEY = 'iphone15';
const MAX_DOTS = 5000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const FONT_FILES = ['Inter.ttf', 'RobotoMono.ttf'] as const;

let cachedFontFiles: string[] | null = null;

function loadFontFiles(): string[] {
  if (cachedFontFiles) {
    return cachedFontFiles;
  }

  const files: string[] = [];

  for (const fileName of FONT_FILES) {
    const filePath = fileURLToPath(new URL(`../fonts/${fileName}`, import.meta.url));
    if (existsSync(filePath)) {
      files.push(filePath);
    }
  }

  cachedFontFiles = files;
  return files;
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function parseIsoDate(input: string | null): Date | null {
  if (!input) return null;
  const match = DATE_PATTERN.exec(input.trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

function dateToIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, amount: number): Date {
  return new Date(date.getTime() + amount * DAY_MS);
}

function daysInclusive(start: Date, end: Date): number {
  return Math.floor((end.getTime() - start.getTime()) / DAY_MS) + 1;
}

function sanitizeGoal(goal: string | null): string {
  const value = (goal ?? '').trim();
  if (!value) return 'My Goal';
  return value.slice(0, 42);
}

function validateTimeZone(tz: string | null): string {
  const fallback = 'UTC';
  const value = (tz ?? '').trim();
  if (!value) return fallback;

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date());
    return value;
  } catch {
    return fallback;
  }
}

function todayInTimeZone(tz: string): Date {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const parts = formatter.formatToParts(new Date());
  const year = Number(parts.find((part) => part.type === 'year')?.value ?? '1970');
  const month = Number(parts.find((part) => part.type === 'month')?.value ?? '01');
  const day = Number(parts.find((part) => part.type === 'day')?.value ?? '01');

  return new Date(Date.UTC(year, month - 1, day));
}

function getDateParam(url: URL, key: string, fallback: Date): Date {
  const direct = parseIsoDate(url.searchParams.get(key));
  if (direct) return direct;

  const year = url.searchParams.get(`${key}Year`);
  const month = url.searchParams.get(`${key}Month`);
  const day = url.searchParams.get(`${key}Day`);
  if (year && month && day) {
    const combined = `${year.padStart(4, '0')}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    const byParts = parseIsoDate(combined);
    if (byParts) return byParts;
  }

  return fallback;
}

function modelFromKey(key: string | null): { key: string; spec: PhoneModel } {
  if (key && PHONE_MODELS[key]) {
    return { key, spec: PHONE_MODELS[key] };
  }

  return { key: DEFAULT_MODEL_KEY, spec: PHONE_MODELS[DEFAULT_MODEL_KEY] };
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function formatFriendlyDate(date: Date): string {
  const formatter = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
  return formatter.format(date);
}

function calculateDotLayout(totalDots: number, areaWidth: number, areaHeight: number) {
  const gap = clamp(Math.round(Math.min(areaWidth, areaHeight) * 0.007), 3, 8);
  const minDot = 3;
  const maxDot = 18;

  const ratio = areaWidth / Math.max(areaHeight, 1);
  const startingColumns = clamp(Math.ceil(Math.sqrt(totalDots * ratio)), 8, 220);

  let best = {
    columns: startingColumns,
    rows: Math.ceil(totalDots / startingColumns),
    dot: minDot,
    gap,
  };

  for (let columns = startingColumns; columns <= 220; columns += 1) {
    const rows = Math.ceil(totalDots / columns);
    const dotByWidth = (areaWidth - (columns - 1) * gap) / columns;
    const dotByHeight = (areaHeight - (rows - 1) * gap) / rows;
    const dot = Math.min(dotByWidth, dotByHeight, maxDot);

    if (dot > best.dot) {
      best = { columns, rows, dot, gap };
    }

    if (dot >= minDot && rows * (dot + gap) - gap <= areaHeight) {
      return { columns, rows, dot, gap };
    }
  }

  return best;
}

function generateWallpaperSvg(params: {
  goal: string;
  start: Date;
  deadline: Date;
  tz: string;
  width: number;
  height: number;
}) {
  const { goal, start, deadline, tz, width, height } = params;

  const today = todayInTimeZone(tz);
  const totalDays = Math.max(1, daysInclusive(start, deadline));
  const elapsed = clamp(daysInclusive(start, today), 0, totalDays);
  const remaining = totalDays - elapsed;
  const progress = elapsed / totalDays;
  const truncated = totalDays > MAX_DOTS;
  const dotsToRender = Math.min(totalDays, MAX_DOTS);
  const todayIndex = clamp(daysInclusive(start, today) - 1, 0, totalDays - 1);
  const panelX = Math.round(width * 0.07);
  const panelWidth = width - panelX * 2;
  const panelY = Math.round(height * 0.16);
  const panelHeight = Math.round(height * 0.68);
  const panelRadius = clamp(Math.round(width * 0.023), 16, 34);

  const insetX = clamp(Math.round(panelWidth * 0.06), 24, 74);
  const contentX = panelX + insetX;
  const contentWidth = panelWidth - insetX * 2;

  const baseGoalFontSize = clamp(Math.round(width * 0.066), 32, 78);
  const goalScale = clamp(1 - Math.max(goal.length - 14, 0) * 0.02, 0.56, 1);
  const goalFontSize = Math.round(baseGoalFontSize * goalScale);
  const rangeFontSize = clamp(Math.round(width * 0.019), 13, 24);
  const statusFontSize = clamp(Math.round(width * 0.029), 20, 40);
  const metaFontSize = clamp(Math.round(width * 0.016), 12, 18);
  const barHeight = clamp(Math.round(width * 0.0058), 5, 10);
  const barRadius = Math.round(barHeight / 2);

  const verticalNudge = clamp(Math.round(height * 0.1), 18, 220);
  const topPadding = clamp(Math.round(panelHeight * 0.22) + verticalNudge, 160, 460);
  const bottomPadding = clamp(Math.round(panelHeight * 0.08), 30, 68);

  const goalY = panelY + topPadding + goalFontSize;
  const rangeY = goalY + 18 + rangeFontSize;
  const statusY = rangeY + 22 + statusFontSize;
  const barY = statusY + 15;
  const gridTop = barY + barHeight + 26;

  const footerReserve = truncated ? metaFontSize * 2 + 22 : metaFontSize + 12;
  const maxGridBottom = panelY + panelHeight - bottomPadding - footerReserve;
  const dotAreaHeight = Math.max(68, maxGridBottom - gridTop);

  const wideDotAreaHeight = Math.max(56, Math.round(dotAreaHeight * 0.58));
  const layout = calculateDotLayout(dotsToRender, contentWidth, wideDotAreaHeight);
  const gridHeight = layout.rows * layout.dot + (layout.rows - 1) * layout.gap;
  const footerY = gridTop + gridHeight + 16 + metaFontSize;
  const truncationY = footerY - metaFontSize - 11;

  const dots: string[] = [];
  const doneColor = '#e5e7eb';
  const currentColor = '#ff8a00';
  const pendingColor = '#2f333d';
  const dotRadius = Math.max(1.5, layout.dot * 0.43);

  for (let i = 0; i < dotsToRender; i += 1) {
    const row = Math.floor(i / layout.columns);
    const col = i % layout.columns;
    const cx = contentX + col * (layout.dot + layout.gap) + layout.dot / 2;
    const cy = gridTop + row * (layout.dot + layout.gap) + layout.dot / 2;
    const fill = i < todayIndex ? doneColor : i === todayIndex ? currentColor : pendingColor;
    dots.push(`<circle cx="${cx}" cy="${cy}" r="${dotRadius}" fill="${fill}" />`);
  }

  const startText = formatFriendlyDate(start);
  const deadlineText = formatFriendlyDate(deadline);
  const escapedGoal = escapeXml(goal);

  const statusRight =
    remaining > 0 ? `${remaining} days left` : remaining === 0 ? 'deadline is today' : 'goal complete';
  const statusLabel = `${Math.round(progress * 100)}% // ${statusRight}`;
  const progressWidth = Math.max(0, Math.round(contentWidth * progress));

  return `
  <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="0" width="${width}" height="${height}" fill="#050608" />
    <rect x="1" y="1" width="${width - 2}" height="${height - 2}" fill="none" stroke="#111319" />

    <text x="${contentX}" y="${goalY}" fill="#f5f5f6" font-size="${goalFontSize}" font-weight="700" font-family="Roboto Mono, ui-monospace, Menlo, monospace">${escapedGoal}</text>
    <text x="${contentX}" y="${rangeY}" fill="#a3abba" font-size="${rangeFontSize}" font-weight="500" font-family="Roboto Mono, ui-monospace, Menlo, monospace">${startText} -> ${deadlineText}</text>

    <text x="${contentX}" y="${statusY}" fill="#dde1e8" font-size="${statusFontSize}" font-weight="600" font-family="Roboto Mono, ui-monospace, Menlo, monospace">${escapeXml(statusLabel)}</text>

    <rect x="${contentX}" y="${barY}" width="${contentWidth}" height="${barHeight}" rx="${barRadius}" fill="#262a32" />
    <rect x="${contentX}" y="${barY}" width="${progressWidth}" height="${barHeight}" rx="${barRadius}" fill="#d7dce5" />

    <g>
      ${dots.join('\n')}
    </g>

    <text x="${contentX}" y="${footerY}" fill="#8f98a9" font-size="${metaFontSize}" font-family="Roboto Mono, ui-monospace, Menlo, monospace">${elapsed}/${totalDays} days complete // TZ ${escapeXml(tz)}</text>
    ${
      truncated
        ? `<text x="${contentX}" y="${truncationY}" fill="#c2a891" font-size="${metaFontSize}" font-family="Roboto Mono, ui-monospace, Menlo, monospace">Showing first ${MAX_DOTS} dots (date range is larger)</text>`
        : ''
    }
  </svg>
  `;
}

function renderPage(origin: string): string {
  const modelOptions = Object.entries(PHONE_MODELS)
    .map(([key, model]) => `<option value="${key}">${model.label}</option>`)
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>goal-wallpaper.dev</title>
  <style>
    :root {
      --bg: #040507;
      --panel: rgba(255, 255, 255, 0.02);
      --line: rgba(255, 255, 255, 0.08);
      --text: #e6e8ec;
      --muted: #9da3af;
      --soft: #808693;
      --darkText: #0f1114;
    }
    .wrap {
      max-width: 980px;
      margin: 0 auto;
      padding: 72px 24px 96px;
    }
    * {
      box-sizing: border-box;
    }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: ui-monospace, "SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      line-height: 1.5;
    }
    .hero {
      margin-bottom: 44px;
    }
    h1 {
      margin: 0;
      font-family: Inter, "Avenir Next", "Segoe UI", sans-serif;
      font-size: clamp(32px, 5vw, 56px);
      line-height: 1;
      letter-spacing: -0.02em;
      color: #f2f4f7;
    }
    .tagline {
      margin: 14px 0 0;
      color: var(--muted);
      font-size: clamp(16px, 2vw, 28px);
    }
    .intro {
      max-width: 760px;
      color: var(--muted);
      font-size: clamp(14px, 1.3vw, 20px);
      margin-bottom: 18px;
    }
    .intro p {
      margin: 0;
    }
    .metaLine {
      margin-top: 16px;
      display: flex;
      align-items: center;
      gap: 12px;
      color: #b5bac4;
      font-size: clamp(14px, 1.2vw, 18px);
    }
    .metaLine .slash {
      color: var(--soft);
    }
    .jump {
      margin: 34px 0 20px;
      color: #c4c9d3;
      font-size: clamp(16px, 1.4vw, 22px);
    }
    .sectionTitle {
      margin: 0 0 12px;
      font-family: Inter, "Avenir Next", "Segoe UI", sans-serif;
      font-size: clamp(24px, 3.4vw, 40px);
      letter-spacing: -0.015em;
      color: #f0f2f6;
    }
    .card {
      margin-bottom: 22px;
      border-top: 1px solid var(--line);
      background: transparent;
      border-radius: 0;
      padding: 18px 0 0;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
      margin-top: 14px;
    }
    .full {
      grid-column: 1 / -1;
    }
    label {
      display: block;
      color: #b2b9c6;
      margin-bottom: 6px;
      font-size: 11px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      font-weight: 500;
    }
    input, select {
      width: 100%;
      border: none;
      background: rgba(255, 255, 255, 0.04);
      color: var(--text);
      border-radius: 8px;
      padding: 10px 12px;
      font-size: 14px;
      font-family: inherit;
      transition: background-color 0.14s ease;
    }
    input[type="date"] {
      color-scheme: dark;
    }
    input:focus, select:focus {
      outline: none;
      background: rgba(255, 255, 255, 0.065);
    }
    .actions {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      margin-top: 10px;
    }
    button {
      border-radius: 8px;
      padding: 10px 14px;
      font-size: 14px;
      font-weight: 500;
      font-family: inherit;
      cursor: pointer;
      transition: opacity 0.14s ease;
    }
    button:hover {
      opacity: 0.88;
    }
    .primary {
      background: #f0f1f3;
      color: var(--darkText);
      border: none;
    }
    .ghost {
      border: none;
      background: rgba(255, 255, 255, 0.06);
      color: #d4d8df;
    }
    .urlBox {
      border: none;
      background: rgba(255, 255, 255, 0.04);
      border-radius: 8px;
      padding: 10px 12px;
      font-size: 12px;
      word-break: break-all;
      color: #cdd3de;
      margin: 12px 0 0;
      min-height: 46px;
    }
    .previewShell {
      width: 100%;
      max-width: 394px;
      margin-top: 12px;
      border: none;
      border-radius: 18px;
      background: rgba(255, 255, 255, 0.02);
      padding: 6px;
    }
    .note {
      border: none;
      background: #15110f;
      color: #cfb79f;
      border-radius: 6px;
      padding: 10px;
      margin-top: 12px;
      font-size: 13px;
    }
    .dateQuick {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-top: 2px;
    }
    .dateQuickBtn {
      border: none;
      background: rgba(255, 255, 255, 0.05);
      color: #c8ced8;
      border-radius: 6px;
      padding: 6px 10px;
      font-size: 12px;
      line-height: 1.2;
    }
    .datePicker {
      position: fixed;
      z-index: 100;
      width: 282px;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 10px;
      background: #0b0d11;
      padding: 10px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.45);
    }
    .datePicker[hidden] {
      display: none;
    }
    .dpHead {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 8px;
    }
    .dpLabel {
      font-size: 13px;
      color: #d4d9e2;
      min-width: 120px;
      text-align: center;
    }
    .dpNav {
      border: none;
      background: rgba(255, 255, 255, 0.06);
      color: #d2d8e3;
      border-radius: 6px;
      width: 30px;
      height: 28px;
      padding: 0;
      line-height: 1;
      font-size: 15px;
    }
    .dpWeek,
    .dpGrid {
      display: grid;
      grid-template-columns: repeat(7, minmax(0, 1fr));
      gap: 4px;
    }
    .dpWeek {
      margin-bottom: 4px;
    }
    .dpWeek span {
      text-align: center;
      font-size: 11px;
      color: #8f97a8;
      padding: 3px 0;
    }
    .dpDay {
      border: none;
      border-radius: 6px;
      background: transparent;
      color: #c7ceda;
      height: 30px;
      padding: 0;
      font-size: 13px;
    }
    .dpDay:hover {
      background: rgba(255, 255, 255, 0.06);
    }
    .dpDay.muted {
      color: #596172;
    }
    .dpDay.today {
      box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.24);
    }
    .dpDay.selected {
      background: #f0f2f5;
      color: #0f1217;
      font-weight: 700;
    }
    .dpFoot {
      display: flex;
      justify-content: space-between;
      margin-top: 8px;
    }
    .dpText {
      border: none;
      background: transparent;
      color: #b8c0cd;
      font-size: 12px;
      padding: 4px 2px;
      border-radius: 4px;
    }
    .dpText:hover {
      background: rgba(255, 255, 255, 0.06);
    }
    .steps {
      color: #bfc5cf;
      margin: 0;
      padding-left: 18px;
      font-size: clamp(14px, 1.05vw, 18px);
    }
    .steps li + li {
      margin-top: 8px;
    }
    img {
      width: 100%;
      max-width: 100%;
      border-radius: 16px;
      border: none;
      background: #040607;
      display: block;
      aspect-ratio: 9/19.5;
      object-fit: cover;
    }
    .base {
      color: var(--soft);
      margin-top: 12px;
      font-size: 12px;
    }
    code {
      color: #d6dbe4;
      font-family: inherit;
    }
    @media (max-width: 900px) {
      .wrap {
        padding: 52px 16px 72px;
      }
      .tagline {
        margin-top: 10px;
      }
      .sectionTitle {
        font-size: clamp(24px, 7vw, 34px);
      }
      .grid {
        grid-template-columns: 1fr;
      }
      .card {
        padding-top: 14px;
      }
      input, select {
        font-size: 14px;
      }
      .steps {
        font-size: 14px;
      }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <header class="hero">
      <h1>goal-wallpaper.dev</h1>
      <p class="tagline">Breaking out of setup pain, building one clean wallpaper flow.</p>
    </header>

    <section class="intro">
      <p>Generate one PNG URL for iOS Shortcuts and let your lock screen update itself every day based on your date range.</p>
      <div class="metaLine">
        <span>iOS</span>
        <span class="slash">//</span>
        <span>Shortcuts</span>
      </div>
    </section>

    <p class="jump">Setup -></p>

    <h2 class="sectionTitle">Wallpaper</h2>
    <section class="card">
      <form id="wallpaperForm" class="grid" autocomplete="off">
        <div class="full">
          <label for="goal">Goal</label>
          <input id="goal" name="goal" placeholder="Run 43 workouts" maxlength="42" />
        </div>
        <div>
          <label for="start">Start Date</label>
          <input id="start" name="start" type="text" inputmode="numeric" placeholder="YYYY-MM-DD" autocomplete="off" />
        </div>
        <div>
          <label for="deadline">Deadline</label>
          <input id="deadline" name="deadline" type="text" inputmode="numeric" placeholder="YYYY-MM-DD" autocomplete="off" />
        </div>
        <div class="dateQuick full">
          <button type="button" class="dateQuickBtn" data-date-action="start-today">Start: today</button>
          <button type="button" class="dateQuickBtn" data-date-action="deadline-30">Deadline: +30d</button>
          <button type="button" class="dateQuickBtn" data-date-action="deadline-90">Deadline: +90d</button>
        </div>
        <div class="full">
          <label for="model">iPhone Model</label>
          <select id="model" name="model">${modelOptions}</select>
        </div>
        <div class="full">
          <label for="tz">Timezone</label>
          <input id="tz" name="tz" placeholder="America/Toronto" />
        </div>
        <div class="actions full">
          <button type="submit" class="primary">Generate URL</button>
          <button type="button" id="copyUrl" class="ghost">Copy URL</button>
        </div>
      </form>

      <div id="urlOutput" class="urlBox" aria-live="polite"></div>
      <div class="previewShell">
        <img id="preview" alt="Wallpaper preview" />
      </div>
    </section>

    <h2 class="sectionTitle">Automation</h2>
    <section class="card">
      <ol class="steps">
        <li>Open Shortcuts -> Automation -> New Automation -> Time of Day (daily)</li>
        <li>Select <strong>Run Immediately</strong></li>
        <li>Create a new shortcut for that automation</li>
      </ol>
    </section>

    <h2 class="sectionTitle">Shortcut</h2>
    <section class="card">
      <ol class="steps">
        <li>Add action: <strong>Get Contents of URL</strong> and paste the generated URL</li>
        <li>Add action: <strong>Set Wallpaper Photo</strong> and target <strong>Lock Screen</strong></li>
      </ol>
      <div class="note"><strong>Important:</strong> In "Set Wallpaper Photo", disable both "Show Preview" and "Crop to Subject" so the automation runs without confirmation popups.</div>
      <p class="base">Base URL: <code>${origin}/goal.png</code></p>
    </section>
  </div>

  <div id="datePicker" class="datePicker" hidden>
    <div class="dpHead">
      <button type="button" id="dpPrev" class="dpNav" aria-label="Previous month"><</button>
      <div id="dpLabel" class="dpLabel"></div>
      <button type="button" id="dpNext" class="dpNav" aria-label="Next month">></button>
    </div>
    <div class="dpWeek">
      <span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span>
    </div>
    <div id="dpGrid" class="dpGrid"></div>
    <div class="dpFoot">
      <button type="button" id="dpToday" class="dpText">Today</button>
      <button type="button" id="dpClear" class="dpText">Clear</button>
    </div>
  </div>

  <script>
    const form = document.getElementById('wallpaperForm');
    const urlOutput = document.getElementById('urlOutput');
    const preview = document.getElementById('preview');
    const copyButton = document.getElementById('copyUrl');
    const startInput = document.getElementById('start');
    const deadlineInput = document.getElementById('deadline');
    const datePicker = document.getElementById('datePicker');
    const dpLabel = document.getElementById('dpLabel');
    const dpGrid = document.getElementById('dpGrid');
    const dpPrev = document.getElementById('dpPrev');
    const dpNext = document.getElementById('dpNext');
    const dpToday = document.getElementById('dpToday');
    const dpClear = document.getElementById('dpClear');
    const quickDateButtons = document.querySelectorAll('[data-date-action]');

    const monthNames = [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ];

    let pickerInput = null;
    let pickerMonth = 0;
    let pickerYear = 0;

    function toIsoLocal(date) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return year + '-' + month + '-' + day;
    }

    function parseIsoLocal(value) {
      const match = /^(\\d{4})-(\\d{2})-(\\d{2})$/.exec(String(value || '').trim());
      if (!match) return null;

      const year = Number(match[1]);
      const month = Number(match[2]);
      const day = Number(match[3]);
      const date = new Date(year, month - 1, day);

      if (
        Number.isNaN(date.getTime()) ||
        date.getFullYear() !== year ||
        date.getMonth() !== month - 1 ||
        date.getDate() !== day
      ) {
        return null;
      }

      return date;
    }

    function addDaysLocal(date, amount) {
      const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      copy.setDate(copy.getDate() + amount);
      return copy;
    }

    function isSameDate(a, b) {
      return (
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate()
      );
    }

    const now = new Date();
    const localToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const isoToday = toIsoLocal(localToday);
    const isoFuture = toIsoLocal(addDaysLocal(localToday, 119));

    document.getElementById('goal').value = '43 sessions';
    startInput.value = isoToday;
    deadlineInput.value = isoFuture;
    document.getElementById('tz').value = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

    function positionPicker() {
      if (!pickerInput || datePicker.hidden) return;

      const rect = pickerInput.getBoundingClientRect();
      const pickerWidth = 282;
      const pagePadding = 8;
      let left = rect.left;
      let top = rect.bottom + 8;

      if (left + pickerWidth > window.innerWidth - pagePadding) {
        left = window.innerWidth - pickerWidth - pagePadding;
      }
      if (left < pagePadding) {
        left = pagePadding;
      }

      const pickerHeight = datePicker.offsetHeight || 330;
      if (top + pickerHeight > window.innerHeight - pagePadding) {
        top = Math.max(pagePadding, rect.top - pickerHeight - 8);
      }

      datePicker.style.left = Math.round(left) + 'px';
      datePicker.style.top = Math.round(top) + 'px';
    }

    function renderPicker() {
      if (!pickerInput) return;

      dpLabel.textContent = monthNames[pickerMonth] + ' ' + pickerYear;
      dpGrid.innerHTML = '';

      const selectedDate = parseIsoLocal(pickerInput.value);
      const firstDay = new Date(pickerYear, pickerMonth, 1).getDay();
      const daysInMonth = new Date(pickerYear, pickerMonth + 1, 0).getDate();
      const daysInPrevMonth = new Date(pickerYear, pickerMonth, 0).getDate();

      for (let i = 0; i < 42; i += 1) {
        const dayOffset = i - firstDay + 1;
        let cellDate = null;
        let muted = false;

        if (dayOffset < 1) {
          cellDate = new Date(pickerYear, pickerMonth - 1, daysInPrevMonth + dayOffset);
          muted = true;
        } else if (dayOffset > daysInMonth) {
          cellDate = new Date(pickerYear, pickerMonth + 1, dayOffset - daysInMonth);
          muted = true;
        } else {
          cellDate = new Date(pickerYear, pickerMonth, dayOffset);
        }

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'dpDay';
        if (muted) {
          button.classList.add('muted');
        }
        if (isSameDate(cellDate, localToday)) {
          button.classList.add('today');
        }
        if (selectedDate && isSameDate(cellDate, selectedDate)) {
          button.classList.add('selected');
        }
        button.textContent = String(cellDate.getDate());
        button.addEventListener('click', () => {
          pickerInput.value = toIsoLocal(cellDate);
          closePicker();
          refresh();
        });

        dpGrid.appendChild(button);
      }
    }

    function openPicker(input) {
      pickerInput = input;
      const baseDate = parseIsoLocal(input.value) || localToday;
      pickerMonth = baseDate.getMonth();
      pickerYear = baseDate.getFullYear();
      datePicker.hidden = false;
      renderPicker();
      positionPicker();
    }

    function closePicker() {
      datePicker.hidden = true;
      pickerInput = null;
    }

    function buildUrl() {
      const formData = new FormData(form);
      const params = new URLSearchParams();
      params.set('goal', String(formData.get('goal') || '').trim());
      params.set('start', String(formData.get('start') || ''));
      params.set('deadline', String(formData.get('deadline') || ''));
      params.set('model', String(formData.get('model') || '${DEFAULT_MODEL_KEY}'));
      params.set('tz', String(formData.get('tz') || 'UTC').trim());
      return window.location.origin + '/goal.png?' + params.toString();
    }

    function refresh() {
      const url = buildUrl();
      urlOutput.textContent = url;
      preview.src = url + '&preview=1&_preview=' + Date.now();
    }

    [startInput, deadlineInput].forEach((input) => {
      input.addEventListener('focus', () => openPicker(input));
      input.addEventListener('click', () => openPicker(input));
      input.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          openPicker(input);
        }
        if (event.key === 'Escape') {
          closePicker();
        }
      });
      input.addEventListener('blur', () => {
        const parsed = parseIsoLocal(input.value);
        if (parsed) {
          input.value = toIsoLocal(parsed);
          refresh();
        }
      });
    });

    dpPrev.addEventListener('click', () => {
      pickerMonth -= 1;
      if (pickerMonth < 0) {
        pickerMonth = 11;
        pickerYear -= 1;
      }
      renderPicker();
    });

    dpNext.addEventListener('click', () => {
      pickerMonth += 1;
      if (pickerMonth > 11) {
        pickerMonth = 0;
        pickerYear += 1;
      }
      renderPicker();
    });

    dpToday.addEventListener('click', () => {
      if (!pickerInput) return;
      pickerInput.value = toIsoLocal(localToday);
      closePicker();
      refresh();
    });

    dpClear.addEventListener('click', () => {
      if (!pickerInput) return;
      pickerInput.value = '';
      closePicker();
      refresh();
    });

    quickDateButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const action = button.getAttribute('data-date-action');
        const startDate = parseIsoLocal(startInput.value) || localToday;

        if (action === 'start-today') {
          startInput.value = toIsoLocal(localToday);
        } else if (action === 'deadline-30') {
          deadlineInput.value = toIsoLocal(addDaysLocal(startDate, 30));
        } else if (action === 'deadline-90') {
          deadlineInput.value = toIsoLocal(addDaysLocal(startDate, 90));
        }

        refresh();
      });
    });

    document.addEventListener('mousedown', (event) => {
      if (datePicker.hidden) return;

      const target = event.target;
      if (!(target instanceof Node)) return;

      if (
        datePicker.contains(target) ||
        startInput.contains(target) ||
        deadlineInput.contains(target)
      ) {
        return;
      }

      closePicker();
    });

    window.addEventListener('resize', positionPicker);
    window.addEventListener('scroll', positionPicker, true);

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      refresh();
    });

    copyButton.addEventListener('click', async () => {
      const text = urlOutput.textContent || '';
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
        copyButton.textContent = 'Copied';
        setTimeout(() => {
          copyButton.textContent = 'Copy URL';
        }, 1200);
      } catch {
        copyButton.textContent = 'Copy failed';
      }
    });

    refresh();
  </script>
</body>
</html>`;
}

function imageResponse(
  svg: string,
  width: number,
  height: number,
  options?: { download?: boolean },
): Response {
  const fontFiles = loadFontFiles();
  const renderer = new Resvg(svg, {
    fitTo: {
      mode: 'width',
      value: width,
    },
    background: 'rgba(0,0,0,1)',
    font: {
      loadSystemFonts: true,
      defaultFontFamily: 'Roboto Mono',
      fontFiles,
    },
  });

  const png = renderer.render().asPng();

  return new Response(new Uint8Array(png), {
    status: 200,
    headers: {
      'content-type': 'image/png',
      'cache-control': 'no-store, max-age=0',
      pragma: 'no-cache',
      'content-disposition': options?.download === false ? 'inline' : 'attachment; filename=\"goal-wallpaper.png\"',
    },
  });
}

function errorImage(message: string): Response {
  const width = 1170;
  const height = 2532;
  const safeMessage = escapeXml(message.slice(0, 140));

  const svg = `
  <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${width}" height="${height}" fill="#0d111a" />
    <text x="80" y="240" fill="#f8fafc" font-size="58" font-family="Arial" font-weight="700">Goal Wallpaper Error</text>
    <text x="80" y="330" fill="#fcb7b7" font-size="38" font-family="Arial">${safeMessage}</text>
  </svg>
  `;

  return imageResponse(svg, width, height, { download: false });
}

export function handleRequest(request: Request): Response {
  const url = new URL(request.url);

  if (url.pathname === '/health') {
    return new Response('ok', { headers: { 'content-type': 'text/plain; charset=utf-8' } });
  }

  if (url.pathname === '/') {
    return new Response(renderPage(url.origin), {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  }

  if (
    url.pathname === '/goal' ||
    url.pathname === '/goal.png' ||
    url.pathname === '/wallpaper.png'
  ) {
    const goal = sanitizeGoal(url.searchParams.get('goal'));
    const tz = validateTimeZone(url.searchParams.get('tz') ?? url.searchParams.get('timezone'));

    const baseStart = todayInTimeZone(tz);
    const start = getDateParam(url, 'start', baseStart);
    const deadline =
      getDateParam(
        url,
        'deadline',
        getDateParam(url, 'target', addDays(baseStart, 119)),
      ) ?? addDays(baseStart, 119);

    if (deadline.getTime() < start.getTime()) {
      return errorImage('Deadline must be on or after start date (YYYY-MM-DD).');
    }

    const { spec } = modelFromKey(url.searchParams.get('model'));

    const svg = generateWallpaperSvg({
      goal,
      start,
      deadline,
      tz,
      width: spec.width,
      height: spec.height,
    });

    const download = url.searchParams.get('preview') !== '1';
    return imageResponse(svg, spec.width, spec.height, { download });
  }

  return new Response('Not found', {
    status: 404,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}

if (typeof Bun !== 'undefined' && import.meta.main) {
  const server = Bun.serve({
    port: Number(process.env.PORT ?? 3000),
    fetch: handleRequest,
  });

  console.log(`Goal wallpaper server running at ${server.url}`);
}
