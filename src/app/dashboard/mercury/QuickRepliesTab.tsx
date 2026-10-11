'use client'

import ChatInterface from '@/components/ChatInterface'

export default function QuickRepliesTab() {
  return (
    <ChatInterface
      tab="quick_replies"
      starterMessage="What's the situation? Tell me who it's for, what happened, and which channel (email, LinkedIn, or WhatsApp). I'll draft the reply."
      placeholder="Describe the situation..."
    />
  )
}
