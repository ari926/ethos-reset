import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';
import { SEED_MEMBERS, SEED_REPORTS, SEED_RESTRICTIONS, SEED_METRICS, SEED_VITALS } from '../lib/seedData';

export interface FamilyMember {
  id: string;
  created_at: string;
  owner_id: string | null;
  auth_user_id: string | null;
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  gender: string | null;
  blood_type: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  avatar_url: string | null;
  notes: string | null;
}

export interface Restriction {
  id: string;
  created_at: string;
  member_id: string;
  restriction_type: string;
  item_name: string;
  severity: string;
  reaction: string | null;
  notes: string | null;
  source: string;
  source_report_id: string | null;
  confirmed: boolean;
}

export interface HealthReport {
  id: string;
  created_at: string;
  member_id: string;
  report_type: string;
  report_date: string | null;
  title: string;
  file_url: string | null;
  storage_path: string | null;
  storage_type: string;
  file_mime_type: string | null;
  ai_summary: string | null;
  structured_data: Record<string, unknown> | null;
  body_regions: string[] | null;
  processing_status: string;
}

export interface HealthMetric {
  id: string;
  member_id: string;
  metric_name: string;
  metric_value: number;
  metric_unit: string | null;
  status: string | null;
  ref_range_low: number | null;
  ref_range_high: number | null;
  body_region: string | null;
  recorded_date: string;
  source: string;
}

export interface Vital {
  id: string;
  member_id: string;
  vital_type: string;
  value_primary: number;
  value_secondary: number | null;
  unit: string | null;
  recorded_at: string;
  source: string;
  notes: string | null;
}

export interface Doctor {
  id: string;
  created_at: string;
  email: string;
  full_name: string | null;
  specialty: string | null;
  practice_name: string | null;
  phone: string | null;
  status: string;
  access_level: string;
  share_token: string | null;
  last_shared_at: string | null;
}

export interface DoctorAccess {
  id: string;
  doctor_id: string;
  member_id: string;
}

export type RegionStatus = 'normal' | 'warning' | 'critical' | 'nodata';

export interface HealthAlert {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  message: string;
  metric_name?: string;
  body_region?: string;
  date: string;
  dismissed: boolean;
}

interface HealthState {
  familyMembers: FamilyMember[];
  activeMemberId: string | null;
  reports: HealthReport[];
  restrictions: Restriction[];
  metrics: HealthMetric[];
  vitals: Vital[];
  regionHealthMap: Record<string, RegionStatus>;
  doctors: Doctor[];
  doctorAccess: DoctorAccess[];
  alerts: HealthAlert[];
  loading: boolean;

  loadDoctors: () => Promise<void>;
  addDoctor: (doctor: Partial<Doctor>) => Promise<void>;
  updateDoctor: (id: string, updates: Partial<Doctor>) => Promise<void>;
  deleteDoctor: (id: string) => Promise<void>;
  grantAccess: (doctorId: string, memberId: string) => Promise<void>;
  revokeAccess: (doctorId: string, memberId: string) => Promise<void>;
  computeAlerts: () => void;
  loadFamilyMembers: () => Promise<void>;
  setActiveMember: (id: string) => void;
  loadMemberData: (memberId: string) => Promise<void>;
  addFamilyMember: (member: Partial<FamilyMember>) => Promise<void>;
  updateFamilyMember: (id: string, updates: Partial<FamilyMember>) => Promise<void>;
  deleteFamilyMember: (id: string) => Promise<void>;
  addRestriction: (r: Partial<Restriction>) => Promise<void>;
  updateRestriction: (id: string, updates: Partial<Restriction>) => Promise<void>;
  deleteRestriction: (id: string) => Promise<void>;
  uploadReport: (memberId: string, file: File, title: string, reportType: string, reportDate: string | null) => Promise<void>;
  deleteReport: (id: string) => Promise<void>;
  addVital: (vital: Partial<Vital>) => Promise<void>;
  computeRegionHealth: () => void;
}

export const useHealthStore = create<HealthState>((set, get) => ({
  familyMembers: [],
  activeMemberId: null,
  reports: [],
  restrictions: [],
  metrics: [],
  vitals: [],
  regionHealthMap: {},
  doctors: [],
  doctorAccess: [],
  alerts: [],
  loading: false,

  loadFamilyMembers: async () => {
    set({ loading: true });
    const { data, error } = await supabase
      .from('family_members')
      .select('*')
      .order('created_at', { ascending: true });

    if (error || !data || data.length === 0) {
      // Fall back to demo seed data when DB is empty/unavailable
      const members = SEED_MEMBERS;
      set({ familyMembers: members, loading: false });
      if (!get().activeMemberId && members.length > 0) {
        set({ activeMemberId: members[0].id });
        get().loadMemberData(members[0].id);
      }
      return;
    }

    const members = data ?? [];
    set({ familyMembers: members, loading: false });

    // Auto-select first member if none selected
    if (!get().activeMemberId && members.length > 0) {
      set({ activeMemberId: members[0].id });
      get().loadMemberData(members[0].id);
    }
  },

  setActiveMember: (id: string) => {
    set({ activeMemberId: id });
    get().loadMemberData(id);
  },

  loadMemberData: async (memberId: string) => {
    const [reportsRes, restrictionsRes, metricsRes, vitalsRes] = await Promise.all([
      supabase.from('health_reports').select('*').eq('member_id', memberId).order('report_date', { ascending: false }),
      supabase.from('restrictions').select('*').eq('member_id', memberId).order('created_at', { ascending: false }),
      supabase.from('health_metrics').select('*').eq('member_id', memberId).order('recorded_date', { ascending: false }).limit(200),
      supabase.from('vitals').select('*').eq('member_id', memberId).order('recorded_at', { ascending: false }).limit(100),
    ]);

    const reports = reportsRes.data?.length ? reportsRes.data : SEED_REPORTS.filter(r => r.member_id === memberId);
    const restrictions = restrictionsRes.data?.length ? restrictionsRes.data : SEED_RESTRICTIONS.filter(r => r.member_id === memberId);
    const metrics = metricsRes.data?.length ? metricsRes.data : SEED_METRICS.filter(m => m.member_id === memberId);
    const vitals = vitalsRes.data?.length ? vitalsRes.data : SEED_VITALS.filter(v => v.member_id === memberId);

    set({ reports, restrictions, metrics, vitals });
    get().computeRegionHealth();
    get().computeAlerts();
  },

  addFamilyMember: async (member: Partial<FamilyMember>) => {
    const { error } = await supabase.from('family_members').insert(member);
    if (error) {
      toast.error('Failed to add family member');
      return;
    }
    toast.success('Family member added');
    get().loadFamilyMembers();
  },

  updateFamilyMember: async (id: string, updates: Partial<FamilyMember>) => {
    const { error } = await supabase.from('family_members').update(updates).eq('id', id);
    if (error) {
      toast.error('Failed to update family member');
      return;
    }
    toast.success('Family member updated');
    get().loadFamilyMembers();
  },

  deleteFamilyMember: async (id: string) => {
    const { error } = await supabase.from('family_members').delete().eq('id', id);
    if (error) {
      toast.error('Failed to delete family member');
      return;
    }
    toast.success('Family member deleted');
    const members = get().familyMembers.filter(m => m.id !== id);
    set({ familyMembers: members });
    if (get().activeMemberId === id) {
      const next = members[0]?.id ?? null;
      set({ activeMemberId: next });
      if (next) get().loadMemberData(next);
    }
  },

  addRestriction: async (r: Partial<Restriction>) => {
    const { error } = await supabase.from('restrictions').insert(r);
    if (error) {
      toast.error('Failed to add restriction');
      return;
    }
    toast.success('Restriction added');
    const memberId = get().activeMemberId;
    if (memberId) get().loadMemberData(memberId);
  },

  updateRestriction: async (id: string, updates: Partial<Restriction>) => {
    const { error } = await supabase.from('restrictions').update(updates).eq('id', id);
    if (error) {
      toast.error('Failed to update restriction');
      return;
    }
    toast.success('Restriction updated');
    const memberId = get().activeMemberId;
    if (memberId) get().loadMemberData(memberId);
  },

  deleteRestriction: async (id: string) => {
    const { error } = await supabase.from('restrictions').delete().eq('id', id);
    if (error) {
      toast.error('Failed to delete restriction');
      return;
    }
    toast.success('Restriction deleted');
    const memberId = get().activeMemberId;
    if (memberId) get().loadMemberData(memberId);
  },

  uploadReport: async (memberId: string, file: File, title: string, reportType: string, reportDate: string | null) => {
    const ext = file.name.split('.').pop() ?? 'pdf';
    const path = `${memberId}/${Date.now()}.${ext}`;

    const { error: storageError } = await supabase.storage
      .from('health-reports')
      .upload(path, file, { contentType: file.type });

    if (storageError) {
      toast.error('Failed to upload file');
      return;
    }

    const { data: { publicUrl } } = supabase.storage
      .from('health-reports')
      .getPublicUrl(path);

    const { data: reportData, error } = await supabase.from('health_reports').insert({
      member_id: memberId,
      title,
      report_type: reportType,
      report_date: reportDate,
      file_url: publicUrl,
      storage_path: path,
      storage_type: 'supabase',
      file_mime_type: file.type,
      file_size_bytes: file.size,
      processing_status: 'pending',
    }).select('id').single();

    if (error) {
      toast.error('Failed to save report record');
      return;
    }

    toast.success('Report uploaded — AI processing started');
    get().loadMemberData(memberId);

    // Trigger AI processing in background
    if (reportData?.id) {
      triggerReportProcessing(reportData.id, publicUrl, reportType, memberId).then(() => {
        get().loadMemberData(memberId);
      });
    }
  },

  deleteReport: async (id: string) => {
    const report = get().reports.find(r => r.id === id);
    if (report?.storage_path) {
      await supabase.storage.from('health-reports').remove([report.storage_path]);
    }

    const { error } = await supabase.from('health_reports').delete().eq('id', id);
    if (error) {
      toast.error('Failed to delete report');
      return;
    }
    toast.success('Report deleted');
    const memberId = get().activeMemberId;
    if (memberId) get().loadMemberData(memberId);
  },

  addVital: async (vital: Partial<Vital>) => {
    const { error } = await supabase.from('vitals').insert(vital);
    if (error) {
      toast.error('Failed to add vital');
      return;
    }
    toast.success('Vital recorded');
    const memberId = get().activeMemberId;
    if (memberId) get().loadMemberData(memberId);
  },

  loadDoctors: async () => {
    const [docRes, accessRes] = await Promise.all([
      supabase.from('doctors').select('*').order('created_at', { ascending: false }),
      supabase.from('doctor_member_access').select('*'),
    ]);
    set({ doctors: docRes.data ?? [], doctorAccess: accessRes.data ?? [] });
  },

  addDoctor: async (doctor: Partial<Doctor>) => {
    const { error } = await supabase.from('doctors').insert(doctor);
    if (error) {
      toast.error('Failed to add doctor');
      return;
    }
    toast.success('Doctor added');
    get().loadDoctors();
  },

  updateDoctor: async (id: string, updates: Partial<Doctor>) => {
    const { error } = await supabase.from('doctors').update(updates).eq('id', id);
    if (error) {
      toast.error('Failed to update doctor');
      return;
    }
    toast.success('Doctor updated');
    get().loadDoctors();
  },

  deleteDoctor: async (id: string) => {
    const { error } = await supabase.from('doctors').delete().eq('id', id);
    if (error) {
      toast.error('Failed to delete doctor');
      return;
    }
    toast.success('Doctor removed');
    get().loadDoctors();
  },

  grantAccess: async (doctorId: string, memberId: string) => {
    const { error } = await supabase.from('doctor_member_access').insert({
      doctor_id: doctorId,
      member_id: memberId,
    });
    if (error) {
      toast.error('Failed to grant access');
      return;
    }
    get().loadDoctors();
  },

  revokeAccess: async (doctorId: string, memberId: string) => {
    const existing = get().doctorAccess.find(a => a.doctor_id === doctorId && a.member_id === memberId);
    if (!existing) return;
    const { error } = await supabase.from('doctor_member_access').delete().eq('id', existing.id);
    if (error) {
      toast.error('Failed to revoke access');
      return;
    }
    get().loadDoctors();
  },

  computeRegionHealth: () => {
    const metrics = get().metrics;
    const regionMap: Record<string, RegionStatus> = {};
    const regionMetrics: Record<string, string[]> = {};

    for (const m of metrics) {
      if (!m.body_region) continue;
      if (!regionMetrics[m.body_region]) regionMetrics[m.body_region] = [];
      if (m.status) regionMetrics[m.body_region].push(m.status);
    }

    for (const [region, statuses] of Object.entries(regionMetrics)) {
      if (statuses.includes('critical')) {
        regionMap[region] = 'critical';
      } else if (statuses.includes('high') || statuses.includes('low')) {
        regionMap[region] = 'warning';
      } else {
        regionMap[region] = 'normal';
      }
    }

    set({ regionHealthMap: regionMap });
  },

  computeAlerts: () => {
    const metrics = get().metrics;
    const reports = get().reports;
    const alerts: HealthAlert[] = [];

    // Build latest-by-name map
    const latestByName = new Map<string, HealthMetric>();
    for (const m of metrics) {
      const existing = latestByName.get(m.metric_name);
      if (!existing || m.recorded_date > existing.recorded_date) {
        latestByName.set(m.metric_name, m);
      }
    }

    // Build history-by-name for trend detection
    const historyByName = new Map<string, HealthMetric[]>();
    for (const m of metrics) {
      const arr = historyByName.get(m.metric_name) ?? [];
      arr.push(m);
      historyByName.set(m.metric_name, arr);
    }

    // 1) Critical / High status metrics -> red alert
    for (const [name, m] of latestByName) {
      if (m.status === 'critical' || m.status === 'high') {
        const direction = m.status === 'critical' ? 'critically' : 'significantly';
        alerts.push({
          id: `status-${m.id}`,
          severity: 'critical',
          title: `${name} is ${direction} elevated`,
          message: `${name} at ${m.metric_value} ${m.metric_unit ?? ''} — outside reference range${m.ref_range_high != null ? ` (ref <${m.ref_range_high})` : ''}. Review with your provider.`,
          metric_name: name,
          body_region: m.body_region ?? undefined,
          date: m.recorded_date,
          dismissed: false,
        });
      }
    }

    // 2) Low status metrics -> yellow/warning alert
    for (const [name, m] of latestByName) {
      if (m.status === 'low') {
        alerts.push({
          id: `low-${m.id}`,
          severity: 'warning',
          title: `${name} is below range`,
          message: `${name} at ${m.metric_value} ${m.metric_unit ?? ''}${m.ref_range_low != null ? ` (ref >${m.ref_range_low})` : ''}. May need attention.`,
          metric_name: name,
          body_region: m.body_region ?? undefined,
          date: m.recorded_date,
          dismissed: false,
        });
      }
    }

    // 3) Trending worse — value moving further from ref range over time (normal-status only)
    for (const [name, history] of historyByName) {
      if (history.length < 2) continue;
      const sorted = [...history].sort((a, b) => a.recorded_date.localeCompare(b.recorded_date));
      const latest = sorted[sorted.length - 1];
      const previous = sorted[sorted.length - 2];
      if (latest.ref_range_high == null && latest.ref_range_low == null) continue;
      if (latest.status !== 'normal') continue;

      const latestVal = latest.metric_value;
      const prevVal = previous.metric_value;

      let worsening = false;
      if (latest.ref_range_high != null) {
        const latestDist = latest.ref_range_high - latestVal;
        const prevDist = latest.ref_range_high - prevVal;
        if (latestDist < prevDist && latestDist < (latest.ref_range_high * 0.1)) {
          worsening = true;
        }
      }
      if (!worsening && latest.ref_range_low != null) {
        const latestDist = latestVal - latest.ref_range_low;
        const prevDist = prevVal - latest.ref_range_low;
        if (latestDist < prevDist && latestDist < (latest.ref_range_low * 0.1)) {
          worsening = true;
        }
      }

      if (worsening) {
        alerts.push({
          id: `trend-${latest.id}`,
          severity: 'warning',
          title: `${name} trending toward limit`,
          message: `${name} moved from ${prevVal} to ${latestVal} ${latest.metric_unit ?? ''} — approaching reference boundary. Watch on next labs.`,
          metric_name: name,
          body_region: latest.body_region ?? undefined,
          date: latest.recorded_date,
          dismissed: false,
        });
      }
    }

    // 4) Report follow-ups — reports older than 90 days with no newer report of same type
    const now = new Date();
    const reportsByType = new Map<string, HealthReport>();
    for (const r of reports) {
      const existing = reportsByType.get(r.report_type);
      if (!existing || (r.report_date ?? '') > (existing.report_date ?? '')) {
        reportsByType.set(r.report_type, r);
      }
    }
    for (const [type, r] of reportsByType) {
      if (!r.report_date) continue;
      const reportDate = new Date(r.report_date);
      const daysSince = Math.floor((now.getTime() - reportDate.getTime()) / (1000 * 60 * 60 * 24));
      if (daysSince > 90) {
        alerts.push({
          id: `followup-${r.id}`,
          severity: 'info',
          title: `${type} follow-up due`,
          message: `Last ${type.toLowerCase()} was ${daysSince} days ago (${r.title}). Consider scheduling a follow-up.`,
          date: r.report_date,
          dismissed: false,
        });
      }
    }

    // Sort: critical first, then warning, then info
    const severityOrder: Record<string, number> = { critical: 0, warning: 1, info: 2 };
    alerts.sort((a, b) => (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9));

    set({ alerts });
  },
}));

// ─── AI API HELPERS ───

const EDGE_URL = `https://cxgflrxcvtexibcbthie.supabase.co/functions/v1/health-ai`;

async function triggerReportProcessing(reportId: string, fileUrl: string, reportType: string, memberId: string) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    await fetch(EDGE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token ?? ''}`,
        'x-action': 'process-report',
      },
      body: JSON.stringify({ report_id: reportId, file_url: fileUrl, report_type: reportType, member_id: memberId }),
    });
  } catch (err) {
    console.error('Report processing trigger failed:', err);
  }
}

export async function analyzeScanImage(
  imageBase64: string,
  mimeType: string,
  scanType: string,
  memberId: string,
  restrictions: Array<{ item_name: string; severity: string; restriction_type: string; reaction?: string | null }>
): Promise<ScanResult | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(EDGE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token ?? ''}`,
        'x-action': 'analyze-scan',
      },
      body: JSON.stringify({ image_base64: imageBase64, mime_type: mimeType, scan_type: scanType, member_id: memberId, restrictions }),
    });
    if (!res.ok) return null;
    return await res.json() as ScanResult;
  } catch (err) {
    console.error('Scan analysis failed:', err);
    return null;
  }
}

export async function sendHealthChat(
  memberId: string,
  messages: Array<{ role: string; content: string }>
): Promise<string> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(EDGE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token ?? ''}`,
        'x-action': 'chat',
      },
      body: JSON.stringify({ member_id: memberId, messages }),
    });
    if (!res.ok) throw new Error('Chat request failed');
    const data = await res.json();
    return data.response ?? 'Sorry, I could not process that.';
  } catch (err) {
    console.error('Health chat failed:', err);
    return 'Sorry, there was an error connecting to the AI. Please try again.';
  }
}

export interface ScanResult {
  item_name: string;
  overall_result: 'safe' | 'unsafe' | 'caution';
  ingredients: string[];
  flagged: Array<{ ingredient: string; severity: string; reason: string }>;
  explanation: string;
}
