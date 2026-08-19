import path from 'path'
process.loadEnvFile(path.join(process.cwd(), '.env'))

import { getDb } from '../src/db'
import {
  muse_entries, muse_change_log, muse_links, muse_pending,
  iris_posts, apollo_calls,
} from '../src/db/schema'

async function reset() {
  const db = getDb()

  // MUSE — full wipe
  await db.delete(muse_entries)
  await db.delete(muse_change_log)
  await db.delete(muse_links)
  await db.delete(muse_pending)
  console.log('✅ MUSE wiped')

  // IRIS — wipe posts only, keep voice preferences
  await db.delete(iris_posts)
  console.log('✅ IRIS posts wiped (voice preferences kept)')

  // APOLLO — full wipe
  await db.delete(apollo_calls)
  console.log('✅ APOLLO wiped')

  // DO NOT TOUCH: cassandra, hera, victoria, diana, athena, mercury, maia
  console.log('✅ Reset complete. CASSANDRA, HERA, VICTORIA, DIANA, ATHENA, MERCURY, MAIA untouched.')
}

reset().catch(console.error)
