#!/usr/bin/env node
/**
 * Push database migrations to Supabase using the Management API
 * Usage: node scripts/db-push.js
 */

const fs = require("fs")
const path = require("path")

// Load .env.local
const envPath = path.join(__dirname, "..", ".env.local")
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf8")
  envContent.split("\n").forEach((line) => {
    const match = line.match(/^([^#=]+)=(.*)$/)
    if (match) {
      const key = match[1].trim()
      const value = match[2].trim()
      if (!process.env[key]) {
        process.env[key] = value
      }
    }
  })
}

// Extract project ref from SUPABASE_URL if available
function getProjectRef() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (url) {
    const match = url.match(/https:\/\/([^.]+)\.supabase\.co/)
    if (match) return match[1]
  }
  return "adckkcqfrrbvdmgznkuc"
}

const PROJECT_REF = getProjectRef()
const MIGRATIONS_DIR = path.join(__dirname, "..", "supabase", "migrations")

async function main() {
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN

  if (!accessToken) {
    console.error("❌ SUPABASE_ACCESS_TOKEN not found in environment")
    console.error("   Add it to .env.local or set it as an environment variable")
    process.exit(1)
  }

  console.log(`Project ref: ${PROJECT_REF}`)
  console.log(`Access token: ${accessToken.slice(0, 10)}...`)
  console.log("")

  // First, verify we can access the project
  try {
    const projectRes = await fetch(
      `https://api.supabase.com/v1/projects/${PROJECT_REF}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    )
    if (!projectRes.ok) {
      const text = await projectRes.text()
      console.error(`❌ Cannot access project ${PROJECT_REF}:`)
      console.error(`   Status: ${projectRes.status}`)
      console.error(`   Response: ${text}`)

      // List available projects
      console.log("\nListing available projects...")
      const listRes = await fetch("https://api.supabase.com/v1/projects", {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (listRes.ok) {
        const projects = await listRes.json()
        console.log("Available projects:")
        projects.forEach((p) => console.log(`  - ${p.id}: ${p.name}`))
      }
      process.exit(1)
    }
    const project = await projectRes.json()
    console.log(`✅ Connected to project: ${project.name}`)
    console.log("")
  } catch (err) {
    console.error("❌ Failed to verify project access:", err.message)
    process.exit(1)
  }

  // Read all migration files
  const migrationFiles = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()

  if (migrationFiles.length === 0) {
    console.log("No migration files found in", MIGRATIONS_DIR)
    process.exit(0)
  }

  console.log(`Found ${migrationFiles.length} migration(s):`)
  migrationFiles.forEach((f) => console.log(`  - ${f}`))
  console.log("")

  for (const file of migrationFiles) {
    const filePath = path.join(MIGRATIONS_DIR, file)
    const sql = fs.readFileSync(filePath, "utf8")

    console.log(`Executing ${file}...`)

    try {
      const res = await fetch(
        `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ query: sql }),
        }
      )

      if (!res.ok) {
        const errorText = await res.text()
        console.error(`❌ Failed to execute ${file}:`)
        console.error(`   Status: ${res.status}`)
        console.error(`   Response: ${errorText}`)
        process.exit(1)
      }

      const result = await res.json()
      console.log(`✅ ${file} executed successfully`)

      // Check for any errors in the result
      if (result.error) {
        console.warn(`   Warning: ${result.error}`)
      }
    } catch (err) {
      console.error(`❌ Error executing ${file}:`, err.message)
      process.exit(1)
    }
  }

  console.log("")
  console.log("✅ All migrations executed successfully!")
}

main()
