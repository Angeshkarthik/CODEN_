import http from 'http';
import { executeCode, stopCurrentExecution } from './runner';
import { detectAllCompilers } from './toolDetector';
import { LANGUAGE_CONFIGS } from './languages';

const PORT = 5174;
const HOST = '127.0.0.1';
const ALLOWED_ORIGIN = 'http://127.0.0.1:5173';

function sendJson(res: http.ServerResponse, statusCode: number, data: any) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(data));
}

function parseJsonBody(req: http.IncomingMessage, maxBytes = 2 * 1024 * 1024): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = '';
    let size = 0;

    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error('Request payload too large (max 2MB)'));
        req.destroy();
        return;
      }
      body += chunk;
    });

    req.on('end', () => {
      try {
        const parsed = body ? JSON.parse(body) : {};
        resolve(parsed);
      } catch (e: any) {
        reject(new Error('Invalid JSON payload'));
      }
    });

    req.on('error', (err) => {
      reject(err);
    });
  });
}

export function startDevServer(): Promise<http.Server> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      // Handle CORS preflight
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400'
        });
        res.end();
        return;
      }

      const url = new URL(req.url || '/', `http://${req.headers.host || HOST}`);

      // 1. Health check
      if (req.method === 'GET' && url.pathname === '/api/health') {
        sendJson(res, 200, { status: 'ok', service: 'offline-compiler-dev-api' });
        return;
      }

      // 2. Compilers check
      if (req.method === 'GET' && url.pathname === '/api/compilers') {
        try {
          const statuses = await detectAllCompilers();
          sendJson(res, 200, statuses);
        } catch (err: any) {
          sendJson(res, 500, { error: err?.message || 'Failed to detect compilers' });
        }
        return;
      }

      // 3. Execute code: POST /api/run
      if (req.method === 'POST' && url.pathname === '/api/run') {
        try {
          const body = await parseJsonBody(req);
          const { language, code, stdin = '', timeout = 10, executionId } = body;

          // Validation
          if (!language || typeof language !== 'string') {
            sendJson(res, 400, { error: 'Missing or invalid language parameter.' });
            return;
          }

          if (!LANGUAGE_CONFIGS[language]) {
            sendJson(res, 400, { error: `Unsupported language: ${language}` });
            return;
          }

          if (typeof code !== 'string') {
            sendJson(res, 400, { error: 'Missing or invalid code parameter.' });
            return;
          }

          const parsedTimeout = Math.min(Math.max(Number(timeout) || 10, 1), 60);

          const result = await executeCode(
            language,
            code,
            typeof stdin === 'string' ? stdin : String(stdin),
            parsedTimeout,
            typeof executionId === 'string' ? executionId : undefined
          );

          sendJson(res, 200, result);
        } catch (err: any) {
          console.error('[Dev API] /api/run error:', err);
          sendJson(res, 500, {
            stdout: '',
            stderr: err?.message || 'Internal server execution error',
            exitCode: 1,
            durationMs: 0
          });
        }
        return;
      }

      // 4. Stop execution: POST /api/stop
      if (req.method === 'POST' && url.pathname === '/api/stop') {
        try {
          const body = await parseJsonBody(req);
          const { executionId } = body;
          const stopped = await stopCurrentExecution(
            typeof executionId === 'string' ? executionId : undefined
          );
          sendJson(res, 200, { success: stopped });
        } catch (err: any) {
          console.error('[Dev API] /api/stop error:', err);
          sendJson(res, 500, { error: err?.message || 'Failed to stop process' });
        }
        return;
      }

      sendJson(res, 404, { error: 'Not found' });
    });

    server.listen(PORT, HOST, () => {
      console.log(`[Dev API] Compiler Dev Server listening on http://${HOST}:${PORT}`);
      resolve(server);
    });

    server.on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        console.log(`[Dev API] Port ${PORT} is already in use (dev server already running).`);
        setInterval(() => {}, 1000 * 60 * 60);
        resolve(server);
      } else {
        reject(err);
      }
    });
  });
}

// Allow running standalone via: node dist-electron/devServer.js
if (require.main === module) {
  startDevServer().catch((err) => {
    console.error('[Dev API] Failed to start dev server:', err);
    process.exit(1);
  });
}
