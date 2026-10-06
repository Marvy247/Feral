-- FERAL database schema (Supabase / Postgres)
-- Adapted from 02_BACKEND.md:
--   * master_id / user_tag / memo are TEXT holding lowercase hex instead of BYTEA,
--     because supabase-js serializes Node Buffers as JSON, which PostgREST cannot
--     store in bytea columns.
-- Apply with: psql or Supabase SQL editor / `supabase db reset`.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Businesses
CREATE TABLE IF NOT EXISTS businesses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  master_wallet_address TEXT NOT NULL UNIQUE,
  master_id TEXT NOT NULL UNIQUE, -- 4-byte masterId for virtual addresses, hex (8 chars)
  owner_email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  registry_tx_hash TEXT, -- FeralRegistry.registerBusiness() tx hash
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Team members (humans + AI agents)
CREATE TABLE IF NOT EXISTS team_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('human', 'agent')),
  email TEXT, -- null for agents
  wallet_address TEXT NOT NULL, -- the access key's derived address
  access_key_id TEXT NOT NULL, -- hex address derived from the key's public key
  weekly_limit_usdc NUMERIC NOT NULL DEFAULT 500, -- in dollars
  is_active BOOLEAN NOT NULL DEFAULT true,
  provision_tx_hash TEXT, -- tx hash of key authorization
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Per-member approved vendor list
CREATE TABLE IF NOT EXISTS approved_vendors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_member_id UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  vendor_name TEXT NOT NULL,
  vendor_address TEXT NOT NULL, -- the Tempo address of the vendor
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(team_member_id, vendor_address)
);

-- Invoices
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  invoice_number TEXT NOT NULL, -- human-readable: INV-0001
  client_name TEXT NOT NULL,
  amount_usdc NUMERIC NOT NULL, -- in dollars (e.g., 1250.00)
  virtual_address TEXT NOT NULL UNIQUE, -- the unique deposit address
  user_tag TEXT NOT NULL, -- 6-byte tag encoded from invoice id, hex (12 chars)
  memo TEXT, -- optional 32-byte memo, hex
  due_date DATE NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue', 'cancelled')),
  paid_at TIMESTAMPTZ,
  paid_by_address TEXT, -- who paid
  payment_tx_hash TEXT, -- Tempo tx hash of the payment
  on_chain_id TEXT, -- keccak256(invoiceId) if registered in InvoiceVault
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Payroll schedules
CREATE TABLE IF NOT EXISTS payroll_schedules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  label TEXT NOT NULL, -- e.g., "October Payroll"
  total_amount_usdc NUMERIC NOT NULL,
  recipients JSONB NOT NULL, -- [{address, amountUsdc, name}]
  execute_at TIMESTAMPTZ NOT NULL,
  valid_before TIMESTAMPTZ NOT NULL, -- execute_at + 1 hour
  signed_tx_hex TEXT, -- the pre-signed Tempo Transaction hex
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'executed', 'failed', 'cancelled')),
  execution_tx_hash TEXT,
  executed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- All transaction attempts (approved + blocked)
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  team_member_id UUID REFERENCES team_members(id),
  direction TEXT NOT NULL CHECK (direction IN ('outbound', 'inbound')),
  status TEXT NOT NULL CHECK (status IN ('approved', 'blocked', 'pending')),
  amount_usdc NUMERIC NOT NULL,
  token_address TEXT NOT NULL,
  from_address TEXT NOT NULL,
  to_address TEXT NOT NULL,
  vendor_name TEXT, -- resolved from approved_vendors if known
  memo TEXT,
  tempo_tx_hash TEXT, -- null if blocked (never submitted)
  block_number BIGINT,
  block_timestamp TIMESTAMPTZ,
  rejection_reason TEXT, -- for blocked: "CallNotAllowed" | "SpendingLimitExceeded"
  category TEXT DEFAULT 'uncategorized',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Real-time policy events for Policy Radar
CREATE TABLE IF NOT EXISTS policy_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  team_member_id UUID REFERENCES team_members(id),
  member_name TEXT NOT NULL,
  member_type TEXT NOT NULL, -- 'human' | 'agent'
  event_type TEXT NOT NULL CHECK (event_type IN ('APPROVED', 'BLOCKED', 'INVOICE_PAID', 'PAYROLL_EXECUTED')),
  amount_usdc NUMERIC NOT NULL,
  vendor_name TEXT,
  to_address TEXT,
  rejection_reason TEXT,
  tempo_tx_hash TEXT,
  tempo_explorer_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_transactions_business ON transactions(business_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created ON transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_policy_events_business ON policy_events(business_id);
CREATE INDEX IF NOT EXISTS idx_policy_events_created ON policy_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_business ON invoices(business_id);
CREATE INDEX IF NOT EXISTS idx_invoices_virtual_address ON invoices(virtual_address);
CREATE INDEX IF NOT EXISTS idx_team_members_business ON team_members(business_id);
