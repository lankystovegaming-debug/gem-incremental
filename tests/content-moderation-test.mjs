import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import {
  moderatePlayerText,
  normalizeContentFilterLevel
} from '../src/logic/contentModeration.js';

assert.equal(normalizeContentFilterLevel('strict'), 'strict');
assert.equal(normalizeContentFilterLevel('off'), 'standard', 'filtering cannot be disabled');
assert.equal(moderatePlayerText('A severe f.u.c.k insult'), 'A severe [filtered] insult');
assert.equal(moderatePlayerText(`s\u200Bh\u200Bi\u200Bt`), '[filtered]', 'zero-width evasion is removed');
assert.equal(moderatePlayerText('That idea is stupid', 'standard'), 'That idea is stupid');
assert.equal(moderatePlayerText('That idea is stupid', 'strict'), 'That idea is [filtered]');
assert.equal(moderatePlayerText('Classic assessment in Scunthorpe', 'strict'), 'Classic assessment in Scunthorpe');

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const settingsPage = read('../settings/index.html');
const settingsUi = read('../settings/qol.js');
const globalChat = read('../chat-ui.js');
const privateChat = read('../private-messages-ui.js');
const migration = read('../supabase/migrations/20260919153000_configurable_content_moderation.sql');

assert.match(settingsPage, /id="contentFilterLevel"/);
assert.match(settingsPage, /Filtering is always on/);
assert.match(settingsUi, /save\(\{contentFilterLevel:/);
assert.match(globalChat, /moderatePlayerText\(message\.message/);
assert.match(privateChat, /moderatePlayerText\(message\.message/);
assert.match(migration, /before insert or update of message on public\.chat_messages/);
assert.match(migration, /before insert or update of message on public\.private_messages/);

const db = new PGlite();
await db.exec(read('./fixtures/late-game-live-schema.sql'));
await db.exec(`
  create table player_settings(
    player_id uuid primary key,
    settings jsonb not null default '{}',
    updated_at timestamptz default now()
  );
  create table chat_messages(
    id bigint generated always as identity primary key,
    sender_id uuid not null,
    message text not null
  );
  create table private_messages(
    id bigint generated always as identity primary key,
    sender_id uuid not null,
    recipient_id uuid not null,
    message text not null
  );
`);
await db.exec(migration);

const uid = '00000000-0000-0000-0000-000000000001';
const other = '00000000-0000-0000-0000-000000000002';
await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
await db.exec('set role authenticated');
let result = await db.query("select update_content_filter_level('strict') saved");
assert.equal(result.rows[0].saved.contentFilterLevel, 'strict');
await assert.rejects(
  () => db.query("select update_content_filter_level('off')"),
  /invalid_content_filter_level/
);
await db.exec('reset role');

await db.query('insert into chat_messages(sender_id,message) values($1,$2)', [uid, 'You are stupid']);
await db.query('insert into private_messages(sender_id,recipient_id,message) values($1,$2,$3)', [uid, other, 's.h.i.t']);
result = await db.query('select message from chat_messages');
assert.equal(result.rows[0].message, 'You are [filtered]');
result = await db.query('select message from private_messages');
assert.equal(result.rows[0].message, '[filtered]');

await db.close();
console.log('Content moderation: mandatory standard filtering, strict mode, settings UI, send/display paths and database triggers passed.');
