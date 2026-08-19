import { DbJob, DbPrintOrder, Shop, Agent, Student, Printer, PrinterSettings, TimelineEntry, FailureSnapshot, JobMetrics, DbStudentPrintHistory } from '../db.js';

// ========================================================
// CAMPUS PRINT — PURE BIDIRECTIONAL REPOSITORY MAPPER
// Isolates PostgreSQL snake_case from TypeScript camelCase
// ========================================================

export function jobFromDb(row: any): DbJob {
  return {
    id: row.id,
    token: row.token,
    orderId: row.order_id || undefined,       // CRITICAL: Preserves P1 prefetch grouping
    shopId: row.shop_id,                     // CRITICAL: Tenant isolation
    fileName: row.file_name,
    fileSize: Number(row.file_size || 0),
    pageCount: Number(row.page_count || 1),
    copies: Number(row.copies || 1),
    printMode: row.print_mode || 'mono',
    printType: row.print_type || 'bw',
    sides: row.sides || 'single',
    pageRange: row.page_range || undefined,
    status: row.status,
    chargedAmount: row.charged_amount !== null && row.charged_amount !== undefined ? Number(row.charged_amount) : undefined,
    studentName: row.student_name || undefined,
    studentEmail: row.student_email || undefined,
    studentId: row.student_id || undefined,
    progressPercent: Number(row.progress_percent || 0),
    serverFilePath: row.server_file_path,
    originalFilePath: row.original_file_path || undefined,
    reason: row.reason || undefined,
    scheduledFor: row.scheduled_for || undefined,
    tokenId: row.token_id || undefined,
    timeline: (row.timeline as TimelineEntry[]) || [],
    failureSnapshot: (row.failure_snapshot as FailureSnapshot) || undefined,
    metrics: (row.metrics as JobMetrics) || undefined,
    retryCount: Number(row.retry_count || 0),
    createdAt: typeof row.created_at === 'string' ? row.created_at : new Date(row.created_at).toISOString()
  };
}

export function jobToDb(job: DbJob): any {
  return {
    id: job.id,
    token: job.token,
    order_id: job.orderId || null,
    shop_id: job.shopId,
    file_name: job.fileName,
    file_size: job.fileSize || 0,
    page_count: job.pageCount || 1,
    copies: job.copies || 1,
    print_mode: job.printMode || 'mono',
    print_type: job.printType || 'bw',
    sides: job.sides || 'single',
    page_range: job.pageRange || null,
    status: job.status,
    charged_amount: job.chargedAmount !== undefined ? job.chargedAmount : 0,
    student_name: job.studentName || null,
    student_email: job.studentEmail || null,
    student_id: job.studentId || null,
    progress_percent: job.progressPercent || 0,
    server_file_path: job.serverFilePath || '',
    original_file_path: job.originalFilePath || null,
    reason: job.reason || null,
    scheduled_for: job.scheduledFor || null,
    token_id: job.tokenId || null,
    timeline: job.timeline || [],
    failure_snapshot: job.failureSnapshot || null,
    metrics: job.metrics || null,
    retry_count: job.retryCount || 0,
    created_at: job.createdAt || new Date().toISOString()
  };
}

export function orderFromDb(row: any): DbPrintOrder {
  return {
    id: row.id,
    token: row.token,
    studentId: row.student_id,
    studentName: row.student_name || undefined,
    studentEmail: row.student_email || undefined,
    shopId: row.shop_id,
    status: row.status,
    totalChargedAmount: Number(row.total_charged_amount || 0),
    jobIds: Array.isArray(row.job_ids) ? row.job_ids : [],
    createdAt: typeof row.created_at === 'string' ? row.created_at : new Date(row.created_at).toISOString()
  };
}

export function orderToDb(order: DbPrintOrder): any {
  return {
    id: order.id,
    token: order.token,
    student_id: order.studentId,
    student_name: order.studentName || null,
    student_email: order.studentEmail || null,
    shop_id: order.shopId,
    status: order.status,
    total_charged_amount: order.totalChargedAmount || 0,
    job_ids: order.jobIds || [],
    created_at: order.createdAt || new Date().toISOString()
  };
}

export function shopFromDb(row: any): Shop {
  return {
    id: row.id,
    name: row.name,
    ownerName: row.owner_name || 'TJohn Staff',
    phoneNumber: row.phone_number || '9876543210',
    address: row.address || '',
    maintenanceMode: Boolean(row.maintenance_mode),
    bwPrice: Number(row.bw_price || 2),
    colorPrice: Number(row.color_price || 5),
    duplexPrice: Number(row.duplex_price || 3),
    activePrinterId: row.active_printer_id || undefined,
    bwPrinterId: row.bw_printer_id || undefined,
    bwPrinterName: row.bw_printer_name || undefined,
    colorPrinterId: row.color_printer_id || undefined,
    colorPrinterName: row.color_printer_name || undefined,
    bwMaintenanceMode: row.bw_maintenance_mode !== null ? Boolean(row.bw_maintenance_mode) : undefined,
    colorMaintenanceMode: row.color_maintenance_mode !== null ? Boolean(row.color_maintenance_mode) : undefined,
    bwStatusMode: row.bw_status_mode || 'auto',
    colorStatusMode: row.color_status_mode || 'auto',
    bwExpectedReturnTime: row.bw_expected_return_time || undefined,
    colorExpectedReturnTime: row.color_expected_return_time || undefined,
    adminUsername: row.admin_username || 'admin',
    adminPasswordHash: row.admin_password_hash || '',
    operationalState: row.operational_state || 'offline',
    agentInstalled: Boolean(row.agent_installed),
    printerStatus: row.printer_status || 'offline',
    lastHeartbeat: row.last_heartbeat || '',
    phone: row.phone_number || '9876543210',
    isOpen: !row.maintenance_mode,
    openingTime: '08:00 AM',
    closingTime: '08:00 PM'
  };
}

export function shopToDb(shop: Shop): any {
  return {
    id: shop.id,
    name: shop.name,
    owner_name: shop.ownerName || 'TJohn Staff',
    phone_number: shop.phoneNumber || shop.phone || '9876543210',
    address: shop.address || '',
    maintenance_mode: Boolean(shop.maintenanceMode),
    bw_price: shop.bwPrice || 2,
    color_price: shop.colorPrice || 5,
    duplex_price: shop.duplexPrice || 3,
    active_printer_id: shop.activePrinterId || null,
    bw_printer_id: shop.bwPrinterId || null,
    bw_printer_name: shop.bwPrinterName || null,
    color_printer_id: shop.colorPrinterId || null,
    color_printer_name: shop.colorPrinterName || null,
    bw_maintenance_mode: shop.bwMaintenanceMode !== undefined ? Boolean(shop.bwMaintenanceMode) : false,
    color_maintenance_mode: shop.colorMaintenanceMode !== undefined ? Boolean(shop.colorMaintenanceMode) : false,
    bw_status_mode: shop.bwStatusMode || 'auto',
    color_status_mode: shop.colorStatusMode || 'auto',
    bw_expected_return_time: shop.bwExpectedReturnTime || null,
    color_expected_return_time: shop.colorExpectedReturnTime || null,
    admin_username: shop.adminUsername || 'admin',
    admin_password_hash: shop.adminPasswordHash || '',
    operational_state: shop.operationalState || 'offline',
    agent_installed: Boolean(shop.agentInstalled),
    printer_status: shop.printerStatus || 'offline',
    last_heartbeat: shop.lastHeartbeat || null
  };
}

export function agentFromDb(row: any): Agent {
  return {
    agentId: row.agent_id,
    shopId: row.shop_id,
    machineName: row.machine_name,
    printerName: row.printer_name,
    daemonVersion: row.daemon_version || '1.0.0',
    onlineStatus: row.online_status || 'offline',
    lastSeen: typeof row.last_seen === 'string' ? row.last_seen : new Date(row.last_seen).toISOString(),
    scanRequested: Boolean(row.scan_requested),
    scanStatus: row.scan_status || 'idle',
    scanStartedAt: row.scan_started_at || undefined,
    printerStatus: row.printer_status || 'unknown',
    startupProgress: row.startup_progress || [],
    connectionError: row.connection_error || null,
    printerIntelligence: row.printer_intelligence || undefined
  };
}

export function agentToDb(agent: Agent): any {
  return {
    agent_id: agent.agentId,
    shop_id: agent.shopId,
    machine_name: agent.machineName,
    printer_name: agent.printerName,
    daemon_version: agent.daemonVersion || '1.0.0',
    online_status: agent.onlineStatus || 'offline',
    last_seen: agent.lastSeen || new Date().toISOString(),
    scan_requested: Boolean(agent.scanRequested),
    scan_status: agent.scanStatus || 'idle',
    scan_started_at: agent.scanStartedAt || null,
    printer_status: agent.printerStatus || 'unknown',
    startup_progress: agent.startupProgress || [],
    connection_error: agent.connectionError || null,
    printer_intelligence: agent.printerIntelligence || null
  };
}

export function studentFromDb(row: any): Student {
  return {
    id: row.id,
    googleId: row.google_id,
    name: row.name,
    email: row.email,
    picture: row.picture || '',
    role: 'student',
    isActive: Boolean(row.is_active),
    createdAt: typeof row.created_at === 'string' ? row.created_at : new Date(row.created_at).toISOString(),
    lastLogin: typeof row.last_login === 'string' ? row.last_login : new Date(row.last_login).toISOString(),
    lastSeen: typeof row.last_seen === 'string' ? row.last_seen : new Date(row.last_seen).toISOString()
  };
}

export function studentToDb(student: Student): any {
  return {
    id: student.id,
    google_id: student.googleId,
    name: student.name,
    email: student.email,
    picture: student.picture || '',
    role: student.role || 'student',
    is_active: student.isActive !== undefined ? Boolean(student.isActive) : true,
    last_login: student.lastLogin || new Date().toISOString(),
    last_seen: student.lastSeen || new Date().toISOString(),
    created_at: student.createdAt || new Date().toISOString()
  };
}

export function printerFromDb(row: any): Printer {
  return {
    printerId: row.printer_id,
    shopId: row.shop_id,
    printerName: row.printer_name,
    status: row.status || 'offline',
    discoveredAt: typeof row.discovered_at === 'string' ? row.discovered_at : new Date(row.discovered_at).toISOString()
  };
}

export function printerToDb(printer: Printer): any {
  return {
    printer_id: printer.printerId,
    shop_id: printer.shopId,
    printer_name: printer.printerName,
    status: printer.status || 'offline',
    discovered_at: printer.discoveredAt || new Date().toISOString()
  };
}

export function printerSettingsFromDb(row: any): PrinterSettings {
  return {
    status: row.status || 'offline',
    expectedReturnTime: row.expected_return_time || '2:00 PM',
    averagePrintSpeed: Number(row.average_print_speed || 5),
    lastHeartbeat: row.last_heartbeat || undefined,
    adminOverrideStatus: row.admin_override_status || 'none',
    availablePrinters: Array.isArray(row.available_printers) ? row.available_printers : [],
    selectedPrinter: row.selected_printer || undefined,
    underMaintenance: Boolean(row.under_maintenance),
    scanRequested: Boolean(row.scan_requested)
  };
}

export function printerSettingsToDb(settings: PrinterSettings, shopId = 'tjohn_print'): any {
  return {
    shop_id: shopId,
    status: settings.status || 'offline',
    expected_return_time: settings.expectedReturnTime || '2:00 PM',
    average_print_speed: settings.averagePrintSpeed || 5,
    admin_override_status: settings.adminOverrideStatus || 'none',
    available_printers: settings.availablePrinters || [],
    selected_printer: settings.selectedPrinter || null,
    under_maintenance: Boolean(settings.underMaintenance),
    scan_requested: Boolean(settings.scanRequested),
    last_heartbeat: settings.lastHeartbeat || null
  };
}

export function studentHistoryFromDb(row: any): DbStudentPrintHistory {
  return {
    id: row.id,
    orderId: row.order_id,
    jobId: row.job_id || undefined,
    orderToken: row.order_token,
    jobToken: row.job_token || undefined,
    studentId: row.student_id,
    shopId: row.shop_id,
    shopName: row.shop_name || 'Campus Print Center',
    fileName: row.file_name,
    fileSize: Number(row.file_size || 0),
    pageCount: Number(row.page_count || 1),
    copies: Number(row.copies || 1),
    printMode: row.print_mode || 'mono',
    printType: row.print_type || 'bw',
    sides: row.sides || 'single',
    paperSize: row.paper_size || 'A4',
    pageRange: row.page_range || undefined,
    chargedAmount: Number(row.charged_amount || 0),
    status: row.status || 'completed',
    createdAt: typeof row.created_at === 'string' ? row.created_at : new Date(row.created_at).toISOString(),
    completedAt: row.completed_at ? (typeof row.completed_at === 'string' ? row.completed_at : new Date(row.completed_at).toISOString()) : undefined
  };
}

export function studentHistoryToDb(hist: DbStudentPrintHistory): any {
  return {
    id: hist.id,
    order_id: hist.orderId,
    job_id: hist.jobId || null,
    order_token: hist.orderToken,
    job_token: hist.jobToken || null,
    student_id: hist.studentId,
    shop_id: hist.shopId,
    shop_name: hist.shopName,
    file_name: hist.fileName,
    file_size: hist.fileSize || 0,
    page_count: hist.pageCount || 1,
    copies: hist.copies || 1,
    print_mode: hist.printMode || 'mono',
    print_type: hist.printType || 'bw',
    sides: hist.sides || 'single',
    paper_size: hist.paperSize || 'A4',
    page_range: hist.pageRange || null,
    charged_amount: hist.chargedAmount !== undefined ? hist.chargedAmount : 0,
    status: hist.status || 'completed',
    created_at: hist.createdAt || new Date().toISOString(),
    completed_at: hist.completedAt || null
  };
}
