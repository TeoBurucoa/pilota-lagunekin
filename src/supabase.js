import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const key = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

let configError = ''

try {
  if (url) new URL(url)
} catch {
  configError = `VITE_SUPABASE_URL est invalide (« ${url} »). Elle doit ressembler à https://votre-projet.supabase.co, sans guillemets.`
}

export const isConfigured = Boolean(url && key && !configError)

export const createGroupClient = (groupToken = '') =>
  isConfigured
    ? createClient(url, key, {
        global: {
          headers: groupToken ? { 'x-group-token': groupToken } : {},
        },
      })
    : null

export const createAdminClient = (adminToken = '') =>
  isConfigured
    ? createClient(url, key, {
        global: {
          headers: adminToken ? { 'x-admin-token': adminToken } : {},
        },
      })
    : null

export { configError }
