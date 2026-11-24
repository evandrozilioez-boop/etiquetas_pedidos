-- Giro 360 | Galeria de Eventos — esquema para Cloudflare D1 (SQLite)
-- Datas e horas em texto ISO 8601 UTC (ex.: 2026-11-24T12:00:00.000Z); booleanos em 0/1; ids UUID gerados na aplicação.
-- O banco guarda só metadados, permissões e referências; arquivos ficam no R2.

create table admin_users (
  id text primary key,
  email text not null unique,
  name text not null,
  password_hash text not null,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  last_login_at text
);

create table settings (
  key text primary key,
  value text not null,
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

create table events (
  id text primary key,
  name text not null,
  event_date text not null,
  city text not null,
  description text,
  cover_key text,
  cover_thumb_key text,
  public_token text not null unique,
  is_private integer not null default 1,
  access_code text,
  allow_full_browse integer not null default 0,
  access_until text not null,
  face_search_enabled integer not null default 0,
  face_until text not null,
  face_collection_id text,
  face_purged_at text,
  show_in_portfolio integer not null default 0,
  created_by text references admin_users(id) on delete set null,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

create table media (
  id text primary key,
  event_id text not null references events(id) on delete cascade,
  kind text not null check (kind in ('photo', 'video')),
  original_filename text not null,
  content_type text not null,
  size_bytes integer not null,
  client_fingerprint text not null,
  sha256 text,
  storage_key text not null unique,
  upload_mode text not null check (upload_mode in ('single', 'multipart')),
  upload_id text,
  status text not null default 'uploading'
    check (status in ('uploading', 'received', 'processing', 'ready', 'failed', 'duplicate')),
  error text,
  duplicate_of text references media(id) on delete set null,
  width integer,
  height integer,
  duration_sec real,
  thumb_key text,
  preview_key text,
  poster_key text,
  derived_bytes integer not null default 0,
  published integer not null default 1,
  unpublished_at text,
  consent_status text not null default 'pending' check (consent_status in ('pending', 'granted_all', 'denied')),
  consent_note text,
  consent_set_by text,
  consent_set_at text,
  image_use integer not null default 0,
  image_use_note text,
  image_use_set_by text,
  image_use_set_at text,
  highlight integer not null default 0,
  face_status text not null default 'off'
    check (face_status in ('off', 'queued', 'indexing', 'indexed', 'no_faces', 'failed')),
  face_count integer not null default 0,
  face_indexed_at text,
  face_error text,
  capture_label text,
  process_attempts integer not null default 0,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ready_at text,
  unique (event_id, client_fingerprint)
);
create index media_event_list_idx on media (event_id, created_at desc, id desc);
create index media_event_sha_idx on media (event_id, sha256);
create index media_highlight_idx on media (event_id) where highlight = 1;

create table face_records (
  id integer primary key autoincrement,
  event_id text not null references events(id) on delete cascade,
  media_id text not null references media(id) on delete cascade,
  provider text not null,
  face_id text not null,
  frame_ms integer,
  confidence real,
  bbox text,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  unique (event_id, face_id)
);
create index face_records_media_idx on face_records (media_id);

-- Unidades já enviadas à IA (foto inteira ou quadro de vídeo): reprocessar não cobra de novo.
create table ai_units (
  media_id text not null references media(id) on delete cascade,
  unit_key text not null,
  faces integer not null default 0,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  primary key (media_id, unit_key)
);

create table ai_usage (
  id integer primary key autoincrement,
  event_id text not null references events(id) on delete cascade,
  kind text not null check (kind in ('index_photo', 'index_video_frame', 'search', 'detect_selfie')),
  units integer not null default 1,
  provider text not null,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index ai_usage_event_idx on ai_usage (event_id, kind);

create table share_links (
  id text primary key,
  event_id text not null references events(id) on delete cascade,
  media_id text not null references media(id) on delete cascade,
  token_hash text not null unique,
  token_hint text not null,
  expires_at text not null,
  revoked_at text,
  created_by text,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  last_used_at text,
  use_count integer not null default 0
);
create index share_links_media_idx on share_links (media_id);

create table guest_sessions (
  id text primary key,
  event_id text not null references events(id) on delete cascade,
  code_verified integer not null default 0,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at text not null
);
create index guest_sessions_event_idx on guest_sessions (event_id);

-- Mídias liberadas pela busca de cada sessão de convidado.
create table guest_grants (
  session_id text not null references guest_sessions(id) on delete cascade,
  media_id text not null references media(id) on delete cascade,
  primary key (session_id, media_id)
);

create table rate_limits (
  key text primary key,
  window_start text not null,
  count integer not null
);

create table consent_records (
  id text primary key,
  event_id text not null references events(id) on delete cascade,
  participant_name text not null,
  participant_contact text,
  capture_ref text,
  term_version text not null,
  scope text not null default 'face' check (scope in ('face', 'image_use', 'face_and_image_use')),
  collected_by text not null,
  collected_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  notes text,
  revoked_at text,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index consent_records_event_idx on consent_records (event_id);

create table media_consents (
  media_id text not null references media(id) on delete cascade,
  consent_id text not null references consent_records(id) on delete cascade,
  primary key (media_id, consent_id)
);

-- Exclusões pendentes no armazenamento ou na IA, repetidas até concluírem.
create table deletion_tasks (
  id integer primary key autoincrement,
  event_id text,
  target text not null check (target in ('object', 'prefix', 'faces', 'collection', 'multipart')),
  ref text not null,
  status text not null default 'pending' check (status in ('pending', 'done')),
  attempts integer not null default 0,
  last_error text,
  next_attempt_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index deletion_tasks_pending_idx on deletion_tasks (status, next_attempt_at);

create table removal_requests (
  id text primary key,
  event_id text references events(id) on delete set null,
  name text not null,
  contact text not null,
  message text not null,
  status text not null default 'open' check (status in ('open', 'done')),
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  handled_at text
);

create table search_logs (
  id integer primary key autoincrement,
  event_id text not null references events(id) on delete cascade,
  outcome text not null,
  match_count integer not null default 0,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index search_logs_event_idx on search_logs (event_id);

create table audit_log (
  id integer primary key autoincrement,
  actor text not null,
  action text not null,
  event_id text,
  media_id text,
  details text,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Índice simulado (FACE_PROVIDER=mock), nunca usado em produção.
create table mock_face_index (
  collection_id text not null,
  face_id text not null,
  persona integer not null,
  external_id text not null,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  primary key (collection_id, face_id)
);
