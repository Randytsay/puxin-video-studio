'use client';
import Link from 'next/link';
import { type ComponentType, use, useCallback, useEffect, useRef, useState } from 'react';
import { Player } from '@remotion/player';
import { ProductVideo } from '@/src/ProductVideo';
import { computeTotalFrames } from '@/src/timeline';
import { RESOLUTIONS, type VideoClip, type VideoAspectRatio } from '@/src/types';
import type { StudioProject, StudioJob } from '@/lib/puxin/projects';
import type { AiGenerationJob, AiGenerationProvider } from '@/lib/puxin/ai-jobs';
import type { TtsBatchJob } from '@/lib/puxin/tts-jobs';
import '../studio.css';

async function request(url: string, init?: RequestInit) { const response = await fetch(url, init); const data = await response.json(); if (!response.ok || data.error) throw new Error(data.error || '操作失敗，請再試一次'); return data; }
export default function StudioEditor({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [document, setDocument] = useState<StudioProject | null>(null);
  const [jobs, setJobs] = useState<StudioJob[]>([]);
  const [aiJobs, setAiJobs] = useState<AiGenerationJob[]>([]);
  const [ttsJobs, setTtsJobs] = useState<TtsBatchJob[]>([]);
  const [selected, setSelected] = useState(0);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [saved, setSaved] = useState(true);
  const [voices, setVoices] = useState<string[]>(['Kore', 'Leda', 'Aoede', 'Charon', 'Puck', 'Sulafat']);
  const [voicePreviewUrl, setVoicePreviewUrl] = useState('');
  const [veoOpen, setVeoOpen] = useState(false);
  const [veoPrompt, setVeoPrompt] = useState('');
  const [videoProvider, setVideoProvider] = useState<AiGenerationProvider>('vertex-veo-3.1');
  const [h3Configured, setH3Configured] = useState(false);
  const docRef = useRef<StudioProject | null>(null);
  const edits = useRef(0), stored = useRef(0);
  const saving = useRef<Promise<StudioProject> | null>(null);
  const refreshedTtsJob = useRef('');
  useEffect(() => {
    let active = true;
    request(`/api/puxin/projects/${id}`).then(data => { if (active) { docRef.current = data; setDocument(data); } }).catch(error => setError(error.message));
    request('/api/puxin/tts').then(data => setVoices(data.voices)).catch(() => {});
    request('/api/puxin/providers').then(data => {
      const h3 = data.videoProviders?.find((provider: { id: string }) => provider.id === 'minimax-h3-colab');
      setH3Configured(Boolean(h3?.configured));
    }).catch(() => {});
    return () => { active = false; };
  }, [id]);
  const refreshJobs = useCallback(async () => { try { const data = await request(`/api/puxin/jobs?projectId=${id}`); setJobs(data.jobs); } catch (error) { setError(error instanceof Error ? error.message : '匯出紀錄讀取失敗'); } }, [id]);
  const refreshAiJobs = useCallback(async () => {
    try {
      const data = await request(`/api/puxin/ai-jobs?projectId=${id}`);
      setAiJobs(data.jobs);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'AI 動態化紀錄讀取失敗');
    }
  }, [id]);
  const refreshTtsJobs = useCallback(async () => {
    try {
      const data = await request('/api/puxin/tts-jobs?projectId=' + id);
      setTtsJobs(data.jobs);
    } catch (error) {
      setError(error instanceof Error ? error.message : '旁白背景工作讀取失敗');
    }
  }, [id]);
  useEffect(() => { const first = setTimeout(refreshJobs, 0); const timer = setInterval(refreshJobs, 2500); return () => { clearTimeout(first); clearInterval(timer); }; }, [refreshJobs]);
  useEffect(() => { const first = setTimeout(refreshAiJobs, 0); const timer = setInterval(refreshAiJobs, 3000); return () => { clearTimeout(first); clearInterval(timer); }; }, [refreshAiJobs]);
  useEffect(() => { const first = setTimeout(refreshTtsJobs, 0); const timer = setInterval(refreshTtsJobs, 3000); return () => { clearTimeout(first); clearInterval(timer); }; }, [refreshTtsJobs]);
  useEffect(() => {
    if (!document || !saved) return;
    if (!aiJobs.some(job => job.appliedAt && job.projectRevision >= document.revision)) return;
    request(`/api/puxin/projects/${id}`).then(record => {
      docRef.current = record;
      stored.current = edits.current;
      setDocument(record);
      setSaved(true);
      setMessage('AI 動態影片已完成並自動套用。');
    }).catch(error => setError(error instanceof Error ? error.message : '無法更新 AI 動態影片'));
  }, [aiJobs, document, id, saved]);
  useEffect(() => {
    const latest = ttsJobs[0];
    if (!latest || !saved) return;
    const refreshKey = latest.id + ':' + latest.cursor + ':' + latest.status;
    if (refreshedTtsJob.current === refreshKey) return;
    if (latest.cursor === 0 && latest.status !== 'done') return;
    const version = edits.current;
    request('/api/puxin/projects/' + id).then(record => {
      if (edits.current !== version || edits.current !== stored.current) return;
      docRef.current = record;
      stored.current = edits.current;
      refreshedTtsJob.current = refreshKey;
      setDocument(record);
      setSaved(true);
      if (latest.status === 'done') setMessage('背景旁白已完成，作品已更新。');
    }).catch(error => setError(error instanceof Error ? error.message : '無法更新背景旁白結果'));
  }, [ttsJobs, id, saved]);

  const save = useCallback(async (): Promise<StudioProject> => {
    if (saving.current) await saving.current;
    if (!docRef.current) throw new Error('作品尚未載入');
    if (stored.current === edits.current) return docRef.current;
    const snapshot = docRef.current; const version = edits.current;
    const task = request(`/api/puxin/projects/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(snapshot) }) as Promise<StudioProject>;
    saving.current = task;
    try {
      const record = await task;
      const merged = { ...docRef.current!, revision: record.revision, updatedAt: record.updatedAt };
      docRef.current = merged; stored.current = version; setDocument(merged); setSaved(version === edits.current);
      return merged;
    } finally { if (saving.current === task) saving.current = null; }
  }, [id]);
  useEffect(() => {
    if (saved || !document) return;
    const timer = setTimeout(() => save().catch(error => setError(error.message)), 1000);
    return () => clearTimeout(timer);
  }, [document, saved, save]);
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => { if (edits.current !== stored.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', handler); return () => window.removeEventListener('beforeunload', handler);
  }, []);
  function edit(transform: (record: StudioProject) => StudioProject) {
    if (!docRef.current) return;
    const next = transform(docRef.current); docRef.current = next; edits.current++; setDocument(next); setSaved(false); setError('');
  }
  function clipPatch(patch: Partial<VideoClip>, at = selected) { edit(record => ({ ...record, project: { ...record.project, clips: record.project.clips.map((clip, index) => index === at ? { ...clip, ...patch } : clip) } })); }
  function move(direction: number) {
    const target = selected + direction;
    if (!document || target < 0 || target >= document.project.clips.length) return;
    edit(record => { const clips = [...record.project.clips]; [clips[selected], clips[target]] = [clips[target], clips[selected]]; return { ...record, project: { ...record.project, clips: clips.map((c, index) => ({ ...c, index })) } }; }); setSelected(target);
  }
  async function generate(at: number) {
    if (ttsJobs.some(job => ['queued', 'running'].includes(job.status))) throw new Error('背景旁白正在處理，完成後再單段生成');
    const record = docRef.current!; const clip = record.project.clips[at];
    if (!clip.text.trim()) throw new Error('請先輸入這段旁白');
    const text = clip.text;
    const result = await request('/api/puxin/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, voice: record.voice, style: record.voiceStyle }) });
    if (docRef.current!.project.clips[at]?.text !== text) throw new Error('生成期間旁白已修改，請重新生成');
    clipPatch({ audioUrl: result.audioUrl, audioStartTime: 0, duration: Math.round((result.duration + 0.6) * 100) / 100 }, at);
  }
  async function run(label: string, operation: () => Promise<void>) { setBusy(label); setError(''); setMessage(''); try { await operation(); } catch (error) { setError(error instanceof Error ? error.message : '操作失敗'); } finally { setBusy(''); } }
  async function upload(file: File | undefined, kind: 'bgm' | 'visual' | 'audio') {
    if (!file) return;
    await run('上傳中', async () => {
      const form = new FormData(); form.append('file', file); const data = await request('/api/puxin/media', { method: 'POST', body: form });
      if (kind === 'bgm') { if (data.kind !== 'audio') throw new Error('配樂請選音訊檔案'); edit(record => ({ ...record, project: { ...record.project, bgmUrl: data.url } })); }
      else if (kind === 'audio') { if (data.kind !== 'audio') throw new Error('旁白請選音訊檔案'); clipPatch({ audioUrl: data.url, audioStartTime: 0 }); setMessage('旁白已上傳，請確認場景長度足夠。'); }
      else { if (data.kind === 'audio') throw new Error('畫面請選圖片或影片'); clipPatch({ imageUrl: data.url }); }
    });
  }
  function isVideoAsset(url: string | null | undefined) {
    const clean = url?.split('?')[0].toLowerCase() || '';
    return ['.mp4', '.mov', '.m4v', '.webm', '.ogv'].some(ext => clean.endsWith(ext));
  }
  async function animateScene() {
    const current = docRef.current?.project.clips[selected];
    if (!current?.imageUrl) throw new Error('這個場景沒有可用畫面');
    if (isVideoAsset(current.imageUrl)) throw new Error('這個場景已經是影片');
    if (videoProvider === 'minimax-h3-colab' && !h3Configured) throw new Error('MiniMax H3 外部 runner 尚未完成設定');
    await run('建立 AI 動態化工作', async () => {
      const record = await save();
      await request('/api/puxin/ai-jobs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: id,
          revision: record.revision,
          clipIndex: selected,
          provider: videoProvider,
          prompt: veoPrompt.trim() || undefined,
        }),
      });
      setVeoOpen(false);
      setVeoPrompt('');
      await refreshAiJobs();
      setMessage('AI 動態化已加入背景工作；可以離開此頁，稍後回來查看或套用。');
    });
  }
  async function applyCompletedAi(job: AiGenerationJob) {
    await run('套用 AI 動態影片', async () => {
      await save();
      const record = await request(`/api/puxin/ai-jobs/${job.id}/apply`, { method: 'POST' });
      docRef.current = record;
      stored.current = edits.current;
      setDocument(record);
      setSaved(true);
      await refreshAiJobs();
      setMessage('AI 動態影片已套用到場景。');
    });
  }
  async function revertCompletedAi(job: AiGenerationJob) {
    await run('還原原圖', async () => {
      await save();
      const record = await request('/api/puxin/ai-jobs/' + job.id + '/revert', { method: 'POST' });
      docRef.current = record;
      stored.current = edits.current;
      setDocument(record);
      setSaved(true);
      await refreshAiJobs();
      setMessage('已還原 AI 動態化前的原始圖片；需要時可以再次套用完成影片。');
    });
  }
  if (!document) return <main className="puxin-app"><div className="puxin-shell">{error || '正在開啟作品…'}<p><Link href="/studio">回到作品庫</Link></p></div></main>;
  const clip = document.project.clips[selected];
  const resolution = RESOLUTIONS[document.project.resolution][document.project.aspectRatio];
  const sceneCount = document.project.clips.length;
  const selectedAiJobs = aiJobs.filter(job => job.clipIndex === selected).slice(0, 4);
  const activeTtsJob = ttsJobs.find(job => ['queued', 'running'].includes(job.status));
  const missingNarration = document.project.clips.filter(scene => scene.text.trim() && !scene.audioUrl);
  const missingNarrationCount = missingNarration.length;
  const missingNarrationChars = missingNarration.reduce((sum, scene) => sum + scene.text.trim().length, 0);
  return <main className="puxin-app"><header className="puxin-header"><Link href="/studio" className="puxin-wordmark">普新<span>內容製作台</span></Link><Link href="/studio" onClick={async event => { if (!saved) { event.preventDefault(); try { await save(); window.location.href = '/studio'; } catch (error) { setError(error instanceof Error ? error.message : '保存失敗'); } } }} className="puxin-quiet">← 作品庫</Link></header><div className="puxin-shell">
    <div className="puxin-editor-heading"><label className="puxin-title-input"><input aria-label="作品名稱" value={document.title} onChange={e => edit(record => ({ ...record, title: e.target.value }))} /></label><div className="puxin-actions"><span role="status" className="puxin-help">{saved ? '已保存' : '有修改，等待保存'}</span><button className="puxin-button secondary" onClick={() => run('保存中', async () => { await save(); setMessage('作品已保存'); })}>保存作品</button><button className="puxin-button" disabled={!!busy} onClick={() => run('建立匯出', async () => { let record = await save(); if (stored.current !== edits.current) record = await save(); await request('/api/puxin/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: id, revision: record.revision }) }); await refreshJobs(); setMessage('已加入匯出佇列，可以離開此頁，稍後回來下載。'); })}>匯出影片 →</button></div></div>
    {error && <p className="puxin-error" role="alert">{error}</p>}{message && <p className="puxin-notice" role="status">{message}</p>}{busy && <p className="puxin-notice" role="status">{busy}…</p>}
    <div className="puxin-editor-grid"><section className="puxin-preview-pane"><div className="puxin-player" style={{ aspectRatio: `${resolution.width}/${resolution.height}` }}><Player component={ProductVideo as unknown as ComponentType<Record<string, unknown>>} inputProps={document.project as unknown as Record<string, unknown>} durationInFrames={Math.max(30, computeTotalFrames(document.project.clips))} fps={30} compositionWidth={resolution.width} compositionHeight={resolution.height} controls style={{ width: '100%', height: '100%' }} /></div><p className="puxin-help">{sceneCount} 個場景 · 約 {(computeTotalFrames(document.project.clips) / 30).toFixed(1)} 秒</p><div className="puxin-form-row"><label>影片比例<select value={document.project.aspectRatio} onChange={e => edit(record => ({ ...record, project: { ...record.project, aspectRatio: e.target.value as VideoAspectRatio } }))}><option value="9:16">9:16</option><option value="3:4">3:4</option></select></label><label>畫質<select value={document.project.resolution} onChange={e => edit(record => ({ ...record, project: { ...record.project, resolution: e.target.value as '720p' | '1080p' } }))}><option value="1080p">1080p</option><option value="720p">720p</option></select></label></div></section>
      <section className="puxin-edit-pane"><nav className="puxin-scenes">{document.project.clips.map((scene, index) => <button disabled={!!busy} className={index === selected ? 'active' : ''} key={`${index}-${scene.imageUrl}`} onClick={() => setSelected(index)}><span>{index + 1}</span><span>{scene.plotName}</span>{scene.audioUrl && <small>有聲</small>}</button>)}</nav>{clip && <div className="puxin-scene-form"><div className="puxin-section-title"><h2>場景 {selected + 1}</h2><div className="puxin-actions"><button disabled={selected === 0 || !!busy} onClick={() => move(-1)}>↑ 前移</button><button disabled={selected === sceneCount - 1 || !!busy} onClick={() => move(1)}>↓ 後移</button><button disabled={sceneCount <= 1 || !!busy} onClick={() => { edit(record => ({ ...record, project: { ...record.project, clips: record.project.clips.filter((_, i) => i !== selected).map((c, index, arr) => ({ ...c, index, totalClips: arr.length })) } })); setSelected(Math.max(0, selected - 1)); }}>移除</button></div></div><label>場景名稱<input value={clip.plotName} onChange={e => clipPatch({ plotName: e.target.value })} /></label><label>旁白<textarea rows={4} value={clip.text} onChange={e => clipPatch({ text: e.target.value, ...(clip.audioUrl ? { audioUrl: '' } : {}) })} placeholder="寫下這一段要說的話。原圖有文字時，可以使用自然的口語補充。" /></label><div className="puxin-actions"><button className="puxin-button" disabled={!!busy || !clip.text.trim()} onClick={() => run('生成這段旁白', async () => { await generate(selected); await save(); setMessage('旁白已生成，場景長度已依音訊調整。'); })}>{clip.audioUrl ? '重新生成這段' : '生成這段並試聽'}</button><label className="puxin-button secondary">上傳真人旁白<input hidden type="file" accept="audio/*" disabled={!!busy} onChange={e => upload(e.target.files?.[0], 'audio')} /></label></div>{clip.audioUrl && <audio controls src={clip.audioUrl} className="puxin-audio" />}<div className="puxin-form-row"><label>場景長度（秒）<input type="number" min={0.1} max={300} step={0.1} value={clip.duration} onChange={e => clipPatch({ duration: Math.max(0.1, Math.min(300, Number(e.target.value))) })} /></label><label>圖片呈現<select value={clip.sceneLayout || 'fit-blur'} onChange={e => clipPatch({ sceneLayout: e.target.value as VideoClip['sceneLayout'] })}><option value="fit-blur">完整保留 · 模糊延伸背景</option><option value="contain">完整保留 · 柔和延伸背景</option><option value="cover">填滿畫面 · 可能裁切</option></select></label><label>運鏡<select value={clip.imageEffect || 'none'} onChange={e => clipPatch({ imageEffect: e.target.value as VideoClip['imageEffect'] })}><option value="none">保持靜止</option><option value="zoom">緩慢靠近</option><option value="zoomOut">緩慢拉遠</option><option value="pan">輕微平移</option><option value="kenBurns">柔和運鏡</option></select></label></div><label className="puxin-checkbox"><input type="checkbox" checked={clip.showSceneSubtitle === true} onChange={e => clipPatch({ showSceneSubtitle: e.target.checked })} />顯示這段旁白字幕（原圖已有文字時可關閉）</label><label className="puxin-button secondary">替換圖片或影片<input hidden type="file" accept="image/*,video/*" disabled={!!busy} onChange={e => upload(e.target.files?.[0], 'visual')} /></label>{clip.imageUrl && !isVideoAsset(clip.imageUrl) && <div className="puxin-panel"><div className="puxin-section-title"><div><h2>AI 動態化</h2><p className="puxin-help">可選 Veo 3.1 Fast 或 MiniMax H3；只有按下確認後才會使用對應服務的額度。</p></div>{!veoOpen && <button className="puxin-button secondary" disabled={!!busy} onClick={() => setVeoOpen(true)}>AI 動態化</button>}</div>{veoOpen && <><div className="puxin-form-row"><label>生成引擎<select value={videoProvider} onChange={e => setVideoProvider(e.target.value as AiGenerationProvider)}><option value="vertex-veo-3.1">Vertex AI · Veo 3.1 Fast</option><option value="minimax-h3-colab" disabled={!h3Configured}>MiniMax H3 · Colab{h3Configured ? '' : '（尚未連線）'}</option></select></label></div><label>動作提示（可留空）<textarea rows={3} maxLength={800} value={veoPrompt} onChange={e => setVeoPrompt(e.target.value)} placeholder="例如：窗邊光影緩慢變化，人物衣角微微飄動，鏡頭很慢地靠近。" /></label><div className="puxin-actions"><button className="puxin-button" disabled={!!busy} onClick={animateScene}>確認生成</button><button className="puxin-button secondary" disabled={!!busy} onClick={() => { setVeoOpen(false); setVeoPrompt(''); }}>取消</button></div></>}</div>}{isVideoAsset(clip.imageUrl) && <p className="puxin-help">此場景目前已使用影片素材；若要重新 AI 動態化，請先替換為靜態圖片。</p>}{selectedAiJobs.length > 0 && <div className="puxin-panel"><h3>AI 動態化工作</h3>{selectedAiJobs.map(job => <article className="puxin-job" key={job.id}><div><strong>{job.provider === 'vertex-veo-3.1' ? 'Veo 3.1 Fast' : 'MiniMax H3'} · {({ queued: '等待中', submitting: '送出中', running: '生成中', done: '已完成', failed: '失敗' })[job.status]}</strong><p>{new Date(job.createdAt).toLocaleString('zh-TW')} · {Math.round(job.progress)}%</p>{['queued','submitting','running'].includes(job.status) && <progress value={job.progress} max={100} />}{job.error && <p className="puxin-error">{job.error}</p>}</div><div className="puxin-actions">{job.status === 'done' && !job.appliedAt && <button className="puxin-button secondary" disabled={!!busy} onClick={() => applyCompletedAi(job)}>套用完成影片</button>}{job.appliedAt && <button className="puxin-button secondary" disabled={!!busy} onClick={() => revertCompletedAi(job)}>還原原圖</button>}</div></article>)}</div>}</div>}</section></div>
    <section className="puxin-panel"><div className="puxin-section-title"><h2>聲音與品牌</h2><button className="puxin-button secondary" disabled={!!busy || Boolean(activeTtsJob) || missingNarrationCount === 0} onClick={() => run('建立背景旁白工作', async () => { const record = await save(); await request('/api/puxin/tts-jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: id, revision: record.revision }) }); await refreshTtsJobs(); setMessage('旁白已加入背景工作；可以離開此頁，稍後回來查看。'); })}>{activeTtsJob ? '背景旁白進行中' : missingNarrationCount ? '背景生成 ' + missingNarrationCount + ' 段旁白' : '旁白已完成'}</button></div><p className="puxin-help">批次旁白會使用 Google Cloud 計費。目前待生成 {missingNarrationCount} 段、約 {missingNarrationChars} 字；建議先試聽單段確認聲線。背景工作建立後可以關頁，相同文字與設定會沿用快取。</p>{activeTtsJob && <article className="puxin-job"><div><strong>背景旁白 · {activeTtsJob.cursor}／{activeTtsJob.total}</strong><p>{activeTtsJob.status === 'queued' ? '等待處理' : '正在生成'}</p><progress value={activeTtsJob.progress} max={100} /></div></article>}{ttsJobs[0]?.status === 'failed' && <p className="puxin-error">{ttsJobs[0].error || '批次旁白失敗，可再次建立工作重試。'}</p>}<div className="puxin-form-row"><label>固定聲線<select value={document.voice} onChange={e => { setVoicePreviewUrl(''); edit(record => ({ ...record, voice: e.target.value })); }}>{voices.map(voice => <option key={voice}>{voice}</option>)}</select></label><label>旁白語氣<input value={document.voiceStyle} maxLength={800} onChange={e => { setVoicePreviewUrl(''); edit(record => ({ ...record, voiceStyle: e.target.value })); }} /></label></div><div className="puxin-actions"><button className="puxin-button secondary" disabled={!!busy || Boolean(activeTtsJob)} onClick={() => run('生成聲線試聽', async () => { const result = await request('/api/puxin/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: '停一下，讓心慢慢回來。這裡是普新精舍。', voice: document.voice, style: document.voiceStyle }) }); setVoicePreviewUrl(result.audioUrl); setMessage('聲線試聽已準備好；相同設定再次試聽會沿用快取。'); })}>試聽這個聲線</button>{voicePreviewUrl && <audio controls src={voicePreviewUrl} className="puxin-audio" />}</div><div className="puxin-form-row"><label>配樂音量 {Math.round(document.project.bgmVolume * 100)}%<input type="range" min={0} max={0.6} step={0.01} value={document.project.bgmVolume} onChange={e => edit(record => ({ ...record, project: { ...record.project, bgmVolume: Number(e.target.value) } }))} /></label><label className="puxin-button secondary">上傳配樂<input hidden type="file" accept="audio/*" disabled={!!busy} onChange={e => upload(e.target.files?.[0], 'bgm')} /></label>{document.project.bgmUrl && <button onClick={() => edit(record => ({ ...record, project: { ...record.project, bgmUrl: null } }))}>移除配樂</button>}</div><label className="puxin-checkbox"><input type="checkbox" checked={document.project.brand?.enabled || false} onChange={e => edit(record => ({ ...record, project: { ...record.project, brand: { enabled: e.target.checked, closingText: record.project.brand?.closingText || '' } } }))} />疊加原始普新 Logo（原圖已有 Logo 時可關閉）</label><label>結尾文字（最後三秒，留空則不顯示）<textarea rows={2} maxLength={300} value={document.project.brand?.closingText || ''} onChange={e => edit(record => ({ ...record, project: { ...record.project, brand: { enabled: record.project.brand?.enabled || false, closingText: e.target.value } } }))} placeholder="例如：一起練習，讓心安定。\n普新精舍禪修課程｜報名方式" /></label></section>
    <section className="puxin-panel"><h2>匯出紀錄</h2><p className="puxin-help">每次匯出保存當時版本；Drive 上傳失敗時，影片仍可下載。</p>{!jobs.length && <p className="puxin-help">還沒有匯出。完成編輯後，按上方「匯出影片」。</p>}{jobs.map(job => <article className="puxin-job" key={job.id}><div><strong>版本 {job.revision} · {({ queued: '等待匯出', rendering: '正在製作', done: '影片完成', failed: '匯出失敗' })[job.status]}</strong><p>{new Date(job.createdAt).toLocaleString('zh-TW')}</p>{job.status === 'rendering' && <progress value={job.progress} max={100} />}{job.error && <p className="puxin-error">{job.error}</p>}{job.syncError && <p className="puxin-help">{job.syncError}</p>}</div><div className="puxin-actions">{job.videoUrl && <a className="puxin-button secondary" href={job.videoUrl} download={`${document.title}.mp4`}>下載 MP4</a>}{job.driveUrl ? <a className="puxin-button" href={job.driveUrl} target="_blank" rel="noreferrer">開啟 Drive 成果 ↗</a> : job.status === 'done' && <button className="puxin-button secondary" disabled={!!busy} onClick={() => run('上傳成果', async () => { await request(`/api/puxin/jobs/${job.id}/sync`, { method: 'POST' }); await refreshJobs(); })}>上傳到 Drive</button>}</div></article>)}</section>
  </div></main>;
}
