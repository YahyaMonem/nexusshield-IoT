import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://mtvbkllefgbcfhutdejg.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im10dmJrbGxlZmdiY2ZodXRkZWpnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzNTUxNTYsImV4cCI6MjA5NDkzMTE1Nn0.WkbObpCoVl-evIZocb2q0QSTPZo17EV6cFun5NXwDf0'
)

async function testNotification() {
  console.log('Sending test alert to Supabase...')
  const { data, error } = await supabase
    .from('tracking_events')
    .insert([
      {
        tracking_id: Math.floor(Math.random() * 1000000),
        object_class: 'person',
        duration_seconds: 15,
        first_seen_at: new Date(Date.now() - 15000).toISOString(),
      }
    ])
    .select()

  if (error) {
    console.error('Error triggering notification:', error)
  } else {
    console.log('Successfully triggered notification!', data)
  }
}

testNotification()
