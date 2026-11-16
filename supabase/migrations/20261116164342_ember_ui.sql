-- Ember UI: equipment imagery and owner subscription plans
alter table public.machines
  add column if not exists image_url text,
  add column if not exists location text;

create table if not exists public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  tagline text,
  title text,
  description text,
  trial_days integer not null default 30,
  price_monthly numeric(10,2) not null,
  price_yearly numeric(10,2) not null,
  currency text not null default 'USD',
  features text[] not null default '{}',
  highlight boolean not null default false,
  sort integer not null default 0,
  active boolean not null default true
);
alter table public.subscription_plans enable row level security;

drop policy if exists "plans readable by signed-in users" on public.subscription_plans;
create policy "plans readable by signed-in users"
  on public.subscription_plans for select to authenticated
  using (active);
grant select on public.subscription_plans to authenticated;

create table if not exists public.owner_subscriptions (
  owner_id uuid primary key references public.profiles(id) on delete cascade,
  plan_id uuid references public.subscription_plans(id),
  billing_cycle text not null default 'monthly'
    check (billing_cycle in ('monthly','yearly')),
  status text not null default 'trialing'
    check (status in ('trialing','active','cancelled')),
  trial_ends_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.owner_subscriptions enable row level security;

drop policy if exists "owner reads own subscription" on public.owner_subscriptions;
create policy "owner reads own subscription"
  on public.owner_subscriptions for select to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists "admin inserts own subscription" on public.owner_subscriptions;
create policy "admin inserts own subscription"
  on public.owner_subscriptions for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.role = 'admin'
    )
  );

drop policy if exists "admin updates own subscription" on public.owner_subscriptions;
create policy "admin updates own subscription"
  on public.owner_subscriptions for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.role = 'admin'
    )
  );
grant select, insert, update on public.owner_subscriptions to authenticated;

insert into storage.buckets (id, name, public)
values ('machine-images', 'machine-images', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "public reads machine images" on storage.objects;
create policy "public reads machine images"
  on storage.objects for select
  using (bucket_id = 'machine-images');

drop policy if exists "admin uploads machine images" on storage.objects;
create policy "admin uploads machine images"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'machine-images'
    and private.is_admin()
  );

insert into public.subscription_plans
  (slug, name, tagline, title, description, price_monthly, price_yearly, currency, features, highlight, sort)
values
  ('starter','Starter','Get your first machines online.','Starter','Start with a 30-day free trial.',1.99,19.99,'USD',
    array['Up to 3 machines','Booking requests','Basic reports'],false,1),
  ('growth','Growth','Grow your rental fleet.','Growth','Start with a 30-day free trial.',2.99,29.99,'USD',
    array['All benefits of Starter','Up to 15 machines','Operator attendance'],false,2),
  ('business','Business','Scale your rental business efficiently.','Business Growth',
    'Start with a 30-day free trial and powerful tools to manage, market, and grow rentals.',4.99,49.99,'USD',
    array['All benefits of Starter and Growth','Five user licenses','Dedicated success manager','Priority support','Open API · 3rd party systems'],
    true,3)
on conflict (slug) do nothing;
