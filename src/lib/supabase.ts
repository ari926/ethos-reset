import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Ethos Reset Supabase (ari926's Org - cxgflrxcvtexibcbthie)
const SUPABASE_URL = 'https://cxgflrxcvtexibcbthie.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN4Z2ZscnhjdnRleGliY2J0aGllIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyODU1NTYsImV4cCI6MjA5MDg2MTU1Nn0.M9s8wlIsWx7xgWh4_Hho80IvuCEkp8fHQrcGJcpAaOY';

export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storageKey: 'family-health-auth-token',
    autoRefreshToken: true,
    persistSession: true,
  },
});

export const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/health-ai`;

// Dual AI Doctor Worker (Cloudflare)
export const HEALTH_AI_URL = import.meta.env.VITE_HEALTH_AI_URL as string | undefined
  ?? 'https://ethos-health-ai.ari-863.workers.dev';
