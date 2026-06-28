import { createServer } from 'node:http';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const PORT = 4319;

let writeQueue = Promise.resolve();
const enqueueWrite = (fn) => {
  writeQueue = writeQueue.then(fn).catch(() => {});
};

const LOGS = {
  '/pipeline-reports': {
    label: 'pipeline-reports',
    path: resolve(process.cwd(), '.codex-logs', 'pipeline-reports.jsonl'),
  },
};

function ensureLogDir(logPath) {
  const dir = dirname(logPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(payload, null, 2));
}

function readJsonl(logPath) {
  ensureLogDir(logPath);
  if (!existsSync(logPath)) return [];
  const raw = readFileSync(logPath, 'utf8').trim();
  if (!raw) return [];
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return { malformed: true, line };
      }
    });
}

function buildReportSummary(reports) {
  return {
    total: reports.length,
    byKind: reports.reduce((acc, report) => {
      const kind = report?.reportKind ?? 'unknown';
      acc[kind] = (acc[kind] ?? 0) + 1;
      return acc;
    }, {}),
    byStage: reports.reduce((acc, report) => {
      const stageId = report?.stageId ?? 'unknown';
      acc[stageId] = (acc[stageId] ?? 0) + 1;
      return acc;
    }, {}),
    latest: reports.at(-1) ?? null,
  };
}

function printIncoming(payload) {
  const kind = payload?.reportKind ?? 'unknown';
  const outputId = payload?.outputId ?? '?';
  const stageId = payload?.stageId ?? 'unknown';
  const lifecycle = payload?.lifecycle ?? 'unknown';
  console.log(`[pipeline-report] ${kind} ${stageId} ${lifecycle} ${outputId}`);
}

const server = createServer((req, res) => {
  if (!req.url) {
    sendJson(res, 404, { error: 'missing url' });
    return;
  }

  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);

  if (req.method === 'OPTIONS') {
    sendJson(res, 200, { ok: true });
    return;
  }

  const log = LOGS[url.pathname];
  if (!log) {
    sendJson(res, 404, { error: 'not found' });
    return;
  }

  if (req.method === 'GET') {
    const records = readJsonl(log.path);
    sendJson(res, 200, {
      ok: true,
      kind: log.label,
      count: records.length,
      logPath: log.path,
      summary: buildReportSummary(records),
      records,
    });
    return;
  }

  if (req.method === 'DELETE') {
    ensureLogDir(log.path);
    writeFileSync(log.path, '', 'utf8');
    sendJson(res, 200, { ok: true, cleared: true, logPath: log.path });
    return;
  }

  if (req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        req.destroy();
      }
    });
    req.on('end', () => {
      let payload;
      try {
        payload = JSON.parse(body || '{}');
      } catch (error) {
        sendJson(res, 400, {
          ok: false,
          error: 'invalid json payload',
          detail: error instanceof Error ? error.message : String(error),
        });
        return;
      }

      enqueueWrite(() => {
        ensureLogDir(log.path);
        if (payload.id) {
          const existing = readJsonl(log.path);
          const index = existing.findIndex((record) => record.id === payload.id);
          if (index >= 0) {
            existing[index] = payload;
          } else {
            existing.push(payload);
          }
          writeFileSync(log.path, existing.map((record) => JSON.stringify(record)).join('\n') + '\n', 'utf8');
        } else {
          appendFileSync(log.path, `${JSON.stringify(payload)}\n`, 'utf8');
        }
        printIncoming(payload);
      });

      sendJson(res, 200, {
        ok: true,
        stored: true,
        logPath: log.path,
      });
    });
    return;
  }

  sendJson(res, 405, { error: 'method not allowed' });
});

server.listen(PORT, '127.0.0.1', () => {
  Object.values(LOGS).forEach((log) => ensureLogDir(log.path));
  console.log(`pipeline report endpoint listening on http://127.0.0.1:${PORT}/pipeline-reports`);
  Object.values(LOGS).forEach((log) => console.log(`writing ${log.label} to ${log.path}`));
});
