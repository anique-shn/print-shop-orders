import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

const supabaseUrl = `https://omgsmgsyqdaahiazqtyl.supabase.co`;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9tZ3NtZ3N5cWRhYWhpYXpxdHlsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODA1MTE2NCwiZXhwIjoyMDkzNjI3MTY0fQ.qhcx_iOEQMWJg2VVnZlXU41SvvvluFGI_INL6lU6WMc';

// Typed client for selects (IDE autocomplete on returned rows)
export const supabase = createClient<Database>(supabaseUrl, supabaseKey);

// Untyped client used for inserts/updates where the strict Database generic
// causes "never" inference due to Supabase JS v2 type narrowing quirks.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const db = createClient(supabaseUrl, supabaseKey) as any;
