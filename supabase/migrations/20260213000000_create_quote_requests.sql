-- Create quote_requests table for storing customer quotation requests
CREATE TABLE IF NOT EXISTS quote_requests (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT DEFAULT 'new',
  request JSONB NOT NULL,
  linked_official_quotation_id TEXT
);

-- Enable Row Level Security
ALTER TABLE quote_requests ENABLE ROW LEVEL SECURITY;

-- Allow public access (customers need to submit without login)
CREATE POLICY "Allow public insert" ON quote_requests
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Allow public select" ON quote_requests
  FOR SELECT TO anon USING (true);

CREATE POLICY "Allow public update" ON quote_requests
  FOR UPDATE TO anon USING (true);

CREATE POLICY "Allow public delete" ON quote_requests
  FOR DELETE TO anon USING (true);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_quote_requests_created_at ON quote_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quote_requests_status ON quote_requests(status);
