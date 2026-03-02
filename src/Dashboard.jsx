import { useState, useEffect, useMemo } from 'react'
import { supabase } from './supabase.js'
import { DOMAINS } from './data.js'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts'

/* ─── Constants ─── */
const REFERENCE = {
  "50-54": { vasomotor: 3.66, psychosocial: 2.81, physical: 3.01, sexual: 3.19, global: 3.04 },
  "55-59": { vasomotor: 3.06, psychosocial: 2.60, physical: 2.95, sexual: 3.27, global: 2.90 },
  "60-64": { vasomotor: 2.50, psychosocial: 2.39, physical: 2.88, sexual: 3.12, global: 2.76 },
  "65+":   { vasomotor: 2.01, psychosocial: 2.14, physical: 2.67, sexual: 2.95, global: 2.51 },
}

const TABS = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'muestra', label: 'Muestra' },
  { id: 'dominios', label: 'Dominios' },
  { id: 'items', label: 'Ítems' },
  { id: 'ipaq', label: 'IPAQ' },
  { id: 'analisis', label: 'Análisis' },
  { id: 'edad', label: 'Por edad' },
  { id: 'gestion', label: 'Gestión' },
]

const AGE_GROUPS = ["<50", "50-54", "55-59", "60-64", "65+"]
const getAgeGroup = (age) => {
  if (!age) return null
  if (age < 50) return "<50"
  if (age < 55) return "50-54"
  if (age < 60) return "55-59"
  if (age < 65) return "60-64"
  return "65+"
}

const DOMAIN_META = DOMAINS.map(d => ({
  id: d.id, name: d.name, short: d.name.replace("Síntomas ", ""),
  emoji: d.emoji, color: d.color, items: d.items,
}))

/* ─── Label maps ─── */
const STAGE_LABELS = {
  premenopause: 'Premenopausia',
  early_perimenopause: 'Perimenopausia temprana',
  late_perimenopause: 'Perimenopausia tardía',
  postmenopause: 'Postmenopausia',
  surgical_menopause: 'Menopausia quirúrgica',
  unknown: 'No determinada',
}
const STAGE_COLORS = {
  premenopause: '#22C55E',
  early_perimenopause: '#F59E0B',
  late_perimenopause: '#F97316',
  postmenopause: '#EF4444',
  surgical_menopause: '#8B5CF6',
  unknown: '#94A3B8',
}
const STAGE_ORDER = ['premenopause', 'early_perimenopause', 'late_perimenopause', 'postmenopause', 'surgical_menopause', 'unknown']

const IPAQ_LABELS = { low: 'Bajo', moderate: 'Moderado', high: 'Alto' }
const IPAQ_COLORS = { low: '#EF4444', moderate: '#F59E0B', high: '#22C55E' }
const IPAQ_ORDER = ['low', 'moderate', 'high']

const VERSION_LABELS = { full: 'Completa', quick: 'Rápida', legacy: 'Legacy' }
const VERSION_COLORS = { full: '#7C9CE8', quick: '#22C55E', legacy: '#94A3B8' }

const MARITAL_LABELS = {
  single: 'Soltera', married: 'Casada/pareja', divorced: 'Divorciada/separada',
  widowed: 'Viuda', other: 'Otro',
}
const EDUCATION_LABELS = {
  primary: 'Primaria', secondary: 'Secundaria', vocational: 'FP',
  university: 'Universidad', postgrad: 'Postgrado', other: 'Otro',
}
const EMPLOYMENT_LABELS = {
  employed: 'Empleada', unemployed: 'Desempleada', retired: 'Jubilada',
  homemaker: 'Ama de casa', student: 'Estudiante', disability: 'Incapacidad', other: 'Otro',
}
const ETHNICITY_LABELS = {
  caucasian: 'Caucásica', hispanic: 'Hispana', african: 'Africana',
  asian: 'Asiática', mixed: 'Mixta', other: 'Otra',
}

const SMOKING_LABELS = { never: 'Nunca', former: 'Exfumadora', current: 'Fumadora activa' }
const THM_LABELS = { never: 'Nunca', past: 'Pasado', current: 'Actual' }
const DEPRESSION_LABELS = { no: 'No', past: 'Pasada', current: 'Actual' }
const ALCOHOL_LABELS = { never: 'Nunca', monthly: 'Mensual', weekly: 'Semanal', daily: 'Diario' }

const BMI_CATS = ['Bajo peso', 'Normopeso', 'Sobrepeso', 'Obesidad']
const BMI_COLORS = { 'Bajo peso': '#60A5FA', 'Normopeso': '#22C55E', 'Sobrepeso': '#F59E0B', 'Obesidad': '#EF4444' }

/* ─── Stats helpers ─── */
const avg = (arr) => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0
const sd = (arr) => {
  if (arr.length < 2) return 0
  const m = avg(arr)
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1))
}
const histogram = (values, binSize, min, max) => {
  const bins = []
  for (let i = min; i < max; i += binSize) {
    const upper = i + binSize
    const label = `${i}-${upper - 1}`
    const count = values.filter(v => v >= i && v < upper).length
    bins.push({ label, count })
  }
  return bins
}

/** Count frequencies for categorical variable */
const distrib = (arr, accessor, labels, order) => {
  const counts = {}
  arr.forEach(item => {
    const val = typeof accessor === 'function' ? accessor(item) : item[accessor]
    if (val != null && val !== '') counts[val] = (counts[val] || 0) + 1
  })
  const total = arr.length
  const keys = order || Object.keys(counts).sort((a, b) => (counts[b] || 0) - (counts[a] || 0))
  return keys
    .filter(k => counts[k] > 0)
    .map(k => ({
      key: k,
      label: (labels && labels[k]) || k,
      count: counts[k] || 0,
      pct: total ? ((counts[k] || 0) / total * 100) : 0,
    }))
}

/* ─── Shared styles ─── */
const card = {
  background: "white", borderRadius: 16, padding: 16,
  border: "1.5px solid #F1F5F9", marginBottom: 14
}
const sectionTitle = { fontSize: 14, fontWeight: 700, color: "#1E293B", marginBottom: 12 }

/* ─── Reusable: HBar (CSS horizontal bars) ─── */
function HBar({ data, color = '#7C9CE8', maxPct }) {
  const maxVal = maxPct || Math.max(...data.map(d => d.pct), 1)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {data.map(d => (
        <div key={d.key || d.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
          <span style={{ width: 130, flexShrink: 0, color: '#475569', textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {d.label}
          </span>
          <div style={{ flex: 1, background: '#F1F5F9', borderRadius: 4, height: 18, position: 'relative' }}>
            <div style={{
              width: `${Math.min(d.pct / maxVal * 100, 100)}%`,
              background: d.color || color, borderRadius: 4, height: '100%', minWidth: d.pct > 0 ? 2 : 0,
              transition: 'width 0.3s ease',
            }} />
          </div>
          <span style={{ width: 70, flexShrink: 0, color: '#64748B', fontSize: 11, whiteSpace: 'nowrap' }}>
            {d.count} ({d.pct.toFixed(1)}%)
          </span>
        </div>
      ))}
    </div>
  )
}

/* ─── Reusable: MiniDonut ─── */
function MiniDonut({ data, colors, title }) {
  const total = data.reduce((s, d) => s + d.value, 0)
  return (
    <div style={{ ...card, padding: 12, flex: 1, minWidth: 180 }}>
      <p style={{ fontSize: 11, fontWeight: 600, color: '#475569', marginBottom: 4, textAlign: 'center' }}>{title}</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <PieChart width={90} height={90}>
          <Pie data={data} cx={42} cy={42} innerRadius={22} outerRadius={38} dataKey="value" strokeWidth={0}>
            {data.map((d, i) => <Cell key={i} fill={colors[d.name] || colors[i] || '#CBD5E1'} />)}
          </Pie>
        </PieChart>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {data.map((d, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#64748B' }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: colors[d.name] || colors[i] || '#CBD5E1', flexShrink: 0 }} />
              <span>{d.label}: {d.value} ({total ? (d.value / total * 100).toFixed(0) : 0}%)</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ─── Reusable: CrossTab (MENQOL stratified by variable) ─── */
function CrossTab({ title, groups, enriched }) {
  const results = groups.map(g => {
    const subset = enriched.filter(g.filter)
    const n = subset.length
    if (!n) return { ...g, n: 0, vasomotor: 0, psychosocial: 0, physical: 0, sexual: 0, global: 0 }
    return {
      ...g, n,
      vasomotor: avg(subset.map(r => r.score_vasomotor).filter(v => v != null)),
      psychosocial: avg(subset.map(r => r.score_psychosocial).filter(v => v != null)),
      physical: avg(subset.map(r => r.score_physical).filter(v => v != null)),
      sexual: avg(subset.map(r => r.score_sexual).filter(v => v != null)),
      global: avg(subset.map(r => r.score_global).filter(v => v != null)),
    }
  }).filter(g => g.n > 0)

  if (!results.length) return (
    <div style={card}>
      <p style={sectionTitle}>{title}</p>
      <p style={{ fontSize: 13, color: '#94A3B8' }}>Sin datos suficientes para este análisis.</p>
    </div>
  )

  return (
    <div style={card}>
      <p style={sectionTitle}>{title}</p>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', minWidth: 500 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #E2E8F0' }}>
              <th style={{ textAlign: 'left', padding: 6, color: '#475569' }}>Grupo</th>
              <th style={{ textAlign: 'right', padding: 6, color: '#475569' }}>n</th>
              <th style={{ textAlign: 'right', padding: 6, color: '#E8927C' }}>Vasomotor</th>
              <th style={{ textAlign: 'right', padding: 6, color: '#9C7CE8' }}>Psicosocial</th>
              <th style={{ textAlign: 'right', padding: 6, color: '#7CC8A8' }}>Físico</th>
              <th style={{ textAlign: 'right', padding: 6, color: '#E87CA8' }}>Sexual</th>
              <th style={{ textAlign: 'right', padding: 6, color: '#475569', fontWeight: 700 }}>Global</th>
            </tr>
          </thead>
          <tbody>
            {results.map(g => (
              <tr key={g.label} style={{ borderBottom: '1px solid #F1F5F9' }}>
                <td style={{ padding: 6, fontWeight: 600 }}>{g.label}</td>
                <td style={{ padding: 6, textAlign: 'right', color: '#94A3B8' }}>{g.n}</td>
                <td style={{ padding: 6, textAlign: 'right' }}>{g.vasomotor.toFixed(2)}</td>
                <td style={{ padding: 6, textAlign: 'right' }}>{g.psychosocial.toFixed(2)}</td>
                <td style={{ padding: 6, textAlign: 'right' }}>{g.physical.toFixed(2)}</td>
                <td style={{ padding: 6, textAlign: 'right' }}>{g.sexual.toFixed(2)}</td>
                <td style={{ padding: 6, textAlign: 'right', fontWeight: 700 }}>{g.global.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 12 }}>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={results.map(g => ({ name: g.label, Global: +g.global.toFixed(2) }))}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
            <XAxis dataKey="name" fontSize={10} tick={{ fill: '#64748B' }} interval={0} angle={-20} textAnchor="end" height={50} />
            <YAxis domain={[0, 8]} fontSize={10} tick={{ fill: '#94A3B8' }} />
            <Tooltip />
            <Bar dataKey="Global" fill="#7C9CE8" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

/* ─── Login ─── */
function LoginForm({ onLogin }) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true); setError(null)
    const { error: err } = await supabase.auth.signInWithPassword({ email, password })
    if (err) { setError(err.message); setLoading(false) }
    else onLogin()
  }

  return (
    <div style={{
      background: "white", borderRadius: 20, padding: 24,
      border: "1.5px solid #F1F5F9", maxWidth: 400, margin: "40px auto",
      boxShadow: "0 4px 20px rgba(0,0,0,0.04)"
    }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: "#1E293B", marginBottom: 4 }}>
        Dashboard de investigación
      </h2>
      <p style={{ fontSize: 13, color: "#94A3B8", marginBottom: 20 }}>
        Acceso restringido a investigadores
      </p>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <input type="email" placeholder="Email" value={email}
          onChange={e => setEmail(e.target.value)}
          style={{ padding: "10px 14px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 14, outline: "none" }} />
        <input type="password" placeholder="Contraseña" value={password}
          onChange={e => setPassword(e.target.value)}
          style={{ padding: "10px 14px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 14, outline: "none" }} />
        {error && <p style={{ color: "#EF4444", fontSize: 12 }}>{error}</p>}
        <button type="submit" disabled={loading} style={{
          padding: 12, borderRadius: 12, background: "#1E293B", color: "white",
          border: "none", fontSize: 15, fontWeight: 700, cursor: "pointer"
        }}>{loading ? "Entrando..." : "Entrar"}</button>
      </form>
    </div>
  )
}

/* ─── KPI Card ─── */
function Kpi({ label, value, sub }) {
  return (
    <div style={{
      background: "white", borderRadius: 14, padding: "14px 16px",
      border: "1.5px solid #F1F5F9", flex: 1, minWidth: 120
    }}>
      <p style={{ fontSize: 11, color: "#94A3B8", marginBottom: 4 }}>{label}</p>
      <p style={{ fontSize: 22, fontWeight: 800, color: "#1E293B" }}>{value}</p>
      {sub && <p style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>{sub}</p>}
    </div>
  )
}

/* ─── Filter Bar (enhanced) ─── */
function FilterBar({ filters, onChange, total }) {
  const input = { padding: "6px 10px", borderRadius: 8, border: "1.5px solid #E2E8F0", fontSize: 12, width: 70, outline: "none" }
  const dateInput = { ...input, width: 120 }
  const selectInput = { ...input, width: 'auto', minWidth: 90, cursor: 'pointer' }
  const set = (key, val) => onChange({ ...filters, [key]: val || undefined })

  return (
    <div style={{
      ...card, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center",
      padding: "10px 14px", marginBottom: 16
    }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: "#475569" }}>Filtros:</span>
      <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#64748B" }}>
        Edad
        <input type="number" placeholder="Min" value={filters.ageMin || ""} onChange={e => set("ageMin", e.target.value)} style={input} />
        <span>–</span>
        <input type="number" placeholder="Max" value={filters.ageMax || ""} onChange={e => set("ageMax", e.target.value)} style={input} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#64748B" }}>
        Peso
        <input type="number" placeholder="Min" value={filters.weightMin || ""} onChange={e => set("weightMin", e.target.value)} style={input} />
        <span>–</span>
        <input type="number" placeholder="Max" value={filters.weightMax || ""} onChange={e => set("weightMax", e.target.value)} style={input} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#64748B" }}>
        Fecha
        <input type="date" value={filters.dateFrom || ""} onChange={e => set("dateFrom", e.target.value)} style={dateInput} />
        <span>–</span>
        <input type="date" value={filters.dateTo || ""} onChange={e => set("dateTo", e.target.value)} style={dateInput} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#64748B" }}>
        Versión
        <select value={filters.version || ""} onChange={e => set("version", e.target.value)} style={selectInput}>
          <option value="">Todas</option>
          <option value="full">Completa</option>
          <option value="quick">Rápida</option>
        </select>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#64748B" }}>
        Etapa
        <select value={filters.stage || ""} onChange={e => set("stage", e.target.value)} style={selectInput}>
          <option value="">Todas</option>
          {STAGE_ORDER.filter(s => s !== 'unknown').map(s => (
            <option key={s} value={s}>{STAGE_LABELS[s]}</option>
          ))}
        </select>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#64748B" }}>
        IPAQ
        <select value={filters.ipaq || ""} onChange={e => set("ipaq", e.target.value)} style={selectInput}>
          <option value="">Todos</option>
          {IPAQ_ORDER.map(c => (
            <option key={c} value={c}>{IPAQ_LABELS[c]}</option>
          ))}
        </select>
      </div>
      <span style={{
        fontSize: 12, fontWeight: 700, color: "#7C9CE8",
        background: "#EEF2FF", padding: "4px 10px", borderRadius: 8
      }}>n = {total}</span>
      <button onClick={() => onChange({})} style={{
        fontSize: 11, color: "#94A3B8", background: "none", border: "none", cursor: "pointer", textDecoration: "underline"
      }}>Limpiar</button>
    </div>
  )
}

/* ─── Audit logger ─── */
const logAudit = async (userEmail, action, details = {}) => {
  try {
    await supabase.from('audit_log').insert({ user_email: userEmail, action, details })
  } catch {}
}

/* ═══════════════════════════════════════════
   MAIN DASHBOARD
   ═══════════════════════════════════════════ */
export default function Dashboard({ onBack }) {
  const [user, setUser] = useState(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [rawData, setRawData] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('resumen')
  const [filters, setFilters] = useState({})

  // Session timeout (30 min inactivity)
  useEffect(() => {
    if (!user) return
    let timer
    const resetTimer = () => {
      clearTimeout(timer)
      timer = setTimeout(async () => {
        logAudit(user.email, 'session_timeout')
        await supabase.auth.signOut()
        setUser(null)
        alert("Sesión cerrada por inactividad (30 min)")
      }, 30 * 60 * 1000)
    }
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart']
    events.forEach(e => window.addEventListener(e, resetTimer))
    resetTimer()
    return () => {
      clearTimeout(timer)
      events.forEach(e => window.removeEventListener(e, resetTimer))
    }
  }, [user])

  // Check existing session
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user || null)
      setAuthChecked(true)
    })
  }, [])

  // Fetch data when authenticated
  useEffect(() => {
    if (!user) return
    setLoading(true)
    supabase.from('responses').select('*').order('created_at', { ascending: false })
      .then(({ data: respData, error }) => {
        if (!error) setRawData(respData || [])
        setLoading(false)
        logAudit(user.email, 'view_data', { count: respData?.length || 0 })
      })
  }, [user])

  // ─── Enriched data ───
  const enriched = useMemo(() => rawData.map(r => {
    const ans = r.answers || {}
    const h = ans._basics?.height
    const bmi = r.weight && h > 100 ? r.weight / ((h / 100) ** 2) : null
    const bmiRound = bmi ? Math.round(bmi * 10) / 10 : null

    // Merge smoking from full _habits or quick _quickHealth
    const smoking = ans._habits?.smoking || ans._quickHealth?.smoking || null
    // Merge depression
    const depression = ans._health?.depression || ans._health?.anxiety_dx
      ? (ans._health?.depression === 'current' || ans._health?.anxiety_dx === 'current' ? 'current'
        : ans._health?.depression || 'no')
      : (ans._quickHealth?.depression || null)
    // THM from either source
    const thm = ans._gynecology?.thm || ans._health?.thm || ans._quickHealth?.thm || null
    // HTA from either source
    const hta = ans._health?.hta || ans._quickHealth?.hta || null

    // IPAQ sitting minutes (from _ipaq answers)
    const ipaqSitting = ans._ipaq?.sitting_hours != null
      ? ans._ipaq.sitting_hours * 60 + (ans._ipaq.sitting_minutes || 0)
      : (ans._ipaq?.sitting_min ?? null)

    return {
      ...r,
      version: ans._version || 'legacy',
      stage: ans._reproductiveStage || null,
      ipaqCat: ans._ipaqScore?.category || null,
      ipaqMet: ans._ipaqScore?.totalMET ?? null,
      ipaqSitting,
      bmi: bmiRound,
      bmiCat: bmiRound == null ? null
        : bmiRound < 18.5 ? 'Bajo peso'
        : bmiRound < 25 ? 'Normopeso'
        : bmiRound < 30 ? 'Sobrepeso'
        : 'Obesidad',
      height: h || null,
      smoking,
      depression,
      thm,
      hta,
      alcoholFreq: ans._habits?.alcoholFreq || null,
      maritalStatus: ans._demographics?.maritalStatus || null,
      education: ans._demographics?.education || null,
      employment: ans._demographics?.employment || null,
      ethnicity: ans._demographics?.ethnicity || null,
      menarche: ans._gynecology?.menarche || null,
      pregnancies: ans._gynecology?.pregnancies ?? null,
      health: ans._health || {},
    }
  }), [rawData])

  // Apply filters (including new ones)
  const data = useMemo(() => {
    return enriched.filter(r => {
      if (filters.ageMin && r.age < parseInt(filters.ageMin)) return false
      if (filters.ageMax && r.age > parseInt(filters.ageMax)) return false
      if (filters.weightMin && r.weight < parseFloat(filters.weightMin)) return false
      if (filters.weightMax && r.weight > parseFloat(filters.weightMax)) return false
      if (filters.dateFrom && r.created_at < filters.dateFrom) return false
      if (filters.dateTo && r.created_at > filters.dateTo + "T23:59:59") return false
      if (filters.version && r.version !== filters.version) return false
      if (filters.stage && r.stage !== filters.stage) return false
      if (filters.ipaq && r.ipaqCat !== filters.ipaq) return false
      return true
    })
  }, [enriched, filters])

  const handleLogin = () => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user)
      if (session?.user) logAudit(session.user.email, 'login')
    })
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setUser(null)
  }

  const handleClearAll = async () => {
    logAudit(user?.email, 'delete_all', { count: rawData.length })
    await supabase.from('responses').delete().gt('created_at', '1970-01-01')
    setRawData([])
  }

  const refreshData = async () => {
    setLoading(true)
    const { data } = await supabase.from('responses').select('*').order('created_at', { ascending: false })
    setRawData(data || [])
    setLoading(false)
  }

  const exportCSV = () => {
    const items = DOMAINS.flatMap(d => d.items)
    const headers = [
      'id', 'fecha', 'edad', 'peso', 'talla', 'imc', 'imc_categoria',
      'version', 'escala', 'etapa_reproductiva',
      'estado_civil', 'educacion', 'empleo', 'etnia',
      'tabaco', 'alcohol_freq', 'thm', 'depresion', 'hta',
      'ipaq_categoria', 'ipaq_met', 'ipaq_sitting_min',
      'score_vasomotor', 'score_psicosocial', 'score_fisico', 'score_sexual', 'score_global',
      ...items.map(i => `item_${i.id}`)
    ]
    const rows = data.map(r => {
      const ans = r.answers || {}
      const scale = ans._scale || '2-8'
      return [
        r.id,
        new Date(r.created_at).toLocaleDateString("es-ES"),
        r.age ?? '', r.weight ?? '',
        r.height ?? '', r.bmi ?? '', r.bmiCat ?? '',
        r.version,
        scale,
        r.stage ? (STAGE_LABELS[r.stage] || r.stage) : '',
        r.maritalStatus ? (MARITAL_LABELS[r.maritalStatus] || r.maritalStatus) : '',
        r.education ? (EDUCATION_LABELS[r.education] || r.education) : '',
        r.employment ? (EMPLOYMENT_LABELS[r.employment] || r.employment) : '',
        r.ethnicity ? (ETHNICITY_LABELS[r.ethnicity] || r.ethnicity) : '',
        r.smoking ? (SMOKING_LABELS[r.smoking] || r.smoking) : '',
        r.alcoholFreq ? (ALCOHOL_LABELS[r.alcoholFreq] || r.alcoholFreq) : '',
        r.thm ? (THM_LABELS[r.thm] || r.thm) : '',
        r.depression ? (DEPRESSION_LABELS[r.depression] || r.depression) : '',
        r.hta ?? '',
        r.ipaqCat ? (IPAQ_LABELS[r.ipaqCat] || r.ipaqCat) : '',
        r.ipaqMet ?? '',
        r.ipaqSitting ?? '',
        r.score_vasomotor, r.score_psychosocial, r.score_physical, r.score_sexual, r.score_global,
        ...items.map(i => {
          const a = ans[String(i.id)]
          if (!a?.present) return 1
          if (a.rating == null) return 1
          return scale === '0-6' ? a.rating + 2 : a.rating
        })
      ]
    })
    const watermark = `# CONFIDENCIAL - Exportado por ${user?.email || 'unknown'} - ${new Date().toISOString()} - Estudio MENQOL`
    const csv = [watermark, headers.join(';'), ...rows.map(r => r.join(';'))].join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `menqol-${(user?.email || 'export').split('@')[0]}-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
    logAudit(user?.email, 'export_csv', { count: data.length, filters })
  }

  // ─── Computed stats ───
  const ages = data.filter(r => r.age).map(r => r.age)
  const globals = data.map(r => r.score_global)
  const bmis = data.filter(r => r.bmi).map(r => r.bmi)

  const weeklyData = useMemo(() => {
    const weeks = {}
    data.forEach(r => {
      const d = new Date(r.created_at)
      const day = d.getDay()
      const monday = new Date(d)
      monday.setDate(d.getDate() - ((day + 6) % 7))
      const key = monday.toISOString().split('T')[0]
      weeks[key] = (weeks[key] || 0) + 1
    })
    let cumul = 0
    return Object.entries(weeks)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week, count]) => { cumul += count; return { week: week.slice(5), count, cumul } })
  }, [data])

  const domainStats = useMemo(() =>
    DOMAIN_META.map(d => {
      const key = `score_${d.id}`
      const vals = data.map(r => r[key]).filter(v => v != null)
      return {
        short: d.short, emoji: d.emoji, color: d.color, id: d.id,
        mean: avg(vals), sd: sd(vals), n: vals.length,
      }
    })
  , [data])

  const itemAnalysis = useMemo(() =>
    DOMAINS.flatMap(d => d.items.map(item => {
      const vals = data.map(r => r.answers?.[String(item.id)])
      const presentCount = vals.filter(v => v?.present).length
      const ratings = vals.filter(v => v?.present && v?.rating != null).map(v => {
        const scale = data.find(r => r.answers?.[String(item.id)] === v)?.answers?._scale
        return scale === '0-6' ? v.rating + 2 : v.rating
      })
      return {
        id: item.id, label: item.label,
        domain: d.name.replace("Síntomas ", ""), domainColor: d.color,
        prevalence: data.length ? (presentCount / data.length * 100) : 0,
        meanSeverity: avg(ratings), sdSeverity: sd(ratings), n: presentCount,
      }
    }))
  , [data])

  const stratification = useMemo(() =>
    AGE_GROUPS.map(group => {
      const gd = data.filter(r => getAgeGroup(r.age) === group)
      if (!gd.length) return null
      const refKey = group === "<50" ? "50-54" : group
      const ref = REFERENCE[refKey] || REFERENCE["50-54"]
      return {
        group, n: gd.length,
        vasomotor: avg(gd.map(r => r.score_vasomotor)),
        psychosocial: avg(gd.map(r => r.score_psychosocial)),
        physical: avg(gd.map(r => r.score_physical)),
        sexual: avg(gd.map(r => r.score_sexual)),
        global: avg(gd.map(r => r.score_global)),
        ref,
      }
    }).filter(Boolean)
  , [data])

  // ─── Auth gate ───
  if (!authChecked) return <p style={{ textAlign: "center", padding: 40, color: "#94A3B8" }}>Cargando...</p>
  if (!user) return (
    <div style={{ maxWidth: 480, margin: "0 auto", padding: "0 16px" }}>
      <button onClick={onBack} style={{
        margin: "16px 0", padding: "8px 16px", borderRadius: 10, background: "none",
        border: "1.5px solid #E2E8F0", color: "#64748B", fontSize: 13, cursor: "pointer"
      }}>← Volver</button>
      <LoginForm onLogin={handleLogin} />
    </div>
  )

  if (loading) return <p style={{ textAlign: "center", padding: 40, color: "#94A3B8" }}>Cargando datos...</p>

  // ─── Render ───
  return (
    <div style={{ maxWidth: 700, margin: "0 auto", padding: "0 16px 80px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 0" }}>
        <button onClick={onBack} style={{
          padding: "8px 16px", borderRadius: 10, background: "none",
          border: "1.5px solid #E2E8F0", color: "#64748B", fontSize: 13, cursor: "pointer"
        }}>← Volver</button>
        <h1 style={{ fontSize: 18, fontWeight: 800, color: "#1E293B" }}>Dashboard</h1>
        <button onClick={handleLogout} style={{
          padding: "8px 14px", borderRadius: 10, background: "none",
          border: "1.5px solid #E2E8F0", color: "#94A3B8", fontSize: 12, cursor: "pointer"
        }}>Salir</button>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, overflowX: "auto", marginBottom: 12, padding: "2px 0" }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: "8px 14px", borderRadius: 10, border: "none",
            background: tab === t.id ? "#1E293B" : "#F1F5F9",
            color: tab === t.id ? "white" : "#64748B",
            fontSize: 13, fontWeight: 600, cursor: "pointer",
            whiteSpace: "nowrap", flexShrink: 0
          }}>{t.label}</button>
        ))}
      </div>

      {/* Filters */}
      <FilterBar filters={filters} onChange={setFilters} total={data.length} />

      {/* ═══ TAB: RESUMEN ═══ */}
      {tab === 'resumen' && <>
        {/* KPI row 1 */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
          <Kpi label="Respuestas" value={data.length} />
          <Kpi label="Edad media" value={ages.length ? avg(ages).toFixed(0) : "—"} sub={ages.length ? `SD ${sd(ages).toFixed(1)}` : ""} />
          <Kpi label="IMC medio" value={bmis.length ? avg(bmis).toFixed(1) : "—"} sub={bmis.length ? `SD ${sd(bmis).toFixed(1)}` : ""} />
          <Kpi label="Score global" value={globals.length ? avg(globals).toFixed(2) : "—"} sub={globals.length ? `SD ${sd(globals).toFixed(2)} / 8` : ""} />
        </div>

        {/* KPI row 2: Mini donuts */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
          {(() => {
            const versionDist = distrib(data, 'version', VERSION_LABELS, ['full', 'quick', 'legacy'])
            return versionDist.length > 0 ? (
              <MiniDonut
                title="Versión"
                data={versionDist.map(d => ({ name: d.key, label: d.label, value: d.count }))}
                colors={VERSION_COLORS}
              />
            ) : null
          })()}
          {(() => {
            const stageData = data.filter(r => r.stage)
            if (!stageData.length) return null
            const stageDist = distrib(stageData, 'stage', STAGE_LABELS, STAGE_ORDER)
            return (
              <MiniDonut
                title="Etapa reproductiva"
                data={stageDist.map(d => ({ name: d.key, label: d.label, value: d.count }))}
                colors={STAGE_COLORS}
              />
            )
          })()}
          {(() => {
            const ipaqData = data.filter(r => r.ipaqCat)
            if (!ipaqData.length) return null
            const ipaqDist = distrib(ipaqData, 'ipaqCat', IPAQ_LABELS, IPAQ_ORDER)
            return (
              <MiniDonut
                title="IPAQ"
                data={ipaqDist.map(d => ({ name: d.key, label: d.label, value: d.count }))}
                colors={IPAQ_COLORS}
              />
            )
          })()}
        </div>

        <div style={card}>
          <p style={sectionTitle}>Respuestas por semana</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={weeklyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis dataKey="week" fontSize={10} tick={{ fill: "#94A3B8" }} />
              <YAxis fontSize={10} tick={{ fill: "#94A3B8" }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" name="Respuestas" fill="#7C9CE8" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div style={card}>
          <p style={sectionTitle}>Acumulado</p>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={weeklyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis dataKey="week" fontSize={10} tick={{ fill: "#94A3B8" }} />
              <YAxis fontSize={10} tick={{ fill: "#94A3B8" }} />
              <Tooltip />
              <Line dataKey="cumul" name="Total acumulado" stroke="#1E293B" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </>}

      {/* ═══ TAB: MUESTRA ═══ */}
      {tab === 'muestra' && <>
        {/* 1. Etapa reproductiva */}
        {(() => {
          const stageData = data.filter(r => r.stage)
          if (!stageData.length) return null
          const stageDist = distrib(stageData, 'stage', STAGE_LABELS, STAGE_ORDER)
          return (
            <div style={card}>
              <p style={sectionTitle}>Etapa reproductiva (n={stageData.length})</p>
              <HBar data={stageDist.map(d => ({ ...d, color: STAGE_COLORS[d.key] }))} />
            </div>
          )
        })()}

        {/* 2. IMC */}
        {(() => {
          const bmiData = data.filter(r => r.bmi != null)
          if (!bmiData.length) return null
          const bmiCatDist = distrib(bmiData, 'bmiCat', null, BMI_CATS)
          return (
            <div style={card}>
              <p style={sectionTitle}>Índice de Masa Corporal (n={bmiData.length})</p>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={histogram(bmiData.map(r => r.bmi), 2, 16, 42)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                  <XAxis dataKey="label" fontSize={10} tick={{ fill: "#94A3B8" }} />
                  <YAxis fontSize={10} tick={{ fill: "#94A3B8" }} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" name="n" fill="#7C9CE8" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <div style={{ marginTop: 12 }}>
                <HBar data={bmiCatDist.map(d => ({ ...d, color: BMI_COLORS[d.key] || '#94A3B8' }))} />
              </div>
            </div>
          )
        })()}

        {/* 3. Demografía (solo full) */}
        {(() => {
          const fullData = data.filter(r => r.version === 'full')
          if (!fullData.length) return null
          const hasDemo = fullData.some(r => r.maritalStatus || r.education || r.employment || r.ethnicity)
          if (!hasDemo) return null
          const demos = [
            { title: 'Estado civil', accessor: 'maritalStatus', labels: MARITAL_LABELS },
            { title: 'Educación', accessor: 'education', labels: EDUCATION_LABELS },
            { title: 'Empleo', accessor: 'employment', labels: EMPLOYMENT_LABELS },
            { title: 'Etnia', accessor: 'ethnicity', labels: ETHNICITY_LABELS },
          ]
          return (
            <div style={card}>
              <p style={sectionTitle}>Demografía (versión completa, n={fullData.length})</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                {demos.map(d => {
                  const withVal = fullData.filter(r => r[d.accessor])
                  if (!withVal.length) return null
                  const dist = distrib(withVal, d.accessor, d.labels)
                  return (
                    <div key={d.accessor}>
                      <p style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6 }}>{d.title}</p>
                      <HBar data={dist} color="#9C7CE8" />
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })()}

        {/* 4. Salud (merged full+quick) */}
        {(() => {
          const conditions = [
            { key: 'hta', label: 'Hipertensión' },
            { key: 'diabetes', label: 'Diabetes' },
            { key: 'dyslipidemia', label: 'Dislipemia' },
            { key: 'thyroid', label: 'Tiroides' },
            { key: 'depression', label: 'Depresión' },
            { key: 'osteoporosis', label: 'Osteoporosis' },
            { key: 'arthrosis', label: 'Artrosis' },
            { key: 'arthritis', label: 'Artritis' },
          ]
          const healthData = conditions.map(c => {
            // Count positive cases: true, 'yes', 'current', 'past'
            const positive = data.filter(r => {
              const val = r.health?.[c.key] ?? r[c.key]
              return val === true || val === 'yes' || val === 'current' || val === 'past'
            }).length
            return { key: c.key, label: c.label, count: positive, pct: data.length ? (positive / data.length * 100) : 0 }
          }).filter(d => d.count > 0).sort((a, b) => b.count - a.count)

          if (!healthData.length) return null
          return (
            <div style={card}>
              <p style={sectionTitle}>Prevalencia de condiciones de salud (n={data.length})</p>
              <HBar data={healthData} color="#E8927C" maxPct={100} />
            </div>
          )
        })()}

        {/* 5. Hábitos */}
        {(() => {
          const smokingData = data.filter(r => r.smoking)
          const thmData = data.filter(r => r.thm)
          const alcData = data.filter(r => r.alcoholFreq && r.version === 'full')
          if (!smokingData.length && !thmData.length && !alcData.length) return null

          return (
            <div style={card}>
              <p style={sectionTitle}>Hábitos</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {smokingData.length > 0 && (
                  <div>
                    <p style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6 }}>Tabaco (n={smokingData.length})</p>
                    <HBar data={distrib(smokingData, 'smoking', SMOKING_LABELS, ['never', 'former', 'current'])} color="#F59E0B" />
                  </div>
                )}
                {alcData.length > 0 && (
                  <div>
                    <p style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6 }}>Alcohol (n={alcData.length}, solo versión completa)</p>
                    <HBar data={distrib(alcData, 'alcoholFreq', ALCOHOL_LABELS, ['never', 'monthly', 'weekly', 'daily'])} color="#8B5CF6" />
                  </div>
                )}
                {thmData.length > 0 && (
                  <div>
                    <p style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6 }}>Terapia hormonal (n={thmData.length})</p>
                    <HBar data={distrib(thmData, 'thm', THM_LABELS, ['never', 'past', 'current'])} color="#EC4899" />
                  </div>
                )}
              </div>
            </div>
          )
        })()}

        {/* 6. Ginecología (solo full) */}
        {(() => {
          const fullData = data.filter(r => r.version === 'full')
          if (!fullData.length) return null
          const menarcheVals = fullData.filter(r => r.menarche).map(r => parseInt(r.menarche)).filter(v => !isNaN(v) && v > 0)
          const pregnancyVals = fullData.filter(r => r.pregnancies != null).map(r => parseInt(r.pregnancies)).filter(v => !isNaN(v))

          if (!menarcheVals.length && !pregnancyVals.length) return null

          return (
            <div style={card}>
              <p style={sectionTitle}>Ginecología (versión completa, n={fullData.length})</p>
              {menarcheVals.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6 }}>
                    Edad menarquia: media {avg(menarcheVals).toFixed(1)} (SD {sd(menarcheVals).toFixed(1)})
                  </p>
                  <ResponsiveContainer width="100%" height={120}>
                    <BarChart data={histogram(menarcheVals, 1, 9, 18)}>
                      <XAxis dataKey="label" fontSize={10} tick={{ fill: "#94A3B8" }} />
                      <YAxis fontSize={10} tick={{ fill: "#94A3B8" }} allowDecimals={false} hide />
                      <Tooltip />
                      <Bar dataKey="count" fill="#EC4899" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
              {pregnancyVals.length > 0 && (
                <div>
                  <p style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6 }}>
                    Embarazos: media {avg(pregnancyVals).toFixed(1)} (SD {sd(pregnancyVals).toFixed(1)})
                  </p>
                  <ResponsiveContainer width="100%" height={120}>
                    <BarChart data={histogram(pregnancyVals, 1, 0, 7)}>
                      <XAxis dataKey="label" fontSize={10} tick={{ fill: "#94A3B8" }} />
                      <YAxis fontSize={10} tick={{ fill: "#94A3B8" }} allowDecimals={false} hide />
                      <Tooltip />
                      <Bar dataKey="count" fill="#7CC8A8" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )
        })()}
      </>}

      {/* ═══ TAB: DOMINIOS ═══ */}
      {tab === 'dominios' && <>
        <div style={card}>
          <p style={sectionTitle}>Media por dominio vs referencia (escala 1-8)</p>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={domainStats.map(d => ({
              name: d.short, Muestra: +d.mean.toFixed(2),
              Referencia: REFERENCE["50-54"][d.id],
            }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis dataKey="name" fontSize={11} tick={{ fill: "#64748B" }} />
              <YAxis domain={[0, 8]} fontSize={10} tick={{ fill: "#94A3B8" }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="Muestra" fill="#7C9CE8" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Referencia" fill="#CBD5E1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div style={card}>
          <p style={sectionTitle}>Estadísticas por dominio</p>
          <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #E2E8F0" }}>
                <th style={{ textAlign: "left", padding: 6, color: "#475569" }}>Dominio</th>
                <th style={{ textAlign: "right", padding: 6, color: "#475569" }}>Media</th>
                <th style={{ textAlign: "right", padding: 6, color: "#475569" }}>SD</th>
                <th style={{ textAlign: "right", padding: 6, color: "#475569" }}>Ref.</th>
                <th style={{ textAlign: "right", padding: 6, color: "#475569" }}>Dif.</th>
              </tr>
            </thead>
            <tbody>
              {domainStats.map(d => {
                const refVal = REFERENCE["50-54"][d.id]
                const diff = d.mean - refVal
                return (
                  <tr key={d.id} style={{ borderBottom: "1px solid #F1F5F9" }}>
                    <td style={{ padding: 6, fontWeight: 600 }}>{d.emoji} {d.short}</td>
                    <td style={{ padding: 6, textAlign: "right" }}>{d.mean.toFixed(2)}</td>
                    <td style={{ padding: 6, textAlign: "right", color: "#94A3B8" }}>{d.sd.toFixed(2)}</td>
                    <td style={{ padding: 6, textAlign: "right", color: "#94A3B8" }}>{refVal.toFixed(2)}</td>
                    <td style={{ padding: 6, textAlign: "right", fontWeight: 600, color: diff > 0.5 ? "#EF4444" : diff < -0.5 ? "#22C55E" : "#F59E0B" }}>
                      {diff > 0 ? "+" : ""}{diff.toFixed(2)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Distribution per domain */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {DOMAIN_META.map(d => {
            const key = `score_${d.id}`
            const vals = data.map(r => r[key]).filter(v => v != null)
            const bins = [1, 2, 3, 4, 5, 6, 7].map(b => ({
              label: `${b}-${b + 1}`,
              count: vals.filter(v => v >= b && v < b + 1).length,
            }))
            return (
              <div key={d.id} style={{ ...card, padding: 12 }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: d.color, marginBottom: 6 }}>
                  {d.emoji} {d.short}
                </p>
                <ResponsiveContainer width="100%" height={100}>
                  <BarChart data={bins}>
                    <XAxis dataKey="label" fontSize={9} tick={{ fill: "#94A3B8" }} />
                    <YAxis hide />
                    <Bar dataKey="count" fill={d.color} radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )
          })}
        </div>
      </>}

      {/* ═══ TAB: ÍTEMS ═══ */}
      {tab === 'items' && <>
        <div style={card}>
          <p style={sectionTitle}>Prevalencia y severidad por síntoma</p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse", minWidth: 500 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #E2E8F0" }}>
                  <th style={{ textAlign: "left", padding: 6, color: "#475569" }}>#</th>
                  <th style={{ textAlign: "left", padding: 6, color: "#475569" }}>Síntoma</th>
                  <th style={{ textAlign: "left", padding: 6, color: "#475569" }}>Dominio</th>
                  <th style={{ textAlign: "right", padding: 6, color: "#475569" }}>Prev. %</th>
                  <th style={{ textAlign: "right", padding: 6, color: "#475569" }}>Media</th>
                  <th style={{ textAlign: "right", padding: 6, color: "#475569" }}>SD</th>
                  <th style={{ textAlign: "right", padding: 6, color: "#475569" }}>n</th>
                </tr>
              </thead>
              <tbody>
                {itemAnalysis.map(item => (
                  <tr key={item.id} style={{ borderBottom: "1px solid #F1F5F9" }}>
                    <td style={{ padding: 6, color: "#94A3B8" }}>{item.id}</td>
                    <td style={{ padding: 6, fontWeight: 500 }}>{item.label}</td>
                    <td style={{ padding: 6 }}>
                      <span style={{
                        fontSize: 10, padding: "2px 6px", borderRadius: 4,
                        background: item.domainColor + "18", color: item.domainColor, fontWeight: 600
                      }}>{item.domain}</span>
                    </td>
                    <td style={{ padding: 6, textAlign: "right", fontWeight: 600 }}>{item.prevalence.toFixed(1)}%</td>
                    <td style={{ padding: 6, textAlign: "right" }}>{item.n ? item.meanSeverity.toFixed(1) : "—"}</td>
                    <td style={{ padding: 6, textAlign: "right", color: "#94A3B8" }}>{item.n ? item.sdSeverity.toFixed(1) : "—"}</td>
                    <td style={{ padding: 6, textAlign: "right", color: "#94A3B8" }}>{item.n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div style={card}>
          <p style={sectionTitle}>Top 10 síntomas más prevalentes</p>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={[...itemAnalysis].sort((a, b) => b.prevalence - a.prevalence).slice(0, 10)} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis type="number" domain={[0, 100]} fontSize={10} tick={{ fill: "#94A3B8" }} unit="%" />
              <YAxis type="category" dataKey="label" width={140} fontSize={11} tick={{ fill: "#64748B" }} />
              <Tooltip />
              <Bar dataKey="prevalence" name="Prevalencia %" fill="#E8927C" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </>}

      {/* ═══ TAB: IPAQ ═══ */}
      {tab === 'ipaq' && <>
        {/* 1. Distribución de categorías IPAQ */}
        {(() => {
          const ipaqData = data.filter(r => r.ipaqCat)
          if (!ipaqData.length) return (
            <div style={card}>
              <p style={sectionTitle}>IPAQ — Actividad física</p>
              <p style={{ fontSize: 13, color: '#94A3B8' }}>No hay datos IPAQ disponibles. Los datos IPAQ se recogen en las versiones completa y rápida del cuestionario.</p>
            </div>
          )
          const catDist = distrib(ipaqData, 'ipaqCat', IPAQ_LABELS, IPAQ_ORDER)
          return (
            <div style={card}>
              <p style={sectionTitle}>Distribución de categorías IPAQ (n={ipaqData.length})</p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={catDist}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                  <XAxis dataKey="label" fontSize={12} tick={{ fill: '#64748B' }} />
                  <YAxis fontSize={10} tick={{ fill: '#94A3B8' }} allowDecimals={false} />
                  <Tooltip formatter={(val, name) => [val, 'n']} />
                  <Bar dataKey="count" name="n" radius={[4, 4, 0, 0]}>
                    {catDist.map((d, i) => <Cell key={i} fill={IPAQ_COLORS[d.key] || '#94A3B8'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )
        })()}

        {/* 2. Histograma MET-min/semana */}
        {(() => {
          const metVals = data.filter(r => r.ipaqMet != null).map(r => r.ipaqMet)
          if (!metVals.length) return null
          const maxMet = Math.min(Math.max(...metVals), 10000)
          const binSize = maxMet > 5000 ? 1000 : maxMet > 2000 ? 500 : 250
          return (
            <div style={card}>
              <p style={sectionTitle}>Distribución de MET-min/semana (n={metVals.length})</p>
              <p style={{ fontSize: 11, color: '#94A3B8', marginBottom: 8 }}>
                Media: {avg(metVals).toFixed(0)} | Mediana: {[...metVals].sort((a, b) => a - b)[Math.floor(metVals.length / 2)]} | SD: {sd(metVals).toFixed(0)}
              </p>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={histogram(metVals.map(v => Math.min(v, maxMet)), binSize, 0, maxMet + binSize)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                  <XAxis dataKey="label" fontSize={9} tick={{ fill: '#94A3B8' }} angle={-30} textAnchor="end" height={40} />
                  <YAxis fontSize={10} tick={{ fill: '#94A3B8' }} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" name="n" fill="#22C55E" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )
        })()}

        {/* 3. Sedentarismo */}
        {(() => {
          const sittingVals = data.filter(r => r.ipaqSitting != null).map(r => r.ipaqSitting)
          if (!sittingVals.length) return null
          return (
            <div style={card}>
              <p style={sectionTitle}>Sedentarismo — minutos sentada/día (n={sittingVals.length})</p>
              <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                <Kpi label="Media" value={`${avg(sittingVals).toFixed(0)} min`} />
                <Kpi label="SD" value={`${sd(sittingVals).toFixed(0)} min`} />
                <Kpi label="Horas/día" value={(avg(sittingVals) / 60).toFixed(1)} />
              </div>
              <ResponsiveContainer width="100%" height={140}>
                <BarChart data={histogram(sittingVals, 60, 0, 720)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                  <XAxis dataKey="label" fontSize={9} tick={{ fill: '#94A3B8' }} />
                  <YAxis fontSize={10} tick={{ fill: '#94A3B8' }} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" name="n" fill="#F59E0B" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )
        })()}

        {/* 4. IPAQ por grupo de edad */}
        {(() => {
          const ipaqData = data.filter(r => r.ipaqCat && r.age)
          if (!ipaqData.length) return null
          const rows = AGE_GROUPS.map(g => {
            const gd = ipaqData.filter(r => getAgeGroup(r.age) === g)
            if (!gd.length) return null
            return {
              group: g, n: gd.length,
              low: gd.filter(r => r.ipaqCat === 'low').length,
              moderate: gd.filter(r => r.ipaqCat === 'moderate').length,
              high: gd.filter(r => r.ipaqCat === 'high').length,
            }
          }).filter(Boolean)
          return (
            <div style={card}>
              <p style={sectionTitle}>IPAQ por grupo de edad</p>
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #E2E8F0' }}>
                    <th style={{ textAlign: 'left', padding: 6, color: '#475569' }}>Grupo</th>
                    <th style={{ textAlign: 'right', padding: 6, color: '#475569' }}>n</th>
                    <th style={{ textAlign: 'right', padding: 6, color: '#EF4444' }}>Bajo</th>
                    <th style={{ textAlign: 'right', padding: 6, color: '#F59E0B' }}>Moderado</th>
                    <th style={{ textAlign: 'right', padding: 6, color: '#22C55E' }}>Alto</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.group} style={{ borderBottom: '1px solid #F1F5F9' }}>
                      <td style={{ padding: 6, fontWeight: 600 }}>{r.group}</td>
                      <td style={{ padding: 6, textAlign: 'right', color: '#94A3B8' }}>{r.n}</td>
                      <td style={{ padding: 6, textAlign: 'right' }}>{r.low} ({(r.low / r.n * 100).toFixed(0)}%)</td>
                      <td style={{ padding: 6, textAlign: 'right' }}>{r.moderate} ({(r.moderate / r.n * 100).toFixed(0)}%)</td>
                      <td style={{ padding: 6, textAlign: 'right' }}>{r.high} ({(r.high / r.n * 100).toFixed(0)}%)</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        })()}

        {/* 5. Score MENQOL global por categoría IPAQ */}
        {(() => {
          const ipaqData = data.filter(r => r.ipaqCat)
          if (!ipaqData.length) return null
          const chartData = IPAQ_ORDER.map(cat => {
            const subset = ipaqData.filter(r => r.ipaqCat === cat)
            if (!subset.length) return null
            return {
              name: IPAQ_LABELS[cat],
              key: cat,
              Global: +avg(subset.map(r => r.score_global)).toFixed(2),
              n: subset.length,
            }
          }).filter(Boolean)
          return (
            <div style={card}>
              <p style={sectionTitle}>Score MENQOL global por categoría IPAQ</p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                  <XAxis dataKey="name" fontSize={12} tick={{ fill: '#64748B' }} />
                  <YAxis domain={[0, 8]} fontSize={10} tick={{ fill: '#94A3B8' }} />
                  <Tooltip formatter={(val) => [val.toFixed(2), 'Score global']} />
                  <Bar dataKey="Global" radius={[4, 4, 0, 0]}>
                    {chartData.map((d, i) => <Cell key={i} fill={IPAQ_COLORS[d.key] || '#94A3B8'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 8 }}>
                {chartData.map(d => (
                  <span key={d.name} style={{ fontSize: 11, color: '#64748B' }}>{d.name}: {d.Global} (n={d.n})</span>
                ))}
              </div>
            </div>
          )
        })()}
      </>}

      {/* ═══ TAB: ANÁLISIS ═══ */}
      {tab === 'analisis' && <>
        <div style={{ ...card, padding: '12px 14px', marginBottom: 14, background: '#F8FAFC' }}>
          <p style={{ fontSize: 12, color: '#64748B', lineHeight: 1.5 }}>
            Análisis cruzado de puntuaciones MENQOL estratificadas por variables clínicas.
            Se muestran medias por dominio y score global para cada grupo.
          </p>
        </div>

        {/* 1. MENQOL por etapa reproductiva */}
        <CrossTab
          title="MENQOL por etapa reproductiva"
          enriched={data}
          groups={STAGE_ORDER.filter(s => s !== 'unknown').map(s => ({
            label: STAGE_LABELS[s],
            filter: r => r.stage === s,
          }))}
        />

        {/* 2. MENQOL por categoría IPAQ */}
        <CrossTab
          title="MENQOL por categoría IPAQ"
          enriched={data}
          groups={IPAQ_ORDER.map(c => ({
            label: IPAQ_LABELS[c],
            filter: r => r.ipaqCat === c,
          }))}
        />

        {/* 3. MENQOL por uso de THM */}
        <CrossTab
          title="MENQOL por terapia hormonal (THM)"
          enriched={data}
          groups={[
            { label: 'Nunca', filter: r => r.thm === 'never' },
            { label: 'Pasado', filter: r => r.thm === 'past' },
            { label: 'Actual', filter: r => r.thm === 'current' },
          ]}
        />

        {/* 4. MENQOL por depresión */}
        <CrossTab
          title="MENQOL por depresión"
          enriched={data}
          groups={[
            { label: 'No', filter: r => r.depression === 'no' || r.depression === false },
            { label: 'Pasada', filter: r => r.depression === 'past' },
            { label: 'Actual', filter: r => r.depression === 'current' || r.depression === true },
          ]}
        />

        {/* 5. MENQOL por tabaco */}
        <CrossTab
          title="MENQOL por tabaco"
          enriched={data}
          groups={[
            { label: 'Nunca', filter: r => r.smoking === 'never' },
            { label: 'Exfumadora', filter: r => r.smoking === 'former' },
            { label: 'Fumadora activa', filter: r => r.smoking === 'current' },
          ]}
        />

        {/* 6. MENQOL por categoría IMC */}
        <CrossTab
          title="MENQOL por categoría de IMC"
          enriched={data}
          groups={BMI_CATS.map(cat => ({
            label: cat,
            filter: r => r.bmiCat === cat,
          }))}
        />
      </>}

      {/* ═══ TAB: POR EDAD ═══ */}
      {tab === 'edad' && <>
        <div style={card}>
          <p style={sectionTitle}>Puntuaciones por grupo de edad (escala MENQOL 1-8)</p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse", minWidth: 500 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #E2E8F0" }}>
                  <th style={{ textAlign: "left", padding: 6, color: "#475569" }}>Grupo</th>
                  <th style={{ textAlign: "right", padding: 6, color: "#475569" }}>n</th>
                  {DOMAIN_META.map(d => (
                    <th key={d.id} style={{ textAlign: "right", padding: 6, color: d.color, fontSize: 11 }}>
                      {d.emoji} {d.short}
                    </th>
                  ))}
                  <th style={{ textAlign: "right", padding: 6, color: "#475569" }}>Global</th>
                </tr>
              </thead>
              <tbody>
                {stratification.map(s => (
                  <tr key={s.group} style={{ borderBottom: "1px solid #F1F5F9" }}>
                    <td style={{ padding: 6, fontWeight: 600 }}>{s.group}</td>
                    <td style={{ padding: 6, textAlign: "right", color: "#94A3B8" }}>{s.n}</td>
                    {['vasomotor', 'psychosocial', 'physical', 'sexual'].map(k => {
                      const diff = s[k] - s.ref[k]
                      return (
                        <td key={k} style={{ padding: 6, textAlign: "right" }}>
                          {s[k].toFixed(2)}
                          <span style={{
                            fontSize: 9, marginLeft: 4,
                            color: Math.abs(diff) >= 0.9 ? (diff > 0 ? "#EF4444" : "#22C55E") : "#94A3B8"
                          }}>
                            ({s.ref[k].toFixed(1)})
                          </span>
                        </td>
                      )
                    })}
                    <td style={{ padding: 6, textAlign: "right", fontWeight: 600 }}>
                      {s.global.toFixed(2)}
                      <span style={{ fontSize: 9, marginLeft: 4, color: "#94A3B8" }}>
                        ({s.ref.global.toFixed(1)})
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ fontSize: 10, color: "#94A3B8", marginTop: 8 }}>
            Valores entre paréntesis = referencia Minnesota Green Tea Trial.
            Rojo = diferencia clínicamente significativa (MCID ≥ 0.9).
          </p>
        </div>

        <div style={card}>
          <p style={sectionTitle}>Score global por grupo de edad</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={stratification.map(s => ({
              name: s.group, Muestra: +s.global.toFixed(2), Referencia: s.ref.global,
            }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis dataKey="name" fontSize={11} tick={{ fill: "#64748B" }} />
              <YAxis domain={[0, 8]} fontSize={10} tick={{ fill: "#94A3B8" }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="Muestra" fill="#7C9CE8" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Referencia" fill="#CBD5E1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </>}

      {/* ═══ TAB: GESTIÓN ═══ */}
      {tab === 'gestion' && <GestionTab data={data} onClear={handleClearAll} onExport={exportCSV} onRefresh={refreshData} user={user} onDeleteByCode={(id) => setRawData(prev => prev.filter(r => r.id !== id))} />}
    </div>
  )
}

/* ─── Gestión Tab (separate for state) ─── */
function GestionTab({ data, onClear, onExport, onRefresh, user, onDeleteByCode }) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteText, setDeleteText] = useState("")
  const [deleting, setDeleting] = useState(false)
  const [codeSearch, setCodeSearch] = useState("")
  const [codeResult, setCodeResult] = useState(null)
  const [codeDeleting, setCodeDeleting] = useState(false)
  const [auditLogs, setAuditLogs] = useState([])
  const [showAudit, setShowAudit] = useState(false)
  const [auditLoading, setAuditLoading] = useState(false)

  const handleDelete = async () => {
    setDeleting(true)
    await onClear()
    setDeleting(false)
    setConfirmDelete(false)
    setDeleteText("")
  }

  const handleCodeSearch = async () => {
    if (!codeSearch.trim()) return
    setCodeResult("searching")
    const { data: records, error } = await supabase
      .from('responses')
      .select('id, created_at, age, weight, score_global, deletion_code')
      .eq('deletion_code', codeSearch.trim().toUpperCase())
    if (error || !records?.length) {
      setCodeResult({ found: false })
    } else {
      setCodeResult({ found: true, record: records[0] })
    }
  }

  const handleCodeDelete = async () => {
    if (!codeResult?.record) return
    setCodeDeleting(true)
    const { error } = await supabase
      .from('responses')
      .delete()
      .eq('id', codeResult.record.id)
    if (!error) {
      logAudit(user?.email, 'delete_by_code', {
        deletion_code: codeResult.record.deletion_code,
        response_id: codeResult.record.id,
      })
      setCodeResult("deleted")
      onDeleteByCode(codeResult.record.id)
    }
    setCodeDeleting(false)
  }

  const loadAuditLog = async () => {
    setAuditLoading(true)
    const { data: logs } = await supabase
      .from('audit_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)
    setAuditLogs(logs || [])
    setAuditLoading(false)
  }

  return (
    <>
      <div style={card}>
        <p style={sectionTitle}>Exportar datos</p>
        <p style={{ fontSize: 13, color: "#64748B", marginBottom: 12, lineHeight: 1.5 }}>
          Exporta todos los datos filtrados ({data.length} respuestas) como CSV
          compatible con Excel, SPSS y R. Separador: punto y coma. Codificación UTF-8.
          <br />
          <span style={{ fontSize: 11, color: '#94A3B8' }}>
            Incluye: datos demográficos, IMC, etapa reproductiva, hábitos, IPAQ, y 29 ítems MENQOL.
          </span>
        </p>
        <button onClick={onExport} style={{
          padding: "10px 20px", borderRadius: 10, background: "#1E293B",
          color: "white", border: "none", fontSize: 14, fontWeight: 600, cursor: "pointer"
        }}>Exportar CSV</button>
      </div>

      <div style={card}>
        <p style={sectionTitle}>Recargar datos</p>
        <button onClick={onRefresh} style={{
          padding: "10px 20px", borderRadius: 10, background: "white",
          color: "#475569", border: "1.5px solid #E2E8F0", fontSize: 14, fontWeight: 600, cursor: "pointer"
        }}>Recargar desde servidor</button>
      </div>

      {/* Search/delete by deletion code (GDPR Art. 17) */}
      <div style={{ ...card, borderColor: "#BBF7D0" }}>
        <p style={{ ...sectionTitle, color: "#166534" }}>Derecho de supresión (RGPD Art. 17)</p>
        <p style={{ fontSize: 13, color: "#64748B", marginBottom: 12, lineHeight: 1.5 }}>
          Busca una respuesta por su código de referencia para ejercer el derecho de supresión
          del participante.
        </p>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input
            value={codeSearch}
            onChange={e => setCodeSearch(e.target.value.toUpperCase())}
            placeholder="Código (ej: A3KM7NP2)"
            maxLength={8}
            style={{
              padding: "10px 14px", borderRadius: 10, border: "1.5px solid #E2E8F0",
              fontSize: 15, fontWeight: 600, letterSpacing: 2, flex: 1, outline: "none",
              fontFamily: "monospace", textTransform: "uppercase"
            }}
          />
          <button
            onClick={handleCodeSearch}
            disabled={!codeSearch.trim() || codeResult === "searching"}
            style={{
              padding: "10px 16px", borderRadius: 10, background: "#1E293B",
              color: "white", border: "none", fontSize: 13, fontWeight: 600,
              cursor: codeSearch.trim() ? "pointer" : "not-allowed"
            }}
          >{codeResult === "searching" ? "..." : "Buscar"}</button>
        </div>

        {codeResult && codeResult !== "searching" && codeResult !== "deleted" && !codeResult.found && (
          <div style={{
            background: "#FEF2F2", borderRadius: 10, padding: 12,
            border: "1px solid #FECACA", fontSize: 13, color: "#991B1B"
          }}>
            No se encontró ninguna respuesta con ese código.
          </div>
        )}

        {codeResult?.found && codeResult.record && (
          <div style={{
            background: "#F0FDF4", borderRadius: 10, padding: 14,
            border: "1px solid #BBF7D0"
          }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: "#166534", marginBottom: 8 }}>
              Respuesta encontrada:
            </p>
            <div style={{ fontSize: 12, color: "#475569", lineHeight: 1.8 }}>
              <div>ID: <span style={{ fontFamily: "monospace" }}>{codeResult.record.id.slice(0, 8)}...</span></div>
              <div>Fecha: {new Date(codeResult.record.created_at).toLocaleString("es-ES")}</div>
              {codeResult.record.age && <div>Edad: {codeResult.record.age}</div>}
              <div>Score global: {codeResult.record.score_global}</div>
            </div>
            <button
              onClick={handleCodeDelete}
              disabled={codeDeleting}
              style={{
                marginTop: 12, padding: "10px 20px", borderRadius: 10,
                background: "#EF4444", color: "white", border: "none",
                fontSize: 13, fontWeight: 700, cursor: "pointer"
              }}
            >{codeDeleting ? "Eliminando..." : "Eliminar esta respuesta"}</button>
          </div>
        )}

        {codeResult === "deleted" && (
          <div style={{
            background: "#F0FDF4", borderRadius: 10, padding: 12,
            border: "1px solid #BBF7D0", fontSize: 13, color: "#166534", fontWeight: 600
          }}>
            Respuesta eliminada correctamente. Los datos han sido suprimidos de la base de datos.
          </div>
        )}
      </div>

      {/* Audit log viewer */}
      <div style={card}>
        <p style={sectionTitle}>Registro de actividad</p>
        <p style={{ fontSize: 13, color: "#64748B", marginBottom: 12, lineHeight: 1.5 }}>
          Últimas 50 acciones registradas en el sistema (SOC 2 — Logging).
        </p>
        <button
          onClick={() => { setShowAudit(!showAudit); if (!showAudit && !auditLogs.length) loadAuditLog() }}
          style={{
            padding: "10px 20px", borderRadius: 10, background: "white",
            color: "#475569", border: "1.5px solid #E2E8F0", fontSize: 14, fontWeight: 600, cursor: "pointer"
          }}
        >{showAudit ? "Ocultar registro" : "Ver registro"}</button>

        {showAudit && (
          <div style={{ marginTop: 12, maxHeight: 300, overflowY: "auto" }}>
            {auditLoading ? (
              <p style={{ fontSize: 13, color: "#94A3B8" }}>Cargando...</p>
            ) : auditLogs.length === 0 ? (
              <p style={{ fontSize: 13, color: "#94A3B8" }}>No hay registros de actividad.</p>
            ) : (
              <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #E2E8F0" }}>
                    <th style={{ textAlign: "left", padding: 4, color: "#475569" }}>Fecha</th>
                    <th style={{ textAlign: "left", padding: 4, color: "#475569" }}>Usuario</th>
                    <th style={{ textAlign: "left", padding: 4, color: "#475569" }}>Acción</th>
                    <th style={{ textAlign: "left", padding: 4, color: "#475569" }}>Detalles</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map(log => (
                    <tr key={log.id} style={{ borderBottom: "1px solid #F1F5F9" }}>
                      <td style={{ padding: 4, color: "#94A3B8", whiteSpace: "nowrap" }}>
                        {new Date(log.created_at).toLocaleString("es-ES", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td style={{ padding: 4, color: "#64748B" }}>{log.user_email?.split('@')[0]}</td>
                      <td style={{ padding: 4, fontWeight: 600, color: "#1E293B" }}>{log.action}</td>
                      <td style={{ padding: 4, color: "#94A3B8", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis" }}>
                        {log.details ? JSON.stringify(log.details).slice(0, 60) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      <div style={{ ...card, borderColor: "#FECACA" }}>
        <p style={{ ...sectionTitle, color: "#EF4444" }}>Zona peligrosa</p>
        <p style={{ fontSize: 13, color: "#64748B", marginBottom: 12, lineHeight: 1.5 }}>
          Borrar <strong>todas</strong> las respuestas de la base de datos ({data.length} registros).
          Esta acción es irreversible.
        </p>

        {!confirmDelete ? (
          <button onClick={() => setConfirmDelete(true)} style={{
            padding: "10px 20px", borderRadius: 10, background: "white",
            color: "#EF4444", border: "1.5px solid #FECACA", fontSize: 14, fontWeight: 600, cursor: "pointer"
          }}>Borrar base de datos</button>
        ) : (
          <div>
            <p style={{ fontSize: 13, color: "#EF4444", fontWeight: 600, marginBottom: 8 }}>
              Escribe BORRAR para confirmar:
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={deleteText}
                onChange={e => setDeleteText(e.target.value)}
                placeholder="BORRAR"
                style={{ padding: "8px 12px", borderRadius: 8, border: "1.5px solid #FECACA", fontSize: 14, flex: 1, outline: "none" }}
              />
              <button
                onClick={handleDelete}
                disabled={deleteText !== "BORRAR" || deleting}
                style={{
                  padding: "8px 16px", borderRadius: 8,
                  background: deleteText === "BORRAR" ? "#EF4444" : "#FCA5A5",
                  color: "white", border: "none", fontSize: 14, fontWeight: 700,
                  cursor: deleteText === "BORRAR" ? "pointer" : "not-allowed"
                }}
              >{deleting ? "Borrando..." : "Confirmar"}</button>
              <button
                onClick={() => { setConfirmDelete(false); setDeleteText("") }}
                style={{
                  padding: "8px 14px", borderRadius: 8, background: "white",
                  color: "#64748B", border: "1.5px solid #E2E8F0", fontSize: 13, cursor: "pointer"
                }}
              >Cancelar</button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
