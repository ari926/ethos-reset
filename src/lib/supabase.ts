import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// TODO: Replace with your new Supabase project credentials
// For now, using the dev Supabase instance
const SUPABASE_URL = 'https://dutvbquoyjtoctjstbmv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR1dHZicXVveWp0b2N0anN0Ym12Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDIzMzU5MDYsImV4cCI6MjA1NzkxMTkwNn0.CxEPNJdscGS1hl-f4fXMHAdz0S5pzmvCLXMwKnfKBvM';

export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storageKey: 'family-health-auth-token',
    autoRefreshToken: true,
    persistSession: true,
  },
});

export const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/health-ai`;
