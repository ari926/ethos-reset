-- ═══════════════════════════════════════════
-- FAMILY HEALTH TRACKER — Database Schema
-- Run this in your Supabase SQL Editor
-- ═══════════════════════════════════════════

-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- ─── FAMILY MEMBERS ───
create table if not exists family_members (
  id uuid primary key default uuid_generate_v4(),
  created_at timestamptz default now(),
  owner_id uuid references auth.users(id) on delete cascade,
  auth_user_id uuid references auth.users(id),
  first_name text not null,
  last_name text not null,
  date_of_birth date,
  gender text check (gender in ('male', 'female', 'other')),
  blood_type text check (blood_type in ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
  height_cm numeric,
  weight_kg numeric,
  avatar_url text,
  notes text
);

-- ─── HEALTH REPORTS ───
create table if not exists health_reports (
  id uuid primary key default uuid_generate_v4(),
  created_at timestamptz default now(),
  member_id uuid not null references family_members(id) on delete cascade,
  report_type text not null default 'blood_test'
    check (report_type in ('blood_test', 'imaging', 'pathology', 'general', 'prescription', 'discharge', 'lab_panel', 'other')),
  report_date date,
  title text not null,
  file_url text,
  storage_path text,
  storage_type text not null default 'supabase' check (storage_type in ('supabase', 'external')),
  file_mime_type text,
  file_size_bytes bigint,
  ai_summary text,
  structured_data jsonb,
  body_regions text[],
  processing_status text not null default 'pending'
    check (processing_status in ('pending', 'processing', 'complete', 'failed'))
);

-- ─── HEALTH METRICS (extracted from reports or manual entry) ───
create table if not exists health_metrics (
  id uuid primary key default uuid_generate_v4(),
  created_at timestamptz default now(),
  member_id uuid not null references family_members(id) on delete cascade,
  report_id uuid references health_reports(id) on delete set null,
  metric_name text not null,
  metric_value numeric not null,
  metric_unit text,
  status text check (status in ('normal', 'low', 'high', 'critical')),
  ref_range_low numeric,
  ref_range_high numeric,
  body_region text,
  recorded_date date not null default current_date,
  source text not null default 'manual' check (source in ('manual', 'report', 'wearable', 'ai'))
);

-- ─── VITALS (recurring measurements) ───
create table if not exists vitals (
  id uuid primary key default uuid_generate_v4(),
  created_at timestamptz default now(),
  member_id uuid not null references family_members(id) on delete cascade,
  vital_type text not null
    check (vital_type in ('blood_pressure', 'heart_rate', 'temperature', 'weight', 'blood_glucose', 'spo2', 'respiratory_rate', 'hrv', 'sleep_score', 'steps', 'other')),
  value_primary numeric not null,
  value_secondary numeric,
  unit text,
  recorded_at timestamptz not null default now(),
  source text not null default 'manual' check (source in ('manual', 'wearable', 'device')),
  notes text
);

-- ─── RESTRICTIONS (allergies, intolerances, contraindications) ───
create table if not exists restrictions (
  id uuid primary key default uuid_generate_v4(),
  created_at timestamptz default now(),
  member_id uuid not null references family_members(id) on delete cascade,
  restriction_type text not null
    check (restriction_type in ('food_allergy', 'food_intolerance', 'drug_allergy', 'drug_interaction', 'dietary', 'contraindication')),
  item_name text not null,
  severity text not null default 'warning'
    check (severity in ('critical', 'warning', 'caution')),
  reaction text,
  notes text,
  source text not null default 'manual' check (source in ('manual', 'report', 'ai')),
  source_report_id uuid references health_reports(id) on delete set null,
  confirmed boolean not null default true
);

-- ─── DOCTORS (authorized viewers) ───
create table if not exists doctors (
  id uuid primary key default uuid_generate_v4(),
  created_at timestamptz default now(),
  auth_user_id uuid references auth.users(id),
  invited_by uuid not null references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  specialty text,
  practice_name text,
  phone text,
  status text not null default 'pending'
    check (status in ('pending', 'active', 'revoked')),
  access_level text not null default 'read'
    check (access_level in ('read', 'read_write'))
);

-- ─── DOCTOR-MEMBER ACCESS ───
create table if not exists doctor_member_access (
  id uuid primary key default uuid_generate_v4(),
  created_at timestamptz default now(),
  doctor_id uuid not null references doctors(id) on delete cascade,
  member_id uuid not null references family_members(id) on delete cascade,
  granted_by uuid not null references auth.users(id),
  unique (doctor_id, member_id)
);

-- ─── WEARABLE CONNECTIONS ───
create table if not exists wearable_connections (
  id uuid primary key default uuid_generate_v4(),
  created_at timestamptz default now(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  member_id uuid not null references family_members(id) on delete cascade,
  provider text not null
    check (provider in ('oura', 'whoop', 'apple_watch', 'eight_sleep', 'fitbit', 'garmin')),
  status text not null default 'disconnected'
    check (status in ('connected', 'disconnected', 'error')),
  access_token_encrypted text,
  refresh_token_encrypted text,
  token_expires_at timestamptz,
  last_sync_at timestamptz,
  metadata jsonb
);

-- ─── SCAN HISTORY ───
create table if not exists scan_history (
  id uuid primary key default uuid_generate_v4(),
  created_at timestamptz default now(),
  member_id uuid not null references family_members(id) on delete cascade,
  scan_type text not null check (scan_type in ('food', 'medicine')),
  image_url text,
  item_name text,
  overall_result text check (overall_result in ('safe', 'unsafe', 'caution')),
  ingredients text[],
  flagged jsonb,
  explanation text,
  ai_model text
);

-- ─── CHAT HISTORY ───
create table if not exists chat_history (
  id uuid primary key default uuid_generate_v4(),
  created_at timestamptz default now(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  member_id uuid references family_members(id) on delete set null,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  metadata jsonb
);

-- ═══════════════════════════════════════════
-- INDEXES
-- ═══════════════════════════════════════════

create index if not exists idx_family_members_owner on family_members(owner_id);
create index if not exists idx_health_reports_member on health_reports(member_id);
create index if not exists idx_health_reports_date on health_reports(report_date desc);
create index if not exists idx_health_metrics_member on health_metrics(member_id);
create index if not exists idx_health_metrics_region on health_metrics(body_region);
create index if not exists idx_health_metrics_date on health_metrics(recorded_date desc);
create index if not exists idx_vitals_member on vitals(member_id);
create index if not exists idx_vitals_type on vitals(member_id, vital_type);
create index if not exists idx_vitals_date on vitals(recorded_at desc);
create index if not exists idx_restrictions_member on restrictions(member_id);
create index if not exists idx_doctors_invited_by on doctors(invited_by);
create index if not exists idx_doctor_access_doctor on doctor_member_access(doctor_id);
create index if not exists idx_doctor_access_member on doctor_member_access(member_id);
create index if not exists idx_wearable_owner on wearable_connections(owner_id);
create index if not exists idx_scan_history_member on scan_history(member_id);
create index if not exists idx_chat_history_owner on chat_history(owner_id);

-- ═══════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ═══════════════════════════════════════════

-- Family Members: owner can CRUD, doctors can read assigned members
alter table family_members enable row level security;
create policy "family_members_owner" on family_members
  for all using (owner_id = auth.uid());
create policy "family_members_doctor_read" on family_members
  for select using (
    id in (
      select dma.member_id from doctor_member_access dma
      join doctors d on d.id = dma.doctor_id
      where d.auth_user_id = auth.uid() and d.status = 'active'
    )
  );

-- Health Reports: owner of the member can CRUD
alter table health_reports enable row level security;
create policy "health_reports_owner" on health_reports
  for all using (
    member_id in (select id from family_members where owner_id = auth.uid())
  );
create policy "health_reports_doctor_read" on health_reports
  for select using (
    member_id in (
      select dma.member_id from doctor_member_access dma
      join doctors d on d.id = dma.doctor_id
      where d.auth_user_id = auth.uid() and d.status = 'active'
    )
  );

-- Health Metrics
alter table health_metrics enable row level security;
create policy "health_metrics_owner" on health_metrics
  for all using (
    member_id in (select id from family_members where owner_id = auth.uid())
  );
create policy "health_metrics_doctor_read" on health_metrics
  for select using (
    member_id in (
      select dma.member_id from doctor_member_access dma
      join doctors d on d.id = dma.doctor_id
      where d.auth_user_id = auth.uid() and d.status = 'active'
    )
  );

-- Vitals
alter table vitals enable row level security;
create policy "vitals_owner" on vitals
  for all using (
    member_id in (select id from family_members where owner_id = auth.uid())
  );
create policy "vitals_doctor_read" on vitals
  for select using (
    member_id in (
      select dma.member_id from doctor_member_access dma
      join doctors d on d.id = dma.doctor_id
      where d.auth_user_id = auth.uid() and d.status = 'active'
    )
  );

-- Restrictions
alter table restrictions enable row level security;
create policy "restrictions_owner" on restrictions
  for all using (
    member_id in (select id from family_members where owner_id = auth.uid())
  );
create policy "restrictions_doctor_read" on restrictions
  for select using (
    member_id in (
      select dma.member_id from doctor_member_access dma
      join doctors d on d.id = dma.doctor_id
      where d.auth_user_id = auth.uid() and d.status = 'active'
    )
  );

-- Doctors
alter table doctors enable row level security;
create policy "doctors_invited_by" on doctors
  for all using (invited_by = auth.uid());
create policy "doctors_self" on doctors
  for select using (auth_user_id = auth.uid());

-- Doctor Member Access
alter table doctor_member_access enable row level security;
create policy "doctor_access_granted_by" on doctor_member_access
  for all using (granted_by = auth.uid());
create policy "doctor_access_doctor_read" on doctor_member_access
  for select using (
    doctor_id in (select id from doctors where auth_user_id = auth.uid())
  );

-- Wearable Connections
alter table wearable_connections enable row level security;
create policy "wearable_owner" on wearable_connections
  for all using (owner_id = auth.uid());

-- Scan History
alter table scan_history enable row level security;
create policy "scan_history_owner" on scan_history
  for all using (
    member_id in (select id from family_members where owner_id = auth.uid())
  );

-- Chat History
alter table chat_history enable row level security;
create policy "chat_history_owner" on chat_history
  for all using (owner_id = auth.uid());

-- ═══════════════════════════════════════════
-- STORAGE BUCKET
-- ═══════════════════════════════════════════

insert into storage.buckets (id, name, public)
values ('health-reports', 'health-reports', false)
on conflict (id) do nothing;

create policy "health_reports_storage_upload" on storage.objects
  for insert with check (bucket_id = 'health-reports' and auth.uid() is not null);

create policy "health_reports_storage_read" on storage.objects
  for select using (bucket_id = 'health-reports' and auth.uid() is not null);

create policy "health_reports_storage_delete" on storage.objects
  for delete using (bucket_id = 'health-reports' and auth.uid() is not null);
