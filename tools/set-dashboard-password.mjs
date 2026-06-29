// Run from project root: node tools/set-dashboard-password.mjs
// Prompts for your password (hidden), generates the bcrypt hash,
// and writes it directly into .env — no copy-paste needed.

import bcrypt from 'bcryptjs'
import fs from 'fs'
import readline from 'readline'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })

process.stdout.write('New dashboard password: ')
process.stdin.setRawMode(true)
process.stdin.resume()
process.stdin.setEncoding('utf8')

let password = ''
process.stdin.on('data', async (ch) => {
  if (ch === '\r' || ch === '\n') {
    process.stdin.setRawMode(false)
    process.stdin.pause()
    rl.close()
    process.stdout.write('\n')

    if (!password) {
      console.error('Error: password cannot be empty.')
      process.exit(1)
    }

    const hash = await bcrypt.hash(password, 12)

    const envPath = join(__dirname, '..', '.env')
    let env = fs.readFileSync(envPath, 'utf8')

    if (/^DASHBOARD_PASSWORD_HASH=.*$/m.test(env)) {
      env = env.replace(/^DASHBOARD_PASSWORD_HASH=.*$/m, `DASHBOARD_PASSWORD_HASH=${hash}`)
    } else {
      env += `\nDASHBOARD_PASSWORD_HASH=${hash}\n`
    }

    fs.writeFileSync(envPath, env, 'utf8')
    console.log(`Generated hash (${hash.length} chars): ${hash}`)

    // Read back and confirm what actually landed in .env
    const written = fs.readFileSync(envPath, 'utf8')
    const line = written.split('\n').find(l => l.startsWith('DASHBOARD_PASSWORD_HASH=')) ?? '(not found)'
    console.log(`In .env: ${line}`)
    console.log('Restart the dev server to pick it up.')
  } else if (ch === '') {
    process.exit()
  } else if (ch === '') {
    password = password.slice(0, -1)
  } else {
    password += ch
  }
})
