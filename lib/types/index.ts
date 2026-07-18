// 型定義

export interface ProductData {
  name: string;
  description: string;
  images: string[];
  reviews: Review[];
  category?: string; // 商品カテゴリ（例：化粧水、シャンプーなど）
}

export interface Review {
  text: string;
  rating?: number;
  author?: string;
}

export type TemplateType = 'PAS' | 'FBE' | 'BEFORE_AFTER';

export interface Plot {
  name: string;
  content: string;
  index: number;
  duration?: number;
  imageUrl?: string | null;
  image_url?: string | null; // 後方互換性
  scale?: number;
  position?: { x: number; y: number };
  imageEffect?: string;
  transitionType?: string;
  transitionDuration?: number;
  audioStartTime?: number;
}

export interface Scenario {
  id?: string;
  productId?: string;
  templateType: TemplateType;
  plots: Plot[];
  createdAt?: Date;
}

export interface Video {
  id?: string;
  scenarioId: string;
  videoUrl?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt?: Date;
}

// 動画解像度関連の型定義
//
// These live in src/types.ts, which the Remotion compositions and every
// component already import from. This module used to carry a second, parallel
// definition; the two had already drifted (the 9:16 / 1:1 labels read
// "Vertical" / "Square" here and "縦型" / "正方形" there), so which string a
// user saw depended on which module a given file happened to import. Re-export
// instead of redeclaring so there is exactly one table.
export type {
  VideoResolution,
  VideoAspectRatio,
  ResolutionConfig,
} from '@/src/types';
export { RESOLUTIONS } from '@/src/types';

