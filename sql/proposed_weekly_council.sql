-- Proposed Quest-owned cache for the weekly council read.
-- Do NOT apply this against Payments. Quest never writes to Payments.
-- Until a Quest-owned schema exists, api/weekly-council.ts persists to
-- /tmp/quest-weekly-council-cache.json (or an in-memory store in tests).

create table if not exists weekly_council_cache (
  week text not null,
  horizon integer not null,
  lang text not null,
  payload_hash text not null,
  read jsonb not null,
  generated_at timestamptz not null,
  token_count integer not null,
  primary key (week, horizon, lang)
);

create table if not exists weekly_council_regen (
  user_id text not null,
  day date not null,
  count integer not null,
  primary key (user_id, day)
);
