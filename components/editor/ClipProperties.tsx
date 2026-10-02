'use client';

// Properties panel for a single clip: image swap, duration, animation,
// transition, scale/position, scene name, subtitle text. Pure presentational —
// all state is owned by the parent VideoEditor and threaded through onUpdate.

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { VideoClip, TransitionType } from '@/src/types';
import { MediaUploadButton } from './MediaUploadButton';

export interface ClipPropertiesProps {
  clip: VideoClip;
  onUpdate: (updates: Partial<VideoClip>) => void;
}

export function ClipProperties({ clip, onUpdate }: ClipPropertiesProps) {
  const t = useTranslations('editor');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMessage, setAiMessage] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiConfirmOpen, setAiConfirmOpen] = useState(false);
  const mediaPath = clip.imageUrl?.split('?')[0].toLowerCase() || '';
  const isVideo = ['.mp4', '.mov', '.m4v', '.webm', '.ogv'].some((suffix) => mediaPath.endsWith(suffix));
  const isPuxinImage = Boolean(clip.imageUrl?.startsWith('/uploads/image/puxin/')) && !isVideo;
  const veoDuration = !Number.isFinite(clip.duration) || clip.duration <= 4 ? 4 : clip.duration <= 6 ? 6 : 8;

  async function animateScene() {
    if (!clip.imageUrl || !isPuxinImage || aiBusy) return;
    setAiBusy(true);
    setAiError(null);
    setAiMessage('正在建立 AI 動態化工作…');
    try {
      const submit = await fetch('/api/puxin/veo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrl: clip.imageUrl,
          clipDuration: clip.duration,
          durationSeconds: veoDuration,
          storyContext: clip.text,
          prompt: aiPrompt.trim() || undefined,
        }),
      });
      const submitted = (await submit.json()) as { operationName?: string; error?: string };
      if (!submit.ok || !submitted.operationName) {
        throw new Error(submitted.error || 'AI 動態化工作建立失敗');
      }
      setAiMessage(`Veo 正在生成 ${veoDuration} 秒直式影片…`);
      for (let attempt = 0; attempt < 120; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 5000));
        const status = await fetch(`/api/puxin/veo?operationName=${encodeURIComponent(submitted.operationName)}`);
        const result = (await status.json()) as { done?: boolean; videoUrl?: string; error?: string };
        if (!status.ok) throw new Error(result.error || 'AI 動態化狀態查詢失敗');
        if (!result.done) continue;
        if (result.error) throw new Error(result.error);
        if (!result.videoUrl) throw new Error('AI 動態化已完成，但沒有取得影片');
        onUpdate({ imageUrl: result.videoUrl, imageEffect: 'none', sceneLayout: 'cover' });
        setAiMessage('AI 動態化完成，已自動替換這個 Scene。');
        return;
      }
      throw new Error('AI 動態化超過 10 分鐘，請稍後再試');
    } catch (error) {
      setAiError(error instanceof Error ? error.message : String(error));
      setAiMessage(null);
    } finally {
      setAiBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* 画像アップロード */}
      <div>
        <label className="block text-sm font-semibold text-gray-300 mb-2">{t('clipProperties.imageLabel')}</label>
        {clip.imageUrl ? (
          <div className="relative">
            {isVideo ? (
              <video
                src={clip.imageUrl}
                muted
                loop
                autoPlay
                playsInline
                className="w-full h-32 object-cover rounded-xl border border-[rgba(255,255,255,0.2)]"
              />
            ) : (
              <img
                src={clip.imageUrl}
                alt={clip.plotName}
                className="w-full h-32 object-cover rounded-xl border border-[rgba(255,255,255,0.2)]"
              />
            )}
            <button
              onClick={() => onUpdate({ imageUrl: null })}
              className="absolute top-2 right-2 p-2 bg-red-500/80 hover:bg-red-500 rounded-lg text-white text-xs"
            >
              {t('clipProperties.removeImage')}
            </button>
          </div>
        ) : (
          <MediaUploadButton onUpload={(url) => onUpdate({ imageUrl: url })} />
        )}
      </div>

      {isPuxinImage && (
        <button
          type="button"
          onClick={() => setAiConfirmOpen(true)}
          className="w-full rounded-xl bg-indigo-500 px-4 py-3 text-sm font-semibold text-white"
        >
          AI 動態化
        </button>
      )}

      {isPuxinImage && aiConfirmOpen && (
        <div className="rounded-xl border border-indigo-400/20 bg-indigo-500/10 p-4">
          <div className="text-sm font-semibold text-indigo-100">確認使用 Veo 3.1 Fast</div>
          <div className="mt-1 text-xs leading-5 text-indigo-200/70">
            將建立 9:16、720p、{veoDuration} 秒的 AI 動態影片。原本的旁白與 Scene 時長會保留。
          </div>
          <textarea
            value={aiPrompt}
            onChange={(event) => setAiPrompt(event.target.value)}
            rows={3}
            maxLength={800}
            disabled={aiBusy}
            placeholder="可選：補充想要的動作；留空會使用禪意慢推鏡、微風與柔光。"
            className="mt-3 w-full resize-none rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-white placeholder:text-gray-500 focus:border-indigo-400 focus:outline-none disabled:opacity-50"
          />
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={aiBusy}
              onClick={animateScene}
              className="rounded-lg bg-indigo-500 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              {aiBusy ? '生成中…' : '確認生成'}
            </button>
            <button
              type="button"
              disabled={aiBusy}
              onClick={() => setAiConfirmOpen(false)}
              className="rounded-lg border border-white/10 px-3 py-2 text-xs text-gray-300 disabled:opacity-50"
            >
              取消
            </button>
          </div>
        </div>
      )}
      {aiMessage && <div className="text-xs text-emerald-300">{aiMessage}</div>}
      {aiError && <div className="text-xs leading-5 text-red-300">{aiError}</div>}

      <div>
        <label className="block text-sm font-semibold text-gray-300 mb-2">{t('clipProperties.durationLabel')}</label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min="0.1"
            max="60"
            step="0.1"
            value={clip.duration}
            onChange={(e) => onUpdate({ duration: parseFloat(e.target.value) || 3 })}
            className="flex-1 px-4 py-3 bg-[rgba(255,255,255,0.1)] border border-[rgba(255,255,255,0.2)] rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
          <div className="flex flex-col gap-1">
            <button
              onClick={() => onUpdate({ duration: Math.min(60, (clip.duration || 3) + 0.5) })}
              className="px-3 py-1 bg-[rgba(255,255,255,0.1)] hover:bg-[rgba(255,255,255,0.2)] rounded-lg text-sm transition-colors"
              title={t('clipProperties.extend05Tooltip')}
            >
              +0.5
            </button>
            <button
              onClick={() => onUpdate({ duration: Math.max(0.1, (clip.duration || 3) - 0.5) })}
              className="px-3 py-1 bg-[rgba(255,255,255,0.1)] hover:bg-[rgba(255,255,255,0.2)] rounded-lg text-sm transition-colors"
              title={t('clipProperties.shrink05Tooltip')}
            >
              -0.5
            </button>
          </div>
        </div>
        <div className="text-xs text-gray-500 mt-1">
          {t('clipProperties.currentDurationSeconds', { value: clip.duration?.toFixed(1) || '3.0' })}
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold text-gray-300 mb-2">{t('clipProperties.animationLabel')}</label>
        <select
          value={clip.imageEffect || 'none'}
          onChange={(e) => onUpdate({ imageEffect: e.target.value as 'none' | 'kenBurns' | 'zoom' | 'pan' | 'zoomOut' | 'pulse' })}
          className="w-full px-4 py-3 bg-[rgba(255,255,255,0.1)] border border-[rgba(255,255,255,0.2)] rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        >
          <option value="none">{t('clipProperties.animationNone')}</option>
          <option value="zoom">{t('clipProperties.animationZoomIn')}</option>
          <option value="zoomOut">{t('clipProperties.animationZoomOut')}</option>
          <option value="kenBurns">{t('clipProperties.animationKenBurns')}</option>
          <option value="pan">{t('clipProperties.animationPan')}</option>
          <option value="pulse">{t('clipProperties.animationPulse')}</option>
        </select>
        <div className="text-xs text-gray-500 mt-1">{t('clipProperties.animationHelp')}</div>
      </div>

      {/* トランジション設定 */}
      <div>
        <label className="block text-sm font-semibold text-gray-300 mb-2">{t('clipProperties.transitionLabel')}</label>
        <select
          value={clip.transitionType || 'none'}
          onChange={(e) => onUpdate({ transitionType: e.target.value as TransitionType })}
          className="w-full px-4 py-3 bg-[rgba(255,255,255,0.1)] border border-[rgba(255,255,255,0.2)] rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        >
          <option value="none">{t('clipProperties.transitionNone')}</option>
          <option value="fade">{t('clipProperties.transitionFade')}</option>
          <option value="crossfade">{t('clipProperties.transitionCrossfade')}</option>
          <option value="slideLeft">{t('clipProperties.transitionSlideLeft')}</option>
          <option value="slideRight">{t('clipProperties.transitionSlideRight')}</option>
          <option value="slideUp">{t('clipProperties.transitionSlideUp')}</option>
          <option value="slideDown">{t('clipProperties.transitionSlideDown')}</option>
          <option value="wipeLeft">{t('clipProperties.transitionWipeLeft')}</option>
          <option value="wipeRight">{t('clipProperties.transitionWipeRight')}</option>
          <option value="zoomIn">{t('clipProperties.transitionZoomIn')}</option>
          <option value="zoomOut">{t('clipProperties.transitionZoomOut')}</option>
        </select>
        <div className="text-xs text-gray-500 mt-1">{t('clipProperties.transitionHelp')}</div>
      </div>

      {/* トランジションの長さ */}
      {clip.transitionType && clip.transitionType !== 'none' && (
        <div>
          <label className="block text-sm font-semibold text-gray-300 mb-2">{t('clipProperties.transitionDurationLabel')}</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="0.1"
              max="3"
              step="0.1"
              value={clip.transitionDuration || 0.5}
              onChange={(e) => onUpdate({ transitionDuration: parseFloat(e.target.value) || 0.5 })}
              className="flex-1 px-4 py-3 bg-[rgba(255,255,255,0.1)] border border-[rgba(255,255,255,0.2)] rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            <div className="flex flex-col gap-1">
              <button
                onClick={() => onUpdate({ transitionDuration: Math.min(3, (clip.transitionDuration || 0.5) + 0.1) })}
                className="px-3 py-1 bg-[rgba(255,255,255,0.1)] hover:bg-[rgba(255,255,255,0.2)] rounded-lg text-sm transition-colors"
                title={t('clipProperties.extend01Tooltip')}
              >
                +0.1
              </button>
              <button
                onClick={() => onUpdate({ transitionDuration: Math.max(0.1, (clip.transitionDuration || 0.5) - 0.1) })}
                className="px-3 py-1 bg-[rgba(255,255,255,0.1)] hover:bg-[rgba(255,255,255,0.2)] rounded-lg text-sm transition-colors"
                title={t('clipProperties.shrink01Tooltip')}
              >
                -0.1
              </button>
            </div>
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {t('clipProperties.currentDurationSeconds', { value: (clip.transitionDuration || 0.5).toFixed(1) })}
          </div>
        </div>
      )}

      {/* サイズ（スケール） */}
      <div>
        <label className="block text-sm font-semibold text-gray-300 mb-2">{t('clipProperties.scaleLabel')}</label>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <input
              type="range"
              min="10"
              max="300"
              step="5"
              value={(clip.scale || 1.0) * 100}
              onChange={(e) => onUpdate({ scale: parseFloat(e.target.value) / 100 })}
              className="flex-1 h-2 bg-[rgba(255,255,255,0.1)] rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-indigo-500 [&::-webkit-slider-thumb]:cursor-pointer"
            />
            <input
              type="number"
              min="10"
              max="300"
              step="5"
              value={Math.round((clip.scale || 1.0) * 100)}
              onChange={(e) => onUpdate({ scale: Math.max(0.1, Math.min(3.0, parseFloat(e.target.value) / 100)) || 1.0 })}
              className="w-20 px-3 py-2 bg-[rgba(255,255,255,0.1)] border border-[rgba(255,255,255,0.2)] rounded-lg text-white text-center focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <span className="text-gray-400 text-sm">%</span>
          </div>
          <div className="flex gap-2">
            <button onClick={() => onUpdate({ scale: 1.0 })} className="px-3 py-1.5 bg-[rgba(255,255,255,0.1)] hover:bg-[rgba(255,255,255,0.15)] rounded-lg text-xs transition-colors">
              {t('clipProperties.resetScale')}
            </button>
            <button onClick={() => onUpdate({ scale: 0.5 })} className="px-3 py-1.5 bg-[rgba(255,255,255,0.1)] hover:bg-[rgba(255,255,255,0.15)] rounded-lg text-xs transition-colors">50%</button>
            <button onClick={() => onUpdate({ scale: 1.5 })} className="px-3 py-1.5 bg-[rgba(255,255,255,0.1)] hover:bg-[rgba(255,255,255,0.15)] rounded-lg text-xs transition-colors">150%</button>
            <button onClick={() => onUpdate({ scale: 2.0 })} className="px-3 py-1.5 bg-[rgba(255,255,255,0.1)] hover:bg-[rgba(255,255,255,0.15)] rounded-lg text-xs transition-colors">200%</button>
          </div>
        </div>
      </div>

      {/* 位置（座標） */}
      <div>
        <label className="block text-sm font-semibold text-gray-300 mb-2">{t('clipProperties.positionLabel')}</label>
        <div className="space-y-3">
          {/* X座標 */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <label className="text-xs text-gray-400 w-8">X:</label>
              <input
                type="range"
                min="-100"
                max="100"
                step="1"
                value={clip.position?.x || 0}
                onChange={(e) => onUpdate({ position: { x: parseFloat(e.target.value), y: clip.position?.y || 0 } })}
                className="flex-1 h-2 bg-[rgba(255,255,255,0.1)] rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-purple-500 [&::-webkit-slider-thumb]:cursor-pointer"
              />
              <input
                type="number"
                min="-100"
                max="100"
                step="1"
                value={clip.position?.x || 0}
                onChange={(e) => onUpdate({ position: { x: Math.max(-100, Math.min(100, parseFloat(e.target.value) || 0)), y: clip.position?.y || 0 } })}
                className="w-20 px-3 py-2 bg-[rgba(255,255,255,0.1)] border border-[rgba(255,255,255,0.2)] rounded-lg text-white text-center focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              <span className="text-gray-400 text-sm">%</span>
            </div>
          </div>

          {/* Y座標 */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <label className="text-xs text-gray-400 w-8">Y:</label>
              <input
                type="range"
                min="-100"
                max="100"
                step="1"
                value={clip.position?.y || 0}
                onChange={(e) => onUpdate({ position: { x: clip.position?.x || 0, y: parseFloat(e.target.value) } })}
                className="flex-1 h-2 bg-[rgba(255,255,255,0.1)] rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-purple-500 [&::-webkit-slider-thumb]:cursor-pointer"
              />
              <input
                type="number"
                min="-100"
                max="100"
                step="1"
                value={clip.position?.y || 0}
                onChange={(e) => onUpdate({ position: { x: clip.position?.x || 0, y: Math.max(-100, Math.min(100, parseFloat(e.target.value) || 0)) } })}
                className="w-20 px-3 py-2 bg-[rgba(255,255,255,0.1)] border border-[rgba(255,255,255,0.2)] rounded-lg text-white text-center focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              <span className="text-gray-400 text-sm">%</span>
            </div>
          </div>

          <div className="flex gap-2">
            <button onClick={() => onUpdate({ position: { x: 0, y: 0 } })} className="px-3 py-1.5 bg-[rgba(255,255,255,0.1)] hover:bg-[rgba(255,255,255,0.15)] rounded-lg text-xs transition-colors">
              {t('clipProperties.positionCenter')}
            </button>
            <button onClick={() => onUpdate({ position: { x: -25, y: 0 } })} className="px-3 py-1.5 bg-[rgba(255,255,255,0.1)] hover:bg-[rgba(255,255,255,0.15)] rounded-lg text-xs transition-colors">
              {t('clipProperties.positionLeft')}
            </button>
            <button onClick={() => onUpdate({ position: { x: 25, y: 0 } })} className="px-3 py-1.5 bg-[rgba(255,255,255,0.1)] hover:bg-[rgba(255,255,255,0.15)] rounded-lg text-xs transition-colors">
              {t('clipProperties.positionRight')}
            </button>
            <button onClick={() => onUpdate({ position: { x: 0, y: -25 } })} className="px-3 py-1.5 bg-[rgba(255,255,255,0.1)] hover:bg-[rgba(255,255,255,0.15)] rounded-lg text-xs transition-colors">
              {t('clipProperties.positionUp')}
            </button>
            <button onClick={() => onUpdate({ position: { x: 0, y: 25 } })} className="px-3 py-1.5 bg-[rgba(255,255,255,0.1)] hover:bg-[rgba(255,255,255,0.15)] rounded-lg text-xs transition-colors">
              {t('clipProperties.positionDown')}
            </button>
          </div>
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold text-gray-300 mb-2">{t('clipProperties.sceneNameLabel')}</label>
        <input
          type="text"
          value={clip.plotName}
          onChange={(e) => onUpdate({ plotName: e.target.value })}
          className="w-full px-4 py-3 bg-[rgba(255,255,255,0.1)] border border-[rgba(255,255,255,0.2)] rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          placeholder={t('clipProperties.sceneNamePlaceholder')}
        />
      </div>

      <div>
        <label className="block text-sm font-semibold text-gray-300 mb-2">{t('clipProperties.subtitleTextLabel')}</label>
        <textarea
          value={clip.text}
          onChange={(e) => onUpdate({ text: e.target.value })}
          rows={4}
          maxLength={50}
          className="w-full px-4 py-3 bg-[rgba(255,255,255,0.1)] border border-[rgba(255,255,255,0.2)] rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
          placeholder={t('clipProperties.subtitleTextPlaceholder')}
        />
        <div className="text-xs text-gray-500 mt-1 text-right">
          {t('clipProperties.subtitleCharCount', { count: clip.text.length })}
        </div>
      </div>
    </div>
  );
}
