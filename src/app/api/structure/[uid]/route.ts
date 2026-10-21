import { createReadStream, existsSync } from 'fs';
import { Readable } from 'stream';
import { domainPdbPath } from '@/lib/data';

/**
 * A pre-cut ECOD domain from the internal af2_pdb store, by ecod_uid. The
 * recommendations were computed on exactly these files (residue order and
 * numbering included), so the viewer must show the same file, not a fresh
 * download of the parent entry or model.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ uid: string }> }) {
  const { uid } = await ctx.params;
  // The value indexes the filesystem: digits only.
  if (!/^\d{1,10}$/.test(uid)) return new Response('not an ecod_uid\n', { status: 400 });
  const file = domainPdbPath(parseInt(uid, 10));
  if (!existsSync(file)) return new Response('structure not found\n', { status: 404 });
  return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream, {
    headers: { 'Content-Type': 'chemical/x-pdb', 'Cache-Control': 'public, max-age=86400' },
  });
}
