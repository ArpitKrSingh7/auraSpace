import test from 'node:test';
import assert from 'node:assert/strict';
import { envSchema } from '../packages/backend/src/config.ts';
import { MediaStore } from '../packages/backend/src/media.ts';
const config = () => envSchema.parse({
  DATABASE_URL: 'postgresql://user:password@localhost/test',
  REDIS_URL: 'redis://localhost:6379',
  SUPABASE_URL: 'https://project.example/',
  SUPABASE_SERVICE_ROLE_KEY: 'test-server-only-key-do-not-export',
  SUPABASE_STORAGE_BUCKET: 'AuraSpace',
});
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });

test('storage configuration needs only the three Supabase values, not S3 keys', () => {
  assert.equal(config().SUPABASE_STORAGE_BUCKET, 'AuraSpace');
  assert.equal(config().S3_ENDPOINT, undefined);
  assert.equal(envSchema.safeParse({ ...config(), SUPABASE_SERVICE_ROLE_KEY: undefined }).success, false);
});

test('missing bucket is created private; an existing public bucket is refused', async () => {
  const calls = [];
  const media = new MediaStore(config(), async (url, options) => {
    calls.push({url, options});
    if (calls.length === 1) return json({statusCode:'404'},400);
    return json({public:false});
  });
  await media.ensureBucket();
  assert.equal(calls.length, 3);
  assert.equal(calls[1].url, 'https://project.example/storage/v1/bucket');
  assert.deepEqual(JSON.parse(calls[1].options.body), {id:'AuraSpace',name:'AuraSpace',public:false});
  const publicMedia = new MediaStore(config(), async () => json({public:true}));
  await assert.rejects(publicMedia.ensureBucket(), /private storage bucket/);
});

test('storage authorization failures neither create buckets nor expose provider secrets', async () => {
  let requests = 0;
  const media = new MediaStore(config(), async () => {
    requests++;
    return json({statusCode:403,message:config().SUPABASE_SERVICE_ROLE_KEY},403);
  });
  await assert.rejects(media.ensureBucket(), (error) => {
    assert.match(error.message, /403/);
    assert.ok(!error.message.includes(config().SUPABASE_SERVICE_ROLE_KEY));
    return true;
  });
  assert.equal(requests, 1);
});

test('signed downloads are temporary, paths are encoded and deletion targets one exact key', async () => {
  const calls = [];
  const media = new MediaStore(config(), async (url, options) => {
    calls.push({url,options});
    assert.equal(options.headers.get('apikey'), config().SUPABASE_SERVICE_ROLE_KEY);
    assert.equal(options.redirect, 'error');
    return json({signedURL:'/object/sign/AuraSpace/room%20photo.png?token=test'});
  });
  const link = await media.access('room photo.png');
  assert.equal(link, 'https://project.example/storage/v1/object/sign/AuraSpace/room%20photo.png?token=test');
  assert.equal(calls[0].url, 'https://project.example/storage/v1/object/sign/AuraSpace/room%20photo.png');
  assert.deepEqual(JSON.parse(calls[0].options.body), {expiresIn:300});
  await media.delete('projects/one/photo.png');
  assert.deepEqual(JSON.parse(calls[1].options.body), {prefixes:['projects/one/photo.png']});
  await assert.rejects(media.get('../another-bucket'), /Invalid storage object path/);
  assert.equal(calls.length, 2);
});

test('storage transport errors and unexpected download URLs stay safe', async () => {
  const unavailable = new MediaStore(config(), async () => {throw new Error(config().SUPABASE_SERVICE_ROLE_KEY);});
  await assert.rejects(unavailable.get('photo.png'), /unavailable or timed out/);
  const badLink = new MediaStore(config(), async () => json({signedURL:'https://unrelated.example/'}));
  await assert.rejects(badLink.access('photo.png'), /invalid download link/);
});
