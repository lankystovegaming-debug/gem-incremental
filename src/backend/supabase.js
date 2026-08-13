import {
  createClient
} from "https://esm.sh/@supabase/supabase-js@2";


export const SUPABASE_URL =
  "https://fuzidbblwzrhhbonjqjm.supabase.co";


export const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_sCiiZxMP5DG8_gjGLg9qUg_HnWVD27U";


export const supabase =
  createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
  );
