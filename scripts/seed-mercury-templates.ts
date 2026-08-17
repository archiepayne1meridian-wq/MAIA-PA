// Seeds MERCURY's 5 template-library rows.
// Idempotent — re-running skips any template whose name already exists.
//
// Run: npx tsx --env-file=.env scripts/seed-mercury-templates.ts

import { getDb } from '../src/db'
import { mercury_templates } from '../src/db/schema'
import { eq } from 'drizzle-orm'

interface TemplateSeed {
  name: string
  category: 'booking' | 'reminder' | 'follow_up' | 'thank_you' | 'general'
  medium: 'email' | 'whatsapp' | 'imessage'
  description: string
  system_prompt_addition: string
}

const TEMPLATES: TemplateSeed[] = [
  {
    name: 'Post-Call Booking Confirmation',
    category: 'booking',
    medium: 'email',
    description: 'Sent immediately after booking a meeting on the phone — warm, references the call, confirms details.',
    system_prompt_addition: `This is a post-call booking confirmation email. The prospect just agreed
to a meeting on the phone. Tone: warm, friendly but professional.
Reference something specific they mentioned on the call — make it feel
personal, not templated. Confirm the meeting details clearly.
Never give financial advice. Never quote fees. Never promise returns.
Sign off as Archie — no signature block needed, it's added automatically.
Maximum 3 short paragraphs.`,
  },
  {
    name: 'Meeting Reminder',
    category: 'reminder',
    medium: 'email',
    description: 'Sent 24-48 hours before the meeting — light, friendly, confident they’re coming.',
    system_prompt_addition: `This is a meeting reminder sent 24-48 hours before the appointment.
Keep it short — 2 paragraphs maximum for email, 2-3 sentences for WhatsApp.
Assume they're coming — confident, not chasing. Reference the meeting topic
briefly. Include any logistics if provided. Warm and forward-looking tone.`,
  },
  {
    name: 'Pre-Meeting Follow-Up',
    category: 'follow_up',
    medium: 'email',
    description: 'A gentle nudge when a prospect has gone quiet before the meeting — casual, no pressure.',
    system_prompt_addition: `This is a gentle pre-meeting follow-up. The prospect has gone quiet.
Keep it very short — 1 paragraph email, 1-2 sentences WhatsApp.
Casual and easy. One simple question. Never sound desperate.
Make it easy for them to confirm with a one-word reply.`,
  },
  {
    name: 'Post-Meeting Thank You',
    category: 'thank_you',
    medium: 'email',
    description: 'Sent by Archie after the meeting has taken place — warm courtesy note, not a follow-up pitch.',
    system_prompt_addition: `This is a post-meeting thank you from Archie (who booked the meeting,
not the adviser who ran it). Warm and genuine. Short — maximum 2 paragraphs.
Reference the meeting positively without pre-empting what was discussed
or what the adviser might recommend. Next steps belong to the adviser.`,
  },
  {
    name: 'General Follow-Up',
    category: 'general',
    medium: 'email',
    description: 'Any other touchpoint — checking in, keeping warm, re-engaging. Natural, not salesy.',
    system_prompt_addition: `This is a general follow-up to keep a warm connection. Natural and personal —
find a relevant hook from the context Archie provides (news event, something
the prospect mentioned, a relevant regulation change). One observation,
one question. Never a pitch. Sounds like a person, not a CRM sequence.`,
  },
]

async function main() {
  const db = getDb()
  let inserted = 0
  let skipped = 0

  for (const t of TEMPLATES) {
    const existing = await db
      .select({ id: mercury_templates.id })
      .from(mercury_templates)
      .where(eq(mercury_templates.name, t.name))
      .limit(1)

    if (existing.length > 0) {
      skipped++
      continue
    }

    await db.insert(mercury_templates).values({
      id: crypto.randomUUID(),
      name: t.name,
      category: t.category,
      medium: t.medium,
      description: t.description,
      system_prompt_addition: t.system_prompt_addition,
    })
    inserted++
  }

  console.log(`MERCURY templates seeded: ${inserted} inserted, ${skipped} already present.`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
