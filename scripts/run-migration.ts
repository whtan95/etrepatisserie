import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function runMigration() {
  const sqlFile = path.join(__dirname, 'update-role-system.sql')
  const sql = fs.readFileSync(sqlFile, 'utf-8')

  // Split by semicolons and run each statement
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'))

  for (const statement of statements) {
    console.log('Running:', statement.substring(0, 50) + '...')
    const { error } = await supabase.rpc('exec_sql', { sql: statement })
    if (error) {
      console.error('Error:', error.message)
    } else {
      console.log('Success!')
    }
  }
}

runMigration().catch(console.error)
