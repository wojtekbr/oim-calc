import React, { useState } from "react";

/*
FactionList:
- Wyświetla listę frakcji, ukrywając te oznaczone jako "hidden" w factions.json
- Wyświetla listę dywizji, ukrywając te oznaczone jako "hidden" w pliku dywizji
*/

export default function FactionList({ factions, onOpenDivision }) {
    // FILTROWANIE FRAKCJI: Pokazujemy tylko te, które nie mają hidden: true
    const keys = Object.keys(factions).filter(k => !factions[k].meta?.hidden);
    const [openKey, setOpenKey] = useState(null);

    return (
        <div>
            <div style={{ display: "grid", gap: 12 }}>
                {keys.map((k) => {
                    const f = factions[k];

                    // FILTROWANIE DYWIZJI: Pobieramy tylko te, które nie mają hidden: true
                    const visibleDivisions = f.divisions
                        ? Object.entries(f.divisions).filter(([_, dv]) => !dv.hidden)
                        : [];

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
                                    <strong style={{ fontSize: 16 }}>{f.meta?.name ?? k}</strong>
                                </div>
                                <div style={{ fontSize: 18, color: '#888' }}>{openKey === k ? "▲" : "▼"}</div>
                            </div>

                            {openKey === k && (
                                <div style={{ padding: 16, background: "#fff", borderTop: "1px solid #eee" }}>
                                    <h4 style={{ marginTop: 0, marginBottom: 12, color: '#555', textTransform: 'uppercase', fontSize: 12 }}>Dostępne dywizje</h4>

                                    {/* Jeśli brak widocznych dywizji, wyświetlamy komunikat */}
                                    {visibleDivisions.length === 0 && (
                                        <div style={{color: '#999', fontStyle: 'italic'}}>Brak zdefiniowanych dywizji</div>
                                    )}

                                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                        {visibleDivisions.map(([dk, dv]) => (
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