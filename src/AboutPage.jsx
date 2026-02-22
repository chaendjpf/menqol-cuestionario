/* ─── About Page: "Cómo funciona" para público no técnico ─── */

const SECTION_CARD = {
  background: "white", borderRadius: 16, padding: 20,
  border: "1.5px solid #F1F5F9", marginBottom: 14,
  boxShadow: "0 2px 10px rgba(0,0,0,0.03)"
}

const SECTION_TITLE = {
  fontSize: 17, fontWeight: 700, color: "#1E293B", marginBottom: 10, lineHeight: 1.3
}

const BODY_TEXT = {
  fontSize: 14, color: "#64748B", lineHeight: 1.7
}

const DIAGRAM_BOX = {
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  background: "#F8FAFC", border: "1.5px solid #E2E8F0", borderRadius: 10,
  padding: "8px 14px", fontSize: 13, fontWeight: 600, color: "#475569",
  textAlign: "center", lineHeight: 1.3
}

const ARROW_STYLE = {
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  fontSize: 18, color: "#94A3B8", padding: "0 6px", flexShrink: 0
}

const BADGE = {
  display: "inline-block", background: "#F0F9FF", color: "#0369A1",
  borderRadius: 8, padding: "3px 10px", fontSize: 12, fontWeight: 600
}

function FlowDiagram({ items }) {
  return (
    <div style={{
      display: "flex", flexWrap: "wrap", alignItems: "center",
      justifyContent: "center", gap: 4, marginTop: 12, marginBottom: 8
    }}>
      {items.map((item, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div style={DIAGRAM_BOX}>{item}</div>
          {i < items.length - 1 && <span style={ARROW_STYLE}>→</span>}
        </div>
      ))}
    </div>
  )
}

function ProtectionItem({ emoji, text }) {
  return (
    <div style={{
      display: "flex", gap: 10, alignItems: "flex-start",
      padding: "8px 0", borderBottom: "1px solid #F8FAFC"
    }}>
      <span style={{ fontSize: 18, flexShrink: 0, lineHeight: 1.4 }}>{emoji}</span>
      <span style={{ ...BODY_TEXT, fontSize: 13 }}>{text}</span>
    </div>
  )
}

export default function AboutPage({ onBack }) {
  return (
    <div className="fade-in" style={{ maxWidth: 560, margin: "0 auto", padding: "0 16px 60px" }}>

      {/* Back button */}
      <button onClick={onBack} className="no-print" style={{
        background: "none", border: "none", color: "#64748B",
        fontSize: 14, fontWeight: 600, cursor: "pointer",
        padding: "16px 0 12px", display: "flex", alignItems: "center", gap: 6
      }}>
        ← Volver al inicio
      </button>

      {/* Page title */}
      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: "#1E293B", letterSpacing: "-0.3px" }}>
          Cómo funciona
        </h2>
        <p style={{ fontSize: 13, color: "#94A3B8", marginTop: 4 }}>
          Explicación para profesionales, participantes y revisores
        </p>
      </div>

      {/* 1. ¿Qué es esto? */}
      <div style={SECTION_CARD}>
        <p style={{ fontSize: 28, marginBottom: 6 }}>🔬</p>
        <h3 style={SECTION_TITLE}>¿Qué es esto?</h3>
        <p style={BODY_TEXT}>
          Es la versión digital del cuestionario <strong>MENQOL</strong> (Menopause-Specific Quality of Life),
          un instrumento <strong>validado científicamente</strong> para medir cómo los síntomas
          de la menopausia afectan la calidad de vida.
        </p>
        <div style={{
          display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14
        }}>
          <span style={BADGE}>29 preguntas</span>
          <span style={BADGE}>4 dominios</span>
          <span style={BADGE}>Escala 1–8</span>
        </div>
        <p style={{ ...BODY_TEXT, fontSize: 12, marginTop: 10 }}>
          Dominios: vasomotor, psicosocial, físico y sexual.
          La puntuación 1 = sin síntoma, 8 = extremadamente molesto.
        </p>
      </div>

      {/* 2. ¿Cómo se creó? */}
      <div style={SECTION_CARD}>
        <p style={{ fontSize: 28, marginBottom: 6 }}>🤖</p>
        <h3 style={SECTION_TITLE}>¿Cómo se creó?</h3>
        <p style={BODY_TEXT}>
          La aplicación fue desarrollada con asistencia de inteligencia artificial,
          siguiendo un proceso supervisado por el investigador:
        </p>
        <FlowDiagram items={[
          "👨‍🔬\nInvestigador",
          "🤖\nClaude (IA)",
          "🔍\nRevisión",
          "✅\nApp web"
        ]} />
        <div style={{
          background: "#F8FAFC", borderRadius: 10, padding: 12, marginTop: 10
        }}>
          <p style={{ fontSize: 12, color: "#64748B", lineHeight: 1.6 }}>
            <strong>Claude</strong> es un modelo de IA de Anthropic que generó el código fuente.
            El investigador revisó, ajustó y validó cada parte.
            El código es <strong>abierto y auditable</strong> en GitHub.
          </p>
        </div>
      </div>

      {/* 3. ¿Dónde vive la app? */}
      <div style={SECTION_CARD}>
        <p style={{ fontSize: 28, marginBottom: 6 }}>🌐</p>
        <h3 style={SECTION_TITLE}>¿Dónde vive la app?</h3>
        <p style={BODY_TEXT}>
          La aplicación se aloja en <strong>GitHub Pages</strong>, un servicio gratuito
          de páginas web estáticas. Cuando abres el enlace:
        </p>
        <FlowDiagram items={[
          "🔗\nEnlace",
          "📥\nDescarga",
          "📱\nTu navegador"
        ]} />
        <p style={{ ...BODY_TEXT, fontSize: 13, marginTop: 8 }}>
          Tu navegador descarga la app completa y la ejecuta <strong>localmente</strong>.
          No hay un servidor intermediario procesando la interfaz — todo funciona en tu dispositivo.
        </p>
        <div style={{
          display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14
        }}>
          <span style={{ ...BADGE, background: "#F0FDF4", color: "#15803D" }}>React (interfaz)</span>
          <span style={{ ...BADGE, background: "#FFF7ED", color: "#C2410C" }}>Vite (empaquetado)</span>
          <span style={{ ...BADGE, background: "#FAF5FF", color: "#7E22CE" }}>Mobile-first</span>
        </div>
      </div>

      {/* 4. ¿Dónde se guardan los datos? */}
      <div style={SECTION_CARD}>
        <p style={{ fontSize: 28, marginBottom: 6 }}>🗄️</p>
        <h3 style={SECTION_TITLE}>¿Dónde se guardan los datos?</h3>
        <p style={BODY_TEXT}>
          Los resultados se envían a una base de datos segura en la nube:
        </p>

        {/* Simple architecture diagram */}
        <div style={{
          background: "#F8FAFC", borderRadius: 12, padding: 16, marginTop: 14
        }}>
          <svg viewBox="0 0 360 80" style={{ width: "100%", display: "block" }}>
            {/* Browser */}
            <rect x="10" y="20" width="90" height="40" rx="8" fill="#EFF6FF" stroke="#93C5FD" strokeWidth="1.5" />
            <text x="55" y="37" textAnchor="middle" fontSize="14">📱</text>
            <text x="55" y="52" textAnchor="middle" fontSize="9" fill="#475569" fontWeight="600">Navegador</text>

            {/* Arrow with HTTPS */}
            <line x1="105" y1="40" x2="170" y2="40" stroke="#94A3B8" strokeWidth="1.5" markerEnd="url(#arrow)" />
            <text x="138" y="32" textAnchor="middle" fontSize="8" fill="#22C55E" fontWeight="700">HTTPS 🔒</text>

            {/* Supabase */}
            <rect x="175" y="12" width="170" height="56" rx="8" fill="#F0FDF4" stroke="#86EFAC" strokeWidth="1.5" />
            <text x="260" y="32" textAnchor="middle" fontSize="10" fill="#15803D" fontWeight="700">Supabase</text>
            <text x="260" y="46" textAnchor="middle" fontSize="9" fill="#64748B">PostgreSQL</text>
            <text x="260" y="59" textAnchor="middle" fontSize="8" fill="#94A3B8">Región UE 🇪🇺</text>

            {/* Arrow marker */}
            <defs>
              <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-auto">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#94A3B8" />
              </marker>
            </defs>
          </svg>
        </div>

        <p style={{ ...BODY_TEXT, fontSize: 13, marginTop: 10 }}>
          Desde la app solo se pueden <strong>enviar</strong> datos (escribir).
          No es posible leer datos de otros participantes.
          La lectura está restringida a <strong>investigadores autenticados</strong>.
        </p>
      </div>

      {/* 5. ¿Cómo se protegen los datos? */}
      <div style={SECTION_CARD}>
        <p style={{ fontSize: 28, marginBottom: 6 }}>🔒</p>
        <h3 style={SECTION_TITLE}>¿Cómo se protegen los datos?</h3>
        <p style={{ ...BODY_TEXT, marginBottom: 10 }}>
          Se aplican múltiples capas de protección:
        </p>
        <div style={{
          background: "#F8FAFC", borderRadius: 12, padding: "4px 14px"
        }}>
          <ProtectionItem emoji="🔐" text="Conexión cifrada (HTTPS) — los datos viajan encriptados entre tu dispositivo y el servidor" />
          <ProtectionItem emoji="🇪🇺" text="Base de datos ubicada en la Unión Europea, sujeta a normativa RGPD" />
          <ProtectionItem emoji="👤" text="Sin datos identificativos — solo se recogen edad, peso y respuestas al cuestionario" />
          <ProtectionItem emoji="🔑" text="Acceso de lectura solo con credenciales de investigador (email + contraseña)" />
          <ProtectionItem emoji="🛡️" text="Row Level Security (RLS) — la app solo puede enviar datos, nunca leer los de otros" />
        </div>
      </div>

      {/* 6. ¿Cómo se analizan? */}
      <div style={SECTION_CARD}>
        <p style={{ fontSize: 28, marginBottom: 6 }}>📊</p>
        <h3 style={SECTION_TITLE}>¿Cómo se analizan?</h3>
        <p style={BODY_TEXT}>
          Los investigadores acceden a un panel protegido con login para analizar los datos:
        </p>
        <FlowDiagram items={[
          "🔑\nLogin",
          "🔍\nFiltros",
          "📈\nGráficos",
          "📄\nExportar"
        ]} />
        <p style={{ ...BODY_TEXT, fontSize: 13, marginTop: 8 }}>
          El dashboard permite filtrar por edad, peso y fechas; visualizar distribuciones
          y tendencias; y exportar los datos en <strong>CSV</strong> para analizarlos
          con herramientas estadísticas (SPSS, R, Excel).
        </p>
        <p style={{ ...BODY_TEXT, fontSize: 13, marginTop: 6 }}>
          Los resultados individuales se comparan con datos de referencia del
          <strong> Minnesota Green Tea Trial</strong> (n=932 mujeres postmenopáusicas).
        </p>
      </div>

      {/* Footer */}
      <div style={{
        textAlign: "center", padding: "20px 0", borderTop: "1px solid #F1F5F9"
      }}>
        <p style={{ fontSize: 12, color: "#94A3B8", lineHeight: 1.8 }}>
          Código abierto — puedes revisar y auditar todo el código fuente.
        </p>
        <a
          href="https://github.com/jpfilevich/menqol-cuestionario"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            fontSize: 13, fontWeight: 600, color: "#475569",
            textDecoration: "none", marginTop: 6,
            padding: "8px 16px", borderRadius: 10,
            background: "#F8FAFC", border: "1.5px solid #E2E8F0"
          }}
        >
          🐙 Ver en GitHub
        </a>
      </div>
    </div>
  )
}
