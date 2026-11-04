import { useEffect, useState } from 'react'
import { ArrowRight, CalendarDays, Clock3, Users } from 'lucide-react'
import { configError, createGroupClient, isConfigured } from './supabase'

export const DAYS = [
  'Dimanche',
  'Lundi',
  'Mardi',
  'Mercredi',
  'Jeudi',
  'Vendredi',
  'Samedi',
]

export const SPORTS = [
  {
    value: 'pelote',
    label: 'Pelote',
    message: 'Osteguna, Pilota eguna!',
    eyebrow: 'Votre rendez-vous, simplement',
    title: 'Créez votre groupe.',
    emphasis: 'Jouez ensemble.',
    intro:
      'Le site pour les « Grande Jugadores ». Gestion des créneaux entre amis : rotation automatique, mais personnalisable. Jo Pilota !',
    placeholder: 'Les copains du fronton',
    maxPlayers: 4,
  },
  {
    value: 'padel',
    label: 'Padel',
    message: 'Quatre sur le court.',
    eyebrow: 'Votre partie, simplement',
    title: 'Créez votre groupe.',
    emphasis: 'Prenez le court.',
    intro:
      'Quatre joueurs, un créneau, une rotation claire. Chacun sait quand il joue, sans relancer toute la conversation.',
    placeholder: 'Les copains du court',
    maxPlayers: 4,
  },
  {
    value: 'football',
    label: 'Football',
    message: 'Dix sur le terrain.',
    eyebrow: 'Votre match, simplement',
    title: 'Créez votre groupe.',
    emphasis: 'Remplissez le terrain.',
    intro:
      'Dix places par créneau et une rotation équitable. L’équipe se complète toute seule, vous n’avez plus qu’à venir.',
    placeholder: 'Les copains du dimanche',
    maxPlayers: 10,
  },
]

export function useSportFavicon(sport = 'pelote') {
  useEffect(() => {
    const link = document.querySelector("link[rel='icon']")
    if (!link) return undefined
    link.href = sport === 'pelote' ? '/favicon.svg' : `/favicon-${sport}.svg`
    return () => {
      link.href = '/favicon.svg'
    }
  }, [sport])
}

export const FREQUENCIES = [
  { value: 1, label: 'Toutes les semaines' },
  { value: 2, label: 'Toutes les deux semaines' },
  { value: 4, label: 'Tous les mois (4 semaines)' },
]

const makeSlug = (value) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)

export default function Welcome() {
  const [form, setForm] = useState({
    name: '',
    sport: 'pelote',
    meeting_day: 4,
    meeting_time: '18:00',
    frequency_weeks: 1,
    recurring: true,
    hero_message: 'Osteguna, Pilota eguna!',
  })
  const [error, setError] = useState(configError)
  const [working, setWorking] = useState(false)
  const sportCopy = SPORTS.find((sport) => sport.value === form.sport)
  useSportFavicon(form.sport)

  const update = (field) => (event) =>
    setForm((current) => ({ ...current, [field]: event.target.value }))

  const chooseSport = (sport) =>
    setForm((current) => {
      const isDefaultMessage = SPORTS.some(
        (item) => item.message === current.hero_message,
      )
      return {
        ...current,
        sport,
        hero_message: isDefaultMessage
          ? SPORTS.find((item) => item.value === sport).message
          : current.hero_message,
      }
    })

  async function createGroup(event) {
    event.preventDefault()
    setWorking(true)
    setError('')

    const id = crypto.randomUUID()
    const token = crypto.randomUUID()
    const slug = `${makeSlug(form.name) || 'mon-groupe'}-${id.slice(0, 6)}`
    const group = {
      id,
      access_token: token,
      slug,
      name: form.name.trim(),
      sport: form.sport,
      created_at: new Date().toISOString(),
      meeting_day: Number(form.meeting_day),
      meeting_time: `${form.meeting_time}:00`,
      frequency_weeks: Number(form.frequency_weeks),
      recurring: form.recurring,
      hero_message: form.hero_message.trim(),
    }

    if (isConfigured) {
      const client = createGroupClient(token)
      const { error: insertError } = await client.from('groups').insert(group)
      if (insertError) {
        setError(insertError.message)
        setWorking(false)
        return
      }
    } else {
      localStorage.setItem(`pilota-group-${id}`, JSON.stringify(group))
    }

    window.location.assign(
      `/?group=${encodeURIComponent(id)}&key=${encodeURIComponent(token)}`,
    )
  }

  return (
    <main className={`welcome-page theme-${form.sport}`}>
      <header className="welcome-header">
        <a className="brand" href="/">
          <span className="brand-mark">P</span>
          <span>Pilota Lagunekin</span>
        </a>
      </header>

      <section className="welcome-layout">
        <div className="welcome-copy">
          <p className="eyebrow">{sportCopy.eyebrow}</p>
          <h1>
            {sportCopy.title} <em>{sportCopy.emphasis}</em>
          </h1>
          <p className="welcome-intro">{sportCopy.intro}</p>
          <div className="welcome-points">
            <span><Users size={18} /> Votre espace privé</span>
            <span><CalendarDays size={18} /> Rotation automatique</span>
            <span><Clock3 size={18} /> Jour et heure au choix</span>
          </div>
        </div>

        <form className="group-form" onSubmit={createGroup}>
          <div>
            <p className="eyebrow">Nouveau groupe</p>
            <h2>Préparez votre espace</h2>
          </div>

          {error && <div className="form-error">{error}</div>}

          <div className="sport-picker" role="radiogroup" aria-label="Sport">
            {SPORTS.map((sport) => (
              <button
                type="button"
                role="radio"
                aria-checked={form.sport === sport.value}
                className={`sport-option sport-${sport.value} ${
                  form.sport === sport.value ? 'selected' : ''
                }`}
                onClick={() => chooseSport(sport.value)}
                key={sport.value}
              >
                <span className="sport-ball" />
                {sport.label}
              </button>
            ))}
          </div>

          <label>
            Nom du groupe
            <input
              required
              maxLength={60}
              value={form.name}
              onChange={update('name')}
              placeholder={sportCopy.placeholder}
            />
          </label>

          <label>
            Fréquence
            <select
              value={form.recurring ? form.frequency_weeks : 'none'}
              onChange={(event) => {
                const value = event.target.value
                setForm((current) => ({
                  ...current,
                  recurring: value !== 'none',
                  frequency_weeks:
                    value === 'none'
                      ? current.frequency_weeks
                      : Number(value),
                }))
              }}
            >
              <option value="none">Pas de créneau récurrent</option>
              {FREQUENCIES.map((frequency) => (
                <option value={frequency.value} key={frequency.value}>
                  {frequency.label}
                </option>
              ))}
            </select>
          </label>

          {form.recurring && (
            <div className="form-row">
              <label>
                Jour habituel
                <select value={form.meeting_day} onChange={update('meeting_day')}>
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
                  value={form.meeting_time}
                  onChange={update('meeting_time')}
                />
              </label>
            </div>
          )}

          <label>
            Message principal
            <textarea
              required
              maxLength={100}
              rows={3}
              value={form.hero_message}
              onChange={update('hero_message')}
              placeholder="Votre phrase d'accueil"
            />
          </label>

          <button className="create-group-button" disabled={working}>
            {working ? 'Création…' : 'Créer mon groupe'}
            {!working && <ArrowRight size={18} />}
          </button>

          <small>
            Un lien privé sera créé. Conservez-le et partagez-le uniquement
            avec les membres de votre groupe.
          </small>
        </form>
      </section>
    </main>
  )
}
