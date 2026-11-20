-- Giro 360 | Galeria de Eventos — esquema inicial
-- O banco guarda apenas metadados, permissões e referências; arquivos ficam no armazenamento S3/R2.

create table admin_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text not null,
  password_hash text not null,
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

create table settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  event_date date not null,
  city text not null,
  description text,
  cover_key text,
  cover_thumb_key text,
  public_token text not null unique,
  is_private boolean not null default true,
  access_code text,
  allow_full_browse boolean not null default false,
  -- Acesso dos convidados (busca, álbum, download, QR individual). A galeria em si nunca sai do ar.
  access_until timestamptz not null,
  -- Busca facial: ligada pela produção e limitada a N dias após o evento; depois o índice é apagado.
  face_search_enabled boolean not null default false,
  face_until timestamptz not null,
  face_collection_id text,
  face_purged_at timestamptz,
  show_in_portfolio boolean not null default false,
  created_by uuid references admin_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table media (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  kind text not null check (kind in ('photo', 'video')),
  original_filename text not null,
  content_type text not null,
  size_bytes bigint not null,
  client_fingerprint text not null,
  sha256 text,
  storage_key text not null unique,
  upload_mode text not null check (upload_mode in ('single', 'multipart')),
  upload_id text,
  status text not null default 'uploading'
    check (status in ('uploading', 'received', 'processing', 'ready', 'failed', 'duplicate')),
  error text,
  duplicate_of uuid references media(id) on delete set null,
  width integer,
  height integer,
  duration_sec numeric(10, 3),
  thumb_key text,
  preview_key text,
  poster_key text,
  derived_bytes bigint not null default 0,
  published boolean not null default true,
  unpublished_at timestamptz,
  consent_status text not null default 'pending' check (consent_status in ('pending', 'granted_all', 'denied')),
  -- Autorização de uso de imagem para divulgação (portfólio). Independente da busca facial.
  image_use boolean not null default false,
  image_use_note text,
  image_use_set_by uuid references admin_users(id) on delete set null,
  image_use_set_at timestamptz,
  highlight boolean not null default false,
  consent_note text,
  consent_set_by uuid references admin_users(id) on delete set null,
  consent_set_at timestamptz,
  face_status text not null default 'off'
    check (face_status in ('off', 'queued', 'indexing', 'indexed', 'no_faces', 'failed')),
  face_count integer not null default 0,
  face_indexed_at timestamptz,
  face_error text,
  capture_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ready_at timestamptz,
  -- Mesmo arquivo (impressão digital do cliente) no mesmo evento = mesma mídia: o reenvio retoma em vez de duplicar.
  unique (event_id, client_fingerprint)
);
create index media_event_list_idx on media (event_id, created_at desc, id desc);
create index media_event_sha_idx on media (event_id, sha256);
create index media_highlight_idx on media (event_id) where highlight;

-- Referências faciais: cada rosto indexado no provedor aponta para a mídia de origem (e o instante, em vídeos).
create table face_records (
  id bigserial primary key,
  event_id uuid not null references events(id) on delete cascade,
  media_id uuid not null references media(id) on delete cascade,
  provider text not null,
  face_id text not null,
  frame_ms integer,
  confidence real,
  bbox jsonb,
  created_at timestamptz not null default now(),
  unique (event_id, face_id)
);
create index face_records_media_idx on face_records (media_id);

-- Unidades já enviadas à IA (foto inteira ou um quadro de vídeo). Garante que reprocessar não cobra de novo.
create table ai_units (
  media_id uuid not null references media(id) on delete cascade,
  unit_key text not null,
  faces integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (media_id, unit_key)
);

-- Contabilidade de chamadas à IA por evento (sem vínculo com mídias para sobreviver à expiração).
create table ai_usage (
  id bigserial primary key,
  event_id uuid not null references events(id) on delete cascade,
  kind text not null check (kind in ('index_photo', 'index_video_frame', 'search', 'detect_selfie')),
  units integer not null default 1,
  provider text not null,
  created_at timestamptz not null default now()
);
create index ai_usage_event_idx on ai_usage (event_id, kind);

-- Fila persistente de tarefas pesadas do worker.
create table jobs (
  id bigserial primary key,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  run_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  dedupe_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index jobs_ready_idx on jobs (status, run_at) where status = 'queued';
create unique index jobs_dedupe_idx on jobs (dedupe_key) where dedupe_key is not null and status in ('queued', 'running');

-- Links individuais de captura (QR por foto/vídeo). Guardamos só o hash do token.
create table share_links (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  media_id uuid not null references media(id) on delete cascade,
  token_hash text not null unique,
  token_hint text not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_by uuid references admin_users(id) on delete set null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  use_count integer not null default 0
);
create index share_links_media_idx on share_links (media_id);

-- Sessões de convidado por evento (após código de acesso). Guardam as mídias liberadas pela busca.
create table guest_sessions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  code_verified boolean not null default false,
  granted_media uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index guest_sessions_event_idx on guest_sessions (event_id);

create table rate_limits (
  key text primary key,
  window_start timestamptz not null,
  count integer not null
);

-- Registro operacional de autorizações coletadas antes da captura.
create table consent_records (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  participant_name text not null,
  participant_contact text,
  capture_ref text,
  term_version text not null,
  scope text not null default 'face' check (scope in ('face', 'image_use', 'face_and_image_use')),
  collected_by text not null,
  collected_at timestamptz not null default now(),
  notes text,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index consent_records_event_idx on consent_records (event_id);

create table media_consents (
  media_id uuid not null references media(id) on delete cascade,
  consent_id uuid not null references consent_records(id) on delete cascade,
  primary key (media_id, consent_id)
);

-- Exclusões pendentes no provedor (armazenamento ou IA). Repetidas até concluírem.
create table deletion_tasks (
  id bigserial primary key,
  event_id uuid references events(id) on delete set null,
  target text not null check (target in ('object', 'prefix', 'faces', 'collection', 'multipart')),
  ref jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'done')),
  attempts integer not null default 0,
  last_error text,
  next_attempt_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index deletion_tasks_pending_idx on deletion_tasks (next_attempt_at) where status = 'pending';

create table removal_requests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete set null,
  name text not null,
  contact text not null,
  message text not null,
  status text not null default 'open' check (status in ('open', 'done')),
  created_at timestamptz not null default now(),
  handled_at timestamptz
);

-- Registro de buscas (sem imagem, sem dados biométricos).
create table search_logs (
  id bigserial primary key,
  event_id uuid not null references events(id) on delete cascade,
  outcome text not null,
  match_count integer not null default 0,
  created_at timestamptz not null default now()
);
create index search_logs_event_idx on search_logs (event_id);

create table audit_log (
  id bigserial primary key,
  actor text not null,
  action text not null,
  event_id uuid,
  media_id uuid,
  details jsonb,
  created_at timestamptz not null default now()
);

-- Índice simulado usado apenas por FACE_PROVIDER=mock (nunca em produção).
create table mock_face_index (
  collection_id text not null,
  face_id text not null,
  persona integer not null,
  external_id text not null,
  created_at timestamptz not null default now(),
  primary key (collection_id, face_id)
);
create table mock_collections (
  collection_id text primary key,
  created_at timestamptz not null default now()
);
