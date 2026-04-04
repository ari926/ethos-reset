import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Ethos Reset dedicated Supabase project
const SUPABASE_URL = 'https://cfbzcwechpspwsssdpqc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNmYnpjd2VjaHBzcHdzc3NkcHFjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyOTc5ODgsImV4cCI6MjA5MDg3Mzk4OH0.qtzjgmZ6rQzp8e-L-Mz_--mtgX1KMZC0Tr4glmlZ33A';

export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storageKey: 'family-health-auth-token',
    autoRefreshToken: true,
    persistSession: true,
  },
});

export const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/health-ai`;
