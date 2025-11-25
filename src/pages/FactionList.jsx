import React, { useState } from "react";

/*
FactionList:
- pokazuje kafelki frakcji
- klik w kafelek -> rozwija listę dywizji pod kafelkiem (accordion)
- klik w nazwę dywizji -> wywołuje onOpenDivision(factionKey, divisionKey)
*/

export default function FactionList({ factions, onOpenDivision }) {
    const keys = Object.keys(factions);
    const [openKey, setOpenKey] = useState(null);

    return (
        <div>
            <h2>Frakcje</h2>
            <div style={{ display: "grid", gap: 12 }}>
                {keys.map((k) => {
                    const f = factions[k];
                    return (
                        <div key={k} style={{ border: "1px solid #ddd", borderRadius: 8, overflow: "hidden" }}>
                            <div
                                onClick={() => setOpenKey(openKey === k ? null : k)}
                                style={{
                                    padding: 12,
                                    background: "#f7f7f7",
                                    cursor: "pointer",
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center"
                                }}
                            >
                                <div>
                                    <strong>{f.meta?.name ?? k}</strong>
                                    <div style={{ fontSize: 12, color: "#666" }}>{k}</div>
                                </div>
                                <div style={{ fontSize: 18 }}>{openKey === k ? "▲" : "▼"}</div>
                            </div>

                            {openKey === k && (
                                <div style={{ padding: 12, background: "#fff" }}>
                                    <h4 style={{ marginTop: 0 }}>Dostępne dywizje</h4>
                                    {Object.keys(f.divisions).length === 0 && <div>Brak dywizji</div>}
                                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                        {Object.entries(f.divisions).map(([dk, dv]) => (
                                            <div
                                                key={dk}
                                                onClick={() => onOpenDivision(k, dk)}
                                                style={{
                                                    padding: 10,
                                                    borderRadius: 6,
                                                    border: "1px solid #eee",
                                                    cursor: "pointer",
                                                    background: "#fafafa"
                                                }}
                                            >
                                                <strong>{dv.name ?? dk}</strong>
                                                <div style={{ fontSize: 12, color: "#666" }}>{dk}</div>
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
