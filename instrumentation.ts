export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { startRenderWorker } = await import('./lib/puxin/render-worker');
  const { startAiWorker } = await import('./lib/puxin/ai-worker');
  const globals = globalThis as typeof globalThis & { puxinWorkerTimer?: ReturnType<typeof setInterval> };
  if (!globals.puxinWorkerTimer) {
    // A service restart resumes durable jobs without requiring an open browser.
    startRenderWorker();
    startAiWorker();
    globals.puxinWorkerTimer = setInterval(() => { startRenderWorker(); startAiWorker(); }, 5000);
    globals.puxinWorkerTimer.unref();
  }
}
