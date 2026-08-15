-- ========================================================
-- CAMPUS PRINT — 7-DAY RETENTION & AUTOMATED PURGE MIGRATION
-- Migration: 20260816000000_7day_retention_purge.sql
-- Approved: 7-Day Lifecycle & Private Storage Policy
-- ========================================================

-- 1. ENSURE PRIVATE STORAGE BUCKET: print-documents
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'print-documents',
    'print-documents',
    false,
    52428800, -- 50 MB max per file
    ARRAY['application/pdf', 'image/png', 'image/jpeg', 'image/jpg']
)
ON CONFLICT (id) DO UPDATE SET
    public = false,
    file_size_limit = 52428800,
    allowed_mime_types = ARRAY['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'];

-- 2. STORAGE RLS: Deny public access, restrict to backend Service Role (idempotent)
DROP POLICY IF EXISTS "Private Print Documents Access" ON storage.objects;

CREATE POLICY "Private Print Documents Access"
ON storage.objects
FOR ALL
USING (bucket_id = 'print-documents' AND auth.role() = 'service_role')
WITH CHECK (bucket_id = 'print-documents' AND auth.role() = 'service_role');

-- 3. STORED PROCEDURE: purge_expired_records
-- Deletes completed/failed jobs and orders older than retention period (default 7 days).
-- Active jobs ('pending_approval', 'queued', 'printing', 'paused') are IMMUNE.
CREATE OR REPLACE FUNCTION purge_expired_records(p_retention_days INT DEFAULT 7)
RETURNS TABLE (
    purged_jobs_count INT,
    purged_orders_count INT
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_jobs_deleted INT := 0;
    v_orders_deleted INT := 0;
    v_cutoff TIMESTAMPTZ := NOW() - (p_retention_days || ' days')::INTERVAL;
BEGIN
    -- Step 1: Safely delete terminal jobs older than cutoff
    -- Terminal statuses: 'completed', 'failed'
    -- In-flight statuses ('pending_approval', 'queued', 'printing', 'paused') are NEVER deleted
    WITH deleted_jobs AS (
        DELETE FROM jobs
        WHERE created_at < v_cutoff
          AND status IN ('completed', 'failed')
        RETURNING id
    )
    SELECT COUNT(*) INTO v_jobs_deleted FROM deleted_jobs;

    -- Step 2: Safely delete terminal orders older than cutoff with no remaining child jobs
    WITH deleted_orders AS (
        DELETE FROM orders
        WHERE created_at < v_cutoff
          AND status IN ('completed', 'failed')
          AND NOT EXISTS (
              SELECT 1 FROM jobs WHERE jobs.order_id = orders.id
          )
        RETURNING id
    )
    SELECT COUNT(*) INTO v_orders_deleted FROM deleted_orders;

    RETURN QUERY SELECT v_jobs_deleted, v_orders_deleted;
END;
$$;

-- 4. EXPLICIT EXECUTION PRIVILEGES
-- Restrict purge execution exclusively to backend service_role (revoke from public, anon, authenticated)
REVOKE ALL ON FUNCTION purge_expired_records(INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION purge_expired_records(INT) FROM anon;
REVOKE ALL ON FUNCTION purge_expired_records(INT) FROM authenticated;
GRANT EXECUTE ON FUNCTION purge_expired_records(INT) TO service_role;
