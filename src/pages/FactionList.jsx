import React, { useState } from "react";

/*
FactionList:
- Czysta lista kafelków bez technicznych ID pod spodem.
*/

export default function FactionList({ factions, onOpenDivision }) {
    const keys = Object.keys(factions);
    const [openKey, setOpenKey] = useState(null);

    return (
        <div>
            {/* Usuwamy nagłówek h2, jest zbędny jeśli mamy tytuł w App.jsx lub clean look */}
            <div style={{ display: "grid", gap: 12 }}>
                {keys.map((k) => {
                    const f = factions[k];
                    return (
                        <div key={k} style={{ border: "1px solid #ddd", borderRadius: 8, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
                            <div
                                onClick={() => setOpenKey(openKey === k ? null : k)}
                                style={{
                                    padding: 16,
                                    background: "#fdfdfd",
                                    cursor: "pointer",
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center"
                                }}
                            >
                                <div>
                                    {/* ZMIANA: Usunięto {k} (klucz techniczny) */}
                                    <strong style={{ fontSize: 16 }}>{f.meta?.name ?? k}</strong>
                                </div>
                                <div style={{ fontSize: 18, color: '#888' }}>{openKey === k ? "▲" : "▼"}</div>
                            </div>

                            {openKey === k && (
                                <div style={{ padding: 16, background: "#fff", borderTop: "1px solid #eee" }}>
                                    <h4 style={{ marginTop: 0, marginBottom: 12, color: '#555', textTransform: 'uppercase', fontSize: 12 }}>Dostępne dywizje</h4>
                                    {Object.keys(f.divisions).length === 0 && <div style={{color: '#999', fontStyle: 'italic'}}>Brak zdefiniowanych dywizji</div>}
                                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                        {Object.entries(f.divisions).map(([dk, dv]) => (
                                            <div
                                                key={dk}
                                                onClick={() => onOpenDivision(k, dk)}
                                                style={{
                                                    padding: 12,
                                                    borderRadius: 6,
                                                    border: "1px solid #eee",
                                                    cursor: "pointer",
                                                    background: "#fafafa",
                                                    transition: "background 0.2s"
                                                }}
                                                onMouseEnter={(e) => e.currentTarget.style.background = "#f0f7ff"}
                                                onMouseLeave={(e) => e.currentTarget.style.background = "#fafafa"}
                                            >
                                                {/* ZMIANA: Usunięto {dk} (klucz techniczny) */}
                                                <div style={{fontWeight: 600, color: '#333'}}>{dv.name ?? dk}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}