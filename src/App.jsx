import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CalendarDays,
  Clock3,
  Lock,
  LockOpen,
  Plus,
  RotateCw,
  Settings,
  Share2,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import { configError, createGroupClient, isConfigured } from './supabase'
import Welcome, { DAYS, FREQUENCIES, SPORTS } from './Welcome'
import Admin from './Admin'

const dateKey = (date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const nextMeetingDate = (
  meetingDay = 4,
  meetingTime = '18:00:00',
  frequencyWeeks = 1,
  createdAt = new Date().toISOString(),
) => {
  const date = new Date(createdAt)
  date.setHours(12, 0, 0, 0)
  date.setDate(date.getDate() + ((meetingDay - date.getDay() + 7) % 7))
  const intervalDays = frequencyWeeks * 7
  const today = new Date()
  today.setHours(12, 0, 0, 0)
  while (date < today) date.setDate(date.getDate() + intervalDays)
  const [hour, minute] = meetingTime.split(':').map(Number)
  const now = new Date()
  if (
    dateKey(date) === dateKey(now) &&
    (now.getHours() > hour ||
      (now.getHours() === hour && now.getMinutes() >= minute))
  ) {
    date.setDate(date.getDate() + intervalDays)
  }
  return date
}

function makeDemoSessions(
  players,
  weeks = 8,
  previousSessions = [],
  meetingDay = 4,
  meetingTime = '18:00:00',
  frequencyWeeks = 1,
  createdAt,
) {
  const counts = new Map(players.map((player) => [player.id, 0]))
  const lastPlayed = new Map(players.map((player) => [player.id, -1]))
  const firstDate = nextMeetingDate(
    meetingDay,
    meetingTime,
    frequencyWeeks,
    createdAt,
  )

  const activeIds = new Set(players.map((player) => player.id))

  return Array.from({ length: weeks }, (_, week) => {
    const date = new Date(firstDate)
    date.setDate(firstDate.getDate() + week * 7 * frequencyWeeks)
    const playedOn = dateKey(date)
    const previous = previousSessions.find((item) => item.played_on === playedOn)
    const lockedEntries = (previous?.session_players || []).filter(
      (entry) => entry.locked && activeIds.has(entry.player_id),
    )
    const lockedIds = new Set(lockedEntries.map((entry) => entry.player_id))
    const selected = [...players]
      .filter((player) => !lockedIds.has(player.id))
      .sort(
        (a, b) =>
          counts.get(a.id) - counts.get(b.id) ||
          lastPlayed.get(a.id) - lastPlayed.get(b.id) ||
          a.created_at.localeCompare(b.created_at),
      )
      .slice(0, Math.max(0, 4 - lockedEntries.length))
    const roster = [
      ...lockedEntries.map((entry) => ({
        player_id: entry.player_id,
        locked: true,
      })),
      ...selected.map((player) => ({ player_id: player.id, locked: false })),
    ]

    roster.forEach((entry) => {
      counts.set(entry.player_id, (counts.get(entry.player_id) || 0) + 1)
      lastPlayed.set(entry.player_id, week)
    })

    return {
      id: previous?.id || `session-${week}`,
      played_on: playedOn,
      session_players: roster,
      session_availability: (previous?.session_availability || []).filter(
        (entry) =>
          activeIds.has(entry.player_id) &&
          !roster.some((item) => item.player_id === entry.player_id),
      ),
    }
  })
}

const COURT_INSET = 25
const BALL_SIZE = 32
const BALL_SPEED = 340

function CourtBall() {
  const ballRef = useRef(null)
  const velocity = useRef({ x: BALL_SPEED * 0.8, y: BALL_SPEED * 0.6 })

  useEffect(() => {
    const ball = ballRef.current
    const court = ball.parentElement
    let width = court.clientWidth
    let height = court.clientHeight
    let x = width * 0.22
    let y = height * 0.28
    ball.style.transform = `translate3d(${x}px, ${y}px, 0)`

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const resizeObserver = new ResizeObserver(() => {
      width = court.clientWidth
      height = court.clientHeight
    })
    resizeObserver.observe(court)

    let last = performance.now()
    let frame
    const step = (now) => {
      const elapsed = Math.min((now - last) / 1000, 0.05)
      last = now
      const v = velocity.current
      const maxX = width - COURT_INSET - BALL_SIZE
      const maxY = height - COURT_INSET - BALL_SIZE
      x += v.x * elapsed
      y += v.y * elapsed

      if (x <= COURT_INSET) {
        x = COURT_INSET
        v.x = Math.abs(v.x)
      } else if (x >= maxX) {
        x = maxX
        v.x = -Math.abs(v.x)
      }
      if (y <= COURT_INSET) {
        y = COURT_INSET
        v.y = Math.abs(v.y)
      } else if (y >= maxY) {
        y = maxY
        v.y = -Math.abs(v.y)
      }

      ball.style.transform = `translate3d(${x}px, ${y}px, 0)`
      frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)

    return () => {
      cancelAnimationFrame(frame)
      resizeObserver.disconnect()
    }
  }, [])

  function changeDirection() {
    const angle =
      (Math.PI / 6 + Math.random() * (Math.PI / 6)) +
      Math.floor(Math.random() * 4) * (Math.PI / 2)
    velocity.current = {
      x: Math.cos(angle) * BALL_SPEED,
      y: Math.sin(angle) * BALL_SPEED,
    }
  }

  return <span ref={ballRef} className="ball" onPointerDown={changeDirection} />
}

function HeroMessage({ message = '' }) {
  const splitAt = message.indexOf(',')
  if (splitAt === -1) return <h1 className="custom-message">{message}</h1>

  return (
    <h1 className="custom-message">
      {message.slice(0, splitAt + 1)} <em>{message.slice(splitAt + 1).trim()}</em>
    </h1>
  )
}

const formatDate = (value) =>
  new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(`${value}T12:00:00`))

function GroupPage({ groupId, groupToken }) {
  const supabase = useMemo(
    () => createGroupClient(groupToken),
    [groupToken],
  )
  const [group, setGroup] = useState(null)
  const [players, setPlayers] = useState([])
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState(configError)
  const [showPlayers, setShowPlayers] = useState(false)
  const [copied, setCopied] = useState(false)
  const [settingsSaved, setSettingsSaved] = useState(false)
  const [newName, setNewName] = useState('')
  const [availabilityChoices, setAvailabilityChoices] = useState({})

  const meetingTime = group?.meeting_time?.slice(0, 5) || '18:00'
  const meetingDayName = DAYS[group?.meeting_day ?? 4]

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
    setLoading(true)
    setError('')

    if (!isConfigured) {
      const storedGroup = localStorage.getItem(`pilota-group-${groupId}`)
      if (!storedGroup) {
        setError('Ce groupe est introuvable ou le lien est incomplet.')
      } else {
        setGroup(JSON.parse(storedGroup))
      }
      setLoading(false)
      return
    }

    const [groupResult, playersResult, sessionsResult] = await Promise.all([
      supabase.from('groups').select('*').eq('id', groupId).maybeSingle(),
      supabase
        .from('players')
        .select('*')
        .eq('group_id', groupId)
        .order('created_at'),
      supabase
        .from('sessions')
        .select(
          'id, played_on, session_players(player_id, locked), session_availability(player_id)',
        )
        .eq('group_id', groupId)
        .order('played_on'),
    ])

    if (groupResult.error || playersResult.error || sessionsResult.error) {
      setError(
        groupResult.error?.message ||
          playersResult.error?.message ||
          sessionsResult.error?.message ||
          'Impossible de charger le planning.',
      )
    } else if (!groupResult.data) {
      setError('Ce groupe est introuvable ou ce lien privé est invalide.')
    } else {
      setGroup(groupResult.data)
      setPlayers(playersResult.data)
      setSessions(sessionsResult.data)
    }
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [groupId, groupToken])

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
      setSessions(
        makeDemoSessions(
          nextPlayers,
          8,
          sessions,
          group.meeting_day,
          group.meeting_time,
          group.frequency_weeks || 1,
          group.created_at,
        ),
      )
      setNewName('')
      return
    }

    const { error: insertError } = await supabase
      .from('players')
      .insert({ name, group_id: groupId })
    if (insertError) setError(insertError.message)
    else {
      setNewName('')
      await loadData()
    }
  }

  async function saveGroupSettings(event) {
    event.preventDefault()
    setError('')
    setSettingsSaved(false)
    const changes = {
      name: group.name.trim(),
      meeting_day: Number(group.meeting_day),
      meeting_time: group.meeting_time,
      frequency_weeks: Number(group.frequency_weeks || 1),
      sport: group.sport || 'pelote',
      hero_message: group.hero_message.trim(),
    }

    if (!isConfigured) {
      const updated = { ...group, ...changes }
      localStorage.setItem(`pilota-group-${groupId}`, JSON.stringify(updated))
      setGroup(updated)
      setSettingsSaved(true)
      return
    }

    const { error: updateError } = await supabase
      .from('groups')
      .update(changes)
      .eq('id', groupId)
    if (updateError) setError(updateError.message)
    else {
      setSettingsSaved(true)
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
          group.meeting_day,
          group.meeting_time,
          group.frequency_weeks || 1,
          group.created_at,
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
      setSessions(
        makeDemoSessions(
          activePlayers,
          12,
          sessions,
          group.meeting_day,
          group.meeting_time,
          group.frequency_weeks || 1,
          group.created_at,
        ),
      )
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

  async function togglePlayerLock(sessionId, player) {
    const locked = !player.locked
    setError('')

    if (!isConfigured) {
      updateDemoSession(sessionId, (item) => ({
        ...item,
        session_players: item.session_players.map((entry) =>
          entry.player_id === player.id ? { ...entry, locked } : entry,
        ),
      }))
      return
    }

    const { error: updateError } = await supabase
      .from('session_players')
      .update({ locked })
      .eq('session_id', sessionId)
      .eq('player_id', player.id)
    if (updateError) setError(updateError.message)
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

  async function copyGroupLink() {
    await navigator.clipboard.writeText(window.location.href)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  if (!group) {
    return (
      <main className="link-state">
        <span className="brand-mark">P</span>
        <h1>{loading ? 'Ouverture du groupe…' : 'Lien invalide'}</h1>
        {!loading && <p>{error}</p>}
        {!loading && <a href="/">Créer un nouveau groupe</a>}
      </main>
    )
  }

  return (
    <main className={`group-page theme-${group.sport || 'pelote'}`}>
      <header className="site-header">
        <a className="brand" href="/">
          <span className="brand-mark">P</span>
          <span>{group?.name || 'Pilota Lagunekin'}</span>
        </a>
        <div className="header-actions">
          <button className="icon-button" onClick={copyGroupLink}>
            <Share2 size={18} />
            <span>{copied ? 'Lien copié' : 'Partager'}</span>
          </button>
          <button className="icon-button" onClick={() => setShowPlayers(true)}>
            <Settings size={19} />
            <span>Gérer</span>
          </button>
        </div>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Prochaine partie</p>
          <HeroMessage message={group?.hero_message} />
          <div className="next-date">
            <CalendarDays size={20} />
            {nextSession ? formatDate(nextSession.played_on) : 'Planning à créer'}
            <span />
            <Clock3 size={20} />
            {meetingTime.replace(':', 'h')}
          </div>
        </div>

        <div className="court-card" aria-hidden="true">
          <div className="court-line horizontal" />
          <div className="court-line vertical" />
          <CourtBall />
          <span>{group?.name}</span>
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
            <h2>Les prochains {meetingDayName.toLowerCase()}s</h2>
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
                .map(({ player_id, locked }) => {
                  const player = playerMap.get(player_id)
                  return player ? { ...player, locked: Boolean(locked) } : null
                })
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
                        <div className="player-actions">
                          <button
                            className={`lock-player ${player.locked ? 'locked' : ''}`}
                            onClick={() => togglePlayerLock(session.id, player)}
                            title={
                              player.locked
                                ? `Déverrouiller ${player.name}`
                                : `Verrouiller ${player.name} sur ce créneau`
                            }
                            aria-label={
                              player.locked
                                ? `Déverrouiller ${player.name}`
                                : `Verrouiller ${player.name}`
                            }
                            aria-pressed={player.locked}
                          >
                            {player.locked ? <Lock size={15} /> : <LockOpen size={15} />}
                          </button>
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
                    <Clock3 size={15} /> {meetingTime.replace(':', 'h')}
                    <span>{selected.length}/4 joueurs</span>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>

      <footer>
        <span>À {meetingDayName.toLowerCase()} !</span>
        <span>Planning équilibré automatiquement</span>
      </footer>

      {showPlayers && (
        <div className="modal-backdrop" onMouseDown={() => setShowPlayers(false)}>
          <aside className="modal" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <p className="eyebrow">Votre espace</p>
                <h2>Gérer le groupe</h2>
              </div>
              <button
                className="close-button"
                onClick={() => setShowPlayers(false)}
                aria-label="Fermer"
              >
                <X size={22} />
              </button>
            </div>

            <form className="group-settings" onSubmit={saveGroupSettings}>
              <label>
                Nom du groupe
                <input
                  required
                  maxLength={60}
                  value={group.name}
                  onChange={(event) =>
                    setGroup((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                Sport
                <select
                  value={group.sport || 'pelote'}
                  onChange={(event) =>
                    setGroup((current) => ({
                      ...current,
                      sport: event.target.value,
                    }))
                  }
                >
                  {SPORTS.map((sport) => (
                    <option value={sport.value} key={sport.value}>
                      {sport.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="form-row">
                <label>
                  Jour
                  <select
                    value={group.meeting_day}
                    onChange={(event) =>
                      setGroup((current) => ({
                        ...current,
                        meeting_day: Number(event.target.value),
                      }))
                    }
                  >
                    {DAYS.map((day, index) => (
                      <option value={index} key={day}>{day}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Heure
                  <input
                    required
                    type="time"
                    value={group.meeting_time.slice(0, 5)}
                    onChange={(event) =>
                      setGroup((current) => ({
                        ...current,
                        meeting_time: `${event.target.value}:00`,
                      }))
                    }
                  />
                </label>
              </div>
              <label>
                Fréquence
                <select
                  value={group.frequency_weeks || 1}
                  onChange={(event) =>
                    setGroup((current) => ({
                      ...current,
                      frequency_weeks: Number(event.target.value),
                    }))
                  }
                >
                  {FREQUENCIES.map((frequency) => (
                    <option value={frequency.value} key={frequency.value}>
                      {frequency.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Message principal
                <textarea
                  required
                  rows={2}
                  maxLength={100}
                  value={group.hero_message}
                  onChange={(event) =>
                    setGroup((current) => ({
                      ...current,
                      hero_message: event.target.value,
                    }))
                  }
                />
              </label>
              <button type="submit">
                {settingsSaved ? 'Modifications enregistrées' : 'Enregistrer'}
              </button>
            </form>

            <div className="modal-section-title">Joueurs du groupe</div>
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
                ceux dont la dernière partie est la plus ancienne. Un joueur
                verrouillé reste sur son créneau lors des prochains recalculs.
              </p>
            </div>
          </aside>
        </div>
      )}
    </main>
  )
}

function App() {
  const params = new URLSearchParams(window.location.search)
  const adminToken = params.get('admin')
  const groupId = params.get('group')
  const groupToken = params.get('key')

  if (adminToken) return <Admin adminToken={adminToken} />
  if (!groupId || !groupToken) return <Welcome />
  return <GroupPage groupId={groupId} groupToken={groupToken} />
}

export default App
