import { useEffect, useMemo, useState } from 'react'
import { ExternalLink, LogOut, ShieldCheck, Trash2 } from 'lucide-react'
import { ADMIN_SESSION_KEY, createAdminClient, isConfigured } from './supabase'
import { DAYS, FREQUENCIES, SPORTS } from './Welcome'

const formatCreatedAt = (value) =>
  new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(value))

function rememberAdminEntry() {
  const params = new URLSearchParams(window.location.search)
  if (!params.get('admin')) return sessionStorage.getItem(ADMIN_SESSION_KEY) || ''
  window.history.replaceState({}, '', `${window.location.pathname}?admin`)
  return sessionStorage.getItem(ADMIN_SESSION_KEY) || ''
}

export default function Admin() {
  const [adminToken, setAdminToken] = useState(rememberAdminEntry)
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const client = useMemo(() => createAdminClient(adminToken), [adminToken])
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(Boolean(adminToken) && isConfigured)
  const [authorized, setAuthorized] = useState(false)
  const [error, setError] = useState('')
  const [deletingId, setDeletingId] = useState('')

  useEffect(() => {
    if (!isConfigured || !adminToken) {
      setAuthorized(false)
      setLoading(false)
      return undefined
    }

    let cancelled = false
    async function loadGroups() {
      const { data: isAdmin, error: authError } =
        await client.rpc('request_is_admin')
      if (cancelled) return
      if (authError || !isAdmin) {
        sessionStorage.removeItem(ADMIN_SESSION_KEY)
        setAdminToken('')
        setAuthorized(false)
        setError('')
        setLoading(false)
        return
      }

      setAuthorized(true)
      const { data, error: groupsError } = await client
        .from('groups')
        .select('*')
        .order('created_at', { ascending: false })

      if (!cancelled) {
        if (groupsError) setError(groupsError.message)
        else setGroups(data)
        setLoading(false)
      }
    }

    loadGroups()
    return () => {
      cancelled = true
    }
  }, [adminToken, client])

  async function signIn(event) {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    const { data, error: loginError } = await createAdminClient().rpc(
      'admin_login',
      { p_login: login.trim(), p_password: password },
    )
    if (loginError) setError(loginError.message)
    else if (!data) setError('Identifiant ou mot de passe incorrect.')
    else {
      sessionStorage.setItem(ADMIN_SESSION_KEY, data)
      setPassword('')
      setLoading(true)
      setAdminToken(data)
    }
    setSubmitting(false)
  }

  function signOut() {
    sessionStorage.removeItem(ADMIN_SESSION_KEY)
    setAdminToken('')
    setAuthorized(false)
    setGroups([])
    setPassword('')
    window.location.assign('/')
  }

  async function deleteGroup(group) {
    const confirmed = window.confirm(
      `Supprimer définitivement le groupe « ${group.name} », ses joueurs et tout son planning ?`,
    )
    if (!confirmed) return

    setDeletingId(group.id)
    setError('')
    const { error: deleteError } = await client
      .from('groups')
      .delete()
      .eq('id', group.id)

    if (deleteError) setError(deleteError.message)
    else setGroups((current) => current.filter((item) => item.id !== group.id))
    setDeletingId('')
  }

  if (!isConfigured) {
    return (
      <main className="link-state">
        <span className="admin-mark"><ShieldCheck size={28} /></span>
        <h1>Administration</h1>
        <p>L’espace administrateur nécessite Supabase.</p>
        <a href="/">Retour à l’accueil</a>
      </main>
    )
  }

  if (loading) {
    return <main className="link-state"><h1>Ouverture de l’administration…</h1></main>
  }

  if (!authorized) {
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
          <form className="admin-login" onSubmit={signIn}>
            <div>
              <p className="eyebrow">Accès réservé</p>
              <h1>Connexion</h1>
            </div>
            <p>
              L’identifiant et le mot de passe sont demandés avant d’afficher
              ou de supprimer les groupes.
            </p>
            {error && <div className="form-error">{error}</div>}
            <label>
              Identifiant
              <input
                required
                autoComplete="username"
                value={login}
                onChange={(event) => setLogin(event.target.value)}
              />
            </label>
            <label>
              Mot de passe
              <input
                required
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <button className="create-group-button" disabled={submitting}>
              {submitting ? 'Connexion…' : 'Se connecter'}
            </button>
          </form>
        </section>
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
        <button className="icon-button" onClick={signOut}>
          <LogOut size={17} /> Se déconnecter
        </button>
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
                  <span className={`sport-tag sport-${group.sport || 'pelote'}`}>
                    {SPORTS.find(
                      (sport) => sport.value === (group.sport || 'pelote'),
                    )?.label}
                  </span>
                  <span>{DAYS[group.meeting_day]}</span>
                  <span>{group.meeting_time.slice(0, 5).replace(':', 'h')}</span>
                  <span>
                    {FREQUENCIES.find(
                      (frequency) =>
                        frequency.value === (group.frequency_weeks || 1),
                    )?.label}
                  </span>
                </div>
                <div className="admin-card-actions">
                  <a
                    className="open-group-button"
                    href={`/?group=${group.id}&key=${group.access_token}&admin=${encodeURIComponent(adminToken)}`}
                  >
                    Ouvrir <ExternalLink size={16} />
                  </a>
                  <button
                    className="delete-group-button"
                    onClick={() => deleteGroup(group)}
                    disabled={deletingId === group.id}
                    title={`Supprimer ${group.name}`}
                    aria-label={`Supprimer ${group.name}`}
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
