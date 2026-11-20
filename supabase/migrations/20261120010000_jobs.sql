create table public.jobs (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (kind in ('generate','edit')),
  day        date not null,
  idea       text,
  drawing_id uuid,
  prev_edits int,
  status     text not null default 'running' check (status in ('running','done','error')),
  error      text,
  created_at timestamptz not null default now()
);
alter table public.jobs enable row level security;
revoke all on public.jobs from anon, authenticated;
grant all on public.jobs to service_role;
