import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Readable } from 'stream';
import { supabase, isSupabaseConfigured, isServiceRoleConfigured, readDb, writeDb, DbJob } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const STORAGE_BUCKET = 'print-documents';

export const UPLOADS_DIR = process.env.NODE_ENV === 'test'
  ? path.resolve(__dirname, './uploads-test')
  : path.resolve(__dirname, './uploads');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

export class StorageError extends Error {
  constructor(message: string, public cause?: any) {
    super(message);
    this.name = 'StorageError';
  }
}

let bucketInitAttempted = false;

/**
 * Ensures the private storage bucket exists (fails gracefully if lacks permission).
 * If the bucket already exists, it is NOT mutated or recreated.
 */
async function ensurePrivateBucketExists(): Promise<void> {
  if (bucketInitAttempted || !supabase) return;
  bucketInitAttempted = true;

  try {
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();
    if (listError) {
      console.warn('[STORAGE] Bucket listing note:', listError.message);
      return;
    }

    const bucketExists = buckets?.some(b => b.name === STORAGE_BUCKET || b.id === STORAGE_BUCKET);
    if (!bucketExists) {
      console.log(`[STORAGE] Bucket "${STORAGE_BUCKET}" not found in list. Creating private bucket...`);
      const { error: createError } = await supabase.storage.createBucket(STORAGE_BUCKET, {
        public: false,
        fileSizeLimit: 52428800,
        allowedMimeTypes: ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg']
      });

      if (createError) {
        console.warn(`[STORAGE] Auto-create bucket note: ${createError.message}`);
      } else {
        console.log(`[STORAGE] Private bucket "${STORAGE_BUCKET}" created successfully.`);
      }
    }
  } catch (err: any) {
    console.warn('[STORAGE] Bucket verification exception:', err?.message);
  }
}

/**
 * Checks whether remote Supabase storage is active.
 * CRITICAL SECURITY RULE:
 * Private document uploads MUST require a real service-role credential.
 * If only an anon key is present, remote storage MUST fail closed to prevent
 * unauthorized or failing public key usage on private buckets.
 */
export function isRemoteStorageActive(): boolean {
  if (process.env.NODE_ENV === 'production') {
    if (!isSupabaseConfigured || !supabase || !isServiceRoleConfigured) {
      throw new StorageError('FATAL: Supabase configuration with valid service-role key (SUPABASE_SERVICE_ROLE_KEY) is required in production environment.');
    }
    return true;
  }
  return isSupabaseConfigured && isServiceRoleConfigured && supabase !== null;
}

/**
 * Uploads a document to private Supabase Storage (production) or local disk (test/dev).
 * In production: fails safely if Supabase Storage is unavailable.
 */
export async function uploadDocument(
  filename: string,
  content: Buffer | string,
  contentType = 'application/pdf'
): Promise<{ storagePath: string; isRemote: boolean }> {
  const cleanFilename = path.basename(filename);

  if (isRemoteStorageActive()) {
    await ensurePrivateBucketExists();

    const fileBuffer = typeof content === 'string' ? fs.readFileSync(content) : content;

    const { data, error } = await supabase!.storage
      .from(STORAGE_BUCKET)
      .upload(cleanFilename, fileBuffer, {
        contentType,
        upsert: true
      });

    if (error) {
      console.error(`[STORAGE ERROR] Upload failed for ${cleanFilename}:`, error.message);
      throw new StorageError(`Failed to upload document to private storage: ${error.message}`, error);
    }

    return { storagePath: `/uploads/${cleanFilename}`, isRemote: true };
  }

  // Local fallback (Dev / Test mode only)
  const targetPath = path.join(UPLOADS_DIR, cleanFilename);
  if (typeof content === 'string' && content !== targetPath) {
    fs.copyFileSync(content, targetPath);
  } else if (Buffer.isBuffer(content)) {
    fs.writeFileSync(targetPath, content);
  }

  return { storagePath: `/uploads/${cleanFilename}`, isRemote: false };
}

/**
 * Retrieves a document stream for downloading or printing.
 */
export async function getDocumentStream(
  filename: string
): Promise<{ stream: NodeJS.ReadableStream; contentType: string; contentLength?: number } | null> {
  const cleanFilename = path.basename(filename);

  if (isRemoteStorageActive()) {
    try {
      const { data, error } = await supabase!.storage
        .from(STORAGE_BUCKET)
        .download(cleanFilename);

      if (error || !data) {
        // Check local disk fallback if object not in Supabase
        const localPath = path.join(UPLOADS_DIR, cleanFilename);
        if (fs.existsSync(localPath)) {
          const stat = fs.statSync(localPath);
          return {
            stream: fs.createReadStream(localPath),
            contentType: 'application/pdf',
            contentLength: stat.size
          };
        }
        return null;
      }

      const arrayBuffer = await data.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      return {
        stream: Readable.from(buffer),
        contentType: data.type || 'application/pdf',
        contentLength: buffer.length
      };
    } catch (err: any) {
      console.error(`[STORAGE ERROR] Failed to download document ${cleanFilename}:`, err.message);
      return null;
    }
  }

  // Local filesystem
  const localPath = path.join(UPLOADS_DIR, cleanFilename);
  if (fs.existsSync(localPath)) {
    const stat = fs.statSync(localPath);
    return {
      stream: fs.createReadStream(localPath),
      contentType: 'application/pdf',
      contentLength: stat.size
    };
  }

  return null;
}

/**
 * Deletes a document immediately upon print completion or during retention purge.
 * Idempotent: treats missing objects (404) as successful deletions.
 */
export async function deleteDocument(
  filename: string
): Promise<{ success: boolean; alreadyMissing: boolean }> {
  const cleanFilename = path.basename(filename);
  let remoteDeleted = false;
  let alreadyMissing = false;

  if (isRemoteStorageActive()) {
    try {
      const { data, error } = await supabase!.storage
        .from(STORAGE_BUCKET)
        .remove([cleanFilename]);

      if (error) {
        if (error.message.includes('not found') || error.message.includes('404')) {
          alreadyMissing = true;
          remoteDeleted = true;
        } else {
          console.error(`[STORAGE ERROR] Delete failed for ${cleanFilename}:`, error.message);
          throw new StorageError(`Storage deletion failed: ${error.message}`, error);
        }
      } else {
        remoteDeleted = true;
      }
    } catch (err: any) {
      if (err instanceof StorageError) throw err;
      console.error(`[STORAGE ERROR] Remote deletion failed for ${cleanFilename}:`, err.message);
      throw new StorageError(`Remote deletion failed: ${err.message}`, err);
    }
  }

  // Also clean local filesystem if file exists
  const localPath = path.join(UPLOADS_DIR, cleanFilename);
  if (fs.existsSync(localPath)) {
    try {
      fs.unlinkSync(localPath);
    } catch {}
  }

  return { success: true, alreadyMissing };
}

/**
 * Executes 7-day automated purge:
 * 1. Deletes expired physical/storage files for terminal jobs older than retention period.
 * 2. Purges database rows via Supabase RPC (or local DB filter in test/dev).
 */
export async function executeRetentionPurge(
  retentionDays = 7
): Promise<{ purgedJobs: number; purgedOrders: number; purgedFiles: number }> {
  const cutoffTime = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
  let purgedFiles = 0;
  let purgedJobs = 0;
  let purgedOrders = 0;

  if (isRemoteStorageActive()) {
    // 1. Fetch expired terminal jobs from PostgreSQL to delete their storage objects first
    const { data: expiredJobs, error: fetchErr } = await supabase!
      .from('jobs')
      .select('id, server_file_path, original_file_path, status, created_at')
      .in('status', ['completed', 'failed'])
      .lt('created_at', cutoffTime);

    if (!fetchErr && Array.isArray(expiredJobs)) {
      for (const j of expiredJobs) {
        if (j.server_file_path) {
          try {
            await deleteDocument(path.basename(j.server_file_path));
            purgedFiles++;
          } catch (err) {
            console.error(`[RETENTION ERROR] Storage deletion failed for job ${j.id}, retaining record for retry.`);
          }
        }
        if (j.original_file_path) {
          try {
            await deleteDocument(path.basename(j.original_file_path));
            purgedFiles++;
          } catch {}
        }
      }
    }

    // 2. Call atomic PostgreSQL stored procedure to delete database rows
    try {
      const { data: purgeResult, error: rpcErr } = await supabase!.rpc('purge_expired_records', {
        p_retention_days: retentionDays
      });

      if (!rpcErr && Array.isArray(purgeResult) && purgeResult.length > 0) {
        purgedJobs = purgeResult[0].purged_jobs_count || 0;
        purgedOrders = purgeResult[0].purged_orders_count || 0;
      }
    } catch (err: any) {
      console.error('[RETENTION ERROR] Database purge RPC failed:', err.message);
    }
  } else {
    // Local DB cleanup (Dev / Test mode)
    const db = readDb();
    const terminalJobs = db.jobs.filter(j => 
      ['completed', 'failed'].includes(j.status) && j.createdAt < cutoffTime
    );

    for (const j of terminalJobs) {
      if (j.serverFilePath) {
        try {
          const lp = path.join(UPLOADS_DIR, path.basename(j.serverFilePath));
          if (fs.existsSync(lp)) {
            fs.unlinkSync(lp);
            purgedFiles++;
          }
        } catch {}
      }
      if (j.originalFilePath) {
        try {
          const lp = path.join(UPLOADS_DIR, path.basename(j.originalFilePath));
          if (fs.existsSync(lp)) {
            fs.unlinkSync(lp);
            purgedFiles++;
          }
        } catch {}
      }
    }

    const remainingJobs = db.jobs.filter(j => !terminalJobs.some(tj => tj.id === j.id));
    purgedJobs = db.jobs.length - remainingJobs.length;
    db.jobs = remainingJobs;

    const remainingOrders = (db.orders || []).filter(o => {
      const isTerminal = ['completed', 'failed'].includes(o.status);
      const isOld = o.createdAt < cutoffTime;
      const hasRemainingJobs = db.jobs.some(j => j.orderId === o.id);
      if (isTerminal && isOld && !hasRemainingJobs) {
        purgedOrders++;
        return false;
      }
      return true;
    });
    db.orders = remainingOrders;

    writeDb(db);
  }

  return { purgedJobs, purgedOrders, purgedFiles };
}
