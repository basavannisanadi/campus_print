-- ========================================================
-- CAMPUS PRINT — SEED DEFAULT SHOPS & PRINTER SETTINGS
-- Migration: 20260820000001_seed_default_shops.sql
-- ========================================================

-- 1. SEED DEFAULT SHOPS
INSERT INTO shops (
    id, name, owner_name, phone_number, address,
    maintenance_mode, bw_price, color_price, duplex_price,
    admin_username, admin_password_hash, operational_state,
    agent_installed, printer_status
) VALUES
(
    'tjohn_print', 'TJohn Print Center', 'TJohn Staff', '9876543210', 'TJohn Block, Ground Floor',
    false, 2.00, 5.00, 3.00,
    'tjohn_admin', 'b20d2fac31472dc217d425b68ede40c3a17e337b899ae72879b3cc49bf36cb00', 'offline',
    false, 'offline'
),
(
    'alliance_print', 'Alliance Print Center', 'Alliance Staff', '9876543211', 'Alliance Main Block',
    false, 2.00, 5.00, 3.00,
    'alliance_admin', 'b20d2fac31472dc217d425b68ede40c3a17e337b899ae72879b3cc49bf36cb00', 'offline',
    false, 'offline'
),
(
    'science_print', 'Science Print Center', 'Science Staff', '9876543212', 'Science Department',
    false, 3.00, 5.00, 3.00,
    'science_admin', 'b20d2fac31472dc217d425b68ede40c3a17e337b899ae72879b3cc49bf36cb00', 'offline',
    false, 'offline'
)
ON CONFLICT (id) DO NOTHING;

-- 2. SEED DEFAULT PRINTER SETTINGS
INSERT INTO printer_settings (
    shop_id, status, expected_return_time, average_print_speed,
    admin_override_status, available_printers, selected_printer,
    under_maintenance, scan_requested
) VALUES
(
    'tjohn_print', 'offline', '2:00 PM', 5.00,
    'none', '[]'::jsonb, null,
    false, false
),
(
    'alliance_print', 'offline', '2:00 PM', 5.00,
    'none', '[]'::jsonb, null,
    false, false
),
(
    'science_print', 'offline', '2:00 PM', 5.00,
    'none', '[]'::jsonb, null,
    false, false
)
ON CONFLICT (shop_id) DO NOTHING;
