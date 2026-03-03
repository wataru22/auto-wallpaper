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
const FONT_FILES = ['Inter.ttf'] as const;

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

  const contentWidth = Math.round(width * 0.62);
  const contentX = Math.round(width * 0.12);

  const goalFontSize = clamp(Math.round(width * 0.065), 34, 72);
  const rangeFontSize = clamp(Math.round(width * 0.02), 14, 22);
  const statusFontSize = clamp(Math.round(width * 0.038), 24, 46);
  const metaFontSize = clamp(Math.round(width * 0.018), 13, 20);
  const barHeight = clamp(Math.round(width * 0.006), 5, 10);
  const barRadius = Math.round(barHeight / 2);

  const dotAreaHeight = Math.round(height * 0.19);
  const layout = calculateDotLayout(dotsToRender, contentWidth, dotAreaHeight);
  const gridHeight = layout.rows * layout.dot + (layout.rows - 1) * layout.gap;

  const contentHeight =
    goalFontSize +
    18 +
    rangeFontSize +
    24 +
    statusFontSize +
    20 +
    barHeight +
    24 +
    gridHeight +
    22 +
    metaFontSize;

  const contentTop = Math.round(height * 0.36);
  const goalY = contentTop + goalFontSize;
  const rangeY = goalY + 18 + rangeFontSize;
  const statusY = rangeY + 24 + statusFontSize;
  const barY = statusY + 20;
  const gridTop = barY + barHeight + 24;
  const footerY = gridTop + gridHeight + 22 + metaFontSize;

  const dots: string[] = [];
  const doneColor = '#ffffff';
  const currentColor = '#ff8a00';
  const pendingColor = '#5b5b5b';

  for (let i = 0; i < dotsToRender; i += 1) {
    const row = Math.floor(i / layout.columns);
    const col = i % layout.columns;
    const cx = contentX + col * (layout.dot + layout.gap) + layout.dot / 2;
    const cy = gridTop + row * (layout.dot + layout.gap) + layout.dot / 2;
    const fill = i < todayIndex ? doneColor : i === todayIndex ? currentColor : pendingColor;
    dots.push(`<circle cx="${cx}" cy="${cy}" r="${layout.dot / 2}" fill="${fill}" />`);
  }

  const startText = formatFriendlyDate(start);
  const deadlineText = formatFriendlyDate(deadline);
  const escapedGoal = escapeXml(goal);

  const statusRight =
    remaining > 0 ? `${remaining} days left` : remaining === 0 ? 'Goal date is today' : 'Goal complete';
  const statusLabel = `${Math.round(progress * 100)}% // ${statusRight}`;

  return `
  <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="0" width="${width}" height="${height}" fill="#000000" />

    <text x="${contentX}" y="${goalY}" fill="#ffffff" font-size="${goalFontSize}" font-weight="700" font-family="Inter, Arial, sans-serif">${escapedGoal}</text>
    <text x="${contentX}" y="${rangeY}" fill="#a1a1a1" font-size="${rangeFontSize}" font-family="Inter, Arial, sans-serif">${startText} → ${deadlineText}</text>

    <text x="${contentX}" y="${statusY}" fill="#e0e0e0" font-size="${statusFontSize}" font-weight="600" font-family="Inter, Arial, sans-serif">${escapeXml(statusLabel)}</text>

    <rect x="${contentX}" y="${barY}" width="${contentWidth}" height="${barHeight}" rx="${barRadius}" fill="#3f3f3f" />
    <rect x="${contentX}" y="${barY}" width="${Math.max(0, Math.round(contentWidth * progress))}" height="${barHeight}" rx="${barRadius}" fill="#ffffff" />

    <g>
      ${dots.join('\n')}
    </g>

    <text x="${contentX}" y="${footerY}" fill="#8d8d8d" font-size="${metaFontSize}" font-family="Inter, Arial, sans-serif">${elapsed}/${totalDays} days complete • TZ ${escapeXml(tz)}</text>
    ${
      truncated
        ? `<text x="${contentX}" y="${footerY - metaFontSize - 8}" fill="#c89359" font-size="${metaFontSize}" font-family="Inter, Arial, sans-serif">Showing first ${MAX_DOTS} dots (date range is larger)</text>`
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
  <title>Goal Wallpaper URL</title>
  <style>
    :root {
      --bg: #070b14;
      --panel: #101726;
      --line: #2a2a2a;
      --text: #f4f7ff;
      --muted: #b2b2b2;
      --accent: #7ee2b8;
      --warn: #f3c971;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: #000;
      color: var(--text);
      font-family: "Avenir Next", "SF Pro Text", "Segoe UI", sans-serif;
      line-height: 1.45;
    }
    .wrap {
      max-width: 980px;
      margin: 0 auto;
      padding: 28px 20px 56px;
    }
    h1 {
      font-size: clamp(34px, 5vw, 52px);
      margin: 0 0 8px;
      letter-spacing: -0.02em;
    }
    .lead {
      margin: 0 0 26px;
      color: var(--muted);
      font-size: 19px;
      max-width: 720px;
    }
    .panel {
      border: 1px solid var(--line);
      background: #0b0b0b;
      border-radius: 16px;
      padding: 18px;
      margin-bottom: 18px;
    }
    .step {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 14px;
    }
    .badge {
      width: 34px;
      height: 34px;
      border-radius: 6px;
      background: #f1f4ff;
      color: #0a0f17;
      font-weight: 700;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex: 0 0 auto;
    }
    .step h2 {
      margin: 0;
      font-size: clamp(24px, 3vw, 36px);
      letter-spacing: -0.02em;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }
    .full { grid-column: 1 / -1; }
    label {
      display: block;
      color: #d6d6d6;
      margin-bottom: 6px;
      font-size: 14px;
      letter-spacing: 0.02em;
      text-transform: uppercase;
    }
    input, select {
      width: 100%;
      border: 1px solid #343434;
      background: #070707;
      color: var(--text);
      border-radius: 10px;
      padding: 13px 12px;
      font-size: 20px;
    }
    .actions {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      margin-top: 8px;
    }
    button {
      border: 0;
      border-radius: 10px;
      padding: 11px 16px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
    }
    .primary {
      background: var(--accent);
      color: #05140f;
    }
    .ghost {
      background: #171717;
      color: #f0f0f0;
      border: 1px solid #363636;
    }
    .urlBox {
      border: 1px solid #3c3c3c;
      background: #050505;
      border-radius: 10px;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      padding: 12px;
      font-size: 14px;
      word-break: break-all;
      color: #ebebeb;
      margin: 10px 0 0;
      min-height: 48px;
    }
    .note {
      border: 1px solid #58411f;
      background: #1b1407;
      color: var(--warn);
      border-radius: 10px;
      padding: 12px;
      margin-top: 12px;
      font-size: 15px;
    }
    .steps {
      color: #c8d4ea;
      margin: 0;
      padding-left: 18px;
      font-size: 18px;
    }
    .steps li + li { margin-top: 8px; }
    img {
      width: 100%;
      max-width: 380px;
      border-radius: 18px;
      border: 1px solid #2e2e2e;
      background: #050505;
      display: block;
      margin-top: 14px;
      aspect-ratio: 9/19.5;
      object-fit: cover;
    }
    .footer {
      color: #8d9db8;
      margin-top: 14px;
      font-size: 14px;
    }
    @media (max-width: 740px) {
      .grid { grid-template-columns: 1fr; }
      input, select { font-size: 18px; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>Installation Steps</h1>
    <p class="lead">Define your countdown wallpaper, then use one URL in iOS Shortcuts Automation to update your lock screen every day.</p>

    <section class="panel">
      <div class="step"><span class="badge">1</span><h2>Define Your Wallpaper</h2></div>
      <form id="wallpaperForm" class="grid" autocomplete="off">
        <div class="full">
          <label for="goal">Goal</label>
          <input id="goal" name="goal" placeholder="Run 43 workouts" maxlength="42" />
        </div>
        <div>
          <label for="start">Start Date</label>
          <input id="start" name="start" type="date" />
        </div>
        <div>
          <label for="deadline">Deadline</label>
          <input id="deadline" name="deadline" type="date" />
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
      <img id="preview" alt="Wallpaper preview" />
    </section>

    <section class="panel">
      <div class="step"><span class="badge">2</span><h2>Create Automation</h2></div>
      <ol class="steps">
        <li>Open Shortcuts → Automation → New Automation → Time of Day (daily)</li>
        <li>Select <strong>Run Immediately</strong></li>
        <li>Create a new shortcut for that automation</li>
      </ol>
    </section>

    <section class="panel">
      <div class="step"><span class="badge">3</span><h2>Create Shortcut</h2></div>
      <ol class="steps">
        <li>Add action: <strong>Get Contents of URL</strong> and paste the generated URL</li>
        <li>Add action: <strong>Set Wallpaper Photo</strong> and target <strong>Lock Screen</strong></li>
      </ol>
      <div class="note"><strong>Important:</strong> In “Set Wallpaper Photo”, disable both “Show Preview” and “Crop to Subject” to avoid daily confirmation popups.</div>
      <p class="footer">URL base: ${origin}/goal.png</p>
    </section>
  </div>

  <script>
    const form = document.getElementById('wallpaperForm');
    const urlOutput = document.getElementById('urlOutput');
    const preview = document.getElementById('preview');
    const copyButton = document.getElementById('copyUrl');

    const now = new Date();
    const isoToday = now.toISOString().slice(0, 10);
    const future = new Date(now.getTime() + 119 * 24 * 60 * 60 * 1000);
    const isoFuture = future.toISOString().slice(0, 10);

    document.getElementById('goal').value = '43';
    document.getElementById('start').value = isoToday;
    document.getElementById('deadline').value = isoFuture;
    document.getElementById('tz').value = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

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
      defaultFontFamily: 'Inter',
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
