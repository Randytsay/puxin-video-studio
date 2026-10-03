'use client';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { StudioProject } from '@/lib/puxin/projects';
import type { SplitMode } from '@/lib/puxin/scene-split';
import { findPresetScene, findPuxinStoryPreset } from '@/lib/puxin/story-presets';
import type { VideoClip, VideoAspectRatio } from '@/src/types';
import './studio.css';

interface Source { id: string; name: string; url: string; local: boolean; selected: boolean; mode: SplitMode; splitPercent: number }
interface Folder { id: string; name: string }
interface Imported { sourceId: string; sourceName: string; panel: 'single' | 'top' | 'bottom'; imageUrl: string; confidence: number }
async function request(url: string, init?: RequestInit) { const response = await fetch(url, init); const data = await response.json(); if (!response.ok || data.error) throw new Error(data.error || '讀取失敗，請再試一次'); return data; }
export default function StudioLibrary() {
  const router = useRouter();
  const [projects, setProjects] = useState<StudioProject[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [breadcrumbs, setBreadcrumbs] = useState<Folder[]>([]);
  const [driveReady, setDriveReady] = useState(false);
  const [driveOutput, setDriveOutput] = useState(false);
  const [title, setTitle] = useState('');
  const [ratio, setRatio] = useState<VideoAspectRatio>('9:16');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    request('/api/puxin/projects').then(data => setProjects(data.projects)).catch(error => setError(error.message));
    request('/api/puxin/drive/status').then(data => setDriveReady(data.connected && data.accessible !== false)).catch(() => {});
    request('/api/puxin/drive/output').then(data => setDriveOutput(data.writable)).catch(() => {});
  }, []);
  async function browse(folder?: Folder, depth?: number) {
    setBusy(true); setError('');
    try {
      const data = await request('/api/puxin/drive/browse' + (folder ? `?folder=${encodeURIComponent(folder.id)}` : ''));
      setFolders(data.folders); setSources(data.images.map((item: Folder) => ({ ...item, url: `/api/puxin/drive/file/${item.id}`, local: false, selected: true, mode: 'single', splitPercent: 50 })));
      setBreadcrumbs(depth !== undefined ? breadcrumbs.slice(0, depth) : folder ? [...breadcrumbs, folder] : []);
      if (folder) setTitle(folder.name);
    } catch (error) { setError(error instanceof Error ? error.message : '素材讀取失敗'); }
    finally { setBusy(false); }
  }
  async function upload(files: FileList | null) {
    if (!files) return; setBusy(true); setError('');
    try {
      for (const file of Array.from(files).sort((a,b) => a.name.localeCompare(b.name, 'zh-Hant', { numeric: true }))) {
        const form = new FormData(); form.append('file', file);
        const result = await request('/api/puxin/media', { method: 'POST', body: form });
        if (result.kind !== 'image') throw new Error('建立作品時請選圖片；影片可在作品內替換');
        setSources(prev => [...prev, { id: result.url, name: file.name, url: result.url, local: true, selected: true, mode: 'single', splitPercent: 50 }]);
      }
    } catch (error) { setError(error instanceof Error ? error.message : '圖片上傳失敗'); }
    finally { setBusy(false); }
  }
  function changeSource(id: string, patch: Partial<Source>) { setSources(prev => prev.map(source => source.id === id ? { ...source, ...patch } : source)); }
  async function create() {
    const selected = sources.filter(s => s.selected); if (!selected.length) return;
    setBusy(true); setError('');
    try {
      const data = await request('/api/puxin/scenes/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fileIds: selected.filter(s => !s.local).map(s => s.id), localImages: selected.filter(s => s.local), selections: Object.fromEntries(selected.map(s => [s.id, { mode: s.mode, splitPercent: s.splitPercent }])), mode: 'single' }) });
      const preset = findPuxinStoryPreset(breadcrumbs.at(-1)?.name);
      const order = new Map(selected.map((source, index) => [source.id, index]));
      data.scenes.sort((a: Imported, b: Imported) => (order.get(a.sourceId) ?? 0) - (order.get(b.sourceId) ?? 0));
      const clips: VideoClip[] = data.scenes.map((scene: Imported, index: number) => {
        const script = findPresetScene(preset, scene.sourceName, scene.panel);
        return { plotName: `${index + 1} · ${scene.sourceName}${scene.panel === 'single' ? '' : scene.panel === 'top' ? ' 上格' : ' 下格'}`, text: script?.narration || '', imageUrl: scene.imageUrl, audioUrl: '', duration: script?.duration || 4, index, totalClips: data.scenes.length, imageEffect: script?.motion || 'none', transitionType: 'crossfade', transitionDuration: 0.35, sceneLayout: 'fit-blur', showSceneSubtitle: false };
      });
      const record = await request('/api/puxin/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: title.trim() || preset?.title || '新的普新作品', project: { clips, subtitles: [], resolution: '1080p', aspectRatio: ratio, audioEnabled: true, bgmUrl: null, bgmVolume: 0.15, bgmStartTime: 0, bgmEndTime: null, brand: { enabled: false, closingText: '' } } }) });
      router.push(`/studio/${record.id}`);
    } catch (error) { setError(error instanceof Error ? error.message : '建立作品失敗'); }
    finally { setBusy(false); }
  }
  async function duplicate(record: StudioProject) {
    try { const result = await request('/api/puxin/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: record.title + '（副本）', project: record.project, voice: record.voice, voiceStyle: record.voiceStyle }) }); router.push(`/studio/${result.id}`); } catch (error) { setError(error instanceof Error ? error.message : '複製失敗'); }
  }
  return <main className="puxin-app"><header className="puxin-header"><Link href="/studio" className="puxin-wordmark">普新<span>內容製作台</span></Link><span className="puxin-caption">把一個故事，好好說完。</span></header><div className="puxin-shell">
    <div className="puxin-intro"><div><p className="puxin-eyebrow">你的作品</p><h1>從一張圖，開始分享。</h1><p>保留原圖，寫下旁白。每個作品都能保存，隨時回來繼續。</p></div><Link className="puxin-quiet" href="/legacy">開啟一般剪輯器 ↗</Link></div>
    {error && <p role="alert" className="puxin-error">{error}</p>}{notice && <p role="status" className="puxin-notice">{notice}</p>}
    <section className="puxin-library">{projects.length ? projects.map(record => <article className="puxin-project-card" key={record.id}><Link href={`/studio/${record.id}`} className="puxin-project-cover">{record.project.clips[0]?.imageUrl && <Image unoptimized width={1080} height={1440} src={record.project.clips[0].imageUrl} alt="" />}<span>{record.project.aspectRatio}</span></Link><div><Link href={`/studio/${record.id}`}><h2>{record.title}</h2></Link><p>{record.project.clips.length} 個場景 · {new Date(record.updatedAt).toLocaleDateString('zh-TW')}</p><button onClick={() => duplicate(record)}>複製作品</button></div></article>) : <div className="puxin-empty">還沒有作品。先選圖片，下次就能從這裡繼續。</div>}</section>
    <section className="puxin-panel"><div className="puxin-section-title"><div><p className="puxin-eyebrow">建立作品</p><h2>選擇故事素材</h2></div><div className="puxin-actions"><label className="puxin-button secondary">從電腦選圖<input type="file" accept="image/png,image/jpeg,image/webp" multiple hidden disabled={busy} onChange={e => { upload(e.target.files); e.target.value = ''; }} /></label><button className="puxin-button secondary" disabled={busy || !driveReady} onClick={() => browse()}>從 Drive 選圖</button></div></div>
      <div className="puxin-form-row"><label>作品名稱<input value={title} onChange={e => setTitle(e.target.value)} placeholder="例如：情緒有解｜水壺的啟示" maxLength={120} /></label><label>輸出比例<select value={ratio} onChange={e => setRatio(e.target.value as VideoAspectRatio)}><option value="9:16">9:16 · 直式短影音</option><option value="3:4">3:4 · 完整圖文</option></select></label></div>
      <p className="puxin-help">預設保留完整圖片。只有你選擇拆格的圖片，才會切成兩個場景。</p>
      {!!breadcrumbs.length && <nav className="puxin-breadcrumb"><button disabled={busy} onClick={() => browse()}>素材根目錄</button>{breadcrumbs.map((folder, index) => <button disabled={busy} key={folder.id} onClick={() => browse(folder, index + 1)}>／ {folder.name}</button>)}</nav>}
      {!!folders.length && <div className="puxin-folders">{folders.map(folder => <button disabled={busy} key={folder.id} onClick={() => browse(folder)}>▱ {folder.name} →</button>)}</div>}
      {!!sources.length && <><div className="puxin-actions"><button onClick={() => setSources(prev => prev.map(s => ({ ...s, selected: true })))}>全部選取</button><button onClick={() => { setSources([]); setNotice('已清除這次的選圖，已保存的作品不受影響。'); }}>清除選圖</button></div><div className="puxin-source-grid">{sources.map(source => <article key={source.id}><div className="puxin-source-preview"><Image unoptimized width={1080} height={1440} src={source.url} alt={source.name} />{source.mode === 'double' && <div className="puxin-divider" style={{ top: `${source.splitPercent}%` }} />}</div><label className="puxin-checkbox"><input type="checkbox" checked={source.selected} onChange={e => changeSource(source.id, { selected: e.target.checked })} />{source.name}</label><select aria-label={`${source.name} 的圖片處理`} value={source.mode} onChange={e => changeSource(source.id, { mode: e.target.value as SplitMode })}><option value="single">保留整張</option><option value="double">拆成上下兩格</option></select>{source.mode === 'double' && <label className="puxin-help">分隔線 {source.splitPercent}%<input type="range" min={10} max={90} value={source.splitPercent} onChange={e => changeSource(source.id, { splitPercent: Number(e.target.value) })} /></label>}</article>)}</div></>}
      <div className="puxin-create"><span>{sources.filter(s => s.selected).length} 張已選 · 每次最多 30 張</span><button className="puxin-button" disabled={busy || !sources.some(s => s.selected)} onClick={create}>{busy ? '處理素材中…' : '建立作品 →'}</button></div>
    </section>
    <section className="puxin-drive-status"><div><h2>成果保存到 Google Drive</h2><p>IG輪播素材／製作成果／作品名稱。匯出後保存影片、旁白與作品設定。</p></div>{driveOutput ? <span className="puxin-ready">已連接成果上傳</span> : <a className="puxin-button secondary" href="/api/puxin/drive/auth">連接成果上傳</a>}</section>
  </div></main>;
}
