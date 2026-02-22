import { useState, useRef } from 'react'
import { DOMAINS } from './data.js'
import { supabase } from './supabase.js'
import Dashboard from './Dashboard.jsx'
import AboutPage from './AboutPage.jsx'
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

// MCID (Minimum Clinically Important Difference) = 0.9 on MENQOL 1-8 scale
const MCID = 0.9

/* ─── Info Bottom Sheet ─── */
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
            { range: "2–4", color: "#22C55E", text: item.scale.low },
            { range: "5–6", color: "#F59E0B", text: item.scale.mid },
            { range: "7–8", color: "#EF4444", text: item.scale.high },
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

/* ─── Scale Selector (MENQOL 2-8) ─── */
function ScaleSelector({ value, onChange, color }) {
  return (
    <div style={{ marginTop: 10 }} className="fade-in">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 5 }}>
        {[2,3,4,5,6,7,8].map(n => {
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
        <span>Extremadamente</span>
      </div>
    </div>
  )
}

/* ─── Single Question Item ─── */
function QuestionItem({ item, domain, answer, onAnswer, openTooltip, setOpenTooltip }) {
  const isYes = answer?.present === true
  const needsRating = isYes && !answer?.rating

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
              rating: val ? (answer?.rating || null) : null
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

      {isYes && <ScaleSelector value={answer?.rating} onChange={r => onAnswer(item.id, { present: true, rating: r })} color={domain.color} />}
      {needsRating && (
        <p style={{ fontSize: 12, color: domain.color, marginTop: 8, fontWeight: 500 }}>
          ⬆ Indica cuánto te molesta (2-8)
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
  const startAngle = -Math.PI / 2 // top

  const point = (i, pct) => {
    const a = startAngle + i * angleStep
    return [cx + r * (pct / 100) * Math.cos(a), cy + r * (pct / 100) * Math.sin(a)]
  }

  const makePath = (pts) => pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0]},${p[1]}`).join(" ") + " Z"

  const gridLevels = [20, 40, 60, 80, 100]

  const dataPoints = domainResults.map((d, i) => point(i, d.pct))
  const refPoints = refPcts ? refPcts.map((p, i) => point(i, p)) : null

  // Label positions pushed further out
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
        {/* Grid polygons */}
        {gridLevels.map(level => {
          const pts = Array.from({ length: n }, (_, i) => point(i, level))
          return <path key={level} d={makePath(pts)} fill="none" stroke="#E2E8F0" strokeWidth={level === 100 ? 1.5 : 0.8} />
        })}

        {/* Axis lines */}
        {domainResults.map((_, i) => {
          const [ex, ey] = point(i, 100)
          return <line key={i} x1={cx} y1={cy} x2={ex} y2={ey} stroke="#E2E8F0" strokeWidth={0.8} />
        })}

        {/* Reference polygon (dashed, behind) */}
        {refPoints && (
          <path d={makePath(refPoints)} fill="rgba(148, 163, 184, 0.10)" stroke="#94A3B8" strokeWidth={1.8}
            strokeDasharray="6 4" strokeLinejoin="round" />
        )}

        {/* Reference dots */}
        {refPoints && refPoints.map((p, i) => (
          <circle key={`ref-${i}`} cx={p[0]} cy={p[1]} r={3} fill="#94A3B8" stroke="white" strokeWidth={1.5} />
        ))}

        {/* Data polygon */}
        <path d={makePath(dataPoints)} fill="rgba(124, 156, 232, 0.18)" stroke="#7C9CE8" strokeWidth={2.5} strokeLinejoin="round" />

        {/* Data dots */}
        {dataPoints.map((p, i) => (
          <circle key={i} cx={p[0]} cy={p[1]} r={4.5} fill={domainResults[i].domain.color} stroke="white" strokeWidth={2} />
        ))}

        {/* Labels */}
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

      {/* Legend */}
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
function ResultsView({ answers, age, weight, onReset }) {
  const [saveStatus, setSaveStatus] = useState(null) // null | "saving" | "saved" | "error"

  const handleSave = async (domainResults, overallMean) => {
    setSaveStatus("saving")
    try {
      const { error } = await supabase.from("responses").insert({
        age: age ? parseInt(age) : null,
        weight: weight ? parseFloat(weight) : null,
        answers,
        score_vasomotor: domainResults[0].mean,
        score_psychosocial: domainResults[1].mean,
        score_physical: domainResults[2].mean,
        score_sexual: domainResults[3].mean,
        score_global: overallMean,
      })
      if (error) throw error
      setSaveStatus("saved")
    } catch (e) {
      console.error("Error saving:", e)
      setSaveStatus("error")
    }
  }

  const domainResults = DOMAINS.map(domain => {
    let scoreSum = 0, yesCount = 0
    domain.items.forEach(item => {
      const a = answers[item.id]
      if (a?.present && a?.rating) { scoreSum += a.rating; yesCount++ }
      else { scoreSum += 1 } // "No" = 1 en escala MENQOL
    })
    const mean = scoreSum / domain.items.length // 1-8
    const pct = Math.round(menqolToPct(mean))   // 0-100%
    return { domain, mean, yesCount, pct, count: domain.items.length, scoreSum }
  })

  const overallSum = domainResults.reduce((s, d) => s + d.scoreSum, 0)
  const overallMean = overallSum / 29 // 1-8
  const overallPct = Math.round(menqolToPct(overallMean))
  const overall = getLevel(overallPct)

  // Reference data
  const ageGroup = getAgeGroup(age)
  const ref = REFERENCE[ageGroup]
  const ageUnder50 = age && parseInt(age) < 50

  // Domain order matches DOMAINS: vasomotor, psychosocial, physical, sexual
  const domainKeys = ["vasomotor", "psychosocial", "physical", "sexual"]
  const refPcts = domainKeys.map(k => menqolToPct(ref[k]))
  const refGlobalPct = menqolToPct(ref.global)

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
        </p>
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
            Tu edad est&aacute; fuera del rango del estudio de referencia (50-65+). Se usa el grupo 50-54 como aproximaci&oacute;n.
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
              {/* Dual bar on 1-8 scale */}
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
              {/* Dual bar on 1-8 scale */}
              <div style={{ position: "relative", height: 6, background: "#F1F5F9", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ position: "absolute", height: "100%", width: `${d.pct}%`, background: d.domain.color, borderRadius: 3, opacity: 0.6 }} />
                <div style={{ position: "absolute", height: "100%", width: 2, left: `${menqolToPct(refMean)}%`, background: "#475569", borderRadius: 1 }} />
              </div>
            </div>
          )
        })}

        {/* Footnote */}
        <div style={{ marginTop: 14, background: "#F8FAFC", borderRadius: 10, padding: 12 }}>
          <p style={{ fontSize: 11, color: "#94A3B8", lineHeight: 1.6 }}>
            Referencia: Minnesota Green Tea Trial (n=932 mujeres postmenopáusicas, EE.UU.).
            Escala MENQOL original 1-8 (1 = sin síntoma, 8 = extremadamente molesto).
            * Diferencia clínicamente significativa (MCID ≥ 0.9 puntos).
            Mayor puntuación = mayor impacto de síntomas.
          </p>
        </div>
      </div>

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
              const a = answers[item.id]
              const present = a?.present
              const rating = a?.rating
              return (
                <div key={item.id} style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "5px 0", borderBottom: "1px solid #F8FAFC"
                }}>
                  <span style={{ fontSize: 13, color: "#475569", flex: 1 }}>{item.label}</span>
                  {present === false && (
                    <span style={{ fontSize: 12, color: "#94A3B8", fontWeight: 500 }}>No</span>
                  )}
                  {present && rating && (
                    <span style={{
                      fontSize: 12, fontWeight: 700,
                      color: rating <= 4 ? "#22C55E" : rating <= 6 ? "#F59E0B" : "#EF4444",
                      background: rating <= 4 ? "#F0FDF4" : rating <= 6 ? "#FFFBEB" : "#FEF2F2",
                      padding: "2px 8px", borderRadius: 6
                    }}>{rating}/8</span>
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

      {/* Actions */}
      <div className="no-print" style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
        <button
          onClick={() => handleSave(domainResults, overallMean)}
          disabled={saveStatus === "saving" || saveStatus === "saved"}
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
           saveStatus === "saved" ? "Guardado" :
           saveStatus === "error" ? "Error — Reintentar" :
           "Guardar resultados"}
        </button>
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

/* ─── Main App ─── */
export default function App() {
  const [step, setStep] = useState("intro")
  const [age, setAge] = useState("")
  const [weight, setWeight] = useState("")
  const [currentDomain, setCurrentDomain] = useState(0)
  const [answers, setAnswers] = useState({})
  const [openTooltip, setOpenTooltip] = useState(null)
  const topRef = useRef(null)

  const domain = DOMAINS[currentDomain]

  const handleAnswer = (id, val) => setAnswers(prev => ({ ...prev, [id]: val }))

  const isDomainComplete = () => {
    if (!domain) return false
    return domain.items.every(item => {
      const a = answers[item.id]
      if (!a) return false
      if (a.present === false) return true
      return a.present === true && a.rating
    })
  }

  const totalAnswered = Object.values(answers).filter(a =>
    a && (a.present === false || (a.present === true && a.rating))
  ).length

  const scrollTop = () => topRef.current?.scrollIntoView({ behavior: "smooth" })

  const reset = () => {
    setStep("intro"); setAnswers({}); setAge(""); setWeight("")
    setCurrentDomain(0); scrollTop()
  }

  const fillRandom = () => {
    const rand = {}
    DOMAINS.forEach(d => d.items.forEach(item => {
      const present = Math.random() > 0.35
      rand[item.id] = present
        ? { present: true, rating: Math.floor(Math.random() * 7) + 2 }
        : { present: false, rating: null }
    }))
    setAnswers(rand)
    setAge(String(Math.floor(Math.random() * 21) + 45))   // 45-65
    setWeight(String(Math.floor(Math.random() * 31) + 55)) // 55-85 kg
    setStep("results")
    scrollTop()
  }

  // Find the item for the open tooltip
  const tooltipItem = openTooltip
    ? DOMAINS.flatMap(d => d.items).find(i => i.id === openTooltip)
    : null

  return (
    <div style={{ minHeight: "100vh" }}>
      <div ref={topRef} style={{ maxWidth: 480, margin: "0 auto", padding: "0 16px 100px" }}>

        {/* Header */}
        <div style={{ padding: "20px 0 16px", textAlign: "center" }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#1E293B", letterSpacing: "-0.3px" }}>
            Cuestionario MENQOL
          </h1>
          <p style={{ fontSize: 13, color: "#94A3B8", marginTop: 4 }}>
            Calidad de vida en la menopausia
          </p>
        </div>

        {/* Progress bar (questions step) */}
        {step === "questions" && (
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
                Evalúa tu calidad de vida durante la menopausia
              </h2>
              <p style={{ fontSize: 14, color: "#64748B", lineHeight: 1.7, textAlign: "center", marginBottom: 20 }}>
                Este cuestionario basado en el MENQOL te ayudará a identificar cómo los síntomas
                de la menopausia afectan tu día a día en cuatro áreas clave.
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
                {DOMAINS.map(d => (
                  <div key={d.id} style={{
                    background: d.colorLight, borderRadius: 12, padding: "12px 10px", textAlign: "center"
                  }}>
                    <span style={{ fontSize: 22 }}>{d.emoji}</span>
                    <p style={{ fontSize: 12, fontWeight: 600, color: d.color, marginTop: 4, lineHeight: 1.3 }}>{d.name}</p>
                    <p style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>{d.items.length} ítems</p>
                  </div>
                ))}
              </div>
              <div style={{ background: "#F8FAFC", borderRadius: 12, padding: 14 }}>
                <p style={{ fontSize: 13, color: "#64748B", lineHeight: 1.6 }}>
                  ⏱ Duración estimada: <strong>5–8 minutos</strong><br/>
                  📋 29 preguntas sobre el <strong>último mes</strong><br/>
                  ❓ Pulsa <strong style={{
                    display: "inline-flex", width: 18, height: 18, borderRadius: "50%",
                    border: "1.5px solid #CBD5E1", alignItems: "center", justifyContent: "center",
                    fontSize: 11, color: "#64748B", verticalAlign: "middle", margin: "0 2px"
                  }}>?</strong> en cada pregunta para más detalle
                </p>
              </div>
            </div>
            <button onClick={() => setStep("profile")} style={{
              width: "100%", padding: 16, borderRadius: 14,
              background: "#1E293B", color: "white", border: "none",
              fontSize: 16, fontWeight: 700, cursor: "pointer",
              boxShadow: "0 4px 15px rgba(30,41,59,0.3)"
            }}>Comenzar</button>
            <button onClick={fillRandom} style={{
              width: "100%", padding: 14, borderRadius: 14, marginTop: 10,
              background: "white", color: "#94A3B8", border: "1.5px solid #E2E8F0",
              fontSize: 13, fontWeight: 600, cursor: "pointer"
            }}>🎲 Rellenar aleatorio (demo)</button>
            <button onClick={() => setStep("dashboard")} style={{
              width: "100%", padding: 14, borderRadius: 14, marginTop: 10,
              background: "white", color: "#94A3B8", border: "1.5px solid #E2E8F0",
              fontSize: 13, fontWeight: 600, cursor: "pointer"
            }}>📊 Dashboard investigación</button>
            <button onClick={() => setStep("about")} style={{
              width: "100%", padding: 12, marginTop: 14,
              background: "none", color: "#94A3B8", border: "none",
              fontSize: 13, fontWeight: 500, cursor: "pointer",
              textDecoration: "underline", textUnderlineOffset: 3
            }}>ℹ️ Cómo funciona esta app</button>
          </div>
        )}

        {/* ── PROFILE ── */}
        {step === "profile" && (
          <div className="fade-in">
            <div style={{
              background: "white", borderRadius: 20, padding: 24,
              border: "1.5px solid #F1F5F9", marginBottom: 16,
              boxShadow: "0 4px 20px rgba(0,0,0,0.04)"
            }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: "#1E293B", marginBottom: 4 }}>Datos básicos</h2>
              <p style={{ fontSize: 13, color: "#94A3B8", marginBottom: 20 }}>
                Información opcional para contextualizar tus resultados
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {[
                  { label: "Edad (años)", value: age, set: setAge, ph: "Ej: 52" },
                  { label: "Peso (kg)", value: weight, set: setWeight, ph: "Ej: 65" }
                ].map(f => (
                  <div key={f.label}>
                    <label style={{ fontSize: 13, fontWeight: 600, color: "#475569", display: "block", marginBottom: 6 }}>{f.label}</label>
                    <input type="number" value={f.value} onChange={e => f.set(e.target.value)} placeholder={f.ph} style={{
                      width: "100%", padding: "12px 16px", borderRadius: 12,
                      border: "1.5px solid #E2E8F0", fontSize: 16, color: "#1E293B",
                      outline: "none", background: "#FAFBFE"
                    }} />
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setStep("intro")} style={{
                flex: 1, padding: 16, borderRadius: 14,
                background: "white", color: "#64748B", border: "1.5px solid #E2E8F0",
                fontSize: 15, fontWeight: 600, cursor: "pointer"
              }}>Atrás</button>
              <button onClick={() => { setStep("questions"); setCurrentDomain(0) }} style={{
                flex: 2, padding: 16, borderRadius: 14,
                background: "#1E293B", color: "white", border: "none",
                fontSize: 15, fontWeight: 700, cursor: "pointer",
                boxShadow: "0 4px 15px rgba(30,41,59,0.3)"
              }}>Continuar</button>
            </div>
          </div>
        )}

        {/* ── QUESTIONS ── */}
        {step === "questions" && domain && (
          <div className="fade-in">
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
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
              {domain.items.map(item => (
                <QuestionItem
                  key={item.id} item={item} domain={domain}
                  answer={answers[item.id]} onAnswer={handleAnswer}
                  openTooltip={openTooltip} setOpenTooltip={setOpenTooltip}
                />
              ))}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              {currentDomain > 0 && (
                <button onClick={() => { setCurrentDomain(p => p - 1); scrollTop() }} style={{
                  flex: 1, padding: 14, borderRadius: 14,
                  background: "white", color: "#64748B", border: "1.5px solid #E2E8F0",
                  fontSize: 15, fontWeight: 600, cursor: "pointer"
                }}>← Anterior</button>
              )}
              <button
                onClick={() => {
                  if (currentDomain < DOMAINS.length - 1) setCurrentDomain(p => p + 1)
                  else setStep("results")
                  scrollTop()
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
              >{currentDomain < DOMAINS.length - 1 ? "Siguiente →" : "Ver resultados"}</button>
            </div>
          </div>
        )}

        {/* ── RESULTS ── */}
        {step === "results" && (
          <ResultsView answers={answers} age={age} weight={weight} onReset={reset} />
        )}
      </div>

      {/* ── DASHBOARD (full-width, outside container) ── */}
      {step === "dashboard" && (
        <Dashboard onBack={() => setStep("intro")} />
      )}

      {/* ── ABOUT PAGE ── */}
      {step === "about" && (
        <AboutPage onBack={() => { setStep("intro"); scrollTop() }} />
      )}

      {/* Tooltip bottom sheet (portal-like) */}
      {tooltipItem && <InfoSheet item={tooltipItem} onClose={() => setOpenTooltip(null)} />}
    </div>
  )
}
