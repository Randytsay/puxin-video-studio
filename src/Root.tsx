import { debug, info, warn, logError } from '../lib/utils/logger.client';

import React from 'react';
import { Composition, registerRoot } from 'remotion';
import { ProductVideo } from './ProductVideo';
import { ProductVideoProps, RESOLUTIONS, VideoResolution, VideoAspectRatio } from './types';
import { computeTotalFrames } from './timeline';
import type { VideoClip } from './types';

// Remotion's <Composition> is generic over `Props extends Record<string, unknown>`.
// ProductVideoProps technically satisfies that, but JSX inference cannot pin
// both the Schema and Props generics together, so we cast at the boundary
// to the wider record type and re-narrow inside calculateMetadata.
type WideProps = Record<string, unknown>;

// Remotionのバンドルが期待するregisterRoot()を呼び出す
const RemotionRoot: React.FC = () => {
  // 複数の解像度とアスペクト比でコンポジションを登録
  const resolutions: VideoResolution[] = ['720p', '1080p'];
  const aspectRatios: VideoAspectRatio[] = ['16:9', '9:16', '1:1', '3:4'];
  
  return (
    <>
      {resolutions.map((resolution) => {
        return aspectRatios.map((aspectRatio) => {
          const config = RESOLUTIONS[resolution][aspectRatio];
          const compositionId = `ProductVideo-${resolution}-${aspectRatio.replace(':', '-')}`;
          return (
            <Composition
              key={compositionId}
              id={compositionId}
              component={ProductVideo as unknown as React.ComponentType<WideProps>}
              durationInFrames={3000} // デフォルト100秒（30fps）
              fps={30}
              width={config.width}
              height={config.height}
              defaultProps={{
                clips: [] as VideoClip[],
                resolution: resolution,
                aspectRatio: aspectRatio,
                audioEnabled: false, // 音声読み上げは無効化（自動字幕作成機能削除のため）
                subtitles: [],
              } satisfies ProductVideoProps as unknown as WideProps}
              calculateMetadata={({ props }) => {
                const typedProps = props as unknown as ProductVideoProps;
                if (!typedProps.clips || typedProps.clips.length === 0) {
                  return {
                    durationInFrames: 30, // 最低1秒
                  };
                }
                // ProductVideo が <Sequence> を並べるのと同じ関数から導出する。
                // 別々に丸めると合計がずれ、末尾に黒フレームが残っていた。
                const totalFrames = Math.max(30, computeTotalFrames(typedProps.clips)); // 最低1秒
                debug(`Remotion: ${totalFrames}フレーム (${resolution}, ${aspectRatio})`);
                return {
                  durationInFrames: totalFrames,
                };
              }}
            />
          );
        });
      }).flat()}
    </>
  );
};

// registerRoot()を呼び出す（Remotionバンドラーが要求）
registerRoot(RemotionRoot);

export default RemotionRoot;

