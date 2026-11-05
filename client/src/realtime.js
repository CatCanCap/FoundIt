import { createClient } from '@supabase/supabase-js'

// Supabase Realtime, used ONLY to hear "a new message was saved" in a chat.
// The ping carries no text: when it arrives, fetch the messages through the
// API as usual. Never use this client to read or write tables; every table is
// locked to the browser, and all data goes through the API.
//
// The channel name comes from GET /api/messages/:matchId/channel, which only
// the two people in the match may call.

let client = null

function getClient() {
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  // Without the settings (for example in tests), the chat relies on polling alone
  if (!url || !key) return null
  if (!client) {
    client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  }
  return client
}

// Calls onPing() whenever a message is saved in this chat.
// Returns a function that stops listening; call it when the chat page closes.
export function onNewMessage(channelName, onPing) {
  const supabase = getClient()
  if (!supabase) return () => {}

  const channel = supabase
    .channel(channelName)
    .on('broadcast', { event: 'new-message' }, () => onPing())
    .subscribe()
  return () => {
    supabase.removeChannel(channel)
  }
}
