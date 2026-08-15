-- ========================================================
-- CAMPUS PRINT — INITIAL POSTGRESQL SCHEMA & ATOMIC CLAIM
-- Migration: 20260815000000_campus_print_initial_schema.sql
-- Approved: M0 Review with Strict Anti-Cascade & Shop-Locking
-- ========================================================

-- Enable UUID extension if needed
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. SHOPS TABLE
CREATE TABLE IF NOT EXISTS shops (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    owner_name TEXT NOT NULL DEFAULT 'TJohn Staff',
    phone_number TEXT NOT NULL DEFAULT '9876543210',
    address TEXT NOT NULL DEFAULT '',
    maintenance_mode BOOLEAN NOT NULL DEFAULT FALSE,
    bw_price NUMERIC(10, 2) NOT NULL DEFAULT 2.00,
    color_price NUMERIC(10, 2) NOT NULL DEFAULT 5.00,
    duplex_price NUMERIC(10, 2) NOT NULL DEFAULT 3.00,
    active_printer_id TEXT,
    bw_printer_id TEXT,
    bw_printer_name TEXT,
    color_printer_id TEXT,
    color_printer_name TEXT,
    bw_maintenance_mode BOOLEAN DEFAULT FALSE,
    color_maintenance_mode BOOLEAN DEFAULT FALSE,
    bw_status_mode TEXT DEFAULT 'auto',
    color_status_mode TEXT DEFAULT 'auto',
    bw_expected_return_time TEXT,
    color_expected_return_time TEXT,
    admin_username TEXT NOT NULL DEFAULT 'admin',
    admin_password_hash TEXT NOT NULL,
    operational_state TEXT DEFAULT 'offline',
    agent_installed BOOLEAN DEFAULT FALSE,
    printer_status TEXT DEFAULT 'offline',
    last_heartbeat TIMESTAMPTZ,
    settings JSONB DEFAULT '{}'::jsonb
);

-- 2. STUDENTS TABLE
CREATE TABLE IF NOT EXISTS students (
    id TEXT PRIMARY KEY,
    google_id TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    picture TEXT,
    role TEXT NOT NULL DEFAULT 'student',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_login TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. ORDERS TABLE (Historical protection: ON DELETE RESTRICT)
CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    token TEXT NOT NULL UNIQUE,
    student_id TEXT NOT NULL,
    student_name TEXT,
    student_email TEXT,
    shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE RESTRICT,
    status TEXT NOT NULL CHECK (status IN ('pending_approval', 'printing', 'completed', 'failed')),
    total_charged_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    job_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. JOBS TABLE (Historical protection: ON DELETE RESTRICT)
CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    token TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_size BIGINT NOT NULL DEFAULT 0,
    page_count INT NOT NULL DEFAULT 1,
    copies INT NOT NULL DEFAULT 1,
    print_mode TEXT NOT NULL DEFAULT 'mono',
    print_type TEXT NOT NULL DEFAULT 'bw',
    sides TEXT NOT NULL DEFAULT 'single',
    page_range TEXT,
    status TEXT NOT NULL CHECK (status IN ('pending_approval', 'queued', 'printing', 'completed', 'failed', 'paused', 'indeterminate', 'printer_offline', 'paper_empty')),
    charged_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    student_name TEXT,
    student_email TEXT,
    student_id TEXT,
    progress_percent INT DEFAULT 0,
    server_file_path TEXT NOT NULL,
    original_file_path TEXT,
    reason TEXT,
    scheduled_for TIMESTAMPTZ,
    shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE RESTRICT,
    token_id TEXT,
    order_id TEXT REFERENCES orders(id) ON DELETE RESTRICT,
    timeline JSONB NOT NULL DEFAULT '[]'::jsonb,
    failure_snapshot JSONB,
    metrics JSONB,
    retry_count INT DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. AGENTS TABLE
CREATE TABLE IF NOT EXISTS agents (
    agent_id TEXT PRIMARY KEY,
    shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE RESTRICT,
    machine_name TEXT NOT NULL,
    printer_name TEXT NOT NULL,
    daemon_version TEXT NOT NULL DEFAULT '1.0.0',
    online_status TEXT NOT NULL DEFAULT 'offline',
    last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    scan_requested BOOLEAN DEFAULT FALSE,
    scan_status TEXT DEFAULT 'idle',
    scan_started_at TIMESTAMPTZ,
    printer_status TEXT DEFAULT 'unknown',
    startup_progress JSONB DEFAULT '[]'::jsonb,
    connection_error JSONB,
    printer_intelligence JSONB
);

-- 6. PRINTERS TABLE
CREATE TABLE IF NOT EXISTS printers (
    printer_id TEXT PRIMARY KEY,
    shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE RESTRICT,
    printer_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'offline',
    discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. PRINTER SETTINGS TABLE
CREATE TABLE IF NOT EXISTS printer_settings (
    shop_id TEXT PRIMARY KEY REFERENCES shops(id) ON DELETE RESTRICT,
    status TEXT NOT NULL DEFAULT 'offline',
    expected_return_time TEXT DEFAULT '2:00 PM',
    average_print_speed NUMERIC(10, 2) DEFAULT 5,
    admin_override_status TEXT DEFAULT 'none',
    available_printers JSONB DEFAULT '[]'::jsonb,
    selected_printer TEXT,
    under_maintenance BOOLEAN DEFAULT FALSE,
    scan_requested BOOLEAN DEFAULT FALSE,
    last_heartbeat TIMESTAMPTZ
);

-- ========================================================
-- INDEXES FOR HIGH-PERFORMANCE FIFO QUEUING & ISOLATION
-- ========================================================

-- Primary dispatch queue index: composite (shop_id, status, created_at, id)
CREATE INDEX IF NOT EXISTS idx_jobs_dispatch_queue 
ON jobs(shop_id, status, created_at ASC, id ASC);

-- Multi-file order grouping index: (order_id, status)
CREATE INDEX IF NOT EXISTS idx_jobs_order_grouping 
ON jobs(order_id, status);

-- Order lookup by shop and status
CREATE INDEX IF NOT EXISTS idx_orders_shop_status 
ON orders(shop_id, status, created_at ASC);

-- Token lookup index for fast verification
CREATE INDEX IF NOT EXISTS idx_orders_token 
ON orders(token);

CREATE INDEX IF NOT EXISTS idx_jobs_token 
ON jobs(token);

-- Agent lookup index by shop
CREATE INDEX IF NOT EXISTS idx_agents_shop_id 
ON agents(shop_id);

-- Hard safety net: Exactly max 1 printing job per shop at database engine level
CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_single_printing_per_shop 
ON jobs(shop_id) 
WHERE status = 'printing';

-- ========================================================
-- ATOMIC CONCURRENCY-SAFE JOB CLAIM STORED FUNCTION
-- ========================================================

CREATE OR REPLACE FUNCTION claim_next_job(
    p_shop_id TEXT,
    p_default_printer TEXT DEFAULT 'UNKNOWN'
)
RETURNS TABLE (
    id TEXT,
    token TEXT,
    file_name TEXT,
    file_size BIGINT,
    page_count INT,
    copies INT,
    print_mode TEXT,
    print_type TEXT,
    sides TEXT,
    page_range TEXT,
    status TEXT,
    charged_amount NUMERIC,
    student_name TEXT,
    student_email TEXT,
    student_id TEXT,
    progress_percent INT,
    server_file_path TEXT,
    original_file_path TEXT,
    reason TEXT,
    scheduled_for TIMESTAMPTZ,
    shop_id TEXT,
    token_id TEXT,
    order_id TEXT,
    timeline JSONB,
    failure_snapshot JSONB,
    metrics JSONB,
    retry_count INT,
    created_at TIMESTAMPTZ
) AS $$
DECLARE
    v_job_id TEXT;
    v_has_printing BOOLEAN;
    v_timeline_entry JSONB;
BEGIN
    -- 1. SERIALIZE ALL CLAIM ATTEMPTS FOR THIS SHOP
    -- Acquires an exclusive row-level lock on the target shop row to eliminate concurrent MVCC snapshot races
    PERFORM 1 FROM shops s
    WHERE s.id = p_shop_id
    FOR UPDATE;

    -- 2. Check if agent is already busy (any job currently in 'printing' status for this shop)
    SELECT EXISTS (
        SELECT 1 FROM jobs j
        WHERE j.shop_id = p_shop_id AND j.status = 'printing'
    ) INTO v_has_printing;

    IF v_has_printing THEN
        -- Agent is already busy printing a job; hold dispatch
        RETURN;
    END IF;

    -- 3. Atomically lock and select the oldest queued job (FIFO tie-breaking by id)
    SELECT j.id INTO v_job_id
    FROM jobs j
    WHERE j.shop_id = p_shop_id 
      AND j.status = 'queued'
      AND (j.scheduled_for IS NULL OR j.scheduled_for <= NOW())
    ORDER BY j.created_at ASC, j.id ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    -- If no eligible job exists, return empty result
    IF v_job_id IS NULL THEN
        RETURN;
    END IF;

    -- 4. Build 'claimed' timeline entry
    v_timeline_entry := jsonb_build_object(
        'stage', 'claimed',
        'at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'printerName', p_default_printer,
        'printerId', lower(regexp_replace(p_default_printer, '[^a-zA-Z0-9]', '_', 'g'))
    );

    -- 5. Atomically transition job status to 'printing' and append timeline
    RETURN QUERY
    UPDATE jobs
    SET status = 'printing',
        progress_percent = 0,
        timeline = jobs.timeline || jsonb_build_array(v_timeline_entry)
    WHERE jobs.id = v_job_id
    RETURNING 
        jobs.id, jobs.token, jobs.file_name, jobs.file_size, jobs.page_count,
        jobs.copies, jobs.print_mode, jobs.print_type, jobs.sides, jobs.page_range,
        jobs.status, jobs.charged_amount, jobs.student_name, jobs.student_email,
        jobs.student_id, jobs.progress_percent, jobs.server_file_path,
        jobs.original_file_path, jobs.reason, jobs.scheduled_for, jobs.shop_id,
        jobs.token_id, jobs.order_id, jobs.timeline, jobs.failure_snapshot,
        jobs.metrics, jobs.retry_count, jobs.created_at;
END;
$$ LANGUAGE plpgsql;
