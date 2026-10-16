import { useEffect, useMemo, useState } from 'react'
import { ExternalLink, LogOut, ShieldCheck } from 'lucide-react'
import { createAdminClient, isConfigured } from './supabase'
import { DAYS } from './Welcome'

const formatCreatedAt = (value) =>
  new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(value))

export default function Admin({ adminToken }) {
  const client = useMemo(() => createAdminClient(adminToken), [adminToken])
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [authorized, setAuthorized] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function loadGroups() {
      if (!isConfigured) {
        setError("L'espace administrateur nécessite Supabase.")
        setLoading(false)
        return
      }

      const { data: isAdmin, error: authError } =
        await client.rpc('request_is_admin')
      if (authError || !isAdmin) {
        setError('Ce lien administrateur est invalide.')
        setLoading(false)
        return
      }

      setAuthorized(true)
      const { data, error: groupsError } = await client
        .from('groups')
        .select('*')
        .order('created_at', { ascending: false })

      if (groupsError) setError(groupsError.message)
      else setGroups(data)
      setLoading(false)
    }

    loadGroups()
  }, [client])

  if (loading) {
    return <main className="link-state"><h1>Ouverture de l’administration…</h1></main>
  }

  if (!authorized) {
    return (
      <main className="link-state">
        <span className="admin-mark"><ShieldCheck size={28} /></span>
        <h1>Accès refusé</h1>
        <p>{error}</p>
        <a href="/">Retour à l’accueil</a>
      </main>
    )
  }

  return (
    <main className="admin-page">
      <header className="admin-header">
        <div className="brand">
          <span className="admin-mark"><ShieldCheck size={20} /></span>
          <span>Administration</span>
        </div>
        <a className="icon-button" href="/">
          <LogOut size={17} /> Quitter
        </a>
      </header>

      <section className="admin-content">
        <div className="admin-title">
          <div>
            <p className="eyebrow">Pilota Lagunekin</p>
            <h1>Tous les groupes</h1>
          </div>
          <span className="group-count">
            {groups.length} groupe{groups.length > 1 ? 's' : ''}
          </span>
        </div>

        {error && <div className="error-message">{error}</div>}

        {groups.length === 0 ? (
          <div className="empty-state">Aucun groupe n’a encore été créé.</div>
        ) : (
          <div className="admin-group-grid">
            {groups.map((group) => (
              <article className="admin-group-card" key={group.id}>
                <div className="admin-group-top">
                  <span className="avatar">
                    {group.name.slice(0, 1).toUpperCase()}
                  </span>
                  <small>Créé le {formatCreatedAt(group.created_at)}</small>
                </div>
                <h2>{group.name}</h2>
                <p>{group.hero_message}</p>
                <div className="admin-group-meta">
                  <span>{DAYS[group.meeting_day]}</span>
                  <span>{group.meeting_time.slice(0, 5).replace(':', 'h')}</span>
                </div>
                <a
                  className="open-group-button"
                  href={`/?group=${group.id}&key=${group.access_token}`}
                >
                  Ouvrir le groupe <ExternalLink size={16} />
                </a>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
