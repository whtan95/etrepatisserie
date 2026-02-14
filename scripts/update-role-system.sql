-- Update users table role constraint to support admin/manager/staff
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'manager', 'staff'));

-- Create role_settings table for configurable page access
CREATE TABLE IF NOT EXISTS role_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'staff')),
  allowed_pages TEXT[] NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES users(id),
  UNIQUE(role)
);

-- Enable RLS
ALTER TABLE role_settings ENABLE ROW LEVEL SECURITY;

-- Everyone can read role settings
CREATE POLICY "Anyone can read role settings" ON role_settings
  FOR SELECT USING (true);

-- Only admins can update role settings
CREATE POLICY "Admins can update role settings" ON role_settings
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM users WHERE id::text = auth.uid()::text AND role = 'admin')
  );

CREATE POLICY "Admins can insert role settings" ON role_settings
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM users WHERE id::text = auth.uid()::text AND role = 'admin')
  );

-- Insert default role settings (all pages for all roles initially)
INSERT INTO role_settings (role, allowed_pages) VALUES
  ('admin', ARRAY[
    '/portal/status-tracking',
    '/portal/performance-tracking',
    '/portal/sales-order',
    '/portal/ad-hoc',
    '/portal/quotation/webpage-live',
    '/portal/quotation/request-for-quotation',
    '/portal/quotation/official-quotation',
    '/portal/sales-confirmation',
    '/portal/planning',
    '/portal/packing',
    '/portal/procurement',
    '/portal/delivery',
    '/portal/returning',
    '/portal/setting-up',
    '/portal/dismantle',
    '/portal/invoice',
    '/portal/payment',
    '/portal/warnings',
    '/portal/inventory',
    '/portal/settings/users',
    '/portal/settings/roles'
  ]),
  ('manager', ARRAY[
    '/portal/status-tracking',
    '/portal/performance-tracking',
    '/portal/sales-order',
    '/portal/ad-hoc',
    '/portal/quotation/webpage-live',
    '/portal/quotation/request-for-quotation',
    '/portal/quotation/official-quotation',
    '/portal/sales-confirmation',
    '/portal/planning',
    '/portal/packing',
    '/portal/procurement',
    '/portal/delivery',
    '/portal/returning',
    '/portal/setting-up',
    '/portal/dismantle',
    '/portal/invoice',
    '/portal/payment',
    '/portal/warnings',
    '/portal/inventory'
  ]),
  ('staff', ARRAY[
    '/portal/status-tracking',
    '/portal/performance-tracking',
    '/portal/sales-order',
    '/portal/ad-hoc',
    '/portal/quotation/webpage-live',
    '/portal/quotation/request-for-quotation',
    '/portal/quotation/official-quotation',
    '/portal/sales-confirmation',
    '/portal/planning',
    '/portal/packing',
    '/portal/procurement',
    '/portal/delivery',
    '/portal/returning',
    '/portal/setting-up',
    '/portal/dismantle',
    '/portal/invoice',
    '/portal/payment',
    '/portal/warnings',
    '/portal/inventory'
  ])
ON CONFLICT (role) DO NOTHING;
