import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL || 'https://oeiqrtnvlqzzxivpqogf.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9laXFydG52bHF6enhpdnBxb2dmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzNjczMjgsImV4cCI6MjA5Nzk0MzMyOH0.7_eIA1FN2E9DCQRP9fgeQFmC8iN-MwPWv3l8MRTV54M';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
