import { useState } from 'react'
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
    meeting_day: 4,
    meeting_time: '18:00',
    hero_message: 'Osteguna, Pilota eguna!',
  })
  const [error, setError] = useState(configError)
  const [working, setWorking] = useState(false)

  const update = (field) => (event) =>
    setForm((current) => ({ ...current, [field]: event.target.value }))

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
      meeting_day: Number(form.meeting_day),
      meeting_time: `${form.meeting_time}:00`,
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
    <main className="welcome-page">
      <header className="welcome-header">
        <a className="brand" href="/">
          <span className="brand-mark">P</span>
          <span>Pilota Lagunekin</span>
        </a>
      </header>

      <section className="welcome-layout">
        <div className="welcome-copy">
          <p className="eyebrow">Votre rendez-vous, simplement</p>
          <h1>
            Créez votre groupe. <em>Jouez ensemble.</em>
          </h1>
          <p className="welcome-intro">
            Un planning privé et personnalisable pour organiser vos parties
            régulières, sans mélanger votre groupe avec les autres.
          </p>
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

          <label>
            Nom du groupe
            <input
              required
              maxLength={60}
              value={form.name}
              onChange={update('name')}
              placeholder="Les copains du fronton"
            />
          </label>

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
