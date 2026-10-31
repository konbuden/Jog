import { ImportError } from './errors';
import { IMPORT_LIMITS } from './import-limits';
const hex = (bytes: ArrayBuffer) =>
  Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
/** Domain-separated SHA-256 of fixed-size chunk digests: bounded memory, independent of file name. */
export async function fingerprintFile(
  file: Blob & { name: string },
  cancelled: () => boolean = () => false,
  progress: (percent: number) => void = () => {},
) {
  if (!/\.(zip|xml)$/i.test(file.name))
    throw new ImportError('ZIPまたはXMLファイルを選択してください。');
  if (!file.size) throw new ImportError('ファイルが空です。');
  if (file.size > IMPORT_LIMITS.fileBytes)
    throw new ImportError('ZIP・XMLは200 MBまで対応しています。');
  const hashes: string[] = [];
  for (let offset = 0; offset < file.size; offset += 1_048_576) {
    if (cancelled()) throw new ImportError('取り込みをキャンセルしました。');
    const end = Math.min(offset + 1_048_576, file.size),
      chunk = await file.slice(offset, end).arrayBuffer();
    hashes.push(hex(await crypto.subtle.digest('SHA-256', chunk)));
    progress(Math.round((end / file.size) * 100));
  }
  if (cancelled()) throw new ImportError('取り込みをキャンセルしました。');
  return hex(
    await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(
        JSON.stringify(['mrc-file-sha256-chunks-v1', 1_048_576, file.size, hashes]),
      ),
    ),
  );
}
