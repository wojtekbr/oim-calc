import React, { useState, useEffect, useMemo } from "react";

const createDefaultRegiments = (divisionDefinition) => {
    // Pułki podstawowe (Base) MUSZĄ być wybrane, domyślnie pierwszy z opcji
    const baseRegiments = divisionDefinition.base.map((group, index) => ({
        group: "base",
        index,
        id: group.options[0],
        name: null,
        config: {},
    }));

    // Pułki dodatkowe (Additional) są opcjonalne, domyślnie "none" (brak)
    const additionalRegiments = divisionDefinition.additional.map((group, index) => ({
        group: "additional",
        index,
        id: "none",
        name: null,
        config: {},
    }));

    return {
        base: baseRegiments,
        additional: additionalRegiments,
        supportUnits: [], // Domyślnie brak jednostek wsparcia
        divisionDefinition: divisionDefinition // Przechowujemy definicję Dywizji w stanie
    };
};

export default function RegimentSelector({
                                             faction,
                                             divisionDefinition,
                                             configuredDivision,
                                             setConfiguredDivision,
                                             onOpenRegimentEditor,
                                             onBack,
                                             getRegimentDefinition,
                                             calculateRegimentCost,
                                             divisionBaseCost,
                                             remainingImprovementPoints,
                                             improvementPointsLimit,
                                             totalDivisionCost,
                                             additionalUnitsDefinitions, // ZMIANA: PRZYJMUJEMY TEN PROP
                                             unitsMap, // Mapa jednostek z App.jsx
                                         }) {

    // ========================================================
    // HOOKI MUSZĄ BYĆ ZAWSZE NA POCZĄTKU
    // ========================================================

    // 1. Hook useEffect
    useEffect(() => {
        if (!configuredDivision) {
            // Używamy divisionDefinition w stanie, aby przekazać je do RegimentEditora
            setConfiguredDivision(createDefaultRegiments(divisionDefinition));
        }
    }, [divisionDefinition, configuredDivision, setConfiguredDivision]);

    // 2. Hook useMemo
    const regimentsList = useMemo(() => {
        if (!configuredDivision) return []; // Dodaj warunek dla bezpieczeństwa, aby hook był zawsze wywołany

        const { base: baseRegiments, additional: additionalRegiments } = configuredDivision;

        return [
            ...baseRegiments.map(r => ({ ...r, positionKey: `base/${r.index}` })),
            ...additionalRegiments.map(r => ({ ...r, positionKey: `additional/${r.index}` })),
        ].filter(r => r.id !== 'none');
    }, [configuredDivision]);


    // ========================================================
    // ZATRZYMANIE RENDEROWANIA (WARUNEK MUSI BYĆ PO HOOKACH)
    // ========================================================
    if (!configuredDivision) {
        return <div style={{ padding: 20 }}>Ładowanie konfiguracji dywizji...</div>;
    }

    const { base: baseRegiments, additional: additionalRegiments, supportUnits } = configuredDivision;


    // --- LOGIKA JEDNOSTEK DYWIZYJNYCH ---

    const handleBuySupportUnit = (unitId) => {
        setConfiguredDivision(prev => ({
            ...prev,
            supportUnits: [
                ...prev.supportUnits,
                { id: unitId, assignedTo: null } // Kupujemy, ale nie przypisujemy
            ]
        }));
    };

    const handleAssignSupportUnit = (unitIndex, positionKey) => {
        if (!positionKey) {
            handleUnassignSupportUnit(unitIndex);
            return;
        }

        const [group, index] = positionKey.split('/');

        setConfiguredDivision(prev => {
            const newSupportUnits = [...prev.supportUnits];
            newSupportUnits[unitIndex].assignedTo = { group, index: parseInt(index, 10), positionKey };
            return { ...prev, supportUnits: newSupportUnits };
        });
    };

    const handleUnassignSupportUnit = (unitIndex) => {
        setConfiguredDivision(prev => {
            const newSupportUnits = [...prev.supportUnits];
            newSupportUnits[unitIndex].assignedTo = null;
            return { ...prev, supportUnits: newSupportUnits };
        });
    };

    const handleSellSupportUnit = (unitIndex) => {
        setConfiguredDivision(prev => {
            const newSupportUnits = [...prev.supportUnits];
            newSupportUnits.splice(unitIndex, 1);
            return { ...prev, supportUnits: newSupportUnits };
        });
    };

    // --- RENDEROWANIE BLOKÓW ---

    const handleRegimentChange = (groupKey, index, newRegimentId) => {
        setConfiguredDivision((prev) => {
            const group = prev[groupKey];
            const newGroup = [...group];
            const newSupportUnits = [...prev.supportUnits];

            // Wyczyść dotychczasową konfigurację pułku, gdy zmieniamy jego typ
            const newConfig = {};

            newGroup[index] = {
                ...newGroup[index],
                id: newRegimentId,
                config: newConfig,
            };

            // Jeśli pułk jest usuwany (newRegimentId === 'none'), usuń przypisania Support Units
            const positionKey = `${groupKey}/${index}`;
            if (newRegimentId === 'none') {
                newSupportUnits.forEach(su => {
                    if (su.assignedTo?.positionKey === positionKey) {
                        su.assignedTo = null;
                    }
                });
            }

            return { ...prev, [groupKey]: newGroup, supportUnits: newSupportUnits };
        });
    };

    const getRegimentName = (regimentId) => {
        if (regimentId === "none") return "Brak";
        return getRegimentDefinition(regimentId)?.name || regimentId;
    }

    const renderRegimentBlock = (regimentGroup, regiments, definitionOptions) => {
        return regiments.map((regiment, index) => {
            const options = definitionOptions[index].options;
            const currentRegimentId = regiment.id;
            const groupKey = regimentGroup;

            const isNone = currentRegimentId === "none";
            const canEdit = !isNone && getRegimentDefinition(currentRegimentId)?.structure;
            const isBase = groupKey === "base";
            const positionKey = `${groupKey}/${index}`;

            // Koszt bieżącego pułku
            const regimentCost = calculateRegimentCost(regiment.config, regiment.id);

            return (
                <div key={`${groupKey}-${index}`} style={{ border: "1px solid #eee", padding: 12, borderRadius: 8, marginBottom: 10, background: isBase ? "#f7f7f7" : "#fff" }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <div style={{ fontWeight: 700 }}>
                            {isBase ? `Pułk Podstawowy ${index + 1}` : `Pułk Dodatkowy ${index + 1}`}
                            {isBase && <span style={{ color: "red", marginLeft: 5 }}>*</span>}
                        </div>

                        <div style={{ fontWeight: 700, color: regimentCost > 0 ? '#1b7e32' : '#666' }}>
                            {regimentCost} pkt
                        </div>
                    </div>

                    <select
                        value={currentRegimentId}
                        onChange={(e) => handleRegimentChange(groupKey, index, e.target.value)}
                        style={{ padding: 8, minWidth: 250, marginRight: 15 }}
                        disabled={isBase && options.length === 1}
                    >
                        {options.map((optionId) => (
                            <option key={optionId} value={optionId}>
                                {getRegimentName(optionId)}
                            </option>
                        ))}
                    </select>

                    {canEdit && (
                        <button
                            onClick={() => onOpenRegimentEditor(groupKey, index)}
                            style={{ padding: '8px 12px', background: '#0077ff', color: 'white', border: 'none', borderRadius: 5, cursor: 'pointer' }}
                        >
                            Edytuj Pułk
                        </button>
                    )}

                    {isNone && <span style={{ marginLeft: 15, color: "#666" }}>Brak pułku do edycji.</span>}

                    {/* WIDOK PRZYPISANYCH JEDNOSTEK WSPARCIA */}
                    <div style={{ marginTop: 10, fontSize: 12, color: '#0077ff' }}>
                        Przypisane wsparcie:
                        {supportUnits.filter(su => su.assignedTo?.positionKey === positionKey).length === 0
                            ? ' —'
                            : supportUnits
                                .filter(su => su.assignedTo?.positionKey === positionKey)
                                .map(su => unitsMap[su.id]?.name || su.id)
                                .join(', ')
                        }
                    </div>
                </div>
            );
        });
    };

    const impColor = remainingImprovementPoints < 0 ? 'red' : remainingImprovementPoints === improvementPointsLimit ? '#666' : '#1b7e32';

    return (
        <div>
            <button onClick={onBack} style={{ marginBottom: 14 }}>← Powrót do Frakcji</button>
            <h2 style={{ marginTop: 0 }}>Konfiguracja Dywizji: {divisionDefinition.name}</h2>

            {/* SUMA PUNKTÓW */}
            <div style={{ padding: 12, marginBottom: 20, border: '2px solid #0077ff', borderRadius: 8, background: '#e9f3ff' }}>
                <strong style={{ fontSize: 20 }}>SUMA PUNKTÓW DYWIZJI: {totalDivisionCost} pkt</strong>
                <div style={{ fontSize: 14, marginTop: 5 }}>
                    (Koszt bazowy Dywizji: {divisionBaseCost} pkt)
                </div>

                <div style={{ fontSize: 16, marginTop: 10, fontWeight: 700 }}>
                    Punkty ulepszeń:
                    <span style={{ color: impColor, marginLeft: 5 }}>
                         {remainingImprovementPoints} / {improvementPointsLimit}
                    </span>
                    {remainingImprovementPoints < 0 && <span style={{ color: 'red', marginLeft: 10 }}>[PRZEKROCZONO LIMIT!]</span>}
                </div>
            </div>

            <div style={{ color: "#444", marginBottom: 20 }}>
                Frakcja: <strong>{faction.meta?.name ?? faction.meta?.key}</strong>
            </div>

            {/* SEKCJA JEDNOSTEK DYWIZYJNYCH (Support Units) */}
            <section style={{ marginBottom: 30 }}>
                <h3>Jednostki Dywizyjne (Support Units)</h3>

                {/* KAŻDA UNIKALNA JEDNOSTKA DO KUPIENIA */}
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
                    {/* ITERUJEMY PO additionalUnitsDefinitions */}
                    {additionalUnitsDefinitions.map((unitId) => (
                        <button key={unitId} onClick={() => handleBuySupportUnit(unitId)} style={{ padding: 10, border: '1px solid #1b7e32', background: '#e6ffe6', borderRadius: 6, cursor: 'pointer' }}>
                            + Kup {unitsMap[unitId]?.name || unitId} ({unitsMap[unitId]?.cost || 0} pkt)
                        </button>
                    ))}
                </div>

                {/* WYŚWIETLANIE ZAKUPIONYCH JEDNOSTEK */}
                <div style={{ display: "grid", gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 15 }}>
                    {supportUnits.map((su, index) => {
                        const unitDef = unitsMap[su.id];
                        const unitName = unitDef?.name || su.id;
                        const unitCost = unitDef?.cost || 0;
                        const assignedRegiment = su.assignedTo ? regimentsList.find(r => r.positionKey === su.assignedTo.positionKey) : null;
                        const assignedRegimentName = assignedRegiment
                            ? getRegimentName(assignedRegiment.id)
                            : '— Nieprzypisana';

                        return (
                            <div key={index} style={{ padding: 12, border: '1px solid #ddd', borderRadius: 8, background: '#fff' }}>
                                <div style={{ fontWeight: 700, marginBottom: 5 }}>{unitName} ({unitCost} pkt)</div>
                                <div style={{ fontSize: 12, color: su.assignedTo ? '#0077ff' : '#aaa' }}>
                                    Przypisano do: <strong>{assignedRegimentName}</strong>
                                </div>

                                <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
                                    {/* DROPDOWN PRZYPISANIA */}
                                    <select
                                        value={su.assignedTo?.positionKey || ''}
                                        onChange={(e) => handleAssignSupportUnit(index, e.target.value)}
                                        style={{ padding: 6, flexGrow: 1 }}
                                    >
                                        <option value="">Wybierz Pułk...</option>
                                        {regimentsList.map(r => (
                                            <option key={r.positionKey} value={r.positionKey}>
                                                {r.positionKey.startsWith('base') ? 'P. Podstawowy ' : 'P. Dodatkowy '} {getRegimentName(r.id)}
                                            </option>
                                        ))}
                                    </select>

                                    {/* PRZYCISKI AKCJI */}
                                    <button onClick={() => handleSellSupportUnit(index)} style={{ padding: '6px 8px', background: '#ffe6b3', border: '1px solid orange', borderRadius: 4 }}>
                                        Sprzedaj ({unitCost} pkt)
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </section>

            <hr />

            <section style={{ marginBottom: 30 }}>
                <h3>Pułki Podstawowe (Obowiązkowe)</h3>
                {renderRegimentBlock("base", baseRegiments, divisionDefinition.base)}
            </section>

            <section>
                <h3>Pułki Dodatkowe (Opcjonalne)</h3>
                {renderRegimentBlock("additional", additionalRegiments, divisionDefinition.additional)}
            </section>
        </div>
    );
}