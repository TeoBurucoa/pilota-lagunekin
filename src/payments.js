export const formatEuros = (cents = 0) =>
  new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
  }).format((Number(cents) || 0) / 100)

export const eurosToCents = (value) => {
  const amount = Number(String(value).replace(',', '.'))
  return Number.isFinite(amount) ? Math.max(0, Math.round(amount * 100)) : 0
}

export const currentMonthKey = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
}

export const moveMonth = (month, offset) => {
  const [year, monthNumber] = month.split('-').map(Number)
  const date = new Date(year, monthNumber - 1 + offset, 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`
}

export const formatMonth = (month) =>
  new Intl.DateTimeFormat('fr-FR', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${month}T12:00:00`))

export const splitCents = (amountCents, count) => {
  if (count <= 0) return []
  const amount = Math.max(0, Number(amountCents) || 0)
  const base = Math.floor(amount / count)
  const remainder = amount % count
  return Array.from(
    { length: count },
    (_, index) => base + (index < remainder ? 1 : 0),
  )
}

export const getSessionPaymentSummary = (
  session,
  defaultPriceCents,
  playerMap,
) => {
  const participants = [
    ...(session.session_players || []).map((entry) => ({
      key: `player-${entry.player_id}`,
      id: entry.player_id,
      type: 'player',
      name: playerMap.get(entry.player_id)?.name || 'Joueur',
      sharePaid: Boolean(entry.share_paid),
    })),
    ...(session.session_guests || []).map((guest) => ({
      key: `guest-${guest.id}`,
      id: guest.id,
      type: 'guest',
      name: guest.name,
      sharePaid: Boolean(guest.share_paid),
    })),
  ]
  const priceCents = session.price_cents ?? defaultPriceCents ?? 0
  const shares = splitCents(priceCents, participants.length)
  const rows = participants.map((participant, index) => {
    const isPayer =
      participant.type === 'player' && participant.id === session.paid_by
    return {
      ...participant,
      amountCents: shares[index],
      isPayer,
      isPaid: isPayer || participant.sharePaid,
    }
  })
  return {
    priceCents,
    payer: rows.find((participant) => participant.isPayer) || null,
    paidCount: rows.filter((participant) => participant.isPaid).length,
    participants: rows,
  }
}

export const buildMonthlyBalances = ({
  month,
  sessions,
  players,
  payments,
  costCents,
  paidBy,
}) => {
  const monthPrefix = month.slice(0, 7)
  const playerIds = new Set(players.map((player) => player.id))
  const occurrences = sessions
    .filter(
      (session) =>
        !session.manual && session.played_on.slice(0, 7) === monthPrefix,
    )
    .flatMap((session) =>
      (session.session_players || [])
        .filter((entry) => entry.locked || entry.team)
        .map((entry) => entry.player_id)
        .filter((playerId) => playerIds.has(playerId)),
    )
  const shares = splitCents(costCents, occurrences.length)
  const dueByPlayer = new Map()
  const gamesByPlayer = new Map()
  occurrences.forEach((playerId, index) => {
    dueByPlayer.set(
      playerId,
      (dueByPlayer.get(playerId) || 0) + shares[index],
    )
    gamesByPlayer.set(playerId, (gamesByPlayer.get(playerId) || 0) + 1)
  })

  const paidByPlayer = new Map()
  payments
    .filter((payment) => payment.month === month)
    .forEach((payment) =>
      paidByPlayer.set(
        payment.player_id,
        (paidByPlayer.get(payment.player_id) || 0) + payment.amount_cents,
      ),
    )

  return players.map((player) => {
    const dueCents = dueByPlayer.get(player.id) || 0
    const recordedCents = paidByPlayer.get(player.id) || 0
    const paidCents =
      player.id === paidBy
        ? Math.max(dueCents, recordedCents)
        : recordedCents
    return {
      player,
      games: gamesByPlayer.get(player.id) || 0,
      dueCents,
      paidCents,
      remainingCents: Math.max(0, dueCents - paidCents),
    }
  })
}
