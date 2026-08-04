/**
 * Idempotent Supabase Storage bucket provisioner.
 *
 * Creates the private buckets required by the platform using the existing
 * S3-compatible credentials (no service role key needed):
 *
 *   inspector-avatars    — inspector profile photos
 *   inspector-documents  — insurance and police-check files
 *   inspection-assets    — inspection evidence photos
 *
 * Also provisions the PUBLIC bucket:
 *
 *   tenant-branding      — agency email logos ({{agencyLogoUrl}})
 *
 * A public bucket cannot be created through the S3 API (Supabase ignores S3
 * ACLs), so tenant-branding uses the Storage REST API when SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY are set; otherwise the script prints a manual
 * Dashboard step.
 *
 * After running this script, configure each bucket in the Supabase Dashboard:
 *   Storage → <bucket> → Edit → set file size limit + allowed MIME types
 *
 *   inspector-avatars:    5 MB  |  image/png, image/jpeg, image/webp
 *   inspector-documents:  20 MB |  application/pdf, image/png, image/jpeg, image/webp
 *   inspection-assets:    30 MB |  image/jpeg, image/png, image/webp, image/heic
 *   tenant-branding:      2 MB  |  image/png, image/jpeg, image/webp  (PUBLIC)
 *
 * Invocation:
 *
 *   Local:
 *     pnpm --filter backend storage:provision
 *
 *   Fly.io (staging / prod):
 *     flyctl ssh console -a properfy \
 *       -C "sh -lc 'cd /app/apps/backend && pnpm storage:provision'"
 */

import { S3Client, ListBucketsCommand, CreateBucketCommand, HeadBucketCommand } from '@aws-sdk/client-s3';

const BUCKETS_REQUIRED = [
  'inspector-avatars',
  'inspector-documents',
  'inspection-assets',
] as const;

const PUBLIC_BUCKET = 'tenant-branding';

function buildS3Client(): S3Client {
  const endpoint = process.env.SUPABASE_S3_ENDPOINT;
  const accessKeyId = process.env.SUPABASE_S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.SUPABASE_S3_SECRET_ACCESS_KEY;

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error(
      'Missing S3 credentials. Ensure SUPABASE_S3_ENDPOINT, ' +
        'SUPABASE_S3_ACCESS_KEY_ID and SUPABASE_S3_SECRET_ACCESS_KEY are set.',
    );
  }

  return new S3Client({
    endpoint,
    region: 'us-east-1',
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  });
}

async function bucketExists(s3: S3Client, name: string): Promise<boolean> {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: name }));
    return true;
  } catch {
    return false;
  }
}

async function listBuckets(s3: S3Client): Promise<string[]> {
  const res = await s3.send(new ListBucketsCommand({}));
  return (res.Buckets ?? []).map((b) => b.Name ?? '').filter(Boolean);
}

/**
 * Create (or converge) the public bucket via the Storage REST API.
 * Returns false when the REST credentials are absent — caller prints the
 * manual step.
 */
async function provisionPublicBucketViaRest(): Promise<boolean> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return false;

  const base = supabaseUrl.replace(/\/$/, '');
  const headers = {
    Authorization: `Bearer ${serviceRoleKey}`,
    apikey: serviceRoleKey,
    'Content-Type': 'application/json',
  };

  const createRes = await fetch(`${base}/storage/v1/bucket`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ id: PUBLIC_BUCKET, name: PUBLIC_BUCKET, public: true }),
  });
  if (createRes.ok) {
    console.log(`  + created: ${PUBLIC_BUCKET} (public, via REST)`);
    return true;
  }

  // Already exists (409) → converge it to public so a previously-private
  // bucket cannot silently serve 400s to email clients.
  if (createRes.status === 409 || createRes.status === 400) {
    const updateRes = await fetch(`${base}/storage/v1/bucket/${PUBLIC_BUCKET}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ public: true }),
    });
    if (updateRes.ok) {
      console.log(`  ✓ exists:  ${PUBLIC_BUCKET} (converged to public via REST)`);
      return true;
    }
    throw new Error(
      `Failed to mark ${PUBLIC_BUCKET} public: ${updateRes.status} ${await updateRes.text()}`,
    );
  }

  throw new Error(
    `Failed to create ${PUBLIC_BUCKET}: ${createRes.status} ${await createRes.text()}`,
  );
}

async function main(): Promise<void> {
  const s3 = buildS3Client();

  console.log('Listing existing buckets...\n');
  const existing = await listBuckets(s3);
  console.log(`Found: ${existing.length > 0 ? existing.join(', ') : '(none)'}\n`);

  for (const name of BUCKETS_REQUIRED) {
    if (existing.includes(name)) {
      console.log(`  ✓ exists:  ${name}`);
      continue;
    }
    await s3.send(new CreateBucketCommand({ Bucket: name }));
    console.log(`  + created: ${name}`);
  }

  const publicViaRest = await provisionPublicBucketViaRest();
  if (!publicViaRest) {
    const exists = existing.includes(PUBLIC_BUCKET) || (await bucketExists(s3, PUBLIC_BUCKET));
    if (!exists) {
      await s3.send(new CreateBucketCommand({ Bucket: PUBLIC_BUCKET }));
      console.log(`  + created: ${PUBLIC_BUCKET} (PRIVATE — see manual step below)`);
    } else {
      console.log(`  ✓ exists:  ${PUBLIC_BUCKET}`);
    }
    console.log(
      `\n  ⚠ MANUAL STEP REQUIRED: mark "${PUBLIC_BUCKET}" as Public in the Supabase Dashboard` +
        '\n    (Storage → tenant-branding → Edit → Public bucket).' +
        '\n    Email clients fetch agency logos anonymously — a private bucket breaks every logo.' +
        '\n    To automate this, set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY and re-run.',
    );
  }

  console.log('\nDone. Next step: set file size limits and MIME types in the Supabase Dashboard.');
  console.log('  Storage → <bucket> → Edit');
  console.log('  inspector-avatars:    5 MB   | image/png, image/jpeg, image/webp');
  console.log('  inspector-documents: 20 MB   | application/pdf, image/png, image/jpeg, image/webp');
  console.log('  inspection-assets:   30 MB   | image/jpeg, image/png, image/webp, image/heic');
  console.log('  tenant-branding:      2 MB   | image/png, image/jpeg, image/webp  (PUBLIC)');
}

main().catch((err: unknown) => {
  console.error('\nFailed:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
