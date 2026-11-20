-- L'Atelier à colorier : schéma initial.
-- Tout l'accès passe par l'Edge Function "atelier" (clé secrète).
-- Aucun accès direct pour anon / authenticated.

create table public.settings (
  id          int primary key default 1 check (id = 1),
  pin_hash    text,
  pin_salt    text not null default replace(gen_random_uuid()::text, '-', ''),
  daily_limit int  not null default 2 check (daily_limit between 1 and 10),
  fail_day    date,
  fail_count  int  not null default 0
);
insert into public.settings (id) values (1);

create table public.usage (
  day   date primary key,
  used  int not null default 0,
  bonus int not null default 0
);

create table public.drawings (
  id         uuid primary key default gen_random_uuid(),
  idea       text not null check (char_length(idea) <= 300),
  svg        text not null,
  edits      int  not null default 0,
  created_at timestamptz not null default now()
);
create index drawings_created_at_idx on public.drawings (created_at desc);

alter table public.settings enable row level security;
alter table public.usage    enable row level security;
alter table public.drawings enable row level security;

revoke all on public.settings, public.usage, public.drawings from anon, authenticated;
grant all on public.settings, public.usage, public.drawings to service_role;

-- Réserve un dessin pour la journée, de façon atomique.
create function public.reserve_drawing(p_day date)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  lim int;
begin
  select daily_limit into lim from public.settings where id = 1;
  insert into public.usage (day) values (p_day) on conflict (day) do nothing;
  update public.usage set used = used + 1
   where day = p_day and used < lim + bonus;
  return found;
end;
$$;

-- Rend le dessin si la génération a échoué.
create function public.refund_drawing(p_day date)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.usage set used = greatest(used - 1, 0) where day = p_day;
$$;

revoke execute on function public.reserve_drawing(date), public.refund_drawing(date) from public, anon, authenticated;
grant  execute on function public.reserve_drawing(date), public.refund_drawing(date) to service_role;
