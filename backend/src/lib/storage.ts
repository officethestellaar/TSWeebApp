import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || '';

const supabase = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null;

const BUCKET = 'uploads';

export const uploadFile = async (
  buffer: Buffer,
  filename: string,
  mimeType: string,
): Promise<string | null> => {
  if (!supabase) {
    console.warn('[Storage] Supabase not configured — file not saved');
    return null;
  }

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(filename, buffer, { contentType: mimeType, upsert: true });

  if (error) {
    console.error('[Storage] Upload failed:', error.message);
    return null;
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(filename);
  return data.publicUrl;
};

export const deleteFile = async (url: string) => {
  if (!supabase) return;

  const path = url.split('/').pop();
  if (!path) return;

  await supabase.storage.from(BUCKET).remove([path]);
};
