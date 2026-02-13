/**
 * 自动创建 Supabase 表
 * 运行: npx tsx scripts/setup-supabase.ts
 */

import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function setup() {
  console.log("🚀 Setting up Supabase...")
  console.log(`   URL: ${supabaseUrl}`)

  // 测试连接 - 尝试插入一条测试数据
  const testId = `TEST-${Date.now()}`

  const { error: insertError } = await supabase.from("quote_requests").insert({
    id: testId,
    status: "test",
    request: { test: true },
  })

  if (insertError) {
    if (insertError.message.includes("relation") && insertError.message.includes("does not exist")) {
      console.log("")
      console.log("❌ 表还没创建！请按照以下步骤操作：")
      console.log("")
      console.log("1. 打开 Supabase Dashboard:")
      console.log(`   https://supabase.com/dashboard/project/adckkqcqfrrbvdmgznkuc`)
      console.log("")
      console.log("2. 点击左边的 'SQL Editor'")
      console.log("")
      console.log("3. 点击 'New query'")
      console.log("")
      console.log("4. 复制下面的 SQL 并粘贴进去，然后点击 'Run':")
      console.log("")
      console.log("─".repeat(60))
      console.log(`
CREATE TABLE quote_requests (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT DEFAULT 'new',
  request JSONB NOT NULL,
  linked_official_quotation_id TEXT
);

ALTER TABLE quote_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public insert" ON quote_requests
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Allow public select" ON quote_requests
  FOR SELECT TO anon USING (true);

CREATE POLICY "Allow public update" ON quote_requests
  FOR UPDATE TO anon USING (true);

CREATE POLICY "Allow public delete" ON quote_requests
  FOR DELETE TO anon USING (true);
`)
      console.log("─".repeat(60))
      console.log("")
      console.log("5. 创建完后，再次运行这个脚本来验证")
      process.exit(1)
    } else {
      console.error("❌ 插入测试数据失败:", insertError.message)
      process.exit(1)
    }
  }

  // 删除测试数据
  await supabase.from("quote_requests").delete().eq("id", testId)

  console.log("✅ Supabase 设置成功！表已经存在并且可以正常使用。")
  console.log("")
  console.log("现在你可以：")
  console.log("1. 运行 pnpm dev")
  console.log("2. 访问 /quote 填表并提交")
  console.log("3. 在 /portal/quotation/request-for-quotation 看到数据")
}

setup().catch(console.error)
