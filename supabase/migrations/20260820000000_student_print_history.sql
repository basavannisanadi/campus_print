-- ========================================================
-- CAMPUS PRINT — LIFETIME STUDENT PRINT HISTORY MIGRATION
-- Migration: 20260820000000_student_print_history.sql
-- Approved: Lifetime Metadata-Only Ledger & Privacy Policy
-- ========================================================

-- 1. STUDENT PRINT HISTORY TABLE
-- Lightweight metadata-only historical ledger for student accounts.
-- Excludes all file paths, binary storage keys, pre-signed URLs, and memory dumps.
CREATE TABLE IF NOT EXISTS student_print_history (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL,
    job_id TEXT UNIQUE,
    order_token TEXT NOT NULL,
    job_token TEXT,
    student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE RESTRICT,
    shop_name TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_size BIGINT NOT NULL DEFAULT 0,
    page_count INT NOT NULL DEFAULT 1,
    copies INT NOT NULL DEFAULT 1,
    print_mode TEXT NOT NULL DEFAULT 'mono',
    print_type TEXT NOT NULL DEFAULT 'bw',
    sides TEXT NOT NULL DEFAULT 'single',
    paper_size TEXT DEFAULT 'A4',
    page_range TEXT,
    charged_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    status TEXT NOT NULL DEFAULT 'completed',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- 2. HIGH-PERFORMANCE LIFETIME HISTORY INDEXES
-- Composite index for fast student timeline queries (newest first)
CREATE INDEX IF NOT EXISTS idx_student_print_history_student_created 
ON student_print_history(student_id, created_at DESC);

-- Order ID grouping index
CREATE INDEX IF NOT EXISTS idx_student_print_history_order_id 
ON student_print_history(order_id);

-- Shop lookup index
CREATE INDEX IF NOT EXISTS idx_student_print_history_shop_id 
ON student_print_history(shop_id);

-- Job ID uniqueness lookup index
CREATE INDEX IF NOT EXISTS idx_student_print_history_job_id 
ON student_print_history(job_id);

-- 3. ROW-LEVEL SECURITY (RLS) POLICIES
ALTER TABLE student_print_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service Role Full Access On History" ON student_print_history;

CREATE POLICY "Service Role Full Access On History"
ON student_print_history
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- 4. NON-DESTRUCTIVE SAFE HISTORICAL BACKFILL (Idempotent)
-- Safely backfills existing terminal jobs into the lifetime history ledger
INSERT INTO student_print_history (
    id,
    order_id,
    job_id,
    order_token,
    job_token,
    student_id,
    shop_id,
    shop_name,
    file_name,
    file_size,
    page_count,
    copies,
    print_mode,
    print_type,
    sides,
    paper_size,
    page_range,
    charged_amount,
    status,
    created_at,
    completed_at
)
SELECT
    'hist-' || j.id,
    COALESCE(j.order_id, 'order-legacy'),
    j.id,
    COALESCE(o.token, j.token_id, j.token),
    j.token,
    j.student_id,
    j.shop_id,
    COALESCE(s.name, 'Campus Print Center'),
    j.file_name,
    j.file_size,
    j.page_count,
    j.copies,
    j.print_mode,
    j.print_type,
    j.sides,
    'A4',
    j.page_range,
    j.charged_amount,
    j.status,
    j.created_at,
    j.created_at
FROM jobs j
LEFT JOIN orders o ON j.order_id = o.id
LEFT JOIN shops s ON j.shop_id = s.id
WHERE j.student_id IS NOT NULL 
  AND j.student_id != ''
  AND j.status IN ('completed', 'failed')
ON CONFLICT (job_id) DO NOTHING;
