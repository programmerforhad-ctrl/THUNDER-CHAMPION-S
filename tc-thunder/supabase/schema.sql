-- =====================================================================
-- THUNDER CHAMPION'S (TC) - Supabase schema
-- Run this whole file once in: Supabase Dashboard > SQL Editor > New query
-- Safe to re-run.
-- =====================================================================

-- Functions below reference tables created later in this file, so skip body checks at creation time.
set check_function_bodies = off;

create extension if not exists pgcrypto with schema extensions;

-- ---------- Admin / role tables ----------
create table if not exists public.admins (
  email text primary key,
  role  text not null default 'admin' check (role in ('admin','manager','coach'))
);

create or replace function public.jwt_email() returns text
language sql stable as $$ select lower(coalesce(auth.jwt()->>'email','')) $$;

create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.admins where lower(email)=public.jwt_email() limit 1
$$;

-- admin = everything | manager = site operations | coach = Coaching Zone content
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$ select coalesce(public.my_role() = 'admin', false) $$;

create or replace function public.is_manager() returns boolean
language sql stable security definer set search_path = public as $$ select coalesce(public.my_role() in ('admin','manager'), false) $$;

create or replace function public.is_coach() returns boolean
language sql stable security definer set search_path = public as $$ select coalesce(public.my_role() in ('admin','coach'), false) $$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$ select public.my_role() is not null $$;

-- captain = a player flagged is_captain, or any staff member (they can always send voice too)
create or replace function public.is_captain() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_staff() or coalesce((select is_captain from public.players where lower(email)=public.jwt_email()), false)
$$;

-- member = any staff role, or an APPROVED player whose email matches the logged-in
-- account. A player who has signed up but not yet been approved by the Super Admin
-- is authenticated but is_member() stays false, so the Coaching Zone / Finance /
-- Team chat stay locked for them until Admin ticks "Approved" in Squad.
create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_staff()
      or exists(select 1 from public.players where lower(email)=public.jwt_email() and coalesce(approved,false) = true)
$$;

-- ---------- Tables ----------
create table if not exists public.team (
  id int primary key default 1 check (id = 1),
  name text default 'THUNDER CHAMPION''S',
  short_name text default 'TC',
  tagline text default '#NEVER BACK DOWN',
  description text,
  founded text,
  founder text,
  email text,
  logo_url text,
  cover_url text,
  facebook text, youtube text, tiktok text, discord text,
  whatsapp text,
  app_url text,
  copyright text default 'All rights reserved.',
  policy text,
  developer text,
  contact text,
  owner_percent numeric default 0,
  sponsor_percent numeric default 15,
  manager_percent numeric default 20,
  squad_fund_percent numeric default 0,
  developer_image_url text,
  developer_link text
);

create table if not exists public.players (
  id bigint generated always as identity primary key,
  ign text not null,
  full_name text,
  game_uid text,
  game_role text,
  joined date,
  age int,
  about text,
  image_url text,
  cover_url text,
  clip_url text,
  email text,
  approved boolean default false,
  tournaments int default 0,
  kills int default 0,
  earnings numeric default 0,
  sort int default 100
);

create table if not exists public.staff (
  id bigint generated always as identity primary key,
  name text not null,
  position text,
  age int,
  about text,
  image_url text,
  cover_url text,
  sort int default 100
);

create table if not exists public.achievements (
  id bigint generated always as identity primary key,
  title text not null,
  description text,
  date date,
  image_url text
);

create table if not exists public.notices (
  id bigint generated always as identity primary key,
  title text not null,
  body text,
  active boolean default true,
  created_at timestamptz default now()
);

create table if not exists public.knowledge (
  id bigint generated always as identity primary key,
  section text not null check (section in ('esports','igl','roles','rules','tournament')),
  title text not null,
  body text,
  sort int default 100
);

create table if not exists public.strategies (
  id bigint generated always as identity primary key,
  title text not null,
  description text,
  media_url text,
  drawing jsonb default '[]'::jsonb,
  version int default 1,
  parent_id bigint references public.strategies(id) on delete set null,
  created_by text,
  created_at timestamptz default now()
);

create table if not exists public.strategy_comments (
  id bigint generated always as identity primary key,
  strategy_id bigint not null references public.strategies(id) on delete cascade,
  author text,
  author_email text,
  body text not null,
  created_at timestamptz default now()
);

create table if not exists public.schedules (
  id bigint generated always as identity primary key,
  title text not null,
  type text default 'practice',
  starts_at timestamptz not null,
  note text,
  for_player text,
  remind_min int default 30
);

create table if not exists public.messages (
  id bigint generated always as identity primary key,
  author text,
  author_email text,
  body text not null,
  created_at timestamptz default now()
);

create table if not exists public.tournaments (
  id bigint generated always as identity primary key,
  name text not null,
  played_at date,
  position text,
  entry_fee numeric default 0,
  prize_win numeric default 0,
  mgmt_percent numeric default 0,
  player_percent numeric default 0
);

-- which players played a given tournament (drives their "tournaments played" stat and their revenue share)
create table if not exists public.tournament_players (
  tournament_id bigint not null references public.tournaments(id) on delete cascade,
  player_id bigint not null references public.players(id) on delete cascade,
  primary key (tournament_id, player_id)
);

create table if not exists public.app_secrets (
  key text primary key,
  value text
);

-- upgrades for databases created by an earlier version of this file
alter table public.players add column if not exists full_name text;
alter table public.players add column if not exists is_captain boolean default false;
alter table public.admins drop constraint if exists admins_role_check;
alter table public.admins add constraint admins_role_check check (role in ('admin','manager','coach'));
alter table public.messages add column if not exists kind text default 'text';
alter table public.messages drop constraint if exists messages_kind_check;
alter table public.messages add constraint messages_kind_check check (kind in ('text','voice'));
alter table public.messages add column if not exists audio_url text;
alter table public.messages add column if not exists duration numeric;
alter table public.messages alter column body drop not null;

alter table public.team add column if not exists owner_percent numeric default 0;
alter table public.team add column if not exists sponsor_percent numeric default 15;
alter table public.team add column if not exists manager_percent numeric default 20;
alter table public.team add column if not exists squad_fund_percent numeric default 0;
alter table public.players add column if not exists revenue_percent numeric default 13;
alter table public.players add column if not exists approved boolean default false;
alter table public.team add column if not exists developer_image_url text;
alter table public.team add column if not exists developer_link text;

create table if not exists public.tournament_players (
  tournament_id bigint not null references public.tournaments(id) on delete cascade,
  player_id bigint not null references public.players(id) on delete cascade,
  primary key (tournament_id, player_id)
);
alter table public.tournament_players enable row level security;

create table if not exists public.message_plays (
  message_id bigint not null references public.messages(id) on delete cascade,
  player_email text not null,
  played_seconds numeric not null default 0,
  updated_at timestamptz default now(),
  primary key (message_id, player_email)
);
alter table public.message_plays enable row level security;

-- ---------- Guard: players can not edit their own stats / role / email ----------
create or replace function public.players_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    new.tournaments := old.tournaments;
    new.kills := old.kills;
    new.earnings := old.earnings;
    new.email := old.email;
    new.full_name := old.full_name;
    new.is_captain := old.is_captain;
    new.revenue_percent := old.revenue_percent;
    new.approved := old.approved;
    new.game_uid := old.game_uid;
    new.game_role := old.game_role;
    new.sort := old.sort;
  end if;
  return new;
end $$;
drop trigger if exists trg_players_guard on public.players;
create trigger trg_players_guard before update on public.players
  for each row execute function public.players_guard();

-- ---------- UID login: a player's login email is derived from their UID, never
-- typed by anyone. This keeps the login form to "UID + password" only.
create or replace function public.sync_player_email() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.game_uid is not null and length(trim(new.game_uid)) > 0 then
    new.email := 'p' || lower(regexp_replace(new.game_uid, '[^a-zA-Z0-9]', '', 'g')) || '@players.tc.local';
  else
    new.email := null;
  end if;
  return new;
end $$;
drop trigger if exists trg_players_sync_email on public.players;
create trigger trg_players_sync_email before insert or update on public.players
  for each row execute function public.sync_player_email();

-- ---------- Auto stats: a player's "tournaments played" and "earnings" are
-- computed from which tournaments they were added to (tournament_players)
-- and their own revenue_percent, so nobody can edit them by hand.
create or replace function public.recalc_player(pid bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.players p set
    tournaments = (select count(*) from public.tournament_players tp where tp.player_id = pid),
    -- a player earns their % of the tournament's PROFIT (prize - entry fee), never
    -- of the raw prize — a breakeven or loss tournament pays nobody anything
    earnings = coalesce((select sum(round(greatest(t.prize_win - t.entry_fee, 0) * p.revenue_percent / 100.0, 2))
                          from public.tournament_players tp join public.tournaments t on t.id = tp.tournament_id
                          where tp.player_id = pid), 0)
  where p.id = pid;
end $$;

create or replace function public.trg_tp_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then perform public.recalc_player(old.player_id); return old;
  else perform public.recalc_player(new.player_id); return new; end if;
end $$;
drop trigger if exists tp_change on public.tournament_players;
create trigger tp_change after insert or delete on public.tournament_players
  for each row execute function public.trg_tp_change();

create or replace function public.trg_player_revpercent() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.revenue_percent is distinct from old.revenue_percent then perform public.recalc_player(new.id); end if;
  return new;
end $$;
drop trigger if exists player_revpercent on public.players;
create trigger player_revpercent after update of revenue_percent on public.players
  for each row execute function public.trg_player_revpercent();

create or replace function public.trg_tournament_prize() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  -- player earnings are based on profit (prize - entry fee), so either changing
  if new.prize_win is distinct from old.prize_win or new.entry_fee is distinct from old.entry_fee then
    for r in select player_id from public.tournament_players where tournament_id = new.id loop
      perform public.recalc_player(r.player_id);
    end loop;
  end if;
  return new;
end $$;
drop trigger if exists tournament_prize on public.tournaments;
create trigger tournament_prize after update of prize_win, entry_fee on public.tournaments
  for each row execute function public.trg_tournament_prize();

-- One-time (and safe to repeat) recalc so every player's stored earnings match
-- the current formula — needed the first time this file runs after the formula
-- changed from "% of prize" to "% of profit".
do $$ declare r record; begin
  for r in select id from public.players loop perform public.recalc_player(r.id); end loop;
end $$;

-- ---------- Row Level Security ----------
alter table public.admins enable row level security;
alter table public.team enable row level security;
alter table public.players enable row level security;
alter table public.staff enable row level security;
alter table public.achievements enable row level security;
alter table public.notices enable row level security;
alter table public.knowledge enable row level security;
alter table public.strategies enable row level security;
alter table public.strategy_comments enable row level security;
alter table public.schedules enable row level security;
alter table public.messages enable row level security;
alter table public.tournaments enable row level security;
alter table public.app_secrets enable row level security;  -- no policies = nobody can read directly

-- admins: only admins manage the list
drop policy if exists "admins_all" on public.admins;
create policy "admins_all" on public.admins for all using (public.is_admin()) with check (public.is_admin());

-- public readable, admin writable
do $$
declare t text;
begin
  foreach t in array array['team','players','staff','achievements'] loop
    execute format('drop policy if exists "%1$s_read" on public.%1$s', t);
    execute format('drop policy if exists "%1$s_write" on public.%1$s', t);
    execute format('create policy "%1$s_read" on public.%1$s for select using (true)', t);
    execute format('create policy "%1$s_write" on public.%1$s for all using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

-- players: a player may update their own row (trigger blocks sensitive columns)
drop policy if exists "players_self_update" on public.players;
create policy "players_self_update" on public.players for update
  using (lower(email) = public.jwt_email()) with check (lower(email) = public.jwt_email());

-- notices: public read, managers write
drop policy if exists "notices_read" on public.notices;
drop policy if exists "notices_write" on public.notices;
create policy "notices_read" on public.notices for select using (true);
create policy "notices_write" on public.notices for all using (public.is_manager()) with check (public.is_manager());

-- knowledge: members read, admin write
drop policy if exists "knowledge_read" on public.knowledge;
drop policy if exists "knowledge_write" on public.knowledge;
create policy "knowledge_read" on public.knowledge for select using (public.is_member());
create policy "knowledge_write" on public.knowledge for all using (public.is_coach()) with check (public.is_coach());

-- strategies: members read + create, creator/manager update, manager delete
drop policy if exists "strat_read" on public.strategies;
drop policy if exists "strat_insert" on public.strategies;
drop policy if exists "strat_update" on public.strategies;
drop policy if exists "strat_delete" on public.strategies;
create policy "strat_read" on public.strategies for select using (public.is_member());
create policy "strat_insert" on public.strategies for insert with check (public.is_member());
create policy "strat_update" on public.strategies for update
  using (public.is_staff() or lower(created_by) = public.jwt_email());
create policy "strat_delete" on public.strategies for delete using (public.is_staff());

-- strategy comments
drop policy if exists "sc_read" on public.strategy_comments;
drop policy if exists "sc_insert" on public.strategy_comments;
drop policy if exists "sc_delete" on public.strategy_comments;
create policy "sc_read" on public.strategy_comments for select using (public.is_member());
create policy "sc_insert" on public.strategy_comments for insert
  with check (public.is_member() and lower(author_email) = public.jwt_email());
create policy "sc_delete" on public.strategy_comments for delete using (public.is_staff());

-- schedules
drop policy if exists "sch_read" on public.schedules;
drop policy if exists "sch_write" on public.schedules;
create policy "sch_read" on public.schedules for select using (public.is_member());
create policy "sch_write" on public.schedules for all using (public.is_manager() or public.is_coach()) with check (public.is_manager() or public.is_coach());

-- team chat
drop policy if exists "msg_read" on public.messages;
drop policy if exists "msg_insert" on public.messages;
drop policy if exists "msg_delete" on public.messages;
create policy "msg_read" on public.messages for select using (public.is_member());
create policy "msg_insert" on public.messages for insert
  with check (public.is_member() and lower(author_email) = public.jwt_email() and (coalesce(kind,'text') = 'text' or public.is_captain()));
create policy "msg_delete" on public.messages for delete using (public.is_staff());

-- voice-message play tracking: members read all, each player writes only their own row
drop policy if exists "mp_read" on public.message_plays;
drop policy if exists "mp_insert" on public.message_plays;
drop policy if exists "mp_update" on public.message_plays;
create policy "mp_read" on public.message_plays for select using (public.is_member());
create policy "mp_insert" on public.message_plays for insert
  with check (public.is_member() and lower(player_email) = public.jwt_email());
create policy "mp_update" on public.message_plays for update using (lower(player_email) = public.jwt_email());

-- tournaments (finance): admin only. Players read through finance_view() below.
drop policy if exists "tour_all" on public.tournaments;
create policy "tour_all" on public.tournaments for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "tp_all" on public.tournament_players;
create policy "tp_all" on public.tournament_players for all using (public.is_admin()) with check (public.is_admin());

-- ---------- Finance password (server-side) ----------
create or replace function public.set_finance_password(p text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.is_admin() then raise exception 'Forbidden'; end if;
  insert into public.app_secrets(key, value) values ('finance_pass', crypt(p, gen_salt('bf')))
  on conflict (key) do update set value = excluded.value;
end $$;

-- Admin gets the full breakdown: every tournament with its participants and
-- exactly how much each stakeholder (owner/sponsor/manager/fund/each player) earned.
-- A player who only has the finance password gets three totals and nothing else.
create or replace function public.finance_view(pass text default null) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare ok boolean := false; h text;
begin
  if not public.is_member() then raise exception 'Login required'; end if;
  if public.is_admin() then
    return jsonb_build_object(
      'admin', true,
      'team', (select to_jsonb(x) from (select owner_percent, sponsor_percent, manager_percent, squad_fund_percent from public.team where id = 1) x),
      'tournaments', coalesce((select jsonb_agg(jsonb_build_object(
          'id', t.id, 'name', t.name, 'played_at', t.played_at, 'position', t.position,
          'entry_fee', t.entry_fee, 'prize_win', t.prize_win,
          'participants', coalesce((select jsonb_agg(jsonb_build_object(
              'player_id', p.id, 'ign', p.ign, 'full_name', p.full_name,
              'revenue_percent', p.revenue_percent, 'amount', round(greatest(t.prize_win - t.entry_fee, 0) * p.revenue_percent / 100.0, 2)
            ) order by p.sort, p.id)
            from public.tournament_players tp join public.players p on p.id = tp.player_id where tp.tournament_id = t.id), '[]'::jsonb)
        ) order by t.played_at desc nulls last, t.id desc)
        from public.tournaments t), '[]'::jsonb)
    );
  end if;
  select value into h from public.app_secrets where key = 'finance_pass';
  if h is not null and pass is not null and crypt(pass, h) = h then ok := true; end if;
  if not ok then perform pg_sleep(1.5); raise exception 'Wrong finance password'; end if;
  return jsonb_build_object(
    'admin', false,
    'total_tournaments', (select count(*) from public.tournaments),
    'total_entry_fee', (select coalesce(sum(entry_fee), 0) from public.tournaments),
    'total_prize', (select coalesce(sum(prize_win), 0) from public.tournaments)
  );
end $$;

revoke all on function public.set_finance_password(text) from public, anon;
revoke all on function public.finance_view(text) from public, anon;
grant execute on function public.set_finance_password(text) to authenticated;
grant execute on function public.finance_view(text) to authenticated;
grant execute on function public.my_role(), public.is_admin(), public.is_manager(), public.is_coach(), public.is_staff(), public.is_member(), public.is_captain() to anon, authenticated;

-- ---------- Storage buckets + policies ----------
insert into storage.buckets (id, name, public) values
  ('Logo','Logo',true), ('Roaster','Roaster',true), ('Achievment','Achievment',true),
  ('Highlight','Highlight',true), ('Extra','Extra',true)
on conflict (id) do update set public = true;

drop policy if exists "tc_admin_storage" on storage.objects;
drop policy if exists "tc_member_upload" on storage.objects;
create policy "tc_admin_storage" on storage.objects for all
  using (bucket_id in ('Logo','Roaster','Achievment','Highlight','Extra') and public.is_admin())
  with check (bucket_id in ('Logo','Roaster','Achievment','Highlight','Extra') and public.is_admin());
create policy "tc_member_upload" on storage.objects for insert to authenticated
  with check ((bucket_id in ('Roaster','Highlight','Extra') and public.is_member())
    or (bucket_id = 'Extra' and public.is_captain()));

-- ---------- Realtime for team chat ----------
do $$ begin
  alter publication supabase_realtime add table public.messages;
exception when others then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.message_plays;
exception when others then null; end $$;

-- ---------- Seed data ----------
insert into public.team (id, name, short_name, tagline, description, developer, contact)
values (1, 'THUNDER CHAMPION''S', 'TC', '#NEVER BACK DOWN',
        'THUNDER CHAMPION''S is a competitive esports organisation built on discipline, teamwork and dedication.',
        'Your Developer', 'Add contact in Admin Panel')
on conflict (id) do nothing;

-- Bangla knowledge base. Idempotent: removes any older English or Bangla
-- seed rows by exact title, then inserts fresh, so this is safe to re-run
-- without touching topics you added yourself from the Admin/Coach panel.
delete from public.knowledge where title in (
  '1. Follow the IGL call','2. No needless solo fights','3. Keep communication clear','4. Know your teammates'' positions',
  '5. Do not delay rotations','6. Avoid unnecessary fights','7. Plan before you split','8. No extra risk for a finish',
  '9. Play your assigned role','10. Share information instantly','11. Do not panic','12. No blame during a match',
  '13. Coordinate the end zone','14. No unnecessary looting','15. Use vehicles with a plan','16. Confirm enemy information',
  '17. Discipline in practice','18. Follow tournament rules','19. Respect opponents and teammates','20. Review every match',
  '21. Keep team strategy private','22. Keep emergency calls short','23. Team result comes first','24. Prepare before every match',
  '25. Team discipline above all','IGL','Entry Fragger','Support','Scout','Flanker','Flexible Player',
  'IGL responsibilities','When to rotate','When to take a fight','When to avoid a fight','Zone reading and end-zone calling','Emergency calls',
  'Rotation','Positioning','Zone management','End zone','Fight selection','Communication','Map knowledge','Team coordination','Advanced techniques',
  'Tournament rules and format','Preparation','Match discipline'
);
delete from public.knowledge where title in (
  '১. IGL-এর কল মেনে চলা','২. অকারণে সোলো ফাইট না নেওয়া','৩. কমিউনিকেশন পরিষ্কার রাখা','৪. টিমমেটের পজিশন জানা','৫. রোটেশনে দেরি না করা',
  '৬. অপ্রয়োজনীয় ফাইট এড়ানো','৭. স্প্লিট করার আগে প্ল্যান করা','৮. ফিনিশের জন্য বাড়তি ঝুঁকি না নেওয়া','৯. নিজের রোল পালন করা','১০. তথ্য সাথে সাথে শেয়ার করা',
  '১১. প্যানিক না করা','১২. ম্যাচের মধ্যে ব্লেম না করা','১৩. এন্ড-জোন কোঅর্ডিনেশন','১৪. অপ্রয়োজনীয় লুট না করা','১৫. পরিকল্পনা করে ভেহিকল ব্যবহার',
  '১৬. এনিমি ইনফরমেশন কনফার্ম করা','১৭. প্র্যাকটিসে ডিসিপ্লিন','১৮. টুর্নামেন্ট রুলস মেনে চলা','১৯. প্রতিপক্ষ ও টিমমেটকে সম্মান করা','২০. ম্যাচ রিভিউ করা',
  '২১. টিম স্ট্র্যাটেজি গোপন রাখা','২২. ইমার্জেন্সি কল ছোট রাখা','২৩. টিম রেজাল্ট আগে','২৪. প্রতিটা ম্যাচের আগে প্রস্তুতি','২৫. সার্বিক টিম ডিসিপ্লিন',
  'IGL','এন্ট্রি ফ্র্যাগার','সাপোর্ট','স্কাউট','ফ্ল্যাংকার','ফ্লেক্সিবল প্লেয়ার',
  'IGL-এর দায়িত্ব','কখন রোটেট করবে','কখন ফাইট নেবে','কখন ফাইট এড়াবে','জোন রিডিং ও এন্ড-জোন কলিং','ইমার্জেন্সি কল',
  'রোটেশন','পজিশনিং','জোন ম্যানেজমেন্ট','এন্ড জোন','ফাইট সিলেকশন','কমিউনিকেশন','ম্যাপ নলেজ','টিম কোঅর্ডিনেশন','অ্যাডভান্সড টেকনিক',
  'টুর্নামেন্ট রুলস ও ফরম্যাট','প্রস্তুতি','ম্যাচ ডিসিপ্লিন'
);
insert into public.knowledge (section, title, body, sort) values
('rules','১. IGL-এর কল মেনে চলা','IGL পুরো ম্যাচ দেখে সিদ্ধান্ত নেয়। প্রথমে কল ফলো করো, রাউন্ড শেষে আলোচনা করো।',1),
('rules','২. অকারণে সোলো ফাইট না নেওয়া','কল ছাড়া সোলো ফাইট টিম প্ল্যান ভেঙে দেয় এবং টিমমেটদের ঝুঁকিতে ফেলে।',2),
('rules','৩. কমিউনিকেশন পরিষ্কার রাখা','ছোট, পরিষ্কার, শান্ত কল দাও। চিৎকার বা একসাথে কথা বলা যাবে না।',3),
('rules','৪. টিমমেটের পজিশন জানা','সবসময় জানো টিমমেট কোথায় আছে, যাতে ফাইট ট্রেড এবং একসাথে রোটেট করতে পারো।',4),
('rules','৫. রোটেশনে দেরি না করা','দেরি করলে জোন পজিশন খারাপ হয়ে যায়। IGL কল দিলে সাথে সাথে মুভ করো।',5),
('rules','৬. অপ্রয়োজনীয় ফাইট এড়ানো','প্রতিটা ফাইটে হেলথ, অ্যামো আর সময় খরচ হয়। শুধু সেই ফাইট নাও যা পজিশন ভালো করে।',6),
('rules','৭. স্প্লিট করার আগে প্ল্যান করা','স্প্লিট করার উদ্দেশ্য, সময় আর রিগ্রুপ পয়েন্ট আগে ঠিক করে নাও।',7),
('rules','৮. ফিনিশের জন্য বাড়তি ঝুঁকি না নেওয়া','নক করাটা wipe হওয়ার সমান গুরুত্বপূর্ণ না। কিল তাড়া করার আগে টিমকে সেফ রাখো।',8),
('rules','৯. নিজের রোল পালন করা','প্রতিটা রোল থাকে যাতে টিমে কোনো গ্যাপ না থাকে। কল ছাড়া মাঝপথে রোল বদলানো যাবে না।',9),
('rules','১০. তথ্য সাথে সাথে শেয়ার করা','এনিমি কাউন্ট, ডিরেকশন, দূরত্ব আর হেলথ — দেখার সাথে সাথে বলে দাও।',10),
('rules','১১. প্যানিক না করা','প্যানিক খারাপ সিদ্ধান্ত তৈরি করে। শান্ত হও, পরিস্থিতি বলো, প্ল্যান অনুযায়ী চলো।',11),
('rules','১২. ম্যাচের মধ্যে ব্লেম না করা','ব্লেম মনোবল ভেঙে দেয়। ভুল রিভিউ করো ম্যাচের পরে, চলাকালীন না।',12),
('rules','১৩. এন্ড-জোন কোঅর্ডিনেশন','এন্ড জোন নির্ভর করে পজিশনিং আর ডিসিপ্লিনের উপর। সেখানে সবাই IGL-এর কল ফলো করবে।',13),
('rules','১৪. অপ্রয়োজনীয় লুট না করা','টিমের যা দরকার শুধু সেটুকু লুট করো, তারপর মুভ করো। বাড়তি আইটেমের জন্য এক্সপোজড থেকো না।',14),
('rules','১৫. পরিকল্পনা করে ভেহিকল ব্যবহার','ভেহিকল রোটেশন আর কভারের জন্য, দেখানোর জন্য না। কে ড্রাইভ করবে আর কোথায় থামবে ঠিক করে নাও।',15),
('rules','১৬. এনিমি ইনফরমেশন কনফার্ম করা','কল দেওয়ার আগে কনফার্ম করো। ভুল তথ্যে টিম ভুল রোটেট বা ফাইট করে ফেলে।',16),
('rules','১৭. প্র্যাকটিসে ডিসিপ্লিন','যেভাবে খেলবে সেভাবেই প্র্যাকটিস করো। সময়মতো, ফোকাসড আর শেখার জন্য প্রস্তুত থাকো।',17),
('rules','১৮. টুর্নামেন্ট রুলস মেনে চলা','প্রতিটা টুর্নামেন্ট রুল পড়ো ও মানো। একটা ভায়োলেশন পুরো টিমের ক্ষতি করতে পারে।',18),
('rules','১৯. প্রতিপক্ষ ও টিমমেটকে সম্মান করা','সম্মান একটা জয়ী কালচার তৈরি করে এবং টিমের নাম রক্ষা করে।',19),
('rules','২০. ম্যাচ রিভিউ করা','কী কাজ করেছে আর কী ফেইল করেছে দেখো। পরের ম্যাচের জন্য একটা ফিক্স লিখে রাখো।',20),
('rules','২১. টিম স্ট্র্যাটেজি গোপন রাখা','স্ট্র্যাটেজি, কল আর প্ল্যান টিমের মধ্যেই থাকবে।',21),
('rules','২২. ইমার্জেন্সি কল ছোট রাখা','বিপদে দুই-তিন শব্দ ব্যবহার করো: "পুশ লেফট", "হিল নাও", "ফল ব্যাক"।',22),
('rules','২৩. টিম রেজাল্ট আগে','ব্যক্তিগত কিল কাউন্টের চেয়ে টিমের প্লেসমেন্ট বেশি গুরুত্বপূর্ণ।',23),
('rules','২৪. প্রতিটা ম্যাচের আগে প্রস্তুতি','ডিভাইস, নেটওয়ার্ক, সেটিংস আর ম্যাপের প্ল্যান চেক করে নাও কিউ দেওয়ার আগে।',24),
('rules','২৫. সার্বিক টিম ডিসিপ্লিন','ডিসিপ্লিনই একটা ভালো স্কোয়াডকে গ্রেট স্কোয়াড থেকে আলাদা করে।',25),

('roles','IGL','ইন-গেম লিডার। জোন পড়ে, রোটেশন কল করে, ফাইট সিদ্ধান্ত নেয় এবং এন্ড জোন নিয়ন্ত্রণ করে।',1),
('roles','এন্ট্রি ফ্র্যাগার','প্রথম ফাইট নেয়, স্পেস তৈরি করে এবং টিমের জন্য ওপেনিং কিল সিকিউর করে।',2),
('roles','সাপোর্ট','কভার ফায়ার, ইউটিলিটি আর হিলিং দেয়, রিভাইভ ও ফাইট ট্রেডে সাহায্য করে।',3),
('roles','স্কাউট','এনিমি ইনফরমেশন সংগ্রহ করে, অ্যাঙ্গেল ও পজিশন চেক করে, আগেভাগে এনগেজ না করে রিপোর্ট করে।',4),
('roles','ফ্ল্যাংকার','সাইড আর পেছন দেখে, এনিমিকে পানিশ করে এবং রোটেশন কাটে।',5),
('roles','ফ্লেক্সিবল প্লেয়ার','ম্যাচে যেকোনো গ্যাপ পূরণ করে এবং কল পেলে যেকোনো রোল খেলতে পারে।',6),

('igl','IGL-এর দায়িত্ব','প্ল্যান সেট করা, ল্যান্ডিং আর রোটেশন কল করা, জোন ম্যানেজ করা, টিমকে শান্ত রাখা এবং প্রতিটা ফাইটের সিদ্ধান্ত নেওয়া।',1),
('igl','কখন রোটেট করবে','জোন দূরে হলে, বর্তমান পজিশন কম্প্রোমাইজড হলে বা টিম রিসোর্স কম হলে আগেভাগে রোটেট করো।',2),
('igl','কখন ফাইট নেবে','যখন তোমার পজিশন, সংখ্যা বা তথ্যের সুবিধা আছে তখন ফাইট নাও। হেলথ কম বা পজিশন খারাপ হলে এড়িয়ে চলো।',3),
('igl','কখন ফাইট এড়াবে','জোন ক্লোজ হচ্ছে, টিমমেট আলাদা হয়ে গেছে বা এনিমির কাছে হাই গ্রাউন্ড থাকলে ফাইট এড়িয়ে চলো।',4),
('igl','জোন রিডিং ও এন্ড-জোন কলিং','পরের সার্কেল আগে পড়ো, সবচেয়ে সেফ এজ ধরে রাখো এবং শেষ জোনের জন্য স্পেসিং ও কভার কল করো।',5),
('igl','ইমার্জেন্সি কল','দুই-তিন শব্দে রাখো। প্র্যাকটিসে এক্সাক্ট ফ্রেজ ঠিক করে নাও যাতে কাউকে ভাবতে না হয়।',6),

('esports','রোটেশন','জোন বদলানোর সাথে সাথে পজিশন বদলানো। আগে রোটেট করো, একসাথে রোটেট করো, কভার মাথায় রাখো।',1),
('esports','পজিশনিং','কভার, হাইট আর এস্কেপ রুটসহ পজিশন বাছাই করো। এমন জায়গায় দাঁড়িও না যেখানে পিন হয়ে যাবে।',2),
('esports','জোন ম্যানেজমেন্ট','পরের জোন কোথায় ক্লোজ হবে জানো এবং এজের সেফ সাইডে থাকো।',3),
('esports','এন্ড জোন','ধৈর্য ধরে খেলো, শক্ত কভার ধরে রাখো, সেফ হলে অন্য টিমকে আগে ফাইট করতে দাও।',4),
('esports','ফাইট সিলেকশন','শুধু তখনই ফাইট করো যখন এটা তোমার প্লেসমেন্ট বা পজিশনে সাহায্য করবে। প্রতিটা ফাইটের একটা কারণ থাকা উচিত।',5),
('esports','কমিউনিকেশন','পরিষ্কার, ছোট, তথ্যভিত্তিক। তুমি কী দেখছো, কোথায় দেখছো, আর কী করবে বলো।',6),
('esports','ম্যাপ নলেজ','প্রতিটা ম্যাপের ল্যান্ডিং স্পট, রোটেশন পথ, হাই গ্রাউন্ড আর চোক পয়েন্ট শেখো।',7),
('esports','টিম কোঅর্ডিনেশন','একটা ইউনিট হয়ে খেলো: ফাইট ট্রেড করো, একে অপরকে কভার দাও এবং একটাই প্ল্যান ফলো করো।',8),
('esports','অ্যাডভান্সড টেকনিক','এজ প্লে, ফেক রোটেশন, থার্ড-পার্টি ফাইট এবং কন্ট্রোলড পুশ।',9),

('tournament','টুর্নামেন্ট রুলস ও ফরম্যাট','প্রতিটা টুর্নামেন্টের আগে রুলস, পয়েন্ট সিস্টেম আর সময়সূচি পড়ো। ফরম্যাট ম্যানেজারের সাথে কনফার্ম করো।',1),
('tournament','প্রস্তুতি','ডিভাইস ও নেটওয়ার্ক টেস্ট করো, প্ল্যান ঠিক করো এবং ম্যাচ ডের আগে বিশ্রাম নাও।',2),
('tournament','ম্যাচ ডিসিপ্লিন','শান্ত থাকো, IGL ফলো করো এবং পুরো টুর্নামেন্টে কমিউনিকেশন পরিষ্কার রাখো।',3);

-- =====================================================================
-- AFTER RUNNING THIS FILE:
--   1) In Supabase: Authentication > Sign In / Providers > Email > turn
--      "Confirm email" OFF. This project is REQUIRED to have it off, because
--      players log in with a UID, not a real email address, so there is no
--      inbox to receive a confirmation link.
--   2) The Super Admin does NOT sign up with a UID — admin accounts use a real
--      email. Sign up on the website's login page using your own UID normally
--      is for players only; instead, create the admin account directly:
--      Supabase > Authentication > Users > Add user > enter your real email +
--      a password > tick "Auto Confirm User". Then make it Super Admin:
--        insert into public.admins(email, role) values ('you@example.com','admin');
--      Log in on the website with that same email + password.
--   3) Add a Coaching Zone admin the same way (role 'coach' instead of 'admin'):
--        insert into public.admins(email, role) values ('coach@example.com','coach');
--   4) Players: add them in Admin Panel > Squad with their UID. The player
--      then goes to the website's Sign up page, enters that same UID, and
--      picks a password. They stay locked out of Coaching Zone / Finance /
--      Team chat until you tick "Approved" for them in Admin Panel > Squad.
--   5) To make a player a Captain (so they can send Voice messages in Team
--      chat), tick "Captain" for them in Admin Panel > Squad.
--   6) Revenue share: set Sponsor / Management % (and Owner / Squad Fund % if
--      you use them) in Admin Panel > Team details, and set each player's own
--      % in Admin Panel > Squad ("Revenue share %"). When you add a tournament
--      in Admin Panel > Finance, tick which players played it — their
--      "tournaments played" and "earnings" on the roster update automatically.
--   7) Forgot password: a player's "Forgot password?" link opens their email
--      app addressed to the Team email (Admin Panel > Team details > Team
--      email) with their UID pre-filled. Reset it yourself in Supabase >
--      Authentication > Users > find the player (search their UID) > set a
--      new password directly, and tell the player the new password.
-- =====================================================================
