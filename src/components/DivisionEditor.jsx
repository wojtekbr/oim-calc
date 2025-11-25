import React, { useEffect, useState } from "react";

export default function DivisionEditor({ divisionKey, divisionData, units, onBack }) {
    const { name, structure } = divisionData;
    const { base, additional } = structure;

    const [selectedBase, setSelectedBase] = useState({});
    const [selectedAdditional, setSelectedAdditional] = useState({});

    // Helper: map id → full unit object
    const getUnit = (id) => units[id];
    const getUnitName = (id) => units[id]?.name || id;
    const getUnitCost = (id) => units[id]?.cost || 0;

    // Initialize defaults
    useEffect(() => {
        const baseDefaults = {};
        Object.entries(base).forEach(([groupKey, arr]) => {
            const isOptional = groupKey.toLowerCase().startsWith("optional");

            if (isOptional) {
                baseDefaults[groupKey] = null; // optional → no default pick
            } else if (Array.isArray(arr) && arr.length > 0) {
                baseDefaults[groupKey] = arr[0]; // default to first element
            } else {
                baseDefaults[groupKey] = null;
            }
        });

        const addDefaults = {};
        Object.keys(additional).forEach((groupKey) => {
            addDefaults[groupKey] = null;
        });

        setSelectedBase(baseDefaults);
        setSelectedAdditional(addDefaults);
    }, [divisionKey]);

    // Base click handler
    const handleBaseClick = (groupKey, unitId) => {
        const isOptional = groupKey.toLowerCase().startsWith("optional");

        setSelectedBase((prev) => {
            const current = prev[groupKey];

            if (isOptional) {
                return {
                    ...prev,
                    [groupKey]: current === unitId ? null : unitId,
                };
            }

            return { ...prev, [groupKey]: unitId };
        });
    };

    // Additional → single select or none
    const handleAdditionalSelect = (groupKey, unitId) => {
        setSelectedAdditional((prev) => {
            const current = prev[groupKey];
            return { ...prev, [groupKey]: current === unitId ? null : unitId };
        });
    };

    // COST calculation — FINAL, fixed to include all
    const calculateTotalCost = () => {
        let cost = 0;

        // Base
        Object.values(selectedBase).forEach((uid) => {
            if (uid) cost += getUnitCost(uid);
        });

        // Additional
        Object.values(selectedAdditional).forEach((uid) => {
            if (uid) cost += getUnitCost(uid);
        });

        return cost;
    };

    const totalCost = calculateTotalCost();

    // UI tile
    const Tile = ({ uid, active, onClick }) => (
        <div
            onClick={onClick}
            style={{
                padding: "10px",
                margin: "6px",
                borderRadius: "6px",
                cursor: "pointer",
                minWidth: "180px",
                textAlign: "center",
                border: active ? "2px solid #2a71d0" : "1px solid #666",
                background: active ? "#2a71d033" : "#1b1b1b",
                color: "#fff",
                userSelect: "none",
            }}
        >
            {getUnitName(uid)}
            <div style={{ fontSize: "12px", opacity: 0.75 }}>Koszt: {getUnitCost(uid)}</div>
        </div>
    );

    return (
        <div
            style={{
                display: "flex",
                flexDirection: "column",
                background: "#111",
                color: "#eee",
                padding: "20px",
                minHeight: "100vh",
            }}
        >
            {/* TOP BAR SUMMARY */}
            <div
                style={{
                    background: "#1c1c1c",
                    padding: "16px",
                    borderRadius: "8px",
                    marginBottom: "20px",
                    border: "1px solid #333",
                }}
            >
                <button
                    onClick={onBack}
                    style={{
                        background: "#444",
                        border: "none",
                        padding: "8px 14px",
                        color: "#fff",
                        borderRadius: "6px",
                        marginBottom: "10px",
                        cursor: "pointer",
                    }}
                >
                    ← Powrót
                </button>

                <h2 style={{ margin: "6px 0 14px 0" }}>{name}</h2>

                <h3 style={{ margin: "8px 0" }}>Łączny koszt: {totalCost}</h3>

                <div style={{ display: "flex", gap: "40px", marginTop: "10px" }}>
                    {/* BASE SELECTION SUMMARY */}
                    <div>
                        <h4>Podstawa dywizji:</h4>
                        {Object.entries(selectedBase).map(([group, uid]) => (
                            <div key={group} style={{ marginBottom: "6px" }}>
                                <strong>{group}</strong>: {uid ? getUnitName(uid) : "—"}
                            </div>
                        ))}
                    </div>

                    {/* ADDITIONAL SUMMARY */}
                    <div>
                        <h4>Jednostki dodatkowe:</h4>
                        {Object.entries(selectedAdditional).map(([group, uid]) => (
                            <div key={group} style={{ marginBottom: "6px" }}>
                                <strong>{group}</strong>: {uid ? getUnitName(uid) : "—"}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* MAIN CONTENT */}
            <div style={{ flex: 1 }}>
                {/* BASE */}
                <h3 style={{ marginBottom: "10px" }}>Podstawa dywizji</h3>
                {Object.entries(base).map(([groupKey, arr]) => (
                    <div key={groupKey} style={{ marginBottom: "20px" }}>
                        <h4>{groupKey}</h4>
                        <div style={{ display: "flex", flexWrap: "wrap" }}>
                            {arr.map((uid) => (
                                <Tile
                                    key={uid}
                                    uid={uid}
                                    active={selectedBase[groupKey] === uid}
                                    onClick={() => handleBaseClick(groupKey, uid)}
                                />
                            ))}
                        </div>
                    </div>
                ))}

                {/* ADDITIONAL */}
                <h3 style={{ marginTop: "30px", marginBottom: "10px" }}>Jednostki dodatkowe</h3>
                {Object.entries(additional).map(([groupKey, arr]) => (
                    <div key={groupKey} style={{ marginBottom: "20px" }}>
                        <h4>{groupKey}</h4>
                        <div style={{ display: "flex", flexWrap: "wrap" }}>
                            {arr.map((uid) => (
                                <Tile
                                    key={uid}
                                    uid={uid}
                                    active={selectedAdditional[groupKey] === uid}
                                    onClick={() => handleAdditionalSelect(groupKey, uid)}
                                />
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
