"use client"

import { useEffect, useState } from "react"

export default function Dashboard() {

  const [stats, setStats] = useState<any>(null)

  useEffect(() => {
    fetch("/api/phonesia/stats")
      .then(res => res.json())
      .then(data => setStats(data))
  }, [])

  if (!stats) {
    return <p style={{ padding: 20 }}>Caricamento dashboard…</p>
  }

  return (
    <main style={{ maxWidth: 700, margin: "40px auto", padding: 20 }}>

      <h1 style={{ fontSize: 28, fontWeight: 900 }}>
        Dashboard PHONESIA
      </h1>

      <hr />

      <h2>Statistiche generali</h2>

      <p><b>Clienti registrati:</b> {stats.totale_clienti}</p>
      <p><b>Telegram attivi:</b> {stats.telegram_attivi}</p>

      <hr />

      <h2>Clienti per negozio</h2>

      {Object.entries(stats.clienti_per_negozio).map(([id, count]) => (
        <p key={id}>
          Negozio {id}: {count}
        </p>
      ))}

    </main>
  )
}
