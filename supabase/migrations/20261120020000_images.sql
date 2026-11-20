alter table public.drawings alter column svg drop not null;
alter table public.drawings add column image_path text;
alter table public.jobs add column style text;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('dessins', 'dessins', true, 10485760, array['image/png','image/webp','image/jpeg'])
on conflict (id) do nothing;
