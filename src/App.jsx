import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Euro,
  History,
  PartyPopper,
  Plus,
  RotateCw,
  Settings,
  Share2,
  Trash2,
  UserPlus,
  Users,
  WalletCards,
  X,
} from 'lucide-react'
import {
  ADMIN_TOKEN_KEY,
  configError,
  createAdminClient,
  createGroupClient,
  isConfigured,
} from './supabase'
import Welcome, { DAYS, FREQUENCIES, SPORTS, useSportFavicon } from './Welcome'
import Admin from './Admin'
import {
  buildMonthlyBalances,
  currentMonthKey,
  eurosToCents,
  formatEuros,
  formatMonth,
  getSessionPaymentSummary,
  moveMonth,
} from './payments'

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
  maxPlayers = 4,
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

  const generated = Array.from({ length: weeks }, (_, week) => {
    const date = new Date(firstDate)
    date.setDate(firstDate.getDate() + week * 7 * frequencyWeeks)
    const playedOn = dateKey(date)
    const previous = previousSessions.find((item) => item.played_on === playedOn)
    if (previous?.manual) {
      const roster = (previous.session_players || []).filter((entry) =>
        activeIds.has(entry.player_id),
      )
      roster.forEach((entry) => {
        counts.set(entry.player_id, (counts.get(entry.player_id) || 0) + 1)
        lastPlayed.set(entry.player_id, week)
      })
      return {
        ...previous,
        played_on: playedOn,
        manual: true,
        session_players: roster,
        session_availability: (previous.session_availability || []).filter(
          (entry) =>
            activeIds.has(entry.player_id) &&
            !roster.some((item) => item.player_id === entry.player_id),
        ),
      }
    }
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
      .slice(
        0,
        Math.max(
          0,
          maxPlayers -
            lockedEntries.length -
            (previous?.session_guests || []).length,
        ),
      )
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
      session_guests: previous?.session_guests || [],
      session_availability: (previous?.session_availability || []).filter(
        (entry) =>
          activeIds.has(entry.player_id) &&
          !roster.some((item) => item.player_id === entry.player_id),
      ),
    }
  })

  const generatedDates = new Set(generated.map((session) => session.played_on))
  const extraManual = previousSessions.filter(
    (session) => session.manual && !generatedDates.has(session.played_on),
  )

  return [...generated, ...extraManual].sort((left, right) =>
    left.played_on.localeCompare(right.played_on),
  )
}

const COURT_INSET = 25
const BALL_SIZE = 32
const BALL_SPEED = 340
const PHONE_BALL_SPEED = 140

function CourtBall() {
  const ballRef = useRef(null)
  const phoneScreen = window.matchMedia('(max-width: 560px)')
  const speed = useRef(phoneScreen.matches ? PHONE_BALL_SPEED : BALL_SPEED)
  const velocity = useRef({
    x: speed.current * 0.8,
    y: speed.current * 0.6,
  })

  useEffect(() => {
    const ball = ballRef.current
    const court = ball.parentElement
    let width = court.clientWidth
    let height = court.clientHeight
    let x = width * 0.22
    let y = height * 0.28
    ball.style.transform = `translate3d(${x}px, ${y}px, 0)`

    const updateSpeed = () => {
      const next = phoneScreen.matches ? PHONE_BALL_SPEED : BALL_SPEED
      const ratio = next / speed.current
      speed.current = next
      velocity.current.x *= ratio
      velocity.current.y *= ratio
    }
    phoneScreen.addEventListener('change', updateSpeed)

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return () => phoneScreen.removeEventListener('change', updateSpeed)
    }

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
      phoneScreen.removeEventListener('change', updateSpeed)
    }
  }, [])

  function changeDirection() {
    const angle =
      (Math.PI / 6 + Math.random() * (Math.PI / 6)) +
      Math.floor(Math.random() * 4) * (Math.PI / 2)
    velocity.current = {
      x: Math.cos(angle) * speed.current,
      y: Math.sin(angle) * speed.current,
    }
  }

  return (
    <span ref={ballRef} className="ball" onPointerDown={changeDirection}>
      <span className="ball-surface" />
    </span>
  )
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

function readVisitAdminToken() {
  localStorage.removeItem(ADMIN_TOKEN_KEY)
  const params = new URLSearchParams(window.location.search)
  const fromUrl = params.get('admin')
  if (!fromUrl) return ''
  params.delete('admin')
  const query = params.toString()
  window.history.replaceState(
    {},
    '',
    `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`,
  )
  return fromUrl
}

function GroupPage({ groupId, groupToken }) {
  const [adminToken] = useState(readVisitAdminToken)
  const [isAdmin, setIsAdmin] = useState(!isConfigured)
  const supabase = useMemo(
    () => createGroupClient(groupToken, isAdmin ? adminToken : ''),
    [groupToken, isAdmin, adminToken],
  )
  const [group, setGroup] = useState(null)
  const [players, setPlayers] = useState([])
  const [sessions, setSessions] = useState([])
  const [groupEvents, setGroupEvents] = useState([])
  const [monthCosts, setMonthCosts] = useState([])
  const [monthlyPayments, setMonthlyPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [savingSlot, setSavingSlot] = useState(false)
  const [error, setError] = useState(configError)
  const [showPlayers, setShowPlayers] = useState(false)
  const [showSlotForm, setShowSlotForm] = useState(false)
  const [manualDate, setManualDate] = useState('')
  const [manualTime, setManualTime] = useState('18:00')
  const [copied, setCopied] = useState(false)
  const [settingsSaved, setSettingsSaved] = useState(false)
  const [newName, setNewName] = useState('')
  const [availabilityChoices, setAvailabilityChoices] = useState({})
  const [guestNames, setGuestNames] = useState({})
  const [slotMenuId, setSlotMenuId] = useState('')
  const [slotPick, setSlotPick] = useState('')
  const [eventTitle, setEventTitle] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [eventTime, setEventTime] = useState('19:00')
  const [eventGuestNames, setEventGuestNames] = useState({})
  const [savingEvent, setSavingEvent] = useState(false)
  const [showAllEvents, setShowAllEvents] = useState(false)
  const [showPayments, setShowPayments] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [paymentMonth, setPaymentMonth] = useState(currentMonthKey)
  const [expandedPaymentSession, setExpandedPaymentSession] = useState('')
  const [sessionPriceDrafts, setSessionPriceDrafts] = useState({})
  const [monthCostDrafts, setMonthCostDrafts] = useState({})
  const [monthSessionCountDrafts, setMonthSessionCountDrafts] = useState({})
  const [monthPayerDrafts, setMonthPayerDrafts] = useState({})
  const [monthlyPaymentPlayer, setMonthlyPaymentPlayer] = useState('')
  const [monthlyPaymentAmount, setMonthlyPaymentAmount] = useState('')
  const [groupPriceDraft, setGroupPriceDraft] = useState(null)
  const [scoreDrafts, setScoreDrafts] = useState({})
  const [savingPayment, setSavingPayment] = useState(false)

  useEffect(() => {
    if (!isConfigured || !adminToken) return undefined
    let cancelled = false
    createAdminClient(adminToken)
      .rpc('request_is_admin')
      .then(({ data, error: adminError }) => {
        if (cancelled) return
        if (!adminError && data === true) setIsAdmin(true)
        else setIsAdmin(false)
      })
    return () => {
      cancelled = true
    }
  }, [adminToken])

  const meetingDayName = DAYS[group?.meeting_day ?? 4]
  const maxPlayers =
    SPORTS.find((sport) => sport.value === group?.sport)?.maxPlayers || 4
  const hasRecurringSchedule = group?.recurring !== false
  useSportFavicon(group?.sport || 'pelote')

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
        const savedGroup = JSON.parse(storedGroup)
        setGroup(savedGroup)
        setPlayers(savedGroup.demo_players || [])
        setSessions(savedGroup.demo_sessions || [])
        setGroupEvents(savedGroup.group_events || [])
        setMonthCosts(savedGroup.month_costs || [])
        setMonthlyPayments(savedGroup.monthly_payments || [])
      }
      setLoading(false)
      return
    }

    const [
      groupResult,
      playersResult,
      sessionsResult,
      eventsResult,
      monthCostsResult,
      monthlyPaymentsResult,
    ] =
      await Promise.all([
      supabase.from('groups').select('*').eq('id', groupId).maybeSingle(),
      supabase
        .from('players')
        .select('*')
        .eq('group_id', groupId)
        .order('created_at'),
      supabase
        .from('sessions')
        .select(
          'id, played_on, manual, starts_at, price_cents, paid_by, team_one_score, team_two_score, session_players(player_id, locked, share_paid, team), session_availability(player_id), session_guests(id, name, share_paid, team)',
        )
        .eq('group_id', groupId)
        .order('played_on'),
      supabase
        .from('group_events')
        .select(
          '*, event_attendance(player_id, status), event_guests(id, name, status)',
        )
        .eq('group_id', groupId)
        .order('starts_on')
        .order('starts_at'),
      supabase
        .from('month_costs')
        .select('*')
        .eq('group_id', groupId)
        .order('month'),
      supabase
        .from('monthly_payments')
        .select('*')
        .eq('group_id', groupId)
        .order('created_at'),
    ])

    if (
      groupResult.error ||
      playersResult.error ||
      sessionsResult.error ||
      eventsResult.error ||
      monthCostsResult.error ||
      monthlyPaymentsResult.error
    ) {
      setError(
        groupResult.error?.message ||
          playersResult.error?.message ||
          sessionsResult.error?.message ||
          eventsResult.error?.message ||
          monthCostsResult.error?.message ||
          monthlyPaymentsResult.error?.message ||
          'Impossible de charger le planning.',
      )
    } else if (!groupResult.data) {
      setError('Ce groupe est introuvable ou ce lien privé est invalide.')
    } else {
      setGroup(groupResult.data)
      setPlayers(playersResult.data)
      setSessions(sessionsResult.data)
      setGroupEvents(eventsResult.data)
      setMonthCosts(monthCostsResult.data)
      setMonthlyPayments(monthlyPaymentsResult.data)
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
    const normalizedName = name.toLocaleLowerCase('fr')
    const nameTaken = players.some(
      (player) =>
        player.active &&
        player.name.trim().toLocaleLowerCase('fr') === normalizedName,
    )
    if (nameTaken) {
      setError('Ce nom est déjà utilisé dans le groupe.')
      return
    }
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
          hasRecurringSchedule ? 8 : 0,
          sessions,
          group.meeting_day,
          group.meeting_time,
          group.frequency_weeks || 1,
          group.created_at,
          maxPlayers,
        ),
      )
      setNewName('')
      return
    }

    const { error: insertError } = await supabase
      .from('players')
      .insert({ name, group_id: groupId })
    if (insertError) {
      setError(
        insertError.code === '23505'
          ? 'Ce nom est déjà utilisé dans le groupe.'
          : insertError.message,
      )
    } else {
      setNewName('')
      await loadData()
    }
  }

  function saveDemoEvents(nextEvents) {
    setGroupEvents(nextEvents)
    const updatedGroup = { ...group, group_events: nextEvents }
    setGroup(updatedGroup)
    localStorage.setItem(
      `pilota-group-${groupId}`,
      JSON.stringify(updatedGroup),
    )
  }

  async function createGroupEvent(event) {
    event.preventDefault()
    const title = eventTitle.trim()
    if (!isAdmin || !title || !eventDate || !eventTime) return
    if (eventDate < dateKey(new Date())) {
      setError('La date de l’événement ne peut pas être passée.')
      return
    }

    setError('')
    const startsAt = eventTime.length === 5 ? `${eventTime}:00` : eventTime
    if (!isConfigured) {
      const nextEvents = [
        ...groupEvents,
        {
          id: `event-${crypto.randomUUID()}`,
          group_id: groupId,
          title,
          starts_on: eventDate,
          starts_at: startsAt,
          created_at: new Date().toISOString(),
          event_attendance: [],
          event_guests: [],
        },
      ].sort(
        (left, right) =>
          left.starts_on.localeCompare(right.starts_on) ||
          left.starts_at.localeCompare(right.starts_at),
      )
      saveDemoEvents(nextEvents)
      setEventTitle('')
      setEventDate('')
      setEventTime('19:00')
      return
    }

    setSavingEvent(true)
    const { error: insertError } = await supabase.from('group_events').insert({
      group_id: groupId,
      title,
      starts_on: eventDate,
      starts_at: startsAt,
    })
    if (insertError) setError(insertError.message)
    else {
      setEventTitle('')
      setEventDate('')
      setEventTime('19:00')
      await loadData()
    }
    setSavingEvent(false)
  }

  async function removeGroupEvent(groupEvent) {
    if (!isAdmin) return
    if (!window.confirm(`Supprimer l’événement « ${groupEvent.title} » ?`)) {
      return
    }
    setError('')

    if (!isConfigured) {
      saveDemoEvents(
        groupEvents.filter((item) => item.id !== groupEvent.id),
      )
      return
    }

    const { error: deleteError } = await supabase
      .from('group_events')
      .delete()
      .eq('id', groupEvent.id)
    if (deleteError) setError(deleteError.message)
    else await loadData()
  }

  function eventPeople(groupEvent) {
    const attendance = new Map(
      (groupEvent.event_attendance || []).map((entry) => [
        entry.player_id,
        entry.status || 'present',
      ]),
    )
    return [
      ...activePlayers.map((player) => ({
        key: `player-${player.id}`,
        id: player.id,
        name: player.name,
        kind: 'player',
        status: attendance.get(player.id),
      })),
      ...(groupEvent.event_guests || []).map((guest) => ({
        key: `guest-${guest.id}`,
        id: guest.id,
        name: guest.name,
        kind: 'guest',
        status: guest.status || undefined,
      })),
    ].sort((left, right) => left.name.localeCompare(right.name, 'fr'))
  }

  async function addEventGuest(event, groupEvent) {
    event.preventDefault()
    if (!isAdmin) return
    const name = (eventGuestNames[groupEvent.id] || '').trim()
    if (!name) return
    const normalized = name.toLocaleLowerCase('fr')
    if (
      activePlayers.some(
        (player) => player.name.trim().toLocaleLowerCase('fr') === normalized,
      ) ||
      (groupEvent.event_guests || []).some(
        (guest) => guest.name.trim().toLocaleLowerCase('fr') === normalized,
      )
    ) {
      setError('Ce nom est déjà présent pour cet événement.')
      return
    }
    setError('')

    if (!isConfigured) {
      const nextEvents = groupEvents.map((item) =>
        item.id === groupEvent.id
          ? {
              ...item,
              event_guests: [
                ...(item.event_guests || []),
                {
                  id: `event-guest-${crypto.randomUUID()}`,
                  name,
                  status: null,
                },
              ],
            }
          : item,
      )
      saveDemoEvents(nextEvents)
      setEventGuestNames((current) => ({ ...current, [groupEvent.id]: '' }))
      return
    }

    const { error: insertError } = await supabase.from('event_guests').insert({
      event_id: groupEvent.id,
      name,
    })
    if (insertError) {
      setError(
        insertError.code === '23505'
          ? 'Ce nom est déjà présent pour cet événement.'
          : insertError.message,
      )
    } else {
      setEventGuestNames((current) => ({ ...current, [groupEvent.id]: '' }))
      await loadData()
    }
  }

  async function removeEventGuest(guest) {
    if (!isAdmin) return
    if (!window.confirm(`Retirer ${guest.name} de cet événement ?`)) return
    setError('')
    if (!isConfigured) {
      saveDemoEvents(
        groupEvents.map((item) => ({
          ...item,
          event_guests: (item.event_guests || []).filter(
            (entry) => entry.id !== guest.id,
          ),
        })),
      )
      return
    }

    const { error: deleteError } = await supabase
      .from('event_guests')
      .delete()
      .eq('id', guest.id)
    if (deleteError) setError(deleteError.message)
    else await loadData()
  }

  async function toggleEventAttendance(groupEvent, person) {
    if (person.kind === 'guest') {
      const nextStatus =
        person.status === 'present'
          ? 'absent'
          : person.status === 'absent'
            ? null
            : 'present'
      setError('')
      if (!isConfigured) {
        saveDemoEvents(
          groupEvents.map((item) =>
            item.id === groupEvent.id
              ? {
                  ...item,
                  event_guests: (item.event_guests || []).map((guest) =>
                    guest.id === person.id
                      ? { ...guest, status: nextStatus }
                      : guest,
                  ),
                }
              : item,
          ),
        )
        return
      }

      const { error: updateError } = await supabase
        .from('event_guests')
        .update({ status: nextStatus })
        .eq('id', person.id)
      if (updateError) setError(updateError.message)
      else await loadData()
      return
    }

    const playerId = person.id
    const current = (groupEvent.event_attendance || []).find(
      (entry) => entry.player_id === playerId,
    )
    const nextStatus =
      current?.status === 'present'
        ? 'absent'
        : current?.status === 'absent'
          ? null
          : 'present'
    setError('')

    if (!isConfigured) {
      const nextEvents = groupEvents.map((item) => {
        if (item.id !== groupEvent.id) return item
        const attendance = item.event_attendance || []
        return {
          ...item,
          event_attendance: nextStatus
            ? [
                ...attendance.filter((entry) => entry.player_id !== playerId),
                { player_id: playerId, status: nextStatus },
              ]
            : attendance.filter((entry) => entry.player_id !== playerId),
        }
      })
      saveDemoEvents(nextEvents)
      return
    }

    const query = !current
      ? supabase.from('event_attendance').insert({
          event_id: groupEvent.id,
          player_id: playerId,
          status: nextStatus,
        })
      : nextStatus
        ? supabase
            .from('event_attendance')
            .update({ status: nextStatus })
            .eq('event_id', groupEvent.id)
            .eq('player_id', playerId)
        : supabase
            .from('event_attendance')
            .delete()
            .eq('event_id', groupEvent.id)
            .eq('player_id', playerId)
    const { error: attendanceError } = await query
    if (attendanceError) setError(attendanceError.message)
    else await loadData()
  }

  function saveDemoPaymentData({
    nextSessions = sessions,
    nextMonthCosts = monthCosts,
    nextMonthlyPayments = monthlyPayments,
  } = {}) {
    setSessions(nextSessions)
    setMonthCosts(nextMonthCosts)
    setMonthlyPayments(nextMonthlyPayments)
    const updatedGroup = {
      ...group,
      demo_players: players,
      demo_sessions: nextSessions,
      month_costs: nextMonthCosts,
      monthly_payments: nextMonthlyPayments,
    }
    setGroup(updatedGroup)
    localStorage.setItem(
      `pilota-group-${groupId}`,
      JSON.stringify(updatedGroup),
    )
  }

  async function updateSessionPayment(sessionId, changes) {
    setError('')
    if (!isConfigured) {
      const nextSessions = sessions.map((session) =>
        session.id === sessionId ? { ...session, ...changes } : session,
      )
      saveDemoPaymentData({ nextSessions })
      return
    }

    const { error: updateError } = await supabase
      .from('sessions')
      .update(changes)
      .eq('id', sessionId)
    if (updateError) setError(updateError.message)
    else await loadData()
  }

  async function saveSessionPrice(event, session) {
    event.preventDefault()
    const value =
      sessionPriceDrafts[session.id] ??
      String(
        (session.price_cents ?? group.session_price_cents ?? 0) / 100,
      )
    await updateSessionPayment(session.id, {
      price_cents: eurosToCents(value),
    })
  }

  async function toggleSessionShare(session, participant) {
    const nextPaid = !participant.sharePaid
    setError('')
    if (!isConfigured) {
      const nextSessions = sessions.map((item) => {
        if (item.id !== session.id) return item
        if (participant.type === 'guest') {
          return {
            ...item,
            session_guests: (item.session_guests || []).map((guest) =>
              guest.id === participant.id
                ? { ...guest, share_paid: nextPaid }
                : guest,
            ),
          }
        }
        return {
          ...item,
          session_players: (item.session_players || []).map((entry) =>
            entry.player_id === participant.id
              ? { ...entry, share_paid: nextPaid }
              : entry,
          ),
        }
      })
      saveDemoPaymentData({ nextSessions })
      return
    }

    const table =
      participant.type === 'guest' ? 'session_guests' : 'session_players'
    let query = supabase.from(table).update({ share_paid: nextPaid })
    query =
      participant.type === 'guest'
        ? query.eq('id', participant.id)
        : query
            .eq('session_id', session.id)
            .eq('player_id', participant.id)
    const { error: updateError } = await query
    if (updateError) setError(updateError.message)
    else await loadData()
  }

  async function updateHistoryTeam(session, participant, value) {
    const team = value === '1' || value === '2' ? Number(value) : null
    const played = value !== ''
    setError('')
    if (!isConfigured) {
      const nextSessions = sessions.map((item) => {
        if (item.id !== session.id) return item
        if (participant.type === 'guest') {
          return {
            ...item,
            session_guests: (item.session_guests || []).map((guest) =>
              guest.id === participant.id ? { ...guest, team } : guest,
            ),
          }
        }
        return {
          ...item,
          session_players: (item.session_players || []).map((entry) =>
            entry.player_id === participant.id
              ? { ...entry, team, locked: played }
              : entry,
          ),
        }
      })
      saveDemoPaymentData({ nextSessions })
      return
    }

    const table =
      participant.type === 'guest' ? 'session_guests' : 'session_players'
    let query = supabase
      .from(table)
      .update(
        participant.type === 'guest' ? { team } : { team, locked: played },
      )
    query =
      participant.type === 'guest'
        ? query.eq('id', participant.id)
        : query
            .eq('session_id', session.id)
            .eq('player_id', participant.id)
    const { error: updateError } = await query
    if (updateError) setError(updateError.message)
    else await loadData()
  }

  async function removePastSession(session) {
    if (!isAdmin) return
    if (
      !window.confirm(
        `Supprimer la partie du ${formatDate(session.played_on)} ? Elle sera retirée de l’historique et des comptes.`,
      )
    ) {
      return
    }
    setError('')

    if (!isConfigured) {
      saveDemoPaymentData({
        nextSessions: sessions.filter((item) => item.id !== session.id),
      })
      return
    }

    const { error: deleteError } = await supabase.rpc('delete_past_session', {
      p_session_id: session.id,
    })
    if (deleteError) setError(deleteError.message)
    else await loadData()
  }

  async function saveHistoryScore(event, session) {
    event.preventDefault()
    const draft = scoreDrafts[session.id] || {}
    const firstValue = draft.teamOne ?? session.team_one_score ?? ''
    const secondValue = draft.teamTwo ?? session.team_two_score ?? ''
    if (
      (firstValue === '' && secondValue !== '') ||
      (firstValue !== '' && secondValue === '')
    ) {
      setError('Indiquez le score des deux équipes.')
      return
    }
    const changes = {
      team_one_score: firstValue === '' ? null : Number(firstValue),
      team_two_score: secondValue === '' ? null : Number(secondValue),
    }
    setError('')

    if (!isConfigured) {
      const nextSessions = sessions.map((item) =>
        item.id === session.id ? { ...item, ...changes } : item,
      )
      saveDemoPaymentData({ nextSessions })
      return
    }

    const { error: updateError } = await supabase
      .from('sessions')
      .update(changes)
      .eq('id', session.id)
    if (updateError) setError(updateError.message)
    else await loadData()
  }

  async function saveMonthCost(event) {
    event.preventDefault()
    if (!isAdmin) return
    const regularCount = sessions.filter(
      (session) =>
        !session.manual &&
        session.played_on.slice(0, 7) === paymentMonth.slice(0, 7),
    ).length
    const savedCost = monthCosts.find((cost) => cost.month === paymentMonth)
    const sessionCount = Math.max(
      0,
      Math.trunc(
        Number(
          monthSessionCountDrafts[paymentMonth] ??
            savedCost?.session_count ??
            regularCount,
        ),
      ),
    )
    const defaultCost = (group.session_price_cents || 0) * sessionCount
    const amountCents = eurosToCents(
      monthCostDrafts[paymentMonth] ??
        String((savedCost?.amount_cents ?? defaultCost) / 100),
    )
    const paidBy =
      monthPayerDrafts[paymentMonth] ?? savedCost?.paid_by ?? null
    setError('')

    if (!isConfigured) {
      const nextMonthCosts = [
        ...monthCosts.filter((cost) => cost.month !== paymentMonth),
        {
          group_id: groupId,
          month: paymentMonth,
          amount_cents: amountCents,
          session_count: sessionCount,
          paid_by: paidBy || null,
        },
      ]
      saveDemoPaymentData({ nextMonthCosts })
      return
    }

    const { error: upsertError } = await supabase.from('month_costs').upsert({
      group_id: groupId,
      month: paymentMonth,
      amount_cents: amountCents,
      session_count: sessionCount,
      paid_by: paidBy || null,
    })
    if (upsertError) setError(upsertError.message)
    else await loadData()
  }

  async function addMonthlyPayment(event) {
    event.preventDefault()
    const amountCents = eurosToCents(monthlyPaymentAmount)
    if (!monthlyPaymentPlayer || amountCents <= 0) return
    setSavingPayment(true)
    setError('')
    const payment = {
      group_id: groupId,
      player_id: monthlyPaymentPlayer,
      month: paymentMonth,
      amount_cents: amountCents,
      created_at: new Date().toISOString(),
    }

    if (!isConfigured) {
      saveDemoPaymentData({
        nextMonthlyPayments: [
          ...monthlyPayments,
          { ...payment, id: crypto.randomUUID() },
        ],
      })
      setMonthlyPaymentPlayer('')
      setMonthlyPaymentAmount('')
      setSavingPayment(false)
      return
    }

    const { error: insertError } = await supabase
      .from('monthly_payments')
      .insert(payment)
    if (insertError) setError(insertError.message)
    else {
      setMonthlyPaymentPlayer('')
      setMonthlyPaymentAmount('')
      await loadData()
    }
    setSavingPayment(false)
  }

  async function removeMonthlyPayment(payment) {
    if (!isAdmin) return
    if (!window.confirm('Supprimer ce paiement ?')) return
    setError('')
    if (!isConfigured) {
      saveDemoPaymentData({
        nextMonthlyPayments: monthlyPayments.filter(
          (item) => item.id !== payment.id,
        ),
      })
      return
    }

    const { error: deleteError } = await supabase
      .from('monthly_payments')
      .delete()
      .eq('id', payment.id)
    if (deleteError) setError(deleteError.message)
    else await loadData()
  }

  async function saveGroupSettings(event) {
    event.preventDefault()
    if (!isAdmin) {
      setError('Seul un administrateur peut modifier le groupe.')
      return
    }
    setError('')
    setSettingsSaved(false)
    const changes = {
      name: group.name.trim(),
      meeting_day: Number(group.meeting_day),
      meeting_time: group.meeting_time,
      frequency_weeks: Number(group.frequency_weeks || 1),
      recurring: group.recurring !== false,
      sport: group.sport || 'pelote',
      hero_message: group.hero_message.trim(),
      payment_mode: group.payment_mode || 'none',
      session_price_cents: Number(group.session_price_cents || 0),
    }

    if (!isConfigured) {
      const updated = { ...group, ...changes }
      localStorage.setItem(`pilota-group-${groupId}`, JSON.stringify(updated))
      setGroup(updated)
      setSettingsSaved(true)
      setGroupPriceDraft(null)
      return
    }

    const { error: updateError } = await supabase
      .from('groups')
      .update(changes)
      .eq('id', groupId)
    if (updateError) setError(updateError.message)
    else {
      setSettingsSaved(true)
      setGroupPriceDraft(null)
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
          hasRecurringSchedule ? 8 : 0,
          sessions,
          group.meeting_day,
          group.meeting_time,
          group.frequency_weeks || 1,
          group.created_at,
          maxPlayers,
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
    if (!hasRecurringSchedule) {
      setError('Ce groupe utilise uniquement des créneaux à la demande.')
      return
    }
    if (isConfigured && !isAdmin) {
      setError('Seul un administrateur peut recalculer le planning.')
      return
    }
    if (activePlayers.length < maxPlayers) {
      setError(
        `Il faut au moins ${maxPlayers} joueurs actifs pour créer le planning.`,
      )
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
          maxPlayers,
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

  function openSlotForm() {
    setManualDate('')
    setManualTime((group?.meeting_time || '18:00:00').slice(0, 5))
    setShowSlotForm(true)
    setError('')
  }

  async function createManualSession(event) {
    event.preventDefault()
    const playedOn = manualDate
    const startsAt = manualTime.length === 5 ? `${manualTime}:00` : manualTime
    if (!playedOn || !manualTime) return
    if (sessions.some((session) => session.played_on === playedOn)) {
      setError('Un créneau existe déjà ce jour-là.')
      return
    }

    setError('')
    if (!isConfigured) {
      setSessions((current) =>
        [
          ...current,
          {
            id: `manual-${crypto.randomUUID()}`,
            played_on: playedOn,
            starts_at: startsAt,
            manual: true,
            session_players: [],
            session_guests: [],
            session_availability: [],
          },
        ].sort((left, right) => left.played_on.localeCompare(right.played_on)),
      )
      setShowSlotForm(false)
      return
    }

    setSavingSlot(true)
    const { error: slotError } = await supabase.rpc('create_manual_session', {
      p_played_on: playedOn,
      p_starts_at: startsAt,
    })
    if (slotError) setError(slotError.message)
    else {
      setShowSlotForm(false)
      await loadData()
    }
    setSavingSlot(false)
  }

  async function removeManualSession(session) {
    if (!session.manual) return
    if (!window.confirm(`Retirer le créneau du ${formatDate(session.played_on)} ?`)) {
      return
    }
    setError('')

    if (!isConfigured) {
      setSessions((current) => current.filter((item) => item.id !== session.id))
      return
    }

    const { error: deleteError } = await supabase.rpc('delete_manual_session', {
      p_session_id: session.id,
    })
    if (deleteError) setError(deleteError.message)
    else await loadData()
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

  async function addGuest(event, session) {
    event.preventDefault()
    const name = (guestNames[session.id] || '').trim()
    if (!name) return
    const guests = session.session_guests || []
    const filled = (session.session_players || []).length + guests.length
    const normalized = name.toLocaleLowerCase('fr')
    if (filled >= maxPlayers) {
      setError(`Cette partie compte déjà ${maxPlayers} joueurs.`)
      return
    }
    if (
      guests.some(
        (guest) => guest.name.trim().toLocaleLowerCase('fr') === normalized,
      )
    ) {
      setError('Cet invité est déjà sur ce créneau.')
      return
    }
    if (
      activePlayers.some(
        (player) => player.name.trim().toLocaleLowerCase('fr') === normalized,
      )
    ) {
      setError('Cette personne fait déjà partie du groupe.')
      return
    }

    setError('')
    if (!isConfigured) {
      updateDemoSession(session.id, (item) => ({
        ...item,
        session_guests: [
          ...(item.session_guests || []),
          { id: `guest-${crypto.randomUUID()}`, name },
        ],
      }))
      setGuestNames((current) => ({ ...current, [session.id]: '' }))
      setSlotMenuId('')
      setSlotPick('')
      return
    }

    const { error: insertError } = await supabase
      .from('session_guests')
      .insert({ session_id: session.id, name })
    if (insertError) {
      setError(
        insertError.code === '23505'
          ? 'Cet invité est déjà sur ce créneau.'
          : insertError.message,
      )
    } else {
      setGuestNames((current) => ({ ...current, [session.id]: '' }))
      setSlotMenuId('')
      setSlotPick('')
      await loadData()
    }
  }

  async function removeGuest(sessionId, guest) {
    if (!window.confirm(`Retirer l'invité ${guest.name} de ce créneau ?`)) return
    setError('')

    if (!isConfigured) {
      updateDemoSession(sessionId, (item) => ({
        ...item,
        session_guests: (item.session_guests || []).filter(
          (entry) => entry.id !== guest.id,
        ),
      }))
      return
    }

    const { error: deleteError } = await supabase
      .from('session_guests')
      .delete()
      .eq('id', guest.id)
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

  const isSessionPast = (session) =>
    new Date(
      `${session.played_on}T${
        session.starts_at || group?.meeting_time || '18:00:00'
      }`,
    ) < new Date()
  const pastSessions = sessions
    .filter(isSessionPast)
    .sort((left, right) => right.played_on.localeCompare(left.played_on))
  const futureSessions = sessions
    .filter((session) => !isSessionPast(session))
    .sort((left, right) => left.played_on.localeCompare(right.played_on))
  const upcomingSessions = [
    ...futureSessions.filter((session) => !session.manual).slice(0, 12),
    ...futureSessions.filter((session) => session.manual),
  ].sort((left, right) => left.played_on.localeCompare(right.played_on))
  const nextSession = upcomingSessions[0]
  const featuredSessionId = upcomingSessions.find((session) => !session.manual)?.id
  const formatClock = (value) =>
    (value || group?.meeting_time || '18:00:00').slice(0, 5).replace(':', 'h')
  const canRecalculate = isAdmin && hasRecurringSchedule
  const upcomingEvents = groupEvents
    .filter((groupEvent) => groupEvent.starts_on >= dateKey(new Date()))
    .sort(
      (left, right) =>
        left.starts_on.localeCompare(right.starts_on) ||
        left.starts_at.localeCompare(right.starts_at),
    )
  const visibleEvents = showAllEvents
    ? upcomingEvents
    : upcomingEvents.slice(0, 1)
  const paymentMode = group?.payment_mode || 'none'
  const paymentsEnabled = paymentMode !== 'none'
  const usesSessionPayment = (session) =>
    paymentsEnabled &&
    (paymentMode === 'per_session' ||
      (paymentMode === 'monthly' && session.manual))
  const regularSessionsThisMonth = sessions.filter(
    (session) =>
      !session.manual &&
      session.played_on.slice(0, 7) === paymentMonth.slice(0, 7),
  )
  const savedMonthCost = monthCosts.find(
    (cost) => cost.month === paymentMonth,
  )
  const effectiveMonthSessionCount = Math.max(
    0,
    Math.trunc(
      Number(
        monthSessionCountDrafts[paymentMonth] ??
          savedMonthCost?.session_count ??
          regularSessionsThisMonth.length,
      ),
    ),
  )
  const effectiveMonthPayerId =
    monthPayerDrafts[paymentMonth] ?? savedMonthCost?.paid_by ?? ''
  const effectiveMonthPayer = playerMap.get(effectiveMonthPayerId)
  const effectiveMonthCost =
    savedMonthCost?.amount_cents ??
    (group?.session_price_cents || 0) * effectiveMonthSessionCount
  const monthlyReport = buildMonthlyBalances({
    month: paymentMonth,
    sessions,
    players,
    payments: monthlyPayments,
    costCents: effectiveMonthCost,
    paidBy: effectiveMonthPayerId,
    sessionCount: effectiveMonthSessionCount,
    today: dateKey(new Date()),
  })
  const monthlyBalances = monthlyReport.rows
  const confirmedAppearancesThisMonth = monthlyBalances.reduce(
    (total, row) => total + row.games,
    0,
  )
  const selectedMonthlyPayments = monthlyPayments.filter(
    (payment) => payment.month === paymentMonth,
  )
  const unpaidSessionShares = sessions
    .filter(
      (session) =>
        session.played_on.slice(0, 7) === paymentMonth.slice(0, 7) &&
        usesSessionPayment(session),
    )
    .flatMap((session) => {
      const summary = getSessionPaymentSummary(
        session,
        group?.session_price_cents || 0,
        playerMap,
      )
      if (!summary.payer) return []
      return summary.participants
        .filter(
          (participant) =>
            !participant.isPaid && participant.amountCents > 0,
        )
        .map((participant) => ({
          ...participant,
          session,
          payer: summary.payer,
        }))
    })

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
          <button
            className="icon-button"
            onClick={() => setShowHistory(true)}
          >
            <History size={18} />
            <span>Historique</span>
          </button>
          {paymentsEnabled && (
            <button
              className="icon-button"
              onClick={() => setShowPayments(true)}
            >
              <WalletCards size={18} />
              <span>Paiements</span>
            </button>
          )}
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

      {upcomingEvents.length > 0 && (
        <section className="celebration-wrap">
          <div className="celebration-border">
            <div className="celebration-panel">
              {visibleEvents.map((groupEvent) => {
                const people = eventPeople(groupEvent)
                const attendingCount = people.filter(
                  (person) => person.status === 'present',
                ).length
                const absentCount = people.filter(
                  (person) => person.status === 'absent',
                ).length
                const unansweredCount = people.length - attendingCount - absentCount
                return (
                  <article className="celebration-event" key={groupEvent.id}>
                    <div className="celebration-heading">
                      <span className="celebration-icon">
                        <PartyPopper size={22} />
                      </span>
                      <div>
                        <p className="eyebrow">Événement du groupe</p>
                        <h2>{groupEvent.title}</h2>
                      </div>
                      <div className="celebration-counts">
                        <strong className="present">
                          {attendingCount} présent{attendingCount > 1 ? 's' : ''}
                        </strong>
                        <strong className="absent">
                          {absentCount} absent{absentCount > 1 ? 's' : ''}
                        </strong>
                        <strong>
                          {unansweredCount} sans réponse
                        </strong>
                      </div>
                    </div>
                    <div className="celebration-date">
                      <CalendarDays size={17} />
                      {formatDate(groupEvent.starts_on)}
                      <span />
                      <Clock3 size={17} />
                      {formatClock(groupEvent.starts_at)}
                    </div>
                    {people.length > 0 && (
                      <div
                        className="event-attendance"
                        aria-label={`Présences pour ${groupEvent.title}`}
                      >
                        {people.map((person) => {
                          const label =
                            person.status === 'present'
                              ? 'présent'
                              : person.status === 'absent'
                                ? 'absent'
                                : 'sans réponse'
                          return (
                            <button
                              type="button"
                              className={person.status || 'unanswered'}
                              aria-pressed={person.status === 'present'}
                              title={`${person.name} : ${label}. Cliquer pour changer.`}
                              onClick={() =>
                                toggleEventAttendance(groupEvent, person)
                              }
                              key={person.key}
                            >
                              {person.status === 'present' && (
                                <Check size={14} strokeWidth={3} />
                              )}
                              {person.status === 'absent' && (
                                <X size={14} strokeWidth={3} />
                              )}
                              {person.name}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </article>
                )
              })}
              {upcomingEvents.length > 1 && (
                <button
                  type="button"
                  className="more-events"
                  onClick={() => setShowAllEvents((current) => !current)}
                >
                  {showAllEvents
                    ? 'Masquer les autres événements'
                    : `+ ${upcomingEvents.length - 1} autre${
                        upcomingEvents.length > 2 ? 's' : ''
                      } événement${
                        upcomingEvents.length > 2 ? 's' : ''
                      }`}
                </button>
              )}
            </div>
          </div>
        </section>
      )}

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Prochaine partie</p>
          <HeroMessage message={group?.hero_message} />
          <div className="next-date">
            <CalendarDays size={20} />
            {nextSession
              ? formatDate(nextSession.played_on)
              : hasRecurringSchedule
                ? 'Planning à créer'
                : 'Aucun créneau prévu'}
            <span />
            <Clock3 size={20} />
            {formatClock(nextSession?.starts_at)}
          </div>
        </div>

        <div className="court-card" aria-hidden="true">
          <div className="court-line horizontal" />
          <div className="court-line vertical" />
          <CourtBall />
          <span className="court-label">{group?.name}</span>
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
            <h2>Les prochains créneaux</h2>
          </div>
          <div className="section-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={() => (showSlotForm ? setShowSlotForm(false) : openSlotForm())}
            >
              <Plus size={17} />
              Ajouter un créneau
            </button>
            {canRecalculate && (
              <button
                type="button"
                className="secondary-button"
                onClick={generateSchedule}
                disabled={working}
              >
                <RotateCw size={17} className={working ? 'spin' : ''} />
                {sessions.length ? 'Recalculer le planning' : 'Créer le planning'}
              </button>
            )}
          </div>
        </div>

        {showSlotForm && (
          <form className="manual-slot-form" onSubmit={createManualSession}>
            <label>
              Jour
              <input
                required
                type="date"
                min={dateKey(new Date())}
                value={manualDate}
                onChange={(event) => setManualDate(event.target.value)}
              />
            </label>
            <label>
              Horaire
              <input
                required
                type="time"
                value={manualTime}
                onChange={(event) => setManualTime(event.target.value)}
              />
            </label>
            <button type="submit" disabled={savingSlot}>
              {savingSlot ? 'Création…' : 'Créer le créneau'}
            </button>
          </form>
        )}

        {loading ? (
          <div className="empty-state">Chargement du planning…</div>
        ) : (
          <>
            {activePlayers.length < maxPlayers && (
              <div className="player-setup">
                <p className="eyebrow">Pour commencer</p>
                <h3>
                  {activePlayers.length === 0
                    ? 'Ajoutez les joueurs'
                    : `${activePlayers.length} joueur${activePlayers.length > 1 ? 's' : ''} sur ${maxPlayers}`}
                </h3>
                <p>
                  Il faut {maxPlayers} joueurs pour préparer un créneau complet.
                </p>
                {activePlayers.length > 0 && (
                  <div className="setup-roster">
                    {activePlayers.map((player) => (
                      <span key={player.id}>{player.name}</span>
                    ))}
                  </div>
                )}
                <form className="add-player-prominent" onSubmit={addPlayer}>
                  <input
                    required
                    value={newName}
                    onChange={(event) => setNewName(event.target.value)}
                    placeholder="Prénom du joueur"
                    maxLength={40}
                    aria-label="Prénom du joueur"
                  />
                  <button type="submit">
                    <UserPlus size={18} />
                    Ajouter un joueur
                  </button>
                </form>
              </div>
            )}
            {upcomingSessions.length === 0 ? (
              (!hasRecurringSchedule ||
                activePlayers.length >= maxPlayers) && (
                <div className="empty-state">
                  {!hasRecurringSchedule
                    ? 'Ajoutez votre premier créneau à la demande.'
                    : canRecalculate
                    ? 'Les joueurs sont prêts. Créez le planning.'
                    : 'Les joueurs sont prêts. Seul l’administrateur peut créer le planning.'}
                </div>
              )
            ) : (
          <div className="schedule-grid">
            {upcomingSessions.map((session) => {
              const selected = (session.session_players || [])
                .map(({ player_id, locked }) => {
                  const player = playerMap.get(player_id)
                  return player ? { ...player, locked: Boolean(locked) } : null
                })
                .filter(Boolean)
              const guests = session.session_guests || []
              const filled = selected.length + guests.length
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

              const classicIndex = upcomingSessions
                .filter((item) => !item.manual)
                .findIndex((item) => item.id === session.id)
              const sessionLabel = session.manual
                ? 'Créneau ajouté'
                : classicIndex === 0
                  ? 'Cette semaine'
                  : `Semaine ${classicIndex + 1}`
              const hasSessionPayment = usesSessionPayment(session)
              const sessionPayment = getSessionPaymentSummary(
                session,
                group.session_price_cents || 0,
                playerMap,
              )

              return (
                <article
                  className={`session-card${session.manual ? ' manual' : ''}${
                    session.id === featuredSessionId ? ' featured' : ''
                  }`}
                  key={session.id}
                >
                  {session.manual && (
                    <button
                      type="button"
                      className="remove-manual-session"
                      onClick={() => removeManualSession(session)}
                      title="Retirer ce créneau"
                      aria-label={`Retirer le créneau du ${formatDate(session.played_on)}`}
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                  <div className="session-number">{sessionLabel}</div>
                  <h3>{formatDate(session.played_on)}</h3>
                  <div className="player-list">
                    {selected.map((player) => (
                      <div
                        className={`scheduled-player${player.locked ? ' confirmed' : ''}`}
                        key={player.id}
                      >
                        <span className="avatar">
                          {player.name.slice(0, 1).toUpperCase()}
                        </span>
                        <span>{player.name}</span>
                        <div className="player-actions">
                          <button
                            type="button"
                            className={`confirm-player${player.locked ? ' confirmed' : ''}`}
                            onClick={() => togglePlayerLock(session.id, player)}
                            title={
                              player.locked
                                ? `Annuler la présence de ${player.name}`
                                : `Valider la présence de ${player.name}`
                            }
                            aria-label={
                              player.locked
                                ? `Annuler la présence de ${player.name}`
                                : `Valider la présence de ${player.name}`
                            }
                            aria-pressed={player.locked}
                          >
                            <Check size={15} strokeWidth={player.locked ? 3 : 2} />
                          </button>
                          <button
                            type="button"
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
                    {guests.map((guest) => (
                      <div className="scheduled-player guest" key={guest.id}>
                        <span className="avatar">
                          {guest.name.slice(0, 1).toUpperCase()}
                        </span>
                        <span>{guest.name}</span>
                        <span className="guest-tag">Invité</span>
                        <div className="player-actions">
                          <button
                            type="button"
                            className="remove-from-session"
                            onClick={() => removeGuest(session.id, guest)}
                            title={`Retirer l'invité ${guest.name}`}
                            aria-label={`Retirer l'invité ${guest.name}`}
                          >
                            <X size={15} />
                          </button>
                        </div>
                      </div>
                    ))}
                    {filled < maxPlayers && (
                      <div className="open-slot-block">
                        <div className="open-slot">
                          <span>
                            {maxPlayers - filled} place
                            {maxPlayers - filled > 1 ? 's' : ''} libre
                            {maxPlayers - filled > 1 ? 's' : ''}
                          </span>
                          <button
                            type="button"
                            className="fill-slot"
                            aria-expanded={slotMenuId === session.id}
                            aria-label="Ajouter quelqu'un sur cette place"
                            onClick={() => {
                              setSlotPick('')
                              setSlotMenuId((current) =>
                                current === session.id ? '' : session.id,
                              )
                            }}
                          >
                            <Plus size={16} />
                          </button>
                        </div>
                        {slotMenuId === session.id && (
                          <div className="fill-slot-menu" role="menu">
                            {activePlayers
                              .filter((player) => !selectedIds.has(player.id))
                              .map((player) => (
                                <button
                                  type="button"
                                  role="menuitem"
                                  key={player.id}
                                  onClick={() => {
                                    promoteAvailablePlayer(session.id, player.id)
                                    setSlotMenuId('')
                                    setSlotPick('')
                                  }}
                                >
                                  {player.name}
                                </button>
                              ))}
                            <button
                              type="button"
                              role="menuitem"
                              className={slotPick === 'guest' ? 'selected' : ''}
                              onClick={() => setSlotPick('guest')}
                            >
                              Invité
                            </button>
                            {slotPick === 'guest' && (
                              <form
                                className="guest-form"
                                onSubmit={(event) => addGuest(event, session)}
                              >
                                <input
                                  value={guestNames[session.id] || ''}
                                  onChange={(event) =>
                                    setGuestNames((current) => ({
                                      ...current,
                                      [session.id]: event.target.value,
                                    }))
                                  }
                                  placeholder="Nom de l'invité"
                                  maxLength={40}
                                  aria-label="Nom de l'invité"
                                  autoFocus
                                />
                                <button
                                  type="submit"
                                  disabled={!guestNames[session.id]?.trim()}
                                >
                                  Ajouter
                                </button>
                              </form>
                            )}
                          </div>
                        )}
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
                            {filled < maxPlayers && (
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
                  {hasSessionPayment && (
                    <div className="session-payment">
                      <button
                        type="button"
                        className="session-payment-toggle"
                        aria-expanded={expandedPaymentSession === session.id}
                        onClick={() =>
                          setExpandedPaymentSession((current) =>
                            current === session.id ? '' : session.id,
                          )
                        }
                      >
                        <Euro size={15} />
                        <span>
                          {formatEuros(sessionPayment.priceCents)}
                          {' · '}
                          {sessionPayment.payer
                            ? `payé par ${sessionPayment.payer.name}`
                            : 'personne n’a avancé'}
                          {' · '}
                          {sessionPayment.paidCount}/
                          {sessionPayment.participants.length} parts réglées
                        </span>
                        <ChevronRight
                          size={16}
                          className={
                            expandedPaymentSession === session.id
                              ? 'expanded'
                              : ''
                          }
                        />
                      </button>
                      {expandedPaymentSession === session.id && (
                        <div className="session-payment-details">
                          <form
                            className="session-price-form"
                            onSubmit={(event) =>
                              saveSessionPrice(event, session)
                            }
                          >
                            <label>
                              Prix du créneau (€)
                              <input
                                required
                                type="number"
                                min="0"
                                step="0.01"
                                value={
                                  sessionPriceDrafts[session.id] ??
                                  String(sessionPayment.priceCents / 100)
                                }
                                onChange={(event) =>
                                  setSessionPriceDrafts((current) => ({
                                    ...current,
                                    [session.id]: event.target.value,
                                  }))
                                }
                              />
                            </label>
                            <button type="submit">Enregistrer</button>
                          </form>
                          <label className="session-payer">
                            Payé par
                            <select
                              value={
                                selectedIds.has(session.paid_by)
                                  ? session.paid_by
                                  : ''
                              }
                              onChange={(event) =>
                                updateSessionPayment(session.id, {
                                  paid_by: event.target.value || null,
                                })
                              }
                            >
                              <option value="">Personne pour l’instant</option>
                              {selected.map((player) => (
                                <option value={player.id} key={player.id}>
                                  {player.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <div className="payment-share-list">
                            {sessionPayment.participants.map((participant) => (
                              <div
                                className={participant.isPaid ? 'paid' : ''}
                                key={participant.key}
                              >
                                <span>
                                  <strong>{participant.name}</strong>
                                  <small>
                                    {formatEuros(participant.amountCents)}
                                  </small>
                                </span>
                                {participant.isPayer ? (
                                  <em>Payeur</em>
                                ) : (
                                  <button
                                    type="button"
                                    className={
                                      participant.sharePaid ? 'paid' : ''
                                    }
                                    onClick={() =>
                                      toggleSessionShare(session, participant)
                                    }
                                  >
                                    <Check size={14} />
                                    {participant.sharePaid
                                      ? 'Part réglée'
                                      : 'J’ai payé ma part'}
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="session-footer">
                    <Clock3 size={15} /> {formatClock(session.starts_at)}
                    <span>{filled}/{maxPlayers} joueurs</span>
                  </div>
                </article>
              )
            })}
          </div>
            )}
          </>
        )}
      </section>

      <footer>
        <span>
          {hasRecurringSchedule
            ? `À ${meetingDayName.toLowerCase()} !`
            : 'À la prochaine partie !'}
        </span>
        <span>
          {hasRecurringSchedule
            ? 'Planning équilibré automatiquement'
            : 'Créneaux ajoutés à la demande'}
        </span>
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
              {!isAdmin && (
                <p className="settings-admin-note">
                  Seul l’administrateur peut modifier ces réglages.
                </p>
              )}
              <fieldset disabled={!isAdmin}>
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
              <label>
                Fréquence
                <select
                  value={
                    group.recurring === false
                      ? 'none'
                      : group.frequency_weeks || 1
                  }
                  onChange={(event) =>
                    setGroup((current) => {
                      const value = event.target.value
                      return {
                        ...current,
                        recurring: value !== 'none',
                        frequency_weeks:
                          value === 'none'
                            ? current.frequency_weeks || 1
                            : Number(value),
                      }
                    })
                  }
                >
                  <option value="none">Pas de créneau récurrent</option>
                  {FREQUENCIES.map((frequency) => (
                    <option value={frequency.value} key={frequency.value}>
                      {frequency.label}
                    </option>
                  ))}
                </select>
              </label>
              {group.recurring !== false && (
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
              )}
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
              <label>
                Paiement
                <select
                  value={group.payment_mode || 'none'}
                  onChange={(event) =>
                    setGroup((current) => ({
                      ...current,
                      payment_mode: event.target.value,
                    }))
                  }
                >
                  <option value="none">Pas de paiement</option>
                  <option value="monthly">Au mois</option>
                  <option value="per_session">Au créneau</option>
                </select>
              </label>
              {(group.payment_mode || 'none') !== 'none' && (
                <label>
                  Prix d’un créneau (€)
                  <input
                    required
                    type="number"
                    min="0"
                    step="0.01"
                    value={
                      groupPriceDraft ??
                      String((group.session_price_cents || 0) / 100)
                    }
                    onChange={(event) => {
                      setGroupPriceDraft(event.target.value)
                      setGroup((current) => ({
                        ...current,
                        session_price_cents: eurosToCents(event.target.value),
                      }))
                    }}
                  />
                </label>
              )}
              <button type="submit">
                {settingsSaved ? 'Modifications enregistrées' : 'Enregistrer'}
              </button>
              </fieldset>
            </form>

            {isAdmin && (
              <section className="event-settings">
                <div className="modal-section-title">Événements</div>
                <form className="event-form" onSubmit={createGroupEvent}>
                  <label>
                    Titre
                    <input
                      required
                      maxLength={60}
                      value={eventTitle}
                      onChange={(event) => setEventTitle(event.target.value)}
                      placeholder="Repas de fin de saison"
                    />
                  </label>
                  <div className="form-row">
                    <label>
                      Date
                      <input
                        required
                        type="date"
                        min={dateKey(new Date())}
                        value={eventDate}
                        onChange={(event) => setEventDate(event.target.value)}
                      />
                    </label>
                    <label>
                      Heure
                      <input
                        required
                        type="time"
                        value={eventTime}
                        onChange={(event) => setEventTime(event.target.value)}
                      />
                    </label>
                  </div>
                  <button type="submit" disabled={savingEvent}>
                    <PartyPopper size={17} />
                    {savingEvent ? 'Création…' : 'Créer l’événement'}
                  </button>
                </form>
                {upcomingEvents.length > 0 && (
                  <div className="managed-events">
                    {upcomingEvents.map((groupEvent) => (
                      <article key={groupEvent.id}>
                        <div className="managed-event-row">
                          <span>
                            <strong>{groupEvent.title}</strong>
                            <small>
                              {formatDate(groupEvent.starts_on)} ·{' '}
                              {formatClock(groupEvent.starts_at)}
                            </small>
                          </span>
                          <button
                            type="button"
                            onClick={() => removeGroupEvent(groupEvent)}
                            title={`Supprimer ${groupEvent.title}`}
                            aria-label={`Supprimer ${groupEvent.title}`}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                        <form
                          className="event-extra-form"
                          onSubmit={(event) => addEventGuest(event, groupEvent)}
                        >
                          <input
                            value={eventGuestNames[groupEvent.id] || ''}
                            onChange={(event) =>
                              setEventGuestNames((current) => ({
                                ...current,
                                [groupEvent.id]: event.target.value,
                              }))
                            }
                            maxLength={40}
                            placeholder="Ajouter une personne hors rotation"
                            aria-label={`Ajouter une personne à ${groupEvent.title}`}
                          />
                          <button type="submit">Ajouter</button>
                        </form>
                        {(groupEvent.event_guests || []).length > 0 && (
                          <div className="event-extra-list">
                            {groupEvent.event_guests.map((guest) => (
                              <span key={guest.id}>
                                {guest.name}
                                <button
                                  type="button"
                                  onClick={() => removeEventGuest(guest)}
                                  aria-label={`Retirer ${guest.name}`}
                                >
                                  <X size={13} />
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                      </article>
                    ))}
                  </div>
                )}
              </section>
            )}

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
            {error && <p className="player-form-error">{error}</p>}

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
                ceux dont la dernière partie est la plus ancienne. Une présence
                validée reste sur son créneau lors des prochains recalculs.
              </p>
            </div>
          </aside>
        </div>
      )}

      {showHistory && (
        <div
          className="modal-backdrop"
          onMouseDown={() => setShowHistory(false)}
        >
          <aside
            className="modal history-modal"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <p className="eyebrow">Les parties jouées</p>
                <h2>Historique</h2>
              </div>
              <button
                className="close-button"
                onClick={() => setShowHistory(false)}
                aria-label="Fermer"
              >
                <X size={22} />
              </button>
            </div>

            {error && <p className="player-form-error">{error}</p>}

            {pastSessions.length === 0 ? (
              <p className="payments-empty">
                Aucune partie passée pour le moment.
              </p>
            ) : (
              <div className="history-list">
                {pastSessions.map((session) => {
                  const participants = [
                    ...(session.session_players || [])
                      .map((entry) => {
                        const player = playerMap.get(entry.player_id)
                        return player
                          ? {
                              id: player.id,
                              type: 'player',
                              name: player.name,
                              team: entry.team || null,
                              locked: Boolean(entry.locked),
                            }
                          : null
                      })
                      .filter(Boolean),
                    ...(session.session_guests || []).map((guest) => ({
                      id: guest.id,
                      type: 'guest',
                      name: guest.name,
                      team: guest.team || null,
                    })),
                  ]
                  const firstTeam = participants.filter(
                    (participant) => participant.team === 1,
                  )
                  const secondTeam = participants.filter(
                    (participant) => participant.team === 2,
                  )
                  const hasScore =
                    session.team_one_score != null &&
                    session.team_two_score != null
                  const scoreDraft = scoreDrafts[session.id] || {}

                  return (
                    <article className="history-card" key={session.id}>
                      <div className="history-card-heading">
                        <div>
                          <span>
                            {session.manual
                              ? 'Créneau ajouté'
                              : 'Créneau régulier'}
                          </span>
                          <h3>{formatDate(session.played_on)}</h3>
                        </div>
                        <div className="history-card-actions">
                          <small>{formatClock(session.starts_at)}</small>
                          {isAdmin && (
                            <button
                              type="button"
                              onClick={() => removePastSession(session)}
                              aria-label={`Supprimer la partie du ${formatDate(session.played_on)}`}
                            >
                              <Trash2 size={15} />
                              Supprimer
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="history-teams">
                        <div>
                          <strong>Équipe 1</strong>
                          <span>
                            {firstTeam.length
                              ? firstTeam
                                  .map((participant) => participant.name)
                                  .join(', ')
                              : 'À composer'}
                          </span>
                        </div>
                        <b>
                          {hasScore
                            ? `${session.team_one_score} – ${session.team_two_score}`
                            : 'VS'}
                        </b>
                        <div>
                          <strong>Équipe 2</strong>
                          <span>
                            {secondTeam.length
                              ? secondTeam
                                  .map((participant) => participant.name)
                                  .join(', ')
                              : 'À composer'}
                          </span>
                        </div>
                      </div>

                      <div className="history-participants">
                        {participants.map((participant) => (
                          <label
                            key={`${participant.type}-${participant.id}`}
                          >
                            <span>
                              <i>
                                {participant.name.slice(0, 1).toUpperCase()}
                              </i>
                              {participant.name}
                              {participant.type === 'guest' && (
                                <small>Invité</small>
                              )}
                            </span>
                            <select
                              value={
                                participant.team ||
                                (participant.locked ? 'confirmed' : '')
                              }
                              onChange={(event) =>
                                updateHistoryTeam(
                                  session,
                                  participant,
                                  event.target.value,
                                )
                              }
                            >
                              <option value="">N’a pas joué</option>
                              {participant.type === 'player' && (
                                <option value="confirmed">
                                  A joué — équipe à définir
                                </option>
                              )}
                              <option value="1">Équipe 1</option>
                              <option value="2">Équipe 2</option>
                            </select>
                          </label>
                        ))}
                      </div>

                      <form
                        className="history-score-form"
                        onSubmit={(event) => saveHistoryScore(event, session)}
                      >
                        <label>
                          Score équipe 1
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={
                              scoreDraft.teamOne ??
                              session.team_one_score ??
                              ''
                            }
                            onChange={(event) =>
                              setScoreDrafts((current) => ({
                                ...current,
                                [session.id]: {
                                  ...current[session.id],
                                  teamOne: event.target.value,
                                },
                              }))
                            }
                          />
                        </label>
                        <span>–</span>
                        <label>
                          Score équipe 2
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={
                              scoreDraft.teamTwo ??
                              session.team_two_score ??
                              ''
                            }
                            onChange={(event) =>
                              setScoreDrafts((current) => ({
                                ...current,
                                [session.id]: {
                                  ...current[session.id],
                                  teamTwo: event.target.value,
                                },
                              }))
                            }
                          />
                        </label>
                        <button type="submit">Enregistrer le résultat</button>
                      </form>
                    </article>
                  )
                })}
              </div>
            )}
          </aside>
        </div>
      )}

      {showPayments && (
        <div
          className="modal-backdrop"
          onMouseDown={() => setShowPayments(false)}
        >
          <aside
            className="modal payments-modal"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <p className="eyebrow">Les comptes du groupe</p>
                <h2>Paiements</h2>
              </div>
              <button
                className="close-button"
                onClick={() => setShowPayments(false)}
                aria-label="Fermer"
              >
                <X size={22} />
              </button>
            </div>

            <div className="payment-month-nav">
              <button
                type="button"
                onClick={() =>
                  setPaymentMonth((current) => moveMonth(current, -1))
                }
                aria-label="Mois précédent"
              >
                <ChevronLeft size={19} />
              </button>
              <strong>{formatMonth(paymentMonth)}</strong>
              <button
                type="button"
                onClick={() =>
                  setPaymentMonth((current) => moveMonth(current, 1))
                }
                aria-label="Mois suivant"
              >
                <ChevronRight size={19} />
              </button>
            </div>

            {error && <p className="player-form-error">{error}</p>}

            {paymentMode === 'monthly' && (
              <>
                <section className="monthly-cost">
                  <div>
                    <span>Coût du mois</span>
                    <div className="monthly-cost-total">
                      <strong>{formatEuros(effectiveMonthCost)}</strong>
                      <b>
                        {effectiveMonthPayer
                          ? `avancé par ${effectiveMonthPayer.name}`
                          : 'personne n’a encore avancé'}
                      </b>
                    </div>
                    <small>
                      {effectiveMonthSessionCount} créneau
                      {effectiveMonthSessionCount > 1 ? 'x' : ''} régulier
                      {effectiveMonthSessionCount > 1 ? 's' : ''}
                    </small>
                    {!savedMonthCost && (
                      <small>
                        Montant proposé depuis le prix d’un créneau
                      </small>
                    )}
                  </div>
                  {isAdmin && (
                    <form onSubmit={saveMonthCost}>
                      <label>
                        Créneaux
                        <input
                          required
                          type="number"
                          min="0"
                          step="1"
                          value={effectiveMonthSessionCount}
                          onChange={(event) =>
                            setMonthSessionCountDrafts((current) => ({
                              ...current,
                              [paymentMonth]: event.target.value,
                            }))
                          }
                        />
                      </label>
                      <label>
                        Montant (€)
                        <input
                          required
                          type="number"
                          min="0"
                          step="0.01"
                          value={
                            monthCostDrafts[paymentMonth] ??
                            String(effectiveMonthCost / 100)
                          }
                          onChange={(event) =>
                            setMonthCostDrafts((current) => ({
                              ...current,
                              [paymentMonth]: event.target.value,
                            }))
                          }
                        />
                      </label>
                      <label>
                        Avancé par
                        <select
                          value={effectiveMonthPayerId}
                          onChange={(event) =>
                            setMonthPayerDrafts((current) => ({
                              ...current,
                              [paymentMonth]: event.target.value,
                            }))
                          }
                        >
                          <option value="">Personne pour l’instant</option>
                          {activePlayers.map((player) => (
                            <option value={player.id} key={player.id}>
                              {player.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button type="submit">Enregistrer</button>
                    </form>
                  )}
                </section>

                <p className="monthly-presence-note">
                  {monthlyReport.finalAmount
                    ? 'Montant final : toutes les présences validées sont réparties sur le coût du mois.'
                    : 'Montant en cours : chaque joueur ne doit que ses parties déjà jouées et validées.'}{' '}
                  <strong>
                    {confirmedAppearancesThisMonth} participation
                    {confirmedAppearancesThisMonth > 1 ? 's' : ''}
                  </strong>
                  {effectiveMonthPayer &&
                    ` · les restes sont à régler à ${effectiveMonthPayer.name}`}
                </p>

                <div className="payment-table-wrap">
                  <table className="payment-table">
                    <thead>
                      <tr>
                        <th>Joueur</th>
                        <th>Présences</th>
                        <th>Dû</th>
                        <th>Payé</th>
                        <th>Reste</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthlyBalances.map((row) => (
                        <tr key={row.player.id}>
                          <th>{row.player.name}</th>
                          <td>{row.games}</td>
                          <td>{formatEuros(row.dueCents)}</td>
                          <td>{formatEuros(row.paidCents)}</td>
                          <td
                            className={
                              row.remainingCents > 0 ? 'remaining' : 'settled'
                            }
                          >
                            {formatEuros(row.remainingCents)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <section className="monthly-payment-entry">
                  <h3>Ajouter un paiement</h3>
                  <form onSubmit={addMonthlyPayment}>
                    <select
                      required
                      value={monthlyPaymentPlayer}
                      onChange={(event) =>
                        setMonthlyPaymentPlayer(event.target.value)
                      }
                    >
                      <option value="">Choisir un joueur…</option>
                      {activePlayers.map((player) => (
                        <option value={player.id} key={player.id}>
                          {player.name}
                        </option>
                      ))}
                    </select>
                    <input
                      required
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={monthlyPaymentAmount}
                      onChange={(event) =>
                        setMonthlyPaymentAmount(event.target.value)
                      }
                      placeholder="Montant (€)"
                      aria-label="Montant payé en euros"
                    />
                    <button type="submit" disabled={savingPayment}>
                      {savingPayment ? 'Ajout…' : 'Ajouter'}
                    </button>
                  </form>
                  {selectedMonthlyPayments.length > 0 && (
                    <div className="monthly-payment-list">
                      {selectedMonthlyPayments.map((payment) => {
                        const player = playerMap.get(payment.player_id)
                        return (
                          <div key={payment.id}>
                            <span>
                              <strong>{player?.name || 'Joueur'}</strong>
                              <small>
                                {new Intl.DateTimeFormat('fr-FR').format(
                                  new Date(payment.created_at),
                                )}
                              </small>
                            </span>
                            <b>{formatEuros(payment.amount_cents)}</b>
                            {isAdmin && (
                              <button
                                type="button"
                                onClick={() =>
                                  removeMonthlyPayment(payment)
                                }
                                aria-label={`Supprimer le paiement de ${
                                  player?.name || 'ce joueur'
                                }`}
                              >
                                <Trash2 size={15} />
                              </button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </section>
              </>
            )}

            <section className="unpaid-shares">
              <h3>Parts de créneaux non réglées</h3>
              {unpaidSessionShares.length > 0 ? (
                <div>
                  {unpaidSessionShares.map((share) => (
                    <p key={`${share.session.id}-${share.key}`}>
                      <strong>{share.name}</strong>
                      <span>
                        doit {formatEuros(share.amountCents)} à{' '}
                        {share.payer.name}
                      </span>
                      <small>
                        Créneau du{' '}
                        {new Intl.DateTimeFormat('fr-FR', {
                          day: '2-digit',
                          month: '2-digit',
                        }).format(
                          new Date(`${share.session.played_on}T12:00:00`),
                        )}
                      </small>
                      <button
                        type="button"
                        onClick={() =>
                          toggleSessionShare(share.session, share)
                        }
                      >
                        <Check size={14} />
                        Marquer réglé
                      </button>
                    </p>
                  ))}
                </div>
              ) : (
                <p className="payments-empty">
                  Aucune part en attente pour ce mois.
                </p>
              )}
            </section>
          </aside>
        </div>
      )}
    </main>
  )
}

function App() {
  const params = new URLSearchParams(window.location.search)
  const groupId = params.get('group')
  const groupToken = params.get('key')

  if (groupId && groupToken) {
    return <GroupPage groupId={groupId} groupToken={groupToken} />
  }
  if (params.has('admin')) return <Admin />
  return <Welcome />
}

export default App
