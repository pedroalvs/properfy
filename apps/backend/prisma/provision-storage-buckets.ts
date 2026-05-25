/**
 * Idempotent Supabase Storage bucket provisioner.
 *
 * Creates the three private buckets required by the platform using the
 * existing S3-compatible credentials (no service role key needed):
 *
 *   inspector-avatars    — inspector profile photos
 *   inspector-documents  — insurance and police-check files
 *   inspection-assets    — inspection evidence photos
 *
 * After running this script, configure each bucket in the Supabase Dashboard:
 *   Storage → <bucket> → Edit → set file size limit + allowed MIME types
 *
 *   inspector-avatars:    5 MB  |  image/png, image/jpeg, image/webp
 *   inspector-documents:  20 MB |  application/pdf, image/png, image/jpeg, image/webp
 *   inspection-assets:    30 MB |  image/jpeg, image/png, image/webp, image/heic
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

const BUCKETS_EXPECTED = [
  'tenant-branding',
  ...BUCKETS_REQUIRED,
] as const;

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

  // Report status of expected buckets not in our create list
  for (const name of BUCKETS_EXPECTED) {
    if (BUCKETS_REQUIRED.includes(name as typeof BUCKETS_REQUIRED[number])) continue;
    const exists = existing.includes(name);
    console.log(`  ${exists ? '✓' : '✗'} ${name} (${exists ? 'exists' : 'MISSING — create manually'})`);
  }

  console.log('\nDone. Next step: set file size limits and MIME types in the Supabase Dashboard.');
  console.log('  Storage → <bucket> → Edit');
  console.log('  inspector-avatars:    5 MB   | image/png, image/jpeg, image/webp');
  console.log('  inspector-documents: 20 MB   | application/pdf, image/png, image/jpeg, image/webp');
  console.log('  inspection-assets:   30 MB   | image/jpeg, image/png, image/webp, image/heic');
}

main().catch((err: unknown) => {
  console.error('\nFailed:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
