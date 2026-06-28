import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const repoRoot = resolve(import.meta.dirname, '..');
const outputDir = resolve(repoRoot, '.codex-logs');
const defaultUrls = [
  process.env.UI_BASE_URL,
  'http://127.0.0.1:4202',
  'http://127.0.0.1:4200',
  'http://localhost:4202',
  'http://localhost:4200',
].filter(Boolean);
const simulationPath = process.env.UI_RUNTIME_ROUTE ?? '/simulation';
const remoteDebuggingPort = Number(process.env.RUNTIME_INSPECTION_DEBUG_PORT ?? 9229);
const inspectionDurationMs = Number(process.env.RUNTIME_INSPECTION_DURATION_MS ?? 4500);
const chromeCandidates = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean);

// Runtime inspection step.
// Input: a running app-next dev server URL and an available Chromium-based browser.
// Output: a JSON snapshot containing console errors, uncaught exceptions, and basic simulation-page state.
// This block owns browser-side inspection only. It does not start Angular or change application state.

function findBrowser() {
  return chromeCandidates.find((candidate) => existsSync(candidate));
}

async function resolveBaseUrl() {
  for (const baseUrl of defaultUrls) {
    try {
      const response = await fetch(baseUrl, { redirect: 'manual' });
      if (response.ok || response.status === 302 || response.status === 304) {
        return baseUrl;
      }
    } catch {
      // Try the next URL.
    }
  }

  throw new Error(
    `Could not reach app-next on any known dev-server URL. Tried: ${defaultUrls.join(', ')}`,
  );
}

async function fetchJson(url, attempts = 20) {
  let lastError = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Expected 2xx from ${url}, got ${response.status}`);
      }
      return response.json();
    } catch (error) {
      lastError = error;
      await delay(150);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`Could not fetch ${url}`);
}

async function fetchPageTarget(remotePort, targetUrl) {
  const targets = await fetchJson(`http://127.0.0.1:${remotePort}/json/list`);
  const pageTarget = targets.find((target) =>
    target.type === 'page' && typeof target.url === 'string' && target.url.startsWith(targetUrl),
  );

  if (!pageTarget?.webSocketDebuggerUrl) {
    throw new Error(`Could not find a page DevTools target for ${targetUrl}`);
  }

  return pageTarget;
}

async function connectToCdp(webSocketDebuggerUrl) {
  const socket = new WebSocket(webSocketDebuggerUrl);
  const pending = new Map();
  const events = [];
  let nextId = 1;

  await new Promise((resolveOpen, rejectOpen) => {
    socket.addEventListener('open', resolveOpen, { once: true });
    socket.addEventListener('error', rejectOpen, { once: true });
  });

  socket.addEventListener('message', (event) => {
    const payload = JSON.parse(event.data.toString());

    if (typeof payload.id === 'number' && pending.has(payload.id)) {
      const { resolveResult, rejectResult } = pending.get(payload.id);
      pending.delete(payload.id);
      if (payload.error) {
        rejectResult(new Error(payload.error.message));
      } else {
        resolveResult(payload.result);
      }
      return;
    }

    if (payload.method) {
      events.push(payload);
    }
  });

  async function send(method, params = {}) {
    const id = nextId++;

    const result = await new Promise((resolveResult, rejectResult) => {
      pending.set(id, { resolveResult, rejectResult });
      socket.send(JSON.stringify({ id, method, params }));
    });

    return result;
  }

  return {
    close: () => socket.close(),
    events,
    send,
  };
}

function normalizeConsoleArgs(args = []) {
  return args.map((arg) => {
    if (arg.type === 'string') {
      return arg.value ?? '';
    }

    if (arg.value !== undefined) {
      return arg.value;
    }

    return arg.description ?? arg.type ?? 'unknown';
  });
}

function buildInspectionSummary(snapshotResult, consoleEvents, exceptionEvents, logEntries, targetUrl) {
  const summary = snapshotResult?.result?.value ?? null;

  return {
    inspectedAtIso: new Date().toISOString(),
    targetUrl,
    summary,
    consoleEvents: consoleEvents.map((event) => ({
      type: event.params?.type ?? 'unknown',
      args: normalizeConsoleArgs(event.params?.args),
      timestamp: event.params?.timestamp ?? null,
    })),
    exceptionEvents: exceptionEvents.map((event) => ({
      text: event.params?.exceptionDetails?.text ?? 'Unknown exception',
      lineNumber: event.params?.exceptionDetails?.lineNumber ?? null,
      columnNumber: event.params?.exceptionDetails?.columnNumber ?? null,
      url: event.params?.exceptionDetails?.url ?? null,
    })),
    logEntries: logEntries.map((event) => ({
      level: event.params?.entry?.level ?? 'unknown',
      source: event.params?.entry?.source ?? 'unknown',
      text: event.params?.entry?.text ?? '',
      url: event.params?.entry?.url ?? null,
    })),
  };
}

async function main() {
  const browserPath = findBrowser();
  if (!browserPath) {
    throw new Error('No Chrome or Edge executable found. Set CHROME_PATH to enable runtime inspection.');
  }

  mkdirSync(outputDir, { recursive: true });
  const baseUrl = await resolveBaseUrl();
  const targetUrl = `${baseUrl}${simulationPath}`;
  const userDataDir = join(outputDir, 'runtime-inspection-browser-profile');

  const browser = spawn(
    browserPath,
    [
      '--headless=new',
      '--disable-gpu',
      '--disable-crash-reporter',
      '--disable-breakpad',
      '--no-sandbox',
      `--remote-debugging-port=${remoteDebuggingPort}`,
      `--user-data-dir=${userDataDir}`,
      targetUrl,
    ],
    {
      stdio: 'ignore',
      detached: false,
    },
  );

  try {
    const pageTarget = await fetchPageTarget(remoteDebuggingPort, targetUrl);
    const cdp = await connectToCdp(pageTarget.webSocketDebuggerUrl);

    try {
      await cdp.send('Page.enable');
      await cdp.send('Runtime.enable');
      await cdp.send('Log.enable');
      await delay(inspectionDurationMs);

      const snapshotResult = await cdp.send('Runtime.evaluate', {
        expression: `(() => {
          const text = (selector) => document.querySelector(selector)?.textContent?.trim() ?? null;
          return {
            route: window.location.pathname,
            title: document.title,
            previewBubbleCount: document.querySelectorAll('.simulation-preview circle').length,
            activeJobBubbleRows: document.querySelectorAll('.simulation-bubble-row').length,
            latestEvaluationText: text('.simulation-card:nth-of-type(4)'),
            stageMetricsText: text('.simulation-card:nth-of-type(2)'),
            jobListText: text('.simulation-card .simulation-job-list'),
          };
        })()`,
        returnByValue: true,
      });

      const runtimeEvents = cdp.events;
      const consoleEvents = runtimeEvents.filter((event) => event.method === 'Runtime.consoleAPICalled');
      const exceptionEvents = runtimeEvents.filter((event) => event.method === 'Runtime.exceptionThrown');
      const logEntries = runtimeEvents.filter((event) => event.method === 'Log.entryAdded');
      const inspection = buildInspectionSummary(snapshotResult, consoleEvents, exceptionEvents, logEntries, targetUrl);
      const outputPath = join(outputDir, 'runtime-inspection.json');

      writeFileSync(outputPath, `${JSON.stringify(inspection, null, 2)}\n`, 'utf8');
      console.log(`runtime inspection written to ${outputPath}`);
      console.log(`preview bubbles: ${inspection.summary?.previewBubbleCount ?? 'n/a'}`);
      console.log(`exceptions: ${inspection.exceptionEvents.length}`);
      console.log(`console events: ${inspection.consoleEvents.length}`);
    } finally {
      cdp.close();
      await delay(150);
    }
  } finally {
    if (!browser.killed) {
      browser.kill('SIGTERM');
      await delay(150);
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
