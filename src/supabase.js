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

export const ADMIN_TOKEN_KEY = 'pilota-admin-token'
export const ADMIN_SESSION_KEY = 'pilota-admin-session'

export const createGroupClient = (groupToken = '', adminToken = '') => {
  if (!isConfigured) return null
  const headers = {}
  if (groupToken) headers['x-group-token'] = groupToken
  if (adminToken) headers['x-admin-token'] = adminToken
  return createClient(url, key, { global: { headers } })
}

export const createAdminClient = (adminToken = '') =>
  isConfigured
    ? createClient(url, key, {
        global: {
          headers: adminToken ? { 'x-admin-token': adminToken } : {},
        },
      })
    : null

export { configError }
