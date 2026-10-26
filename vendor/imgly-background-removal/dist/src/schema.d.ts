import type { z } from 'zod';
export type Progress = (key: string, current: number, total: number, ...extra: unknown[]) => void;
export type Config = {
  publicPath?: string;
  debug?: boolean;
  rescale?: boolean;
  device?: 'cpu' | 'gpu';
  proxyToWorker?: boolean;
  fetchArgs?: any;
  progress?: Progress;
  model?: 'isnet' | 'isnet_fp16' | 'isnet_quint8' | 'large' | 'medium' | 'small';
  output?: {
    format?: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/x-rgba8' | 'image/x-alpha8';
    quality?: number;
  };
};
export type ResolvedConfig = Required<Omit<Config, 'progress' | 'model' | 'output'>> & {
  progress?: Progress;
  model: 'isnet' | 'isnet_fp16' | 'isnet_quint8';
  output: Required<NonNullable<Config['output']>>;
};
export declare const ConfigSchema: z.ZodType<ResolvedConfig, Config | undefined>;
export declare function validateConfig(configuration?: Config): ResolvedConfig;
