import { createClient } from '@supabase/supabase-js';

// Yeni Supabase projesi. Publishable anahtar tarayıcı için tasarlanmıştır, gizli değildir.
// Vercel'deki eski ortam değişkenleri karışmasın diye bilerek koda sabitlendi.
export const SUPABASE_URL = 'https://jsprdcdgmmydroiwsgms.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_BA-gCS5LjH229x2hc8qnOA_bp_Qdqbq';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
