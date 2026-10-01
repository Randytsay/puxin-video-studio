'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import type { SplitMode } from '@/lib/puxin/scene-split';
import type { VideoClip } from '@/src/types';

interface DriveItem { id: string; name: string; mimeType: string; modifiedTime: string | null; size: number | null }
interface BrowseResponse { folderId: string; folders: DriveItem[]; images: DriveItem[]; error?: string }
interface DriveStatus { configured: boolean; connected: boolean; rootFolderId: string }
interface ImportedScene { id: string; sourceName: string; panel: 'single' | 'top' | 'bottom'; confidence: number; imageUrl: string }

const MOTIONS: VideoClip['imageEffect'][] = ['kenBurns', 'zoom', 'pan', 'zoomOut'];

export default function PuxinStudioPage() {
  const router = useRouter();
  const setClips = useAppStore((state) => state.setClips);
  const setProductData = useAppStore((state) => state.setProductData);
  const setVideoAspectRatio = useAppStore((state) => state.setVideoAspectRatio);
  const setVideoResolution = useAppStore((state) => state.setVideoResolution);
  const [status, setStatus] = useState<DriveStatus | null>(null);
  const [browse, setBrowse] = useState<BrowseResponse | null>(null);
  const [activeFolder, setActiveFolder] = useState<DriveItem | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [splitMode, setSplitMode] = useState<SplitMode>('auto');

  useEffect(() => {
    fetch('/api/puxin/drive/status').then((r) => r.json()).then(setStatus).catch((err) => setError(String(err)));
  }, []);

  useEffect(() => {
    if (!status?.connected) return;
    setLoading(true);
    fetch('/api/puxin/drive/browse')
      .then((r) => r.json())
      .then((data: BrowseResponse) => { if (data.error) throw new Error(data.error); setBrowse(data); })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [status?.connected]);

  const sortedImages = useMemo(
    () => [...(browse?.images ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant', { numeric: true })),
    [browse?.images],
  );

  async function openFolder(folder: DriveItem) {
    setLoading(true); setError(null); setSelected(new Set());
    try {
      const response = await fetch(`/api/puxin/drive/browse?folder=${encodeURIComponent(folder.id)}`);
      const data = (await response.json()) as BrowseResponse;
      if (!response.ok || data.error) throw new Error(data.error || 'Unable to browse folder');
      setBrowse(data); setActiveFolder(folder); setSelected(new Set(data.images.map((item) => item.id)));
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setLoading(false); }
  }

  function toggleImage(id: string) {
    setSelected((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }

  async function createScenes() {
    if (!selected.size) return;
    setLoading(true); setError(null);
    try {
      const orderedIds = sortedImages.filter((item) => selected.has(item.id)).map((item) => item.id);
      const response = await fetch('/api/puxin/scenes/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fileIds: orderedIds, mode: splitMode }) });
      const data = (await response.json()) as { scenes?: ImportedScene[]; error?: string };
      if (!response.ok || !data.scenes) throw new Error(data.error || 'Scene import failed');
      const total = data.scenes.length;
      const clips: VideoClip[] = data.scenes.map((scene, index) => ({
        plotName: `${String(index + 1).padStart(2, '0')} · ${scene.sourceName}${scene.panel === 'top' ? ' A' : scene.panel === 'bottom' ? ' B' : ''}`,
        text: '', imageUrl: scene.imageUrl, audioUrl: '', duration: scene.panel === 'single' && index === total - 1 ? 6 : 4,
        index, totalClips: total, imageEffect: MOTIONS[index % MOTIONS.length], transitionType: 'crossfade', transitionDuration: 0.35, sceneLayout: 'fit-blur',
      }));
      setClips(clips);
      setProductData({ name: activeFolder?.name || '普新短影音', description: '', images: clips.map((clip) => clip.imageUrl!).filter(Boolean), reviews: [] });
      setVideoAspectRatio('9:16'); setVideoResolution('1080p'); router.push('/video-edit');
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setLoading(false); }
  }

  return (
    <main className="min-h-screen bg-[#f6f1e7] text-[#3d372d]">
      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 lg:px-10">
        <header className="mb-8 flex flex-col gap-4 border-b border-[#cfc3ad] pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div><div className="mb-2 text-xs font-semibold tracking-[0.22em] text-[#9b7a52]">PUXIN MEDITATION CENTER</div><h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">普新短影音製作台</h1><p className="mt-2 text-sm text-[#766d60]">從 Google Drive 選素材，自動拆格並建立 9:16 場景。</p></div>
          <a href="/" className="text-sm font-medium text-[#7a6549] underline underline-offset-4">一般素材上傳</a>
        </header>
        {error && <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{error}</div>}
        {!status && <div className="rounded-3xl border border-[#d9cfbf] bg-white/70 p-8">正在檢查 Google Drive…</div>}
        {status && !status.configured && <section className="rounded-3xl border border-[#d9cfbf] bg-white p-8 shadow-sm"><h2 className="text-xl font-semibold">需要設定 Google Drive OAuth</h2><p className="mt-3 max-w-2xl text-sm leading-7 text-[#766d60]">伺服器尚未設定 GOOGLE_DRIVE_CLIENT_ID / GOOGLE_DRIVE_CLIENT_SECRET。設定後即可直接瀏覽指定的普新素材資料夾。</p></section>}
        {status?.configured && !status.connected && <section className="rounded-3xl border border-[#d9cfbf] bg-white p-8 shadow-sm"><h2 className="text-xl font-semibold">連接你的 Google Drive</h2><p className="mt-3 text-sm text-[#766d60]">第一版只要求唯讀權限；素材匯入 VPS 暫存後建立 Scene。</p><a href="/api/puxin/drive/auth" className="mt-6 inline-flex rounded-full bg-[#6f5b3e] px-6 py-3 text-sm font-semibold text-white">連接 Google Drive</a></section>}
        {status?.connected && !activeFolder && <section><div className="mb-4 flex items-center justify-between"><h2 className="text-xl font-semibold">選擇主題資料夾</h2><span className="text-xs text-[#8a8175]">根目錄：{status.rootFolderId}</span></div><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{(browse?.folders ?? []).map((folder) => <button key={folder.id} type="button" onClick={() => openFolder(folder)} className="rounded-3xl border border-[#d9cfbf] bg-white p-6 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[#bfa882] hover:shadow-md"><div className="mb-10 text-xs font-semibold tracking-[0.18em] text-[#b09163]">STORY</div><div className="text-2xl font-semibold">{folder.name}</div><div className="mt-2 text-sm text-[#81786a]">開啟素材 →</div></button>)}</div></section>}
        {status?.connected && activeFolder && <section><div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><button type="button" onClick={() => { setActiveFolder(null); setSelected(new Set()); }} className="mb-2 text-sm text-[#7a6549] underline underline-offset-4">← 回到主題列表</button><h2 className="text-2xl font-semibold">{activeFolder.name}</h2><p className="mt-1 text-sm text-[#81786a]">已選 {selected.size} / {sortedImages.length} 張；依檔名數字排序後建立 Scene。</p></div><div className="flex flex-wrap items-center gap-3"><label className="text-xs font-medium text-[#766d60]">拆格方式 <select value={splitMode} onChange={(e) => setSplitMode(e.target.value as SplitMode)} className="ml-2 rounded-full border border-[#cfc3ad] bg-white px-3 py-2 text-sm"><option value="auto">自動判斷</option><option value="double">全部上下二格</option><option value="single">全部單格</option></select></label><button type="button" disabled={loading || !selected.size} onClick={createScenes} className="rounded-full bg-[#6f5b3e] px-6 py-3 text-sm font-semibold text-white disabled:opacity-40">{loading ? '處理中…' : '分析素材並建立 9:16 場景'}</button></div></div><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{sortedImages.map((item) => { const checked = selected.has(item.id); return <button key={item.id} type="button" onClick={() => toggleImage(item.id)} className={`overflow-hidden rounded-2xl border bg-white text-left shadow-sm ${checked ? 'border-[#8a704c] ring-2 ring-[#bca27a]/30' : 'border-[#ddd4c6]'}`}><div className="aspect-[4/5] bg-[#e9e1d5]"><img src={`/api/puxin/drive/file/${item.id}`} alt={item.name} className="h-full w-full object-cover" /></div><div className="flex items-center gap-3 p-3"><span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs ${checked ? 'border-[#6f5b3e] bg-[#6f5b3e] text-white' : 'border-[#bbb09f]'}`}>{checked ? '✓' : ''}</span><span className="truncate text-sm font-medium">{item.name}</span></div></button>; })}</div></section>}
        {loading && !activeFolder && <div className="mt-6 text-sm text-[#81786a]">讀取素材中…</div>}
      </div>
    </main>
  );
}
