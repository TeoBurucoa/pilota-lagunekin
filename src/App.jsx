import { useEffect, useMemo, useState } from 'react'
import {
  CalendarDays,
  Clock3,
  Plus,
  RotateCw,
  Settings,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import { isConfigured, supabase } from './supabase'

const demoPlayers = [
  'Antton',
  'Baptiste',
  'Éric',
  'Iban',
  'Jean',
  'Mikel',
  'Nicolas',
  'Peio',
  'Thomas',
  'Xabi',
].map((name, index) => ({
  id: `demo-${index}`,
  name,
  active: true,
  created_at: new Date(2026, 0, index + 1).toISOString(),
}))

const dateKey = (date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const nextThursday = () => {
  const date = new Date()
  date.setHours(12, 0, 0, 0)
  let delta = (4 - date.getDay() + 7) % 7
  if (delta === 0 && new Date().getHours() >= 18) delta = 7
  date.setDate(date.getDate() + delta)
  return date
}

function makeDemoSessions(players, weeks = 8, previousSessions = []) {
  const counts = new Map(players.map((player) => [player.id, 0]))
  const lastPlayed = new Map(players.map((player) => [player.id, -1]))
  const firstDate = nextThursday()

  const generated = Array.from({ length: weeks }, (_, week) => {
    const selected = [...players]
      .sort(
        (a, b) =>
          counts.get(a.id) - counts.get(b.id) ||
          lastPlayed.get(a.id) - lastPlayed.get(b.id) ||
          a.created_at.localeCompare(b.created_at),
      )
      .slice(0, 4)

    selected.forEach((player) => {
      counts.set(player.id, counts.get(player.id) + 1)
      lastPlayed.set(player.id, week)
    })

    const date = new Date(firstDate)
    date.setDate(firstDate.getDate() + week * 7)
    return {
      id: `session-${week}`,
      played_on: dateKey(date),
      session_players: selected.map((player) => ({ player_id: player.id })),
      session_availability: [],
    }
  })

  return generated.map((session) => {
    const previous = previousSessions.find(
      (item) => item.played_on === session.played_on,
    )
    const selectedIds = new Set(
      session.session_players.map((entry) => entry.player_id),
    )
    return {
      ...session,
      session_availability: (previous?.session_availability || []).filter(
        (entry) =>
          counts.has(entry.player_id) && !selectedIds.has(entry.player_id),
      ),
    }
  })
}

const formatDate = (value) =>
  new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(`${value}T12:00:00`))

function App() {
  const [players, setPlayers] = useState(isConfigured ? [] : demoPlayers)
  const [sessions, setSessions] = useState(
    isConfigured ? [] : makeDemoSessions(demoPlayers),
  )
  const [loading, setLoading] = useState(isConfigured)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
  const [showPlayers, setShowPlayers] = useState(false)
  const [newName, setNewName] = useState('')
  const [availabilityChoices, setAvailabilityChoices] = useState({})

  const activePlayers = players.filter((player) => player.active)
  const playerMap = useMemo(
    () => new Map(players.map((player) => [player.id, player])),
    [players],
  )

  const appearances = useMemo(() => {
    const result = new Map(players.map((player) => [player.id, 0]))
    sessions.forEach((session) =>
      session.session_players?.forEach(({ player_id }) =>
        result.set(player_id, (result.get(player_id) || 0) + 1),
      ),
    )
    return result
  }, [players, sessions])

  async function loadData() {
    if (!isConfigured) return
    setLoading(true)
    setError('')

    const [playersResult, sessionsResult] = await Promise.all([
      supabase.from('players').select('*').order('created_at'),
      supabase
        .from('sessions')
        .select(
          'id, played_on, session_players(player_id), session_availability(player_id)',
        )
        .order('played_on'),
    ])

    if (playersResult.error || sessionsResult.error) {
      setError(
        playersResult.error?.message ||
          sessionsResult.error?.message ||
          'Impossible de charger le planning.',
      )
    } else {
      setPlayers(playersResult.data)
      setSessions(sessionsResult.data)
    }
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  async function addPlayer(event) {
    event.preventDefault()
    const name = newName.trim()
    if (!name) return
    setError('')

    if (!isConfigured) {
      const nextPlayers = [
        ...players,
        {
          id: `demo-${crypto.randomUUID()}`,
          name,
          active: true,
          created_at: new Date().toISOString(),
        },
      ]
      setPlayers(nextPlayers)
      setSessions(makeDemoSessions(nextPlayers, 8, sessions))
      setNewName('')
      return
    }

    const { error: insertError } = await supabase
      .from('players')
      .insert({ name })
    if (insertError) setError(insertError.message)
    else {
      setNewName('')
      await loadData()
    }
  }

  async function archivePlayer(player) {
    if (!window.confirm(`Retirer ${player.name} des prochains tirages ?`)) return

    if (!isConfigured) {
      const nextPlayers = players.map((item) =>
        item.id === player.id ? { ...item, active: false } : item,
      )
      setPlayers(nextPlayers)
      setSessions(
        makeDemoSessions(
          nextPlayers.filter((item) => item.active),
          8,
          sessions,
        ),
      )
      return
    }

    const { error: updateError } = await supabase
      .from('players')
      .update({ active: false })
      .eq('id', player.id)
    if (updateError) setError(updateError.message)
    else await loadData()
  }

  async function generateSchedule() {
    if (activePlayers.length < 4) {
      setError('Il faut au moins 4 joueurs actifs pour créer le planning.')
      return
    }
    if (!isConfigured) {
      setSessions(makeDemoSessions(activePlayers, 12, sessions))
      return
    }

    setWorking(true)
    setError('')
    const { error: rpcError } = await supabase.rpc(
      'generate_pelote_sessions',
      { p_weeks: 12, p_rebuild: true },
    )
    if (rpcError) setError(rpcError.message)
    else await loadData()
    setWorking(false)
  }

  function updateDemoSession(sessionId, update) {
    setSessions((current) =>
      current.map((session) =>
        session.id === sessionId ? update(session) : session,
      ),
    )
  }

  async function markAvailable(session, playerId) {
    if (!playerId) return
    setError('')

    if (!isConfigured) {
      updateDemoSession(session.id, (item) => ({
        ...item,
        session_availability: [
          ...(item.session_availability || []),
          { player_id: playerId },
        ],
      }))
    } else {
      const { error: insertError } = await supabase
        .from('session_availability')
        .insert({ session_id: session.id, player_id: playerId })
      if (insertError) setError(insertError.message)
      else await loadData()
    }

    setAvailabilityChoices((current) => ({ ...current, [session.id]: '' }))
  }

  async function removeAvailability(sessionId, playerId) {
    setError('')
    if (!isConfigured) {
      updateDemoSession(sessionId, (item) => ({
        ...item,
        session_availability: item.session_availability.filter(
          (entry) => entry.player_id !== playerId,
        ),
      }))
      return
    }

    const { error: deleteError } = await supabase
      .from('session_availability')
      .delete()
      .eq('session_id', sessionId)
      .eq('player_id', playerId)
    if (deleteError) setError(deleteError.message)
    else await loadData()
  }

  async function removeSelectedPlayer(sessionId, player) {
    if (!window.confirm(`Retirer ${player.name} de cette partie ?`)) return
    setError('')

    if (!isConfigured) {
      updateDemoSession(sessionId, (item) => ({
        ...item,
        session_players: item.session_players.filter(
          (entry) => entry.player_id !== player.id,
        ),
      }))
      return
    }

    const { error: deleteError } = await supabase
      .from('session_players')
      .delete()
      .eq('session_id', sessionId)
      .eq('player_id', player.id)
    if (deleteError) setError(deleteError.message)
    else await loadData()
  }

  async function promoteAvailablePlayer(sessionId, playerId) {
    setError('')
    if (!isConfigured) {
      updateDemoSession(sessionId, (item) => ({
        ...item,
        session_players: [...item.session_players, { player_id: playerId }],
        session_availability: item.session_availability.filter(
          (entry) => entry.player_id !== playerId,
        ),
      }))
      return
    }

    const { error: insertError } = await supabase
      .from('session_players')
      .insert({ session_id: sessionId, player_id: playerId })
    if (insertError) {
      setError(insertError.message)
      return
    }
    await supabase
      .from('session_availability')
      .delete()
      .eq('session_id', sessionId)
      .eq('player_id', playerId)
    await loadData()
  }

  const upcomingSessions = sessions
    .filter((session) => session.played_on >= dateKey(new Date()))
    .slice(0, 12)
  const nextSession = upcomingSessions[0]

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#">
          <span className="brand-mark">P</span>
          <span>Pilota Lagunekin</span>
        </a>
        <button className="icon-button" onClick={() => setShowPlayers(true)}>
          <Settings size={19} />
          <span>Joueurs</span>
        </button>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Prochaine partie</p>
          <h1>
            Osteguna, <em>Pilota eguna!</em>
          </h1>
          <div className="next-date">
            <CalendarDays size={20} />
            {nextSession ? formatDate(nextSession.played_on) : 'Planning à créer'}
            <span />
            <Clock3 size={20} />
            18h00
          </div>
        </div>

        <div className="court-card" aria-hidden="true">
          <div className="court-line horizontal" />
          <div className="court-line vertical" />
          <div className="ball" />
          <span>Fronton</span>
        </div>
      </section>

      {!isConfigured && (
        <div className="demo-banner">
          <span>Mode démo</span>
          Connectez Supabase pour partager ce planning avec le groupe.
        </div>
      )}

      {error && (
        <div className="error-message">
          <X size={18} />
          {error}
        </div>
      )}

      <section className="content-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">La rotation</p>
            <h2>Les prochains jeudis</h2>
          </div>
          <button
            className="secondary-button"
            onClick={generateSchedule}
            disabled={working}
          >
            <RotateCw size={17} className={working ? 'spin' : ''} />
            {sessions.length ? 'Recalculer le planning' : 'Créer le planning'}
          </button>
        </div>

        {loading ? (
          <div className="empty-state">Chargement du planning…</div>
        ) : upcomingSessions.length === 0 ? (
          <div className="empty-state">
            Ajoutez au moins quatre joueurs puis créez le planning.
          </div>
        ) : (
          <div className="schedule-grid">
            {upcomingSessions.map((session, index) => {
              const selected = session.session_players
                .map(({ player_id }) => playerMap.get(player_id))
                .filter(Boolean)
              const selectedIds = new Set(selected.map((player) => player.id))
              const available = (session.session_availability || [])
                .map(({ player_id }) => playerMap.get(player_id))
                .filter(Boolean)
                .filter((player) => !selectedIds.has(player.id))
              const availableIds = new Set(
                available.map((player) => player.id),
              )
              const canDeclareAvailable = activePlayers.filter(
                (player) =>
                  !selectedIds.has(player.id) && !availableIds.has(player.id),
              )

              return (
                <article
                  className={`session-card ${index === 0 ? 'featured' : ''}`}
                  key={session.id}
                >
                  <div className="session-number">
                    {index === 0 ? 'Cette semaine' : `Semaine ${index + 1}`}
                  </div>
                  <h3>{formatDate(session.played_on)}</h3>
                  <div className="player-list">
                    {selected.map((player) => (
                      <div className="scheduled-player" key={player.id}>
                        <span className="avatar">
                          {player.name.slice(0, 1).toUpperCase()}
                        </span>
                        <span>{player.name}</span>
                        <button
                          className="remove-from-session"
                          onClick={() =>
                            removeSelectedPlayer(session.id, player)
                          }
                          title={`Retirer ${player.name} de cette partie`}
                          aria-label={`Retirer ${player.name}`}
                        >
                          <X size={15} />
                        </button>
                      </div>
                    ))}
                    {selected.length < 4 && (
                      <div className="open-slot">
                        <Plus size={16} />
                        {4 - selected.length} place
                        {4 - selected.length > 1 ? 's' : ''} libre
                        {4 - selected.length > 1 ? 's' : ''}
                      </div>
                    )}
                  </div>

                  <div className="availability">
                    <div className="availability-title">
                      <UserPlus size={15} />
                      Disponibles en renfort
                    </div>
                    {available.length > 0 ? (
                      <div className="availability-list">
                        {available.map((player) => (
                          <span className="availability-chip" key={player.id}>
                            {player.name}
                            {selected.length < 4 && (
                              <button
                                onClick={() =>
                                  promoteAvailablePlayer(session.id, player.id)
                                }
                                title={`Ajouter ${player.name} à la partie`}
                                aria-label={`Ajouter ${player.name} à la partie`}
                              >
                                <Plus size={13} />
                              </button>
                            )}
                            <button
                              onClick={() =>
                                removeAvailability(session.id, player.id)
                              }
                              title={`${player.name} n'est plus disponible`}
                              aria-label={`Retirer la disponibilité de ${player.name}`}
                            >
                              <X size={13} />
                            </button>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <small>Personne pour le moment</small>
                    )}

                    {canDeclareAvailable.length > 0 && (
                      <div className="availability-form">
                        <select
                          value={availabilityChoices[session.id] || ''}
                          onChange={(event) =>
                            setAvailabilityChoices((current) => ({
                              ...current,
                              [session.id]: event.target.value,
                            }))
                          }
                          aria-label="Choisir un joueur disponible"
                        >
                          <option value="">Je suis disponible…</option>
                          {canDeclareAvailable.map((player) => (
                            <option value={player.id} key={player.id}>
                              {player.name}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() =>
                            markAvailable(
                              session,
                              availabilityChoices[session.id],
                            )
                          }
                          disabled={!availabilityChoices[session.id]}
                        >
                          Ajouter
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="session-footer">
                    <Clock3 size={15} /> 18h00
                    <span>{selected.length}/4 joueurs</span>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>

      <footer>
        <span>À jeudi au fronton.</span>
        <span>Planning équilibré automatiquement</span>
      </footer>

      {showPlayers && (
        <div className="modal-backdrop" onMouseDown={() => setShowPlayers(false)}>
          <aside className="modal" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <p className="eyebrow">L'équipe</p>
                <h2>Gérer les joueurs</h2>
              </div>
              <button
                className="close-button"
                onClick={() => setShowPlayers(false)}
                aria-label="Fermer"
              >
                <X size={22} />
              </button>
            </div>

            <form className="add-player" onSubmit={addPlayer}>
              <input
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder="Prénom du joueur"
                maxLength={40}
              />
              <button type="submit">
                <Plus size={18} /> Ajouter
              </button>
            </form>

            <div className="roster">
              {activePlayers.map((player) => (
                <div className="roster-player" key={player.id}>
                  <span className="avatar">
                    {player.name.slice(0, 1).toUpperCase()}
                  </span>
                  <div>
                    <strong>{player.name}</strong>
                    <small>{appearances.get(player.id) || 0} parties planifiées</small>
                  </div>
                  <button
                    onClick={() => archivePlayer(player)}
                    title={`Retirer ${player.name}`}
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              ))}
            </div>

            <div className="fairness-note">
              <Users size={19} />
              <p>
                Le planning choisit en priorité ceux qui ont le moins joué, puis
                ceux dont la dernière partie est la plus ancienne.
              </p>
            </div>
          </aside>
        </div>
      )}
    </main>
  )
}

export default App
