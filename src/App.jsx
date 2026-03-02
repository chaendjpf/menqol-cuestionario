import { useState, useRef } from 'react'
import { DOMAINS } from './data.js'
import { supabase } from './supabase.js'
import {
  SECTION_BASICS, SECTION_DEMOGRAPHICS, SECTION_HABITS,
  SECTION_HEALTH, SECTION_GYNECOLOGY,
  SECTION_QUICK_STAGE, SECTION_QUICK_HEALTH,
  isConditionMet, countVisibleQuestions
} from './studyData.js'
import { IPAQ_SHORT, IPAQ_LONG, isIpaqConditionMet, getIpaqLongQuestions } from './ipaqData.js'
import { scoreIpaqShort, scoreIpaqLong, IPAQ_CATEGORIES, formatMET } from './ipaqScoring.js'
import { classifyReproductiveStage, calculateBMI } from './ReproductiveStage.js'
import { QuestionRenderer, HelpSheet } from './QuestionTypes.jsx'
import { SectionStepper, SectionHeader, TimeEstimate } from './SectionFlow.jsx'
import Dashboard from './Dashboard.jsx'
import AboutPage from './AboutPage.jsx'
import ConsentModal from './ConsentModal.jsx'
import PrivacyPolicy from './PrivacyPolicy.jsx'
import './styles.css'

/* ─── Helpers ─── */
const getLevel = (pct) => {
  if (pct <= 20) return { label: "Impacto mínimo", color: "#22C55E", bg: "#F0FDF4" }
  if (pct <= 40) return { label: "Impacto leve", color: "#84CC16", bg: "#F7FEE7" }
  if (pct <= 60) return { label: "Impacto moderado", color: "#F59E0B", bg: "#FFFBEB" }
  if (pct <= 80) return { label: "Impacto alto", color: "#F97316", bg: "#FFF7ED" }
  return { label: "Impacto severo", color: "#EF4444", bg: "#FEF2F2" }
}

/* ─── Reference data: Minnesota Green Tea Trial (n=932), escala MENQOL 1-8 ─── */
const REFERENCE = {
  "50-54": { vasomotor: 3.66, psychosocial: 2.81, physical: 3.01, sexual: 3.19, global: 3.04 },
  "55-59": { vasomotor: 3.06, psychosocial: 2.60, physical: 2.95, sexual: 3.27, global: 2.90 },
  "60-64": { vasomotor: 2.50, psychosocial: 2.39, physical: 2.88, sexual: 3.12, global: 2.76 },
  "65+":   { vasomotor: 2.01, psychosocial: 2.14, physical: 2.67, sexual: 2.95, global: 2.51 },
}

const getAgeGroup = (age) => {
  const a = parseInt(age)
  if (!a || a < 55) return "50-54"
  if (a < 60) return "55-59"
  if (a < 65) return "60-64"
  return "65+"
}

// MENQOL 1-8 → 0-100%
const menqolToPct = (v) => (v - 1) / 7 * 100

// MCID = 0.9 on MENQOL 1-8 scale
const MCID = 0.9

/* ─── Section definitions for each version ─── */
const FULL_SECTIONS = [
  { ...SECTION_BASICS, shortName: "Datos" },
  { ...SECTION_DEMOGRAPHICS, shortName: "Socio." },
  { ...SECTION_HABITS, shortName: "Hábitos" },
  { ...SECTION_HEALTH, shortName: "Salud" },
  { ...SECTION_GYNECOLOGY, shortName: "Gineco." },
  { id: "menqol", name: "MENQOL", shortName: "MENQOL", emoji: "🌸", description: "Cuestionario de calidad de vida en la menopausia (29 preguntas)", estimatedMinutes: 7 },
  { id: "ipaqLong", name: "Actividad física", shortName: "IPAQ", emoji: "🏃‍♀️", description: "Cuestionario IPAQ largo (actividad en los últimos 7 días)", estimatedMinutes: 5 },
  { id: "results", name: "Resultados", shortName: "Resultado", emoji: "📊", description: "Tu informe personalizado", estimatedMinutes: 0 },
]

const QUICK_SECTIONS = [
  { ...SECTION_BASICS, shortName: "Datos" },
  { ...SECTION_QUICK_STAGE, shortName: "Etapa" },
  { ...SECTION_QUICK_HEALTH, shortName: "Salud" },
  { id: "menqol", name: "MENQOL", shortName: "MENQOL", emoji: "🌸", description: "Cuestionario de calidad de vida en la menopausia (29 preguntas)", estimatedMinutes: 7 },
  { id: "ipaqShort", name: "Actividad física", shortName: "IPAQ", emoji: "🏃‍♀️", description: "IPAQ corto: 7 preguntas sobre actividad física", estimatedMinutes: 3 },
  { id: "results", name: "Resultados", shortName: "Resultado", emoji: "📊", description: "Tu informe personalizado", estimatedMinutes: 0 },
]

/* ─── Info Bottom Sheet for MENQOL items ─── */
function InfoSheet({ item, onClose }) {
  return (
    <div
      style={{
        position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 999,
        display: "flex", alignItems: "flex-end", justifyContent: "center",
        background: "rgba(0,0,0,0.3)", backdropFilter: "blur(2px)"
      }}
      onClick={onClose}
    >
      <div
        className="slide-up"
        onClick={e => e.stopPropagation()}
        style={{
          background: "white", borderRadius: "20px 20px 0 0",
          padding: "24px 20px 32px", width: "100%", maxWidth: 480,
          boxShadow: "0 -4px 30px rgba(0,0,0,0.12)"
        }}
      >
        <div style={{ width: 36, height: 4, borderRadius: 2, background: "#E2E8F0", margin: "0 auto 16px" }} />
        <h4 style={{ fontSize: 17, fontWeight: 600, color: "#1E293B", marginBottom: 8 }}>{item.label}</h4>
        <p style={{ fontSize: 14, color: "#64748B", lineHeight: 1.6, marginBottom: 16 }}>{item.help}</p>
        <div style={{ background: "#F8FAFC", borderRadius: 12, padding: 16 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: "#475569", marginBottom: 10 }}>Guía de puntuación:</p>
          {[
            { range: "0–2", color: "#22C55E", text: item.scale.low },
            { range: "3–4", color: "#F59E0B", text: item.scale.mid },
            { range: "5–6", color: "#EF4444", text: item.scale.high },
          ].map(s => (
            <div key={s.range} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: s.color, minWidth: 32 }}>{s.range}</span>
              <span style={{ fontSize: 13, color: "#64748B", lineHeight: 1.5 }}>{s.text}</span>
            </div>
          ))}
        </div>
        <button onClick={onClose} style={{
          marginTop: 16, width: "100%", padding: 12, background: "#1E293B",
          color: "white", border: "none", borderRadius: 12, fontSize: 15,
          fontWeight: 600, cursor: "pointer"
        }}>Entendido</button>
      </div>
    </div>
  )
}

/* ─── Scale Selector (MENQOL 0-6) ─── */
function ScaleSelector({ value, onChange, color }) {
  return (
    <div style={{ marginTop: 10 }} className="fade-in">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 5 }}>
        {[0,1,2,3,4,5,6].map(n => {
          const sel = value === n
          return (
            <button key={n} onClick={() => onChange(n)} style={{
              width: "100%", aspectRatio: "1", borderRadius: 10,
              border: sel ? "none" : "1.5px solid #E2E8F0",
              background: sel ? color : "#F8FAFC",
              color: sel ? "white" : "#64748B",
              fontSize: 15, fontWeight: sel ? 700 : 500,
              cursor: "pointer", transition: "all 0.15s",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: sel ? `0 2px 8px ${color}40` : "none"
            }}>{n}</button>
          )
        })}
      </div>
      <div style={{
        display: "flex", justifyContent: "space-between",
        fontSize: 11, color: "#94A3B8", marginTop: 4
      }}>
        <span>No me molesta</span>
        <span>Muchísimo</span>
      </div>
    </div>
  )
}

/* ─── Single MENQOL Question Item ─── */
function MenqolQuestionItem({ item, domain, answer, onAnswer, openTooltip, setOpenTooltip }) {
  const isYes = answer?.present === true
  const needsRating = isYes && answer?.rating == null

  return (
    <div style={{
      background: "white", borderRadius: 14, padding: "14px 16px",
      border: needsRating ? `2px solid ${domain.color}` : "1.5px solid #F1F5F9",
      boxShadow: needsRating ? `0 0 0 3px ${domain.color}18` : "0 1px 3px rgba(0,0,0,0.04)",
      transition: "all 0.2s"
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: "#1E293B", flex: 1, lineHeight: 1.4 }}>
          {item.label}
        </span>
        <button
          onClick={() => setOpenTooltip(openTooltip === item.id ? null : item.id)}
          aria-label="Más información"
          style={{
            width: 28, height: 28, borderRadius: "50%",
            border: "1.5px solid #CBD5E1",
            background: openTooltip === item.id ? "#F1F5F9" : "white",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", fontSize: 14, color: "#64748B", flexShrink: 0
          }}
        >?</button>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        {[false, true].map(val => {
          const active = answer?.present === val
          return (
            <button key={String(val)} onClick={() => onAnswer(item.id, {
              present: val,
              rating: val ? (answer?.rating ?? null) : null
            })} style={{
              flex: 1, padding: "10px 0", borderRadius: 10,
              border: active ? `2px solid ${domain.color}` : "1.5px solid #E2E8F0",
              background: active ? domain.colorLight : "white",
              color: active ? domain.color : "#64748B",
              fontSize: 14, fontWeight: 600, cursor: "pointer", transition: "all 0.15s"
            }}>{val ? "Sí" : "No"}</button>
          )
        })}
      </div>

      {isYes && <ScaleSelector value={answer?.rating ?? null} onChange={r => onAnswer(item.id, { present: true, rating: r })} color={domain.color} />}
      {needsRating && (
        <p style={{ fontSize: 12, color: domain.color, marginTop: 8, fontWeight: 500 }}>
          ⬆ Indica cuánto te molesta (0-6)
        </p>
      )}
    </div>
  )
}

/* ─── Radar Chart (Spider) ─── */
function RadarChart({ domainResults, refPcts, ageGroup }) {
  const cx = 150, cy = 150, r = 110
  const n = domainResults.length
  const angleStep = (2 * Math.PI) / n
  const startAngle = -Math.PI / 2

  const point = (i, pct) => {
    const a = startAngle + i * angleStep
    return [cx + r * (pct / 100) * Math.cos(a), cy + r * (pct / 100) * Math.sin(a)]
  }

  const makePath = (pts) => pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0]},${p[1]}`).join(" ") + " Z"

  const gridLevels = [20, 40, 60, 80, 100]
  const dataPoints = domainResults.map((d, i) => point(i, d.pct))
  const refPoints = refPcts ? refPcts.map((p, i) => point(i, p)) : null

  const labelPos = domainResults.map((_, i) => {
    const a = startAngle + i * angleStep
    return [cx + (r + 30) * Math.cos(a), cy + (r + 30) * Math.sin(a)]
  })

  return (
    <div style={{
      background: "white", borderRadius: 16, padding: "20px 8px 12px",
      border: "1.5px solid #F1F5F9", marginBottom: 16
    }}>
      <h3 style={{ fontSize: 15, fontWeight: 700, color: "#1E293B", marginBottom: 4, textAlign: "center" }}>
        Perfil de síntomas
      </h3>
      <svg viewBox="0 0 300 300" style={{ width: "100%", maxWidth: 340, display: "block", margin: "0 auto" }}>
        {gridLevels.map(level => {
          const pts = Array.from({ length: n }, (_, i) => point(i, level))
          return <path key={level} d={makePath(pts)} fill="none" stroke="#E2E8F0" strokeWidth={level === 100 ? 1.5 : 0.8} />
        })}
        {domainResults.map((_, i) => {
          const [ex, ey] = point(i, 100)
          return <line key={i} x1={cx} y1={cy} x2={ex} y2={ey} stroke="#E2E8F0" strokeWidth={0.8} />
        })}
        {refPoints && (
          <path d={makePath(refPoints)} fill="rgba(148, 163, 184, 0.10)" stroke="#94A3B8" strokeWidth={1.8}
            strokeDasharray="6 4" strokeLinejoin="round" />
        )}
        {refPoints && refPoints.map((p, i) => (
          <circle key={`ref-${i}`} cx={p[0]} cy={p[1]} r={3} fill="#94A3B8" stroke="white" strokeWidth={1.5} />
        ))}
        <path d={makePath(dataPoints)} fill="rgba(124, 156, 232, 0.18)" stroke="#7C9CE8" strokeWidth={2.5} strokeLinejoin="round" />
        {dataPoints.map((p, i) => (
          <circle key={i} cx={p[0]} cy={p[1]} r={4.5} fill={domainResults[i].domain.color} stroke="white" strokeWidth={2} />
        ))}
        {domainResults.map((d, i) => {
          const [lx, ly] = labelPos[i]
          const anchor = i === 0 || i === 2 ? "middle" : i === 1 ? "start" : "end"
          return (
            <g key={d.domain.id}>
              <text x={lx} y={ly - 6} textAnchor={anchor} fontSize={11} fontWeight={700} fill={d.domain.color}>
                {d.domain.emoji} {d.pct}%
              </text>
              <text x={lx} y={ly + 8} textAnchor={anchor} fontSize={9.5} fontWeight={500} fill="#64748B">
                {d.domain.name.replace("Síntomas ", "")}
              </text>
            </g>
          )
        })}
      </svg>
      <div style={{ display: "flex", justifyContent: "center", gap: 20, marginTop: 4, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 18, height: 4, borderRadius: 2, background: "#7C9CE8" }} />
          <span style={{ fontSize: 11, color: "#475569" }}>Tu resultado</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 18, height: 0, borderTop: "2px dashed #94A3B8" }} />
          <span style={{ fontSize: 11, color: "#94A3B8" }}>Media pobl. ({ageGroup})</span>
        </div>
      </div>
    </div>
  )
}

/* ─── Results View ─── */
function ResultsView({ menqolAnswers, studyData, version, age, weight, onReset, onOpenPrivacy }) {
  const [saveStatus, setSaveStatus] = useState(null)
  const [deletionCode, setDeletionCode] = useState(null)

  const generateDeletionCode = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    let code = ""
    for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)]
    return code
  }

  // MENQOL scoring: rating 0-6 → internal score = present ? rating + 2 : 1 (gives 1-8)
  const domainResults = DOMAINS.map(domain => {
    let scoreSum = 0, yesCount = 0
    domain.items.forEach(item => {
      const a = menqolAnswers[item.id]
      if (a?.present && a?.rating != null) {
        scoreSum += a.rating + 2  // 0-6 → 2-8
        yesCount++
      } else {
        scoreSum += 1  // "No" = 1
      }
    })
    const mean = scoreSum / domain.items.length
    const pct = Math.round(menqolToPct(mean))
    return { domain, mean, yesCount, pct, count: domain.items.length, scoreSum }
  })

  const overallSum = domainResults.reduce((s, d) => s + d.scoreSum, 0)
  const overallMean = overallSum / 29
  const overallPct = Math.round(menqolToPct(overallMean))
  const overall = getLevel(overallPct)

  const ageGroup = getAgeGroup(age)
  const ref = REFERENCE[ageGroup]
  const ageUnder50 = age && parseInt(age) < 50

  const domainKeys = ["vasomotor", "psychosocial", "physical", "sexual"]
  const refPcts = domainKeys.map(k => menqolToPct(ref[k]))

  // Reproductive stage
  const gynData = studyData.gynecology || studyData.quickStage || {}
  const reproStage = classifyReproductiveStage(gynData)

  // BMI
  const height = studyData.basics?.height
  const bmi = calculateBMI(weight ? parseFloat(weight) : null, height ? parseFloat(height) : null)

  // IPAQ scoring
  const ipaqAnswers = studyData.ipaqShort || studyData.ipaqLong || {}
  const ipaqScore = version === "full"
    ? (studyData.ipaqLong ? scoreIpaqLong(studyData.ipaqLong) : null)
    : (studyData.ipaqShort ? scoreIpaqShort(studyData.ipaqShort) : null)
  const ipaqCat = ipaqScore ? IPAQ_CATEGORIES[ipaqScore.category] : null

  const handleSaveClick = () => setSaveStatus("consent")

  const handleConsentAccepted = async () => {
    setSaveStatus("saving")
    try {
      const code = generateDeletionCode()
      const answersPayload = { ...menqolAnswers }
      answersPayload._version = version
      answersPayload._scale = "0-6"
      if (reproStage) answersPayload._reproductiveStage = reproStage.stage
      if (studyData.basics) {
        const { age: _, weight: __, ...rest } = studyData.basics
        if (Object.keys(rest).length) answersPayload._basics = rest
      }
      if (studyData.demographics) answersPayload._demographics = studyData.demographics
      if (studyData.habits) answersPayload._habits = studyData.habits
      if (studyData.health) answersPayload._health = studyData.health
      if (studyData.gynecology) answersPayload._gynecology = studyData.gynecology
      if (studyData.quickStage) answersPayload._quickStage = studyData.quickStage
      if (studyData.quickHealth) answersPayload._quickHealth = studyData.quickHealth
      if (ipaqScore) answersPayload._ipaqScore = { totalMET: ipaqScore.totalMET, category: ipaqScore.category }
      if (studyData.ipaqShort) answersPayload._ipaq = studyData.ipaqShort
      if (studyData.ipaqLong) answersPayload._ipaq = studyData.ipaqLong

      const { error } = await supabase.from("responses").insert({
        age: age ? parseInt(age) : null,
        weight: weight ? parseFloat(weight) : null,
        answers: answersPayload,
        score_vasomotor: domainResults[0].mean,
        score_psychosocial: domainResults[1].mean,
        score_physical: domainResults[2].mean,
        score_sexual: domainResults[3].mean,
        score_global: overallMean,
        consent_given: true,
        consent_date: new Date().toISOString(),
        deletion_code: code,
      })
      if (error) throw error
      setDeletionCode(code)
      setSaveStatus("saved")
    } catch (e) {
      console.error("Error saving:", e)
      setSaveStatus("error")
    }
  }

  const dateStr = new Date().toLocaleDateString("es-ES", {
    day: "numeric", month: "long", year: "numeric"
  })

  return (
    <div className="fade-in">
      {/* Summary card */}
      <div style={{
        background: "linear-gradient(135deg, #1E293B 0%, #334155 100%)",
        borderRadius: 20, padding: 24, marginBottom: 20, color: "white", textAlign: "center"
      }}>
        <p style={{ fontSize: 13, opacity: 0.7, marginBottom: 4 }}>Puntuación global MENQOL</p>
        <p style={{ fontSize: 48, fontWeight: 800, lineHeight: 1.1 }}>
          {overallMean.toFixed(1)}<span style={{ fontSize: 20, opacity: 0.5 }}>/8</span>
        </p>
        <div style={{
          display: "inline-block", padding: "6px 16px", borderRadius: 20,
          background: overall.color + "22", color: overall.color,
          fontSize: 14, fontWeight: 600, marginTop: 8
        }}>
          {overall.label}
        </div>
        <p style={{ fontSize: 12, opacity: 0.5, marginTop: 12 }}>
          {dateStr}{age ? ` · ${age} años` : ""}{weight ? ` · ${weight} kg` : ""}
          {bmi ? ` · IMC ${bmi.value}` : ""}
        </p>
      </div>

      {/* Quick info cards: reproductive stage, BMI, IPAQ */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        {reproStage && reproStage.stage !== "unknown" && (
          <div style={{
            flex: 1, minWidth: 140, background: reproStage.bg, borderRadius: 14,
            padding: "12px 14px", border: `1.5px solid ${reproStage.color}30`
          }}>
            <p style={{ fontSize: 11, color: "#94A3B8", marginBottom: 2 }}>Etapa reproductiva</p>
            <p style={{ fontSize: 14, fontWeight: 700, color: reproStage.color }}>{reproStage.label}</p>
          </div>
        )}
        {bmi && (
          <div style={{
            flex: 1, minWidth: 100, background: "#F8FAFC", borderRadius: 14,
            padding: "12px 14px", border: "1.5px solid #E2E8F0"
          }}>
            <p style={{ fontSize: 11, color: "#94A3B8", marginBottom: 2 }}>IMC</p>
            <p style={{ fontSize: 14, fontWeight: 700, color: bmi.color }}>{bmi.value} ({bmi.category})</p>
          </div>
        )}
        {ipaqCat && (
          <div style={{
            flex: 1, minWidth: 140, background: ipaqCat.bg, borderRadius: 14,
            padding: "12px 14px", border: `1.5px solid ${ipaqCat.color}30`
          }}>
            <p style={{ fontSize: 11, color: "#94A3B8", marginBottom: 2 }}>Actividad física</p>
            <p style={{ fontSize: 14, fontWeight: 700, color: ipaqCat.color }}>
              {ipaqCat.label} ({formatMET(ipaqScore.totalMET)} MET-min/sem)
            </p>
          </div>
        )}
      </div>

      {/* Radar chart */}
      <RadarChart domainResults={domainResults} refPcts={refPcts} ageGroup={ageGroup} />

      {/* Domain bars */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {domainResults.map(({ domain, mean, yesCount, pct, count }) => {
          const level = getLevel(pct)
          return (
            <div key={domain.id} style={{
              background: "white", borderRadius: 16, padding: 16, border: "1.5px solid #F1F5F9"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 20 }}>{domain.emoji}</span>
                <span style={{ fontSize: 15, fontWeight: 600, color: "#1E293B", flex: 1 }}>{domain.name}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: level.color }}>{pct}%</span>
              </div>
              <div style={{ height: 8, background: "#F1F5F9", borderRadius: 4, overflow: "hidden" }}>
                <div style={{
                  height: "100%", width: `${pct}%`, background: domain.color,
                  borderRadius: 4, animation: "barGrow 1s ease"
                }} />
              </div>
              <div style={{
                display: "flex", justifyContent: "space-between", marginTop: 8,
                fontSize: 12, color: "#94A3B8"
              }}>
                <span>{yesCount} de {count} síntomas presentes</span>
                <span>{mean.toFixed(1)}/8</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Comparison with reference */}
      <div style={{
        background: "white", borderRadius: 16, padding: 16, marginTop: 16,
        border: "1.5px solid #F1F5F9"
      }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: "#1E293B", marginBottom: 14 }}>
          Comparativa con estudio de referencia
        </h3>

        {ageUnder50 && (
          <div style={{
            background: "#FFFBEB", borderRadius: 10, padding: 10, marginBottom: 12,
            border: "1px solid #FDE68A", fontSize: 12, color: "#92400E", lineHeight: 1.5
          }}>
            Tu edad está fuera del rango del estudio de referencia (50-65+). Se usa el grupo 50-54 como aproximación.
          </div>
        )}

        {/* Global row */}
        {(() => {
          const diff = overallMean - ref.global
          const absDiff = Math.abs(diff)
          const significant = absDiff >= MCID
          const better = diff < 0
          const neutral = absDiff < 0.5
          const diffColor = neutral ? "#F59E0B" : better ? "#22C55E" : "#EF4444"
          const diffBg = neutral ? "#FFFBEB" : better ? "#F0FDF4" : "#FEF2F2"
          const diffLabel = neutral ? "En la media" : better ? "Por debajo" : "Por encima"
          return (
            <div style={{
              background: "#F8FAFC", borderRadius: 12, padding: 12, marginBottom: 10,
              border: "1px solid #E2E8F0"
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: "#1E293B" }}>Global</span>
                <span style={{
                  fontSize: 11, fontWeight: 600, color: diffColor, background: diffBg,
                  padding: "2px 8px", borderRadius: 6
                }}>{diffLabel}{significant ? " *" : ""}</span>
              </div>
              <div style={{ display: "flex", gap: 12, fontSize: 12, color: "#64748B", marginBottom: 6 }}>
                <span>Tú: <strong style={{ color: "#1E293B" }}>{overallMean.toFixed(1)}</strong></span>
                <span>Ref: <strong style={{ color: "#94A3B8" }}>{ref.global.toFixed(1)}</strong></span>
                <span style={{ color: diffColor, fontWeight: 600 }}>
                  {diff > 0 ? "+" : ""}{diff.toFixed(1)}
                </span>
              </div>
              <div style={{ position: "relative", height: 8, background: "#E2E8F0", borderRadius: 4, overflow: "hidden" }}>
                <div style={{ position: "absolute", height: "100%", width: `${overallPct}%`, background: "#7C9CE8", borderRadius: 4, opacity: 0.7 }} />
                <div style={{ position: "absolute", height: "100%", width: 2, left: `${menqolToPct(ref.global)}%`, background: "#475569", borderRadius: 1 }} />
              </div>
            </div>
          )
        })()}

        {/* Per-domain rows */}
        {domainResults.map((d, i) => {
          const refMean = ref[domainKeys[i]]
          const diff = d.mean - refMean
          const absDiff = Math.abs(diff)
          const significant = absDiff >= MCID
          const better = diff < 0
          const neutral = absDiff < 0.5
          const diffColor = neutral ? "#F59E0B" : better ? "#22C55E" : "#EF4444"
          const diffBg = neutral ? "#FFFBEB" : better ? "#F0FDF4" : "#FEF2F2"
          const diffLabel = neutral ? "En la media" : better ? "Por debajo" : "Por encima"
          return (
            <div key={d.domain.id} style={{ padding: "10px 0", borderBottom: i < domainResults.length - 1 ? "1px solid #F1F5F9" : "none" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#1E293B" }}>
                  {d.domain.emoji} {d.domain.name.replace("Síntomas ", "")}
                </span>
                <span style={{
                  fontSize: 10, fontWeight: 600, color: diffColor, background: diffBg,
                  padding: "2px 7px", borderRadius: 5
                }}>{diffLabel}{significant ? " *" : ""}</span>
              </div>
              <div style={{ display: "flex", gap: 12, fontSize: 12, color: "#64748B", marginBottom: 5 }}>
                <span>Tú: <strong style={{ color: d.domain.color }}>{d.mean.toFixed(1)}</strong></span>
                <span>Ref: <strong style={{ color: "#94A3B8" }}>{refMean.toFixed(1)}</strong></span>
                <span style={{ color: diffColor, fontWeight: 600 }}>
                  {diff > 0 ? "+" : ""}{diff.toFixed(1)}
                </span>
              </div>
              <div style={{ position: "relative", height: 6, background: "#F1F5F9", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ position: "absolute", height: "100%", width: `${d.pct}%`, background: d.domain.color, borderRadius: 3, opacity: 0.6 }} />
                <div style={{ position: "absolute", height: "100%", width: 2, left: `${menqolToPct(refMean)}%`, background: "#475569", borderRadius: 1 }} />
              </div>
            </div>
          )
        })}

        <div style={{ marginTop: 14, background: "#F8FAFC", borderRadius: 10, padding: 12 }}>
          <p style={{ fontSize: 11, color: "#94A3B8", lineHeight: 1.6 }}>
            Referencia: Minnesota Green Tea Trial (n=932 mujeres postmenopáusicas, EE.UU.).
            Escala MENQOL original 1-8 (1 = sin síntoma, 8 = extremadamente molesto).
            * Diferencia clínicamente significativa (MCID ≥ 0.9 puntos).
          </p>
        </div>
      </div>

      {/* IPAQ results detail */}
      {ipaqScore && ipaqCat && (
        <div style={{
          background: "white", borderRadius: 16, padding: 16, marginTop: 16,
          border: "1.5px solid #F1F5F9"
        }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: "#1E293B", marginBottom: 12 }}>
            Nivel de actividad física (IPAQ)
          </h3>
          <div style={{
            background: ipaqCat.bg, borderRadius: 12, padding: 14,
            border: `1px solid ${ipaqCat.color}30`, marginBottom: 12
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 20 }}>🏃‍♀️</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: ipaqCat.color }}>{ipaqCat.label}</span>
            </div>
            <p style={{ fontSize: 13, color: "#64748B", lineHeight: 1.5 }}>{ipaqCat.description}</p>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 100, background: "#F8FAFC", borderRadius: 10, padding: 12, textAlign: "center" }}>
              <p style={{ fontSize: 11, color: "#94A3B8" }}>Total</p>
              <p style={{ fontSize: 18, fontWeight: 800, color: "#1E293B" }}>{formatMET(ipaqScore.totalMET)}</p>
              <p style={{ fontSize: 10, color: "#94A3B8" }}>MET-min/sem</p>
            </div>
            {ipaqScore.sittingMinutes != null && (
              <div style={{ flex: 1, minWidth: 100, background: "#F8FAFC", borderRadius: 10, padding: 12, textAlign: "center" }}>
                <p style={{ fontSize: 11, color: "#94A3B8" }}>Sedentarismo</p>
                <p style={{ fontSize: 18, fontWeight: 800, color: "#1E293B" }}>
                  {Math.round(ipaqScore.sittingMinutes / 60 * 10) / 10}h
                </p>
                <p style={{ fontSize: 10, color: "#94A3B8" }}>horas/día sentada</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Reproductive stage detail */}
      {reproStage && reproStage.stage !== "unknown" && (
        <div style={{
          background: "white", borderRadius: 16, padding: 16, marginTop: 16,
          border: "1.5px solid #F1F5F9"
        }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: "#1E293B", marginBottom: 12 }}>
            Etapa reproductiva (STRAW+10)
          </h3>
          <div style={{
            background: reproStage.bg, borderRadius: 12, padding: 14,
            border: `1px solid ${reproStage.color}30`
          }}>
            <p style={{ fontSize: 16, fontWeight: 700, color: reproStage.color, marginBottom: 6 }}>{reproStage.label}</p>
            <p style={{ fontSize: 13, color: "#64748B", lineHeight: 1.5 }}>{reproStage.description}</p>
          </div>
        </div>
      )}

      {/* Item detail */}
      <div style={{
        background: "white", borderRadius: 16, padding: 16, marginTop: 16,
        border: "1.5px solid #F1F5F9"
      }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: "#1E293B", marginBottom: 12 }}>
          Detalle de síntomas
        </h3>
        {DOMAINS.map(domain => (
          <div key={domain.id} style={{ marginBottom: 14 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: domain.color, marginBottom: 6 }}>
              {domain.emoji} {domain.name}
            </p>
            {domain.items.map(item => {
              const a = menqolAnswers[item.id]
              const present = a?.present
              const rating = a?.rating
              const internalScore = present && rating != null ? rating + 2 : null
              return (
                <div key={item.id} style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "5px 0", borderBottom: "1px solid #F8FAFC"
                }}>
                  <span style={{ fontSize: 13, color: "#475569", flex: 1 }}>{item.label}</span>
                  {present === false && (
                    <span style={{ fontSize: 12, color: "#94A3B8", fontWeight: 500 }}>No</span>
                  )}
                  {present && rating != null && (
                    <span style={{
                      fontSize: 12, fontWeight: 700,
                      color: internalScore <= 4 ? "#22C55E" : internalScore <= 6 ? "#F59E0B" : "#EF4444",
                      background: internalScore <= 4 ? "#F0FDF4" : internalScore <= 6 ? "#FFFBEB" : "#FEF2F2",
                      padding: "2px 8px", borderRadius: 6
                    }}>{rating}/6</span>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {/* Disclaimer */}
      <div style={{
        background: "#F8FAFC", borderRadius: 14, padding: 16, marginTop: 16,
        border: "1.5px solid #E2E8F0"
      }}>
        <p style={{ fontSize: 12, color: "#64748B", lineHeight: 1.6 }}>
          <strong>Nota:</strong> Esta herramienta es orientativa y no sustituye una consulta médica profesional.
          Los resultados están basados en el cuestionario MENQOL (Menopause-Specific Quality of Life).
          Comparte estos resultados con tu profesional de salud para una evaluación personalizada.
        </p>
      </div>

      {/* Deletion code display */}
      {deletionCode && (
        <div style={{
          background: "#F0FDF4", borderRadius: 14, padding: 16, marginTop: 16,
          border: "1.5px solid #BBF7D0", textAlign: "center"
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#166534", marginBottom: 8 }}>
            Datos guardados correctamente
          </div>
          <div style={{ fontSize: 12, color: "#166534", marginBottom: 12, lineHeight: 1.5 }}>
            Tu código de referencia para ejercer tus derechos (acceso, rectificación, supresión):
          </div>
          <div style={{
            background: "white", borderRadius: 10, padding: "12px 16px",
            border: "1.5px solid #BBF7D0", display: "inline-block",
            fontSize: 22, fontWeight: 800, letterSpacing: 3, color: "#1E293B",
            fontFamily: "monospace"
          }}>
            {deletionCode}
          </div>
          <div style={{ fontSize: 11, color: "#64748B", marginTop: 10, lineHeight: 1.5 }}>
            Guarda este código en un lugar seguro. Lo necesitarás si deseas solicitar
            la eliminación de tus datos.
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="no-print" style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
        <button
          onClick={handleSaveClick}
          disabled={saveStatus === "saving" || saveStatus === "saved" || saveStatus === "consent"}
          style={{
            width: "100%", padding: 14, borderRadius: 14,
            background: saveStatus === "saved" ? "#22C55E" : saveStatus === "error" ? "#EF4444" : "#1E293B",
            color: "white", border: "none",
            fontSize: 15, fontWeight: 700, cursor: saveStatus === "saved" ? "default" : "pointer",
            boxShadow: saveStatus === "saved" ? "none" : "0 4px 15px rgba(30,41,59,0.3)",
            transition: "all 0.2s"
          }}
        >
          {saveStatus === "saving" ? "Guardando..." :
           saveStatus === "saved" ? "Guardado para investigación" :
           saveStatus === "error" ? "Error — Reintentar" :
           "Guardar para investigación"}
        </button>

        {saveStatus === "consent" && (
          <ConsentModal
            onAccept={handleConsentAccepted}
            onCancel={() => setSaveStatus(null)}
            onOpenPrivacy={onOpenPrivacy}
          />
        )}

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => window.print()} style={{
            flex: 1, padding: 14, borderRadius: 14,
            background: "white", color: "#475569", border: "1.5px solid #E2E8F0",
            fontSize: 14, fontWeight: 600, cursor: "pointer"
          }}>Imprimir</button>
          <button onClick={onReset} style={{
            flex: 1, padding: 14, borderRadius: 14,
            background: "white", color: "#475569", border: "1.5px solid #E2E8F0",
            fontSize: 14, fontWeight: 600, cursor: "pointer"
          }}>Repetir</button>
        </div>
      </div>
    </div>
  )
}

/* ─── Generic Section View (non-MENQOL, non-IPAQ) ─── */
function GenericSectionView({ section, answers, onAnswer, openHelp, setOpenHelp }) {
  const visibleQuestions = section.questions.filter(q => isConditionMet(q, answers))
  return (
    <div className="fade-in">
      <SectionHeader section={section} questionCount={visibleQuestions.length} />
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
        {visibleQuestions.map(q => (
          <QuestionRenderer
            key={q.id}
            question={q}
            value={answers[q.id]}
            onChange={v => onAnswer(q.id, v)}
            openHelp={openHelp}
            setOpenHelp={setOpenHelp}
          />
        ))}
      </div>
    </div>
  )
}

/* ─── IPAQ Section View ─── */
function IpaqSectionView({ ipaqDef, answers, onAnswer, openHelp, setOpenHelp }) {
  const allQuestions = ipaqDef.parts
    ? ipaqDef.parts.flatMap(p => p.questions)
    : ipaqDef.questions

  const visibleQuestions = allQuestions.filter(q => isIpaqConditionMet(q, answers))

  return (
    <div className="fade-in">
      <SectionHeader section={ipaqDef} questionCount={visibleQuestions.length} />
      {ipaqDef.intro && (
        <div style={{
          background: "#FFFBEB", borderRadius: 12, padding: 14, marginBottom: 14,
          border: "1px solid #FDE68A", fontSize: 13, color: "#92400E", lineHeight: 1.5
        }}>
          {ipaqDef.intro}
        </div>
      )}

      {ipaqDef.parts ? (
        // Long version: show parts
        ipaqDef.parts.map(part => {
          const partVisible = part.questions.filter(q => isIpaqConditionMet(q, answers))
          if (partVisible.length === 0) return null
          return (
            <div key={part.id} style={{ marginBottom: 16 }}>
              <div style={{
                background: "#F8FAFC", borderRadius: 10, padding: "10px 14px", marginBottom: 10,
                border: "1px solid #E2E8F0"
              }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: "#1E293B" }}>{part.name}</p>
                {part.description && <p style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}>{part.description}</p>}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {partVisible.map(q => (
                  <QuestionRenderer
                    key={q.id}
                    question={q}
                    value={answers[q.id]}
                    onChange={v => onAnswer(q.id, v)}
                    openHelp={openHelp}
                    setOpenHelp={setOpenHelp}
                  />
                ))}
              </div>
            </div>
          )
        })
      ) : (
        // Short version: flat list
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
          {visibleQuestions.map(q => (
            <QuestionRenderer
              key={q.id}
              question={q}
              value={answers[q.id]}
              onChange={v => onAnswer(q.id, v)}
              openHelp={openHelp}
              setOpenHelp={setOpenHelp}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/* ─── MENQOL Section View ─── */
function MenqolSectionView({ currentDomain, setCurrentDomain, answers, onAnswer, openTooltip, setOpenTooltip, scrollTop, onComplete }) {
  const domain = DOMAINS[currentDomain]

  const isDomainComplete = () => {
    if (!domain) return false
    return domain.items.every(item => {
      const a = answers[item.id]
      if (!a) return false
      if (a.present === false) return true
      return a.present === true && a.rating != null
    })
  }

  const totalAnswered = Object.values(answers).filter(a =>
    a && (a.present === false || (a.present === true && a.rating != null))
  ).length

  return (
    <div className="fade-in">
      {/* MENQOL sub-progress */}
      <div className="no-print" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 12, color: "#94A3B8" }}>
          <span>{domain.emoji} {domain.name}</span>
          <span>{totalAnswered}/29</span>
        </div>
        <div style={{ height: 4, background: "#E2E8F0", borderRadius: 2, overflow: "hidden" }}>
          <div style={{
            height: "100%", background: domain.color, borderRadius: 2,
            width: `${(totalAnswered / 29) * 100}%`, transition: "width 0.3s"
          }} />
        </div>
        <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
          {DOMAINS.map((d, i) => (
            <button key={d.id} onClick={() => { setCurrentDomain(i); scrollTop() }} style={{
              flex: 1, height: 6, borderRadius: 3, border: "none", cursor: "pointer",
              background: i === currentDomain ? d.color : i < currentDomain ? d.color + "60" : "#E2E8F0",
              transition: "all 0.2s"
            }} />
          ))}
        </div>
      </div>

      {/* Domain header */}
      <div style={{
        background: domain.colorLight, borderRadius: 16, padding: 16, marginBottom: 14,
        border: `1.5px solid ${domain.colorMid}`
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 28 }}>{domain.emoji}</span>
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 700, color: "#1E293B" }}>{domain.name}</h2>
            <p style={{ fontSize: 13, color: "#64748B", marginTop: 2 }}>{domain.description}</p>
          </div>
        </div>
      </div>

      {/* Questions */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
        {domain.items.map(item => (
          <MenqolQuestionItem
            key={item.id} item={item} domain={domain}
            answer={answers[item.id]} onAnswer={onAnswer}
            openTooltip={openTooltip} setOpenTooltip={setOpenTooltip}
          />
        ))}
      </div>

      {/* Navigation */}
      <div style={{ display: "flex", gap: 10 }}>
        {currentDomain > 0 && (
          <button onClick={() => { setCurrentDomain(p => p - 1); scrollTop() }} style={{
            flex: 1, padding: 14, borderRadius: 14,
            background: "white", color: "#64748B", border: "1.5px solid #E2E8F0",
            fontSize: 15, fontWeight: 600, cursor: "pointer"
          }}>Anterior</button>
        )}
        <button
          onClick={() => {
            if (currentDomain < DOMAINS.length - 1) { setCurrentDomain(p => p + 1); scrollTop() }
            else if (onComplete) { onComplete() }
          }}
          disabled={!isDomainComplete()}
          style={{
            flex: 2, padding: 14, borderRadius: 14,
            background: isDomainComplete() ? "#1E293B" : "#CBD5E1",
            color: "white", border: "none", fontSize: 15, fontWeight: 700,
            cursor: isDomainComplete() ? "pointer" : "not-allowed",
            boxShadow: isDomainComplete() ? "0 4px 15px rgba(30,41,59,0.3)" : "none",
            transition: "all 0.2s"
          }}
        >{currentDomain < DOMAINS.length - 1 ? "Siguiente dominio" : "Siguiente sección"}</button>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════
   MAIN APP
   ═══════════════════════════════════════════ */
export default function App() {
  const [step, setStep] = useState("intro")  // intro | versionSelect | sections | results | dashboard | privacy | about
  const [version, setVersion] = useState(null)  // "full" | "quick"
  const [currentSection, setCurrentSection] = useState(0)
  const [menqolAnswers, setMenqolAnswers] = useState({})
  const [currentDomain, setCurrentDomain] = useState(0)
  const [studyData, setStudyData] = useState({})  // { basics: {}, demographics: {}, ... }
  const [openTooltip, setOpenTooltip] = useState(null)
  const [openHelp, setOpenHelp] = useState(null)
  const topRef = useRef(null)

  const sections = version === "full" ? FULL_SECTIONS : QUICK_SECTIONS
  const section = sections[currentSection]

  const age = studyData.basics?.age ?? ""
  const weight = studyData.basics?.weight ?? ""

  const scrollTop = () => topRef.current?.scrollIntoView({ behavior: "smooth" })

  const reset = () => {
    setStep("intro"); setVersion(null); setCurrentSection(0)
    setMenqolAnswers({}); setStudyData({}); setCurrentDomain(0)
    setOpenTooltip(null); setOpenHelp(null)
    scrollTop()
  }

  // Get/set answers for the current section
  const getSectionAnswers = (sectionId) => studyData[sectionId] || {}
  const setSectionAnswer = (sectionId, key, value) => {
    setStudyData(prev => ({
      ...prev,
      [sectionId]: { ...prev[sectionId], [key]: value }
    }))
  }

  // Check if a generic section is "enough" to proceed (not all required, just has some answers)
  const canProceed = () => {
    if (!section) return false
    const sid = section.id

    if (sid === "menqol") {
      // All 29 answered
      return DOMAINS.every(d => d.items.every(item => {
        const a = menqolAnswers[item.id]
        if (!a) return false
        if (a.present === false) return true
        return a.present === true && a.rating != null
      }))
    }

    if (sid === "ipaqShort" || sid === "ipaqLong") {
      // IPAQ: at least the mandatory non-conditional questions answered
      const ipaqDef = sid === "ipaqShort" ? IPAQ_SHORT : IPAQ_LONG
      const allQ = ipaqDef.parts ? ipaqDef.parts.flatMap(p => p.questions) : ipaqDef.questions
      const ans = getSectionAnswers(sid)
      return allQ.filter(q => !q.condition).every(q => ans[q.id] != null)
    }

    if (sid === "results") return true

    // Generic section: at least required fields answered
    const ans = getSectionAnswers(sid)
    const visibleQ = section.questions.filter(q => isConditionMet(q, ans))
    const requiredQ = visibleQ.filter(q => q.required)
    if (requiredQ.length > 0) {
      return requiredQ.every(q => ans[q.id] != null && ans[q.id] !== "")
    }
    // If no required fields, need at least one answer
    return visibleQ.some(q => ans[q.id] != null)
  }

  const goNext = () => {
    if (currentSection < sections.length - 1) {
      setCurrentSection(p => p + 1)
      scrollTop()
    }
  }

  const goPrev = () => {
    if (currentSection > 0) {
      setCurrentSection(p => p - 1)
      scrollTop()
    }
  }

  // Fill random for demo
  const fillRandom = () => {
    const randMenqol = {}
    DOMAINS.forEach(d => d.items.forEach(item => {
      const present = Math.random() > 0.35
      randMenqol[item.id] = present
        ? { present: true, rating: Math.floor(Math.random() * 7) }  // 0-6
        : { present: false, rating: null }
    }))
    setMenqolAnswers(randMenqol)

    const randAge = Math.floor(Math.random() * 21) + 45
    const randWeight = Math.floor(Math.random() * 31) + 55
    const randHeight = Math.floor(Math.random() * 21) + 155

    const basics = { age: randAge, weight: randWeight, height: randHeight }
    const data = { basics }

    if (version === "full" || !version) {
      data.demographics = { maritalStatus: "married", education: "university", employment: "working", ethnicity: "caucasian" }
      data.habits = { smoking: "never", alcoholFreq: "monthly" }
      data.health = { hta: false, diabetes: false, depression: "no", osteoporosis: false }
      data.gynecology = {
        menarche: 12,
        lastPeriod: ["current", "3-6months", "6-12months", "1-5years", "5+years"][Math.floor(Math.random() * 5)],
        irregularCycles: ["regular", "variable", "skipping", "stopped"][Math.floor(Math.random() * 4)],
        pregnancies: Math.floor(Math.random() * 4),
        deliveries: Math.floor(Math.random() * 3),
        hysterectomy: false,
        oophorectomy: "no",
        thm: "never"
      }
      data.ipaqLong = {
        ipaq_l_workStatus: true,
        ipaq_l_workVigDays: Math.floor(Math.random() * 3),
        ipaq_l_workVigMinutes: Math.floor(Math.random() * 60) + 10,
        ipaq_l_workModDays: Math.floor(Math.random() * 4),
        ipaq_l_workModMinutes: Math.floor(Math.random() * 60) + 15,
        ipaq_l_workWalkDays: Math.floor(Math.random() * 5) + 1,
        ipaq_l_workWalkMinutes: Math.floor(Math.random() * 45) + 10,
        ipaq_l_transBikeDays: Math.floor(Math.random() * 3),
        ipaq_l_transBikeMinutes: Math.floor(Math.random() * 30) + 10,
        ipaq_l_transWalkDays: Math.floor(Math.random() * 5) + 1,
        ipaq_l_transWalkMinutes: Math.floor(Math.random() * 30) + 10,
        ipaq_l_homeVigDays: Math.floor(Math.random() * 2),
        ipaq_l_homeVigMinutes: Math.floor(Math.random() * 60) + 15,
        ipaq_l_homeModOutDays: Math.floor(Math.random() * 3),
        ipaq_l_homeModOutMinutes: Math.floor(Math.random() * 45) + 10,
        ipaq_l_homeModInDays: Math.floor(Math.random() * 4) + 1,
        ipaq_l_homeModInMinutes: Math.floor(Math.random() * 45) + 15,
        ipaq_l_leisWalkDays: Math.floor(Math.random() * 5) + 1,
        ipaq_l_leisWalkMinutes: Math.floor(Math.random() * 45) + 15,
        ipaq_l_leisVigDays: Math.floor(Math.random() * 3),
        ipaq_l_leisVigMinutes: Math.floor(Math.random() * 45) + 15,
        ipaq_l_leisModDays: Math.floor(Math.random() * 4),
        ipaq_l_leisModMinutes: Math.floor(Math.random() * 45) + 15,
        ipaq_l_sitWeekday: Math.floor(Math.random() * 300) + 180,
        ipaq_l_sitWeekend: Math.floor(Math.random() * 360) + 120,
      }
    } else {
      data.quickStage = {
        lastPeriod: ["current", "3-6months", "6-12months", "1-5years", "5+years"][Math.floor(Math.random() * 5)],
        irregularCycles: ["regular", "variable", "skipping", "stopped"][Math.floor(Math.random() * 4)],
        hysterectomy: false,
        oophorectomy: "no"
      }
      data.quickHealth = { thm: "never", depression: "no", hta: false, smoking: "never", physicalActivity: "moderate" }
      data.ipaqShort = {
        ipaq_s_vigDays: Math.floor(Math.random() * 4),
        ipaq_s_vigMinutes: Math.floor(Math.random() * 45) + 15,
        ipaq_s_modDays: Math.floor(Math.random() * 5) + 1,
        ipaq_s_modMinutes: Math.floor(Math.random() * 45) + 15,
        ipaq_s_walkDays: Math.floor(Math.random() * 5) + 2,
        ipaq_s_walkMinutes: Math.floor(Math.random() * 45) + 15,
        ipaq_s_sittingMinutes: Math.floor(Math.random() * 300) + 180,
      }
    }

    setStudyData(data)
    setStep("results")
    scrollTop()
  }

  // Help sheet for non-MENQOL questions
  const helpItem = openHelp
    ? (() => {
        // Find the question across all sections
        for (const sec of sections) {
          if (sec.questions) {
            const q = sec.questions.find(q => q.id === openHelp)
            if (q) return q
          }
        }
        // Check IPAQ
        const ipaqDef = version === "full" ? IPAQ_LONG : IPAQ_SHORT
        const allQ = ipaqDef.parts ? ipaqDef.parts.flatMap(p => p.questions) : ipaqDef.questions
        return allQ.find(q => q.id === openHelp) || null
      })()
    : null

  // Find the MENQOL item for the open tooltip
  const tooltipItem = openTooltip
    ? DOMAINS.flatMap(d => d.items).find(i => i.id === openTooltip)
    : null

  return (
    <div style={{ minHeight: "100vh" }}>
      <div ref={topRef} style={{ maxWidth: 480, margin: "0 auto", padding: "0 16px 100px" }}>

        {/* Header */}
        {step !== "dashboard" && (
          <div style={{ padding: "20px 0 16px", textAlign: "center" }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: "#1E293B", letterSpacing: "-0.3px" }}>
              Estudio Menopausia y Salud
            </h1>
            <p style={{ fontSize: 13, color: "#94A3B8", marginTop: 4 }}>
              Calidad de vida, actividad física y factores de salud
            </p>
          </div>
        )}

        {/* ── INTRO ── */}
        {step === "intro" && (
          <div className="fade-in">
            <div style={{
              background: "white", borderRadius: 20, padding: 24,
              border: "1.5px solid #F1F5F9", marginBottom: 16,
              boxShadow: "0 4px 20px rgba(0,0,0,0.04)"
            }}>
              <div style={{ fontSize: 48, textAlign: "center", marginBottom: 16 }}>🌸</div>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: "#1E293B", textAlign: "center", marginBottom: 12, lineHeight: 1.3 }}>
                Estudio integral sobre menopausia y salud
              </h2>
              <p style={{ fontSize: 14, color: "#64748B", lineHeight: 1.7, textAlign: "center", marginBottom: 20 }}>
                Estudio de investigación de la Universidad Politécnica de Madrid (UPM) en colaboración con Cuerpos Serranos.
                Evalúa tu calidad de vida, actividad física y factores de salud asociados a la menopausia.
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
                {[
                  { emoji: "🌸", label: "MENQOL", sub: "29 síntomas", bg: "#FFF1F2", color: "#E8927C" },
                  { emoji: "🏃‍♀️", label: "Actividad física", sub: "IPAQ", bg: "#F0FDF4", color: "#22C55E" },
                  { emoji: "🩺", label: "Salud y hábitos", sub: "Antecedentes", bg: "#EEF2FF", color: "#7C9CE8" },
                  { emoji: "👩‍⚕️", label: "Ginecología", sub: "Etapa reproductiva", bg: "#FDF4FF", color: "#9C7CE8" },
                ].map(d => (
                  <div key={d.label} style={{
                    background: d.bg, borderRadius: 12, padding: "12px 10px", textAlign: "center"
                  }}>
                    <span style={{ fontSize: 22 }}>{d.emoji}</span>
                    <p style={{ fontSize: 12, fontWeight: 600, color: d.color, marginTop: 4, lineHeight: 1.3 }}>{d.label}</p>
                    <p style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>{d.sub}</p>
                  </div>
                ))}
              </div>
              <div style={{ background: "#F8FAFC", borderRadius: 12, padding: 14 }}>
                <p style={{ fontSize: 13, color: "#64748B", lineHeight: 1.6 }}>
                  🌸 <strong>MENQOL</strong>: 29 preguntas sobre síntomas del último mes<br/>
                  🏃‍♀️ <strong>IPAQ</strong>: actividad física de los últimos 7 días<br/>
                  🩺 <strong>Salud</strong>: demografía, hábitos, antecedentes clínicos<br/>
                  🔒 Datos <strong>anónimos</strong> y protegidos (RGPD)
                </p>
              </div>
            </div>
            <button onClick={() => setStep("versionSelect")} style={{
              width: "100%", padding: 16, borderRadius: 14,
              background: "#1E293B", color: "white", border: "none",
              fontSize: 16, fontWeight: 700, cursor: "pointer",
              boxShadow: "0 4px 15px rgba(30,41,59,0.3)"
            }}>Comenzar</button>
            <button onClick={() => setStep("dashboard")} style={{
              width: "100%", padding: 14, borderRadius: 14, marginTop: 10,
              background: "white", color: "#94A3B8", border: "1.5px solid #E2E8F0",
              fontSize: 13, fontWeight: 600, cursor: "pointer"
            }}>Dashboard investigación</button>
            <button onClick={() => setStep("about")} style={{
              width: "100%", padding: 12, marginTop: 14,
              background: "none", color: "#94A3B8", border: "none",
              fontSize: 13, fontWeight: 500, cursor: "pointer",
              textDecoration: "underline", textUnderlineOffset: 3
            }}>Cómo funciona esta app</button>
            <button onClick={() => setStep("privacy")} style={{
              width: "100%", padding: 8, marginTop: 4,
              background: "none", color: "#94A3B8", border: "none",
              fontSize: 12, fontWeight: 500, cursor: "pointer",
              textDecoration: "underline", textUnderlineOffset: 3
            }}>Política de privacidad</button>
          </div>
        )}

        {/* ── VERSION SELECT ── */}
        {step === "versionSelect" && (
          <div className="fade-in">
            <div style={{
              background: "white", borderRadius: 20, padding: 24,
              border: "1.5px solid #F1F5F9", marginBottom: 16,
              boxShadow: "0 4px 20px rgba(0,0,0,0.04)"
            }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: "#1E293B", marginBottom: 4, textAlign: "center" }}>
                Elige tu versión
              </h2>
              <p style={{ fontSize: 13, color: "#94A3B8", textAlign: "center", marginBottom: 20 }}>
                Ambas versiones incluyen el cuestionario MENQOL completo (29 preguntas)
              </p>

              {/* Full version */}
              <button onClick={() => { setVersion("full"); setStep("sections"); setCurrentSection(0); scrollTop() }} style={{
                width: "100%", padding: 20, borderRadius: 16, marginBottom: 12,
                background: "#EEF2FF", border: "2px solid #7C9CE840",
                cursor: "pointer", textAlign: "left"
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <span style={{ fontSize: 24 }}>📋</span>
                  <span style={{ fontSize: 16, fontWeight: 700, color: "#1E293B" }}>Versión completa del estudio</span>
                </div>
                <p style={{ fontSize: 13, color: "#64748B", lineHeight: 1.5, marginBottom: 8 }}>
                  Incluye datos sociodemográficos, hábitos, antecedentes de salud, historia ginecológica, MENQOL y IPAQ largo.
                </p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 11, background: "#7C9CE820", color: "#7C9CE8", padding: "2px 8px", borderRadius: 6, fontWeight: 600 }}>~20-25 min</span>
                  <span style={{ fontSize: 11, background: "#7C9CE820", color: "#7C9CE8", padding: "2px 8px", borderRadius: 6, fontWeight: 600 }}>8 secciones</span>
                  <span style={{ fontSize: 11, background: "#7C9CE820", color: "#7C9CE8", padding: "2px 8px", borderRadius: 6, fontWeight: 600 }}>IPAQ largo (27 preg.)</span>
                </div>
              </button>

              {/* Quick version */}
              <button onClick={() => { setVersion("quick"); setStep("sections"); setCurrentSection(0); scrollTop() }} style={{
                width: "100%", padding: 20, borderRadius: 16,
                background: "#F0FDF4", border: "2px solid #22C55E40",
                cursor: "pointer", textAlign: "left"
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <span style={{ fontSize: 24 }}>⚡</span>
                  <span style={{ fontSize: 16, fontWeight: 700, color: "#1E293B" }}>Versión rápida</span>
                </div>
                <p style={{ fontSize: 13, color: "#64748B", lineHeight: 1.5, marginBottom: 8 }}>
                  Incluye datos básicos, etapa reproductiva, salud clave, MENQOL completo e IPAQ corto.
                </p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 11, background: "#22C55E20", color: "#22C55E", padding: "2px 8px", borderRadius: 6, fontWeight: 600 }}>~10 min</span>
                  <span style={{ fontSize: 11, background: "#22C55E20", color: "#22C55E", padding: "2px 8px", borderRadius: 6, fontWeight: 600 }}>6 secciones</span>
                  <span style={{ fontSize: 11, background: "#22C55E20", color: "#22C55E", padding: "2px 8px", borderRadius: 6, fontWeight: 600 }}>IPAQ corto (7 preg.)</span>
                </div>
              </button>
            </div>

            <button onClick={() => setStep("intro")} style={{
              width: "100%", padding: 14, borderRadius: 14,
              background: "white", color: "#64748B", border: "1.5px solid #E2E8F0",
              fontSize: 14, fontWeight: 600, cursor: "pointer"
            }}>Volver</button>

            {/* Demo button */}
            <button onClick={() => { setVersion("quick"); fillRandom() }} style={{
              width: "100%", padding: 14, borderRadius: 14, marginTop: 10,
              background: "white", color: "#94A3B8", border: "1.5px solid #E2E8F0",
              fontSize: 13, fontWeight: 600, cursor: "pointer"
            }}>Rellenar aleatorio rápido (demo)</button>
            <button onClick={() => { setVersion("full"); fillRandom() }} style={{
              width: "100%", padding: 14, borderRadius: 14, marginTop: 8,
              background: "white", color: "#94A3B8", border: "1.5px solid #E2E8F0",
              fontSize: 13, fontWeight: 600, cursor: "pointer"
            }}>Rellenar aleatorio completo (demo)</button>
          </div>
        )}

        {/* ── SECTIONS ── */}
        {step === "sections" && section && (
          <>
            {/* Section stepper */}
            <SectionStepper sections={sections} currentIndex={currentSection} />

            {/* Time estimate */}
            <div className="no-print" style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
              <TimeEstimate sections={sections} currentIndex={currentSection} />
            </div>

            {/* Render current section */}
            {section.id === "menqol" ? (
              <MenqolSectionView
                currentDomain={currentDomain}
                setCurrentDomain={setCurrentDomain}
                answers={menqolAnswers}
                onAnswer={(id, val) => setMenqolAnswers(prev => ({ ...prev, [id]: val }))}
                openTooltip={openTooltip}
                setOpenTooltip={setOpenTooltip}
                scrollTop={scrollTop}
                onComplete={goNext}
              />
            ) : section.id === "ipaqShort" || section.id === "ipaqLong" ? (
              <IpaqSectionView
                ipaqDef={section.id === "ipaqShort" ? IPAQ_SHORT : IPAQ_LONG}
                answers={getSectionAnswers(section.id)}
                onAnswer={(key, val) => setSectionAnswer(section.id, key, val)}
                openHelp={openHelp}
                setOpenHelp={setOpenHelp}
              />
            ) : section.id === "results" ? (
              <ResultsView
                menqolAnswers={menqolAnswers}
                studyData={studyData}
                version={version}
                age={age}
                weight={weight}
                onReset={reset}
                onOpenPrivacy={() => setStep("privacy")}
              />
            ) : (
              <GenericSectionView
                section={section}
                answers={getSectionAnswers(section.id)}
                onAnswer={(key, val) => setSectionAnswer(section.id, key, val)}
                openHelp={openHelp}
                setOpenHelp={setOpenHelp}
              />
            )}

            {/* Navigation buttons (not for MENQOL or results — MENQOL handles its own nav) */}
            {section.id !== "results" && section.id !== "menqol" && (
              <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                {currentSection > 0 && (
                  <button onClick={goPrev} style={{
                    flex: 1, padding: 14, borderRadius: 14,
                    background: "white", color: "#64748B", border: "1.5px solid #E2E8F0",
                    fontSize: 15, fontWeight: 600, cursor: "pointer"
                  }}>Anterior</button>
                )}
                <button
                  onClick={goNext}
                  disabled={!canProceed()}
                  style={{
                    flex: 2, padding: 14, borderRadius: 14,
                    background: canProceed() ? "#1E293B" : "#CBD5E1",
                    color: "white", border: "none", fontSize: 15, fontWeight: 700,
                    cursor: canProceed() ? "pointer" : "not-allowed",
                    boxShadow: canProceed() ? "0 4px 15px rgba(30,41,59,0.3)" : "none",
                    transition: "all 0.2s"
                  }}
                >{currentSection < sections.length - 2 ? "Siguiente" : "Ver resultados"}</button>
              </div>
            )}

          </>
        )}

        {/* ── RESULTS (standalone, if reached via fillRandom without going through sections) ── */}
        {step === "results" && (
          <ResultsView
            menqolAnswers={menqolAnswers}
            studyData={studyData}
            version={version || "quick"}
            age={age}
            weight={weight}
            onReset={reset}
            onOpenPrivacy={() => setStep("privacy")}
          />
        )}
      </div>

      {/* ── DASHBOARD (full-width) ── */}
      {step === "dashboard" && (
        <Dashboard onBack={() => setStep("intro")} />
      )}

      {/* ── PRIVACY POLICY ── */}
      {step === "privacy" && (
        <PrivacyPolicy onBack={() => { setStep("intro"); scrollTop() }} />
      )}

      {/* ── ABOUT PAGE ── */}
      {step === "about" && (
        <AboutPage onBack={() => { setStep("intro"); scrollTop() }} onOpenPrivacy={() => setStep("privacy")} />
      )}

      {/* Tooltip bottom sheets */}
      {tooltipItem && <InfoSheet item={tooltipItem} onClose={() => setOpenTooltip(null)} />}
      {helpItem && <HelpSheet title={helpItem.label} text={helpItem.help} onClose={() => setOpenHelp(null)} />}
    </div>
  )
}
