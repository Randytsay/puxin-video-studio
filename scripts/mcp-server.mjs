#!/usr/bin/env node
// Abekyo MCP server — lets any MCP client (Claude Code, Claude Desktop, or a
// custom agent) drive a running Abekyo server: upload media, validate a
// project JSON, and render it to MP4.
//
// Zero dependencies by design, matching the repo's runtime-dependency policy:
// the MCP stdio transport is newline-delimited JSON-RPC 2.0, which fits in a
// screenful of code, and Node 20's global fetch/FormData/Blob cover the HTTP
// side. Point it at a running `npm run dev` / `npm run start` instance:
//
//   ABEKYO_URL=http://localhost:3000 node scripts/mcp-server.mjs
//
// Claude Code registration:
//   claude mcp add abekyo -e ABEKYO_URL=http://localhost:3000 -- node scripts/mcp-server.mjs

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const BASE_URL = (process.env.ABEKYO_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
const PROTOCOL_VERSION = '2025-06-18';

function readOwnVersion() {
  try {
    const pkgPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'package.json');
    return JSON.parse(readFileSync(pkgPath, 'utf8')).version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}
const SERVER_INFO = { name: 'abekyo-editor', version: readOwnVersion() };

/**
 * fetch() with actionable failure messages. A bare ECONNREFUSED reads as a
 * bug in the tool; what the agent (and the human reading the transcript)
 * actually needs to know is that the Abekyo server isn't up.
 */
async function fetchAbekyo(url, options) {
  try {
    return await fetch(url, options);
  } catch (err) {
    const cause = err?.cause?.code ?? err?.code ?? '';
    throw new Error(
      `Could not reach the Abekyo server at ${BASE_URL}` +
        (cause ? ` (${cause})` : '') +
        '. Is it running? Start it with `npm run dev` (or `npm run start`), ' +
        'or point ABEKYO_URL at the right address.',
    );
  }
}

async function errorFromResponse(res, fallback) {
  const json = await res.json().catch(() => null);
  let message = `${fallback} (HTTP ${res.status}): ${json?.error ?? 'unknown error'}`;
  const retryAfter = res.headers.get('retry-after');
  if ((res.status === 429 || res.status === 503) && retryAfter) {
    message += `. Wait ${retryAfter}s and try again.`;
  }
  return new Error(message);
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const PROJECT_ARG = {
  type: 'object',
  description:
    'An Abekyo project object (clips / subtitles / bgm / resolution / aspectRatio). ' +
    'Call get_project_schema for the full JSON Schema.',
};

const TOOLS = [
  {
    name: 'get_project_schema',
    description:
      'Fetch the JSON Schema for the Abekyo project format. Read this before ' +
      'constructing a project: it documents every clip, subtitle, and BGM field ' +
      'with types, enums, and defaults.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { title: 'Get project schema', readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'upload_media',
    description:
      'Upload a local media file (image, audio, or video) to the Abekyo server. ' +
      'Returns the same-origin URL to reference from a project, e.g. as a clip ' +
      'imageUrl / audioUrl or as bgmUrl. The server verifies the file type from ' +
      'magic bytes; unsupported content is rejected.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path to the local file to upload.' },
      },
      required: ['path'],
      additionalProperties: false,
    },
    annotations: {
      title: 'Upload media',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  {
    name: 'validate_project',
    description:
      'Dry-run a project against the render rules without rendering. Returns ' +
      'errors (project cannot render), warnings (renders, but probably not as ' +
      'intended), and a summary (clip count, duration, frames). Always validate ' +
      'before render_video — it is instant and free, and a passing validation ' +
      'guarantees the render will be accepted.',
    inputSchema: {
      type: 'object',
      properties: { project: PROJECT_ARG },
      required: ['project'],
      additionalProperties: false,
    },
    annotations: { title: 'Validate project', readOnlyHint: true, openWorldHint: false },
  },
  {
    name: 'render_video',
    description:
      'Render a project to MP4 on the Abekyo server. Blocks until the render ' +
      'finishes (typically tens of seconds; the first ever render also downloads ' +
      'a ~90MB headless browser) and reports progress along the way. Returns the ' +
      'video URL on the server, and saves the file locally when output_path is given.',
    inputSchema: {
      type: 'object',
      properties: {
        project: PROJECT_ARG,
        output_path: {
          type: 'string',
          description:
            'Optional absolute path to save the rendered MP4 to. Parent directories are created.',
        },
      },
      required: ['project'],
      additionalProperties: false,
    },
    annotations: {
      title: 'Render video',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
];

// ---------------------------------------------------------------------------
// Tool implementations — each receives (args, ctx) where ctx.progress(pct,
// message) forwards to the client when it asked for progress updates.
// ---------------------------------------------------------------------------

async function getProjectSchema() {
  const res = await fetchAbekyo(`${BASE_URL}/schema/project.schema.json`);
  if (!res.ok) {
    throw new Error(
      `Failed to fetch schema (HTTP ${res.status}). The server at ${BASE_URL} ` +
        'responded but may be an older Abekyo version without the published schema.',
    );
  }
  return await res.text();
}

async function uploadMedia({ path: filePath }) {
  if (typeof filePath !== 'string' || filePath.length === 0) {
    throw new Error('path is required');
  }
  let buffer;
  try {
    buffer = await readFile(filePath);
  } catch (err) {
    if (err?.code === 'ENOENT') {
      throw new Error(`File not found: ${filePath}. Pass an absolute path to an existing file.`);
    }
    throw err;
  }
  const form = new FormData();
  form.append('file', new Blob([buffer]), path.basename(filePath));
  const res = await fetchAbekyo(`${BASE_URL}/api/upload`, { method: 'POST', body: form });
  if (!res.ok) {
    throw await errorFromResponse(res, 'Upload failed');
  }
  return JSON.stringify(await res.json(), null, 2);
}

async function validateProjectTool({ project }) {
  const res = await fetchAbekyo(`${BASE_URL}/api/project/validate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(project),
  });
  const json = await res.json().catch(() => null);
  if (json === null) {
    throw new Error(`Validation endpoint returned non-JSON (HTTP ${res.status})`);
  }
  // 422 (invalid project) is a *successful* tool call whose payload lists the
  // errors — the caller needs them to fix the project.
  return JSON.stringify(json, null, 2);
}

async function renderVideo({ project, output_path: outputPath }, ctx) {
  const res = await fetchAbekyo(`${BASE_URL}/api/render`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(project),
  });

  if (!res.ok) {
    throw await errorFromResponse(res, 'Render rejected');
  }

  // The render endpoint streams NDJSON progress events; the final line is
  // either {type:"done"} or {type:"error"}.
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let lastEvent = null;
  const handleLine = (line) => {
    if (!line.trim()) return;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      return; // skip malformed line
    }
    lastEvent = event;
    if (event.type === 'error') {
      throw new Error(`Render failed: ${event.error}`);
    }
    if (event.type === 'progress') {
      ctx.progress(event.progress, event.message);
    }
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl;
    while ((nl = buffer.indexOf('\n')) !== -1) {
      handleLine(buffer.slice(0, nl));
      buffer = buffer.slice(nl + 1);
    }
  }
  handleLine(buffer);

  if (lastEvent?.type !== 'done') {
    throw new Error('Render stream ended without a done event (server may have restarted)');
  }
  ctx.progress(100, 'Render complete');

  const videoUrl = `${BASE_URL}${lastEvent.videoUrl}`;
  const result = { videoUrl, filename: lastEvent.filename };

  if (typeof outputPath === 'string' && outputPath.length > 0) {
    const download = await fetchAbekyo(videoUrl);
    if (!download.ok) {
      throw new Error(`Rendered but download failed: HTTP ${download.status} for ${videoUrl}`);
    }
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, Buffer.from(await download.arrayBuffer()));
    result.savedTo = outputPath;
  } else {
    result.note =
      'Pass output_path to save the MP4 locally. Server-side files are ' +
      'swept after the retention window, so download promptly.';
  }

  return JSON.stringify(result, null, 2);
}

const TOOL_HANDLERS = {
  get_project_schema: getProjectSchema,
  upload_media: uploadMedia,
  validate_project: validateProjectTool,
  render_video: renderVideo,
};

// ---------------------------------------------------------------------------
// JSON-RPC 2.0 over newline-delimited stdio (the MCP stdio transport)
// ---------------------------------------------------------------------------

function send(message) {
  process.stdout.write(JSON.stringify(message) + '\n');
}

function sendResult(id, result) {
  send({ jsonrpc: '2.0', id, result });
}

function sendError(id, code, message) {
  send({ jsonrpc: '2.0', id, error: { code, message } });
}

/**
 * Progress notifications, sent only when the client asked (progressToken).
 *
 * Throttled: upstream progress arrives per network chunk (thousands of events
 * for a first-run browser download), which would flood the client's log.
 * Forward a notification only when the percentage actually advanced and at
 * most a few times per second — except 100%, which always goes out so the
 * client never misses completion.
 */
function makeToolContext(params) {
  const token = params?._meta?.progressToken;
  if (token === undefined || token === null) {
    return { progress: () => {} };
  }
  const MIN_INTERVAL_MS = 250;
  let lastPct = -1;
  let lastSentAt = 0;
  return {
    progress: (pct, message) => {
      const now = Date.now();
      const isFinal = pct >= 100;
      if (!isFinal && (pct <= lastPct || now - lastSentAt < MIN_INTERVAL_MS)) return;
      lastPct = pct;
      lastSentAt = now;
      send({
        jsonrpc: '2.0',
        method: 'notifications/progress',
        params: { progressToken: token, progress: pct, total: 100, message },
      });
    },
  };
}

async function handleRequest(msg) {
  const { id, method, params } = msg;
  switch (method) {
    case 'initialize':
      sendResult(id, {
        protocolVersion:
          typeof params?.protocolVersion === 'string' ? params.protocolVersion : PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
        instructions:
          `Drives the Abekyo Editor server at ${BASE_URL}. Typical flow: ` +
          'get_project_schema → upload_media for each asset → validate_project → render_video.',
      });
      return;
    case 'ping':
      sendResult(id, {});
      return;
    case 'tools/list':
      sendResult(id, { tools: TOOLS });
      return;
    case 'tools/call': {
      const handler = TOOL_HANDLERS[params?.name];
      if (!handler) {
        sendError(id, -32602, `Unknown tool: ${params?.name}`);
        return;
      }
      try {
        const text = await handler(params?.arguments ?? {}, makeToolContext(params));
        sendResult(id, { content: [{ type: 'text', text }] });
      } catch (err) {
        // Tool-level failures are reported in-band so the model can react
        // (fix the project, retry) instead of surfacing a protocol error.
        sendResult(id, {
          content: [{ type: 'text', text: err instanceof Error ? err.message : String(err) }],
          isError: true,
        });
      }
      return;
    }
    default:
      if (id !== undefined && id !== null) {
        sendError(id, -32601, `Method not found: ${method}`);
      }
      // Notifications (no id) — e.g. notifications/initialized — need no reply.
  }
}

// Exit when stdin closes, but only after every in-flight request has been
// answered — a tool call that is mid-render must not be killed by the client
// closing its write side early.
let pending = 0;
let stdinClosed = false;
const maybeExit = () => {
  if (stdinClosed && pending === 0) process.exit(0);
};

let stdinBuffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  stdinBuffer += chunk;
  let nl;
  while ((nl = stdinBuffer.indexOf('\n')) !== -1) {
    const line = stdinBuffer.slice(0, nl).trim();
    stdinBuffer = stdinBuffer.slice(nl + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      sendError(null, -32700, 'Parse error');
      continue;
    }
    pending++;
    void handleRequest(msg).finally(() => {
      pending--;
      maybeExit();
    });
  }
});
process.stdin.on('end', () => {
  stdinClosed = true;
  maybeExit();
});
