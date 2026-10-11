'use client'

import ChatInterface from '@/components/ChatInterface'

export default function LinkedInMessagesTab() {
  return (
    <ChatInterface
      tab="linkedin_messages"
      starterMessage="Tell me about the person you want to message — their name, role, company, and any relevant context. I'll draft the LinkedIn message for you."
      placeholder="Name, role, company, notes..."
    />
  )
}
