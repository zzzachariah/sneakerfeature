export { Config, ConfigSchema, validateConfig };

import { z } from 'zod';

// Preserve upstream data identity independently of this local fork's version.
const upstreamPackage = { name: '@imgly/background-removal', version: '1.7.0' };

// Zod 3 allowed +/-Infinity but rejected NaN; keep that existing contract.
const legacyNumber = () => z.union([z.number(), z.literal(Infinity), z.literal(-Infinity)]);
type Progress = (key: string, current: number, total: number, ...extra: unknown[]) => void;
const progressFunction = z.function({
  input: z.tuple([z.string(), legacyNumber(), legacyNumber()]).rest(z.unknown()),
  output: z.void()
});
// Zod 4 function definitions are factories, rather than object-schema members.
// Keep upstream argument and return checks by wrapping the checked callback.
const progressSchema = z.custom<Progress>((value) => typeof value === 'function', {
  error: 'Expected function'
}).transform((callback) => progressFunction.implement(callback));

const ConfigSchema = z
  .object({
    publicPath: z
      .string()
      .optional()
      .describe('The public path to the wasm files and the onnx model.')
      .default(
        'https://staticimgly.com/@imgly/background-removal-data/${PACKAGE_VERSION}/dist/'
      )
      .transform((val) => {
        return val
          .replace('${PACKAGE_NAME}', upstreamPackage.name)
          .replace('${PACKAGE_VERSION}', upstreamPackage.version);
      }),
    debug: z
      .boolean()
      .default(false)
      .describe('Whether to enable debug logging.'),
    rescale: z
      .boolean()
      .default(true)
      .describe('Whether to rescale the image.'),
    device: z
      .enum(['cpu', 'gpu'])
      .default('cpu')
      .describe('The device to run the model on.'),
    proxyToWorker: z
      .boolean()
      .default(false)
      .describe('Whether to proxy inference to a web worker.'),
    fetchArgs: z
      .any()
      .default({})
      .describe('Arguments to pass to fetch when loading the model.'),
    progress: progressSchema
      .describe('Progress callback.')
      .optional(),
    model: z
      .preprocess(
        (val) => {
          switch (val) {
            case 'large':
              return 'isnet';
            case 'small':
              return 'isnet_quint8';
            case 'medium':
              return 'isnet_fp16';
            default:
              return val;
          }
        },
        z.enum(['isnet', 'isnet_fp16', 'isnet_quint8'])
      )
      .prefault('medium'),
    output: z
      .object({
        format: z
          .enum([
            'image/png',
            'image/jpeg',
            'image/webp',
            'image/x-rgba8',
            'image/x-alpha8'
          ])
          .default('image/png'),
        quality: legacyNumber().default(0.8)
      })
      .prefault({})
  })
  .prefault({})
  .transform((config) => {
    if (config.debug) console.log('Config:', config);
    if (config.debug && !config.progress) {
      config.progress =
        config.progress ??
        ((key, current, total) => {
          console.debug(`Downloading ${key}: ${current} of ${total}`);
        });

      if (!crossOriginIsolated) {
        if (config.debug)
          console.debug(
            'Cross-Origin-Isolated is not enabled. Performance will be degraded. Please see  https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer.'
          );
      }
    }

    return config;
  });

type Config = {
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

function validateConfig(configuration?: Config): z.output<typeof ConfigSchema> {
  return ConfigSchema.parse(configuration ?? {});
}
