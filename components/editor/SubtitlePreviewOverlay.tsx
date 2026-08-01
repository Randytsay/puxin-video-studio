'use client';

// The interactive subtitle overlay drawn on top of the Remotion preview:
// positions the active subtitle, renders it with its own typography, and
// handles select / drag / double-click-to-edit.
//
// Extracted from VideoEditor.tsx, which carried two near-copies of this markup.
// The other copy sat inside the `videoUrl ?` true-branch behind a `!videoUrl`
// guard, so it never rendered — and had silently fallen behind this one
// (missing lineHeight, letterSpacing, textTransform, textShadow and the text
// stroke). Keeping a single implementation is what stops that recurring.

import { useEffect, type RefObject } from 'react';
import type { Subtitle } from '@/src/types';

interface SubtitlePreviewOverlayProps {
  subtitles: Subtitle[];
  currentTime: number;
  previewSize: { width: number; height: number };
  selectedSubtitleId: string | null;
  editingSubtitleText: string | null;
  setEditingSubtitleText: (id: string | null) => void;
  subtitleTextInputRef: RefObject<HTMLInputElement | null>;
  onSubtitleEdit: (id: string, updates: Partial<Subtitle>) => void;
  onSubtitlePreviewDragStart: (e: React.MouseEvent, subtitle: Subtitle) => void;
}

export function SubtitlePreviewOverlay({
  subtitles,
  currentTime,
  previewSize,
  selectedSubtitleId,
  editingSubtitleText,
  setEditingSubtitleText,
  subtitleTextInputRef,
  onSubtitleEdit,
  onSubtitlePreviewDragStart,
}: SubtitlePreviewOverlayProps) {
  // 編集を開始したときに一度だけ全選択する。以前は ref コールバックの中で
  // select() を呼んでいたため、キー入力ごとに再選択されていた。
  useEffect(() => {
    if (!editingSubtitleText) return;
    subtitleTextInputRef.current?.select();
  }, [editingSubtitleText, subtitleTextInputRef]);

  if (!subtitles || subtitles.length === 0) return null;

  return (
    <div
      className={`absolute z-20 ${selectedSubtitleId ? 'pointer-events-auto' : 'pointer-events-none'}`}
      style={{
        width: `${previewSize.width}px`,
        height: `${previewSize.height}px`,
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
      }}
    >
      {(() => {
        const activeSubtitle = subtitles.find(
          (subtitle) => currentTime >= subtitle.startTime && currentTime < subtitle.endTime
        );
        if (!activeSubtitle) return null;

        const isSelected = selectedSubtitleId === activeSubtitle.id;
        const isEditing = editingSubtitleText === activeSubtitle.id;

        // プレビューエリアの実際のサイズを取得（calculatePreviewSizeを使用）
        const previewWidth = previewSize.width;
        const previewHeight = previewSize.height;

        // 位置の計算（パーセンテージベース）
        let positionY: number;
        let positionX: number;

        if (activeSubtitle.positionYPercent !== undefined) {
          // パーセンテージベースの位置指定（上から）
          // 10%の余白を確保（最小10%、最大90%）
          const clampedYPercent = Math.max(10, Math.min(90, activeSubtitle.positionYPercent));
          positionY = (clampedYPercent / 100) * previewHeight;
        } else {
          // 従来のposition指定（後方互換性）
          const position = activeSubtitle.position || 'bottom';
          if (position === 'top') {
            positionY = 0.1 * previewHeight; // 上から10%
          } else if (position === 'center') {
            positionY = 0.5 * previewHeight; // 中央
          } else {
            positionY = 0.9 * previewHeight; // 下から10%（上から90%）
          }
        }

        if (activeSubtitle.positionXPercent !== undefined) {
          // パーセンテージベースの位置指定（左から）
          // 10%の余白を確保（最小10%、最大90%）
          const clampedXPercent = Math.max(10, Math.min(90, activeSubtitle.positionXPercent));
          positionX = (clampedXPercent / 100) * previewWidth;
        } else {
          // 従来のalign指定（後方互換性）
          const align = activeSubtitle.align || 'center';
          if (align === 'left') {
            positionX = 0.1 * previewWidth; // 左から10%
          } else if (align === 'center') {
            positionX = 0.5 * previewWidth; // 中央
          } else {
            positionX = 0.9 * previewWidth; // 右から10%（左から90%）
          }
        }

        // フォントサイズの計算（パーセンテージベース）
        let fontSizePx: number;
        if (activeSubtitle.fontSizePercent !== undefined) {
          // パーセンテージベースのフォントサイズ（プレビュー高さに対する%）
          fontSizePx = (activeSubtitle.fontSizePercent / 100) * previewHeight;
        } else {
          // 従来のfontSize（ピクセル値、後方互換性）
          // 既存データとの互換性のため、fontSizeが100以下の場合はパーセンテージとして扱う
          // 100より大きい場合はピクセル値として扱う
          if (activeSubtitle.fontSize <= 100) {
            fontSizePx = (activeSubtitle.fontSize / 100) * previewHeight;
          } else {
            fontSizePx = activeSubtitle.fontSize;
          }
        }

        // alignの取得（後方互換性のため）
        const align = activeSubtitle.align || 'center';

        return (
          <div
            className="w-full h-full relative"
            style={{
              position: 'relative',
            }}
          >
            <div
              onMouseDown={(e) => onSubtitlePreviewDragStart(e, activeSubtitle)}
              onDoubleClick={(e) => {
                e.stopPropagation();
                if (isSelected) {
                  setEditingSubtitleText(activeSubtitle.id);
                }
              }}
              className={isSelected ? 'cursor-move' : ''}
              style={{
                position: 'absolute',
                top: `${positionY}px`,
                left: `${positionX}px`,
                transform: 'translate(-50%, -50%)', // 中央揃え
                background: (activeSubtitle.backgroundColor && activeSubtitle.backgroundColor.trim() !== '' && activeSubtitle.backgroundColor.toLowerCase() !== 'transparent') 
                  ? activeSubtitle.backgroundColor 
                  : 'transparent',
                backdropFilter: 'none', // 背景色の有無に関わらずブラーなし
                padding: '16px 24px',
                borderRadius: '12px',
                maxWidth: '90%',
                textAlign: align,
                boxShadow: (activeSubtitle.backgroundColor && activeSubtitle.backgroundColor.trim() !== '' && activeSubtitle.backgroundColor.toLowerCase() !== 'transparent') 
                  ? '0 4px 20px rgba(0, 0, 0, 0.5)' 
                  : 'none',
                border: isSelected 
                  ? '2px solid rgba(255, 215, 0, 0.6)' 
                  : (activeSubtitle.backgroundColor && activeSubtitle.backgroundColor.trim() !== '' && activeSubtitle.backgroundColor.toLowerCase() !== 'transparent') 
                  ? '1px solid rgba(255, 255, 255, 0.1)' 
                  : 'none',
                display: 'inline-block',
                outline: isSelected ? '2px solid rgba(255, 215, 0, 0.3)' : 'none',
                outlineOffset: '2px',
              }}
            >
              {isEditing ? (
                <input
                  // ref に focus/select を書かないこと。インライン arrow の ref は
                  // レンダーごとに別の識別子になるため React が毎回付け直し、
                  // 1文字入力するたびに全選択が走って次の文字が既存文字列を
                  // 置き換えていた（"abc" と打つと "c" だけ残る）。
                  // 選択は「編集開始時に一度だけ」で十分なので効果に移す。
                  ref={subtitleTextInputRef}
                  autoFocus
                  type="text"
                  value={activeSubtitle.text}
                  onChange={(e) => onSubtitleEdit(activeSubtitle.id, { text: e.target.value })}
                  onBlur={() => setEditingSubtitleText(null)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      setEditingSubtitleText(null);
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      setEditingSubtitleText(null);
                    }
                  }}
                  style={{
                    color: activeSubtitle.color || '#FFFFFF',
                    fontSize: `${fontSizePx}px`,
                    fontFamily: activeSubtitle.fontFamily || 'system-ui, -apple-system, sans-serif', // 実際の字幕と同じフォント
                    fontWeight: activeSubtitle.fontWeight || 600, // 実際の字幕と同じfontWeight
                    background: 'transparent',
                    border: '2px solid rgba(255, 215, 0, 0.8)',
                    borderRadius: '4px',
                    padding: '4px 8px',
                    width: '100%',
                    minWidth: '200px',
                    outline: 'none',
                    lineHeight: activeSubtitle.lineHeight || 1.4, // 実際の字幕と同じlineHeight
                    letterSpacing: activeSubtitle.letterSpacing || 'normal', // 実際の字幕と同じletterSpacing
                    textTransform: activeSubtitle.textTransform || 'none', // 実際の字幕と同じtextTransform
                    textShadow: activeSubtitle.textShadow !== undefined 
                      ? activeSubtitle.textShadow 
                      : '0 2px 10px rgba(0, 0, 0, 0.8)', // 実際の字幕と同じtextShadow
                    ...(activeSubtitle.borderWidth && activeSubtitle.borderWidth > 0 && activeSubtitle.borderColor ? {
                      WebkitTextStroke: `${activeSubtitle.borderWidth}px ${activeSubtitle.borderColor}`,
                      paintOrder: 'stroke fill',
                    } : {}), // 実際の字幕と同じ文字の縁取り
                  }}
                />
              ) : (
                <p
                  style={{
                    color: activeSubtitle.color || '#FFFFFF',
                    fontSize: `${fontSizePx}px`,
                    fontFamily: activeSubtitle.fontFamily || 'system-ui, -apple-system, sans-serif', // 実際の字幕と同じフォント
                    fontWeight: activeSubtitle.fontWeight || 600, // 実際の字幕と同じfontWeight
                    margin: 0,
                    lineHeight: activeSubtitle.lineHeight || 1.4, // 実際の字幕と同じlineHeight
                    letterSpacing: activeSubtitle.letterSpacing || 'normal', // 実際の字幕と同じletterSpacing
                    textTransform: activeSubtitle.textTransform || 'none', // 実際の字幕と同じtextTransform
                    textShadow: activeSubtitle.textShadow !== undefined 
                      ? activeSubtitle.textShadow 
                      : '0 2px 10px rgba(0, 0, 0, 0.8)', // 実際の字幕と同じtextShadow
                    ...(activeSubtitle.borderWidth && activeSubtitle.borderWidth > 0 && activeSubtitle.borderColor ? {
                      WebkitTextStroke: `${activeSubtitle.borderWidth}px ${activeSubtitle.borderColor}`,
                      paintOrder: 'stroke fill',
                    } : {}), // 実際の字幕と同じ文字の縁取り
                  }}
                >
                  {activeSubtitle.text}
                </p>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
