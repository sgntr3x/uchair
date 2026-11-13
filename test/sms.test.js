import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSms } from '../server/sms.js';

const fakeFetch = (status = 200, body = {}) => {
  const calls = [];
  const fn = async (url, init) => { calls.push({ url, init }); return { ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body) }; };
  fn.calls = calls;
  return fn;
};

test('varsayılan sağlayıcı console; bilinmeyen sağlayıcı ve eksik ayar hata verir', () => {
  assert.equal(createSms({}).provider, 'console');
  assert.throws(() => createSms({ SMS_PROVIDER: 'yok' }), /Bilinmeyen/);
  assert.throws(() => createSms({ SMS_PROVIDER: 'netgsm' }), /NETGSM_USER/);
  assert.throws(() => createSms({ SMS_PROVIDER: 'twilio' }), /TWILIO_SID/);
});

test('netgsm: doğru istek, 00 kodu başarı, diğer kodlar hata', async () => {
  const env = { SMS_PROVIDER: 'netgsm', NETGSM_USER: 'u', NETGSM_PASS: 'p', NETGSM_HEADER: 'UCHAIR' };
  const ok = fakeFetch(200, { code: '00', jobid: '1' });
  await createSms(env, ok).send('5321112233', 'Kod: 123456');
  const body = JSON.parse(ok.calls[0].init.body);
  assert.equal(ok.calls[0].url, 'https://api.netgsm.com.tr/sms/rest/v2/send');
  assert.equal(body.msgheader, 'UCHAIR');
  assert.deepEqual(body.messages, [{ msg: 'Kod: 123456', no: '5321112233' }]);
  assert.equal(ok.calls[0].init.headers.authorization, 'Basic ' + Buffer.from('u:p').toString('base64'));
  await assert.rejects(createSms(env, fakeFetch(200, { code: '30' })).send('5321112233', 'x'), /Netgsm/);
});

test('twilio: +90 numarası ve form gövdesi', async () => {
  const f = fakeFetch(201, {});
  await createSms({ SMS_PROVIDER: 'twilio', TWILIO_SID: 'AC1', TWILIO_TOKEN: 't', TWILIO_FROM: '+1555' }, f).send('5321112233', 'Merhaba');
  assert.match(f.calls[0].url, /Accounts\/AC1\/Messages\.json$/);
  assert.equal(f.calls[0].init.body.get('To'), '+905321112233');
  await assert.rejects(createSms({ SMS_PROVIDER: 'twilio', TWILIO_SID: 'AC1', TWILIO_TOKEN: 't', TWILIO_FROM: '+1' }, fakeFetch(400)).send('5321112233', 'x'), /Twilio/);
});

test('webhook: JSON gövde ve bearer', async () => {
  const f = fakeFetch(200);
  await createSms({ SMS_PROVIDER: 'webhook', SMS_WEBHOOK_URL: 'https://x.test/sms', SMS_WEBHOOK_TOKEN: 'tok' }, f).send('5321112233', 'Selam');
  assert.deepEqual(JSON.parse(f.calls[0].init.body), { to: '+905321112233', text: 'Selam' });
  assert.equal(f.calls[0].init.headers.authorization, 'Bearer tok');
});
