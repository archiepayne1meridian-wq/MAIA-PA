// Shared "next to the DB file" path resolution — DATABASE_URL is './maia.db'
// locally and '/data/maia.db' on Railway's volume, so deriving a subdirectory
// from it gives the right location in both places with no separate env var
// to keep in sync. First used for ATHENA's podcast audio; reused here for
// LinkedIn hero images and Social slide images.

import path from 'path'
import { env } from './env'

export function dataSubdir(name: string): string {
  return path.join(path.dirname(path.resolve(/* turbopackIgnore: true */ process.cwd(), env.DATABASE_URL())), name)
}
