import React, { useState, useEffect, useMemo } from "react";
import { PDFDownloadLink } from '@react-pdf/renderer';
import { ArmyListDocument } from '../pdf/ArmyListDocument';

const createDefaultRegiments = (divisionDefinition, getRegimentDefinition) => {
    // Funkcja tworząca pułk z domyślnie wybranymi jednostkami
    const createRegimentWithDefaults = (group, index, regimentId) => {
        const config = { base: {}, additional: {}, improvements: {} };
        const def = getRegimentDefinition(regimentId);
        if (def && def.structure && def.structure.base) {
            Object.entries(def.structure.base).forEach(([slotKey, options]) => {
                const isOptional = slotKey.toLowerCase().startsWith('optional');
                // Wybierz pierwszą opcję, jeśli slot jest obowiązkowy
                if (!isOptional && Array.isArray(options) && options.length > 0) {
                    config.base[slotKey] = options[0];
                } else {
                    config.base[slotKey] = null;
                }
            });
        }
        return { group, index, id: regimentId, name: null, config: config };
    };

    const baseRegiments = divisionDefinition.base.map((group, index) =>
        createRegimentWithDefaults('base', index, group.options[0])
    );

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
        supportUnits: [],
        divisionDefinition: divisionDefinition
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
                                             calculateRegimentStats,
                                             divisionBaseCost,
                                             remainingImprovementPoints,
                                             improvementPointsLimit,
                                             totalDivisionCost,
                                             additionalUnitsDefinitions,
                                             unitsMap,
                                             mainForceKey,
                                         }) {

    // ========================================================
    // HOOKI
    // ========================================================

    // 1. Inicjalizacja stanu
    useEffect(() => {
        if (!configuredDivision) {
            setConfiguredDivision(createDefaultRegiments(divisionDefinition, getRegimentDefinition));
        }
    }, [divisionDefinition, configuredDivision, setConfiguredDivision, getRegimentDefinition]);

    // 2. Lista pułków (płaska)
    const regimentsList = useMemo(() => {
        if (!configuredDivision) return [];
        const { base: baseRegiments, additional: additionalRegiments } = configuredDivision;
        return [
            ...baseRegiments.map(r => ({ ...r, positionKey: `base/${r.index}` })),
            ...additionalRegiments.map(r => ({ ...r, positionKey: `additional/${r.index}` })),
        ].filter(r => r.id !== 'none');
    }, [configuredDivision]);

    // 3. Lista zakupionych jednostek wsparcia (ID)
    const purchasedUnitIds = useMemo(() => {
        if (!configuredDivision) return [];
        return configuredDivision.supportUnits.map(su => su.id);
    }, [configuredDivision]);


    // ========================================================
    // RENDEROWANIE WARUNKOWE (LOADING)
    // ========================================================
    if (!configuredDivision) {
        return <div style={{ padding: 20 }}>Ładowanie konfiguracji dywizji...</div>;
    }

    const { base: baseRegiments, additional: additionalRegiments, supportUnits } = configuredDivision;

    // ========================================================
    // HANDLERS
    // ========================================================

    const handleBuySupportUnit = (unitId) => {
        if (purchasedUnitIds.includes(unitId)) {
            alert(`Jednostka ${unitsMap[unitId]?.name || unitId} została już zakupiona.`);
            return;
        }

        // Walidacja kosztu PU (jeśli jednostka kosztuje PU przy zakupie)
        const unitDef = unitsMap[unitId];
        if (unitDef && unitDef.pu_cost) {
            if (remainingImprovementPoints - unitDef.pu_cost < 0) {
                alert(`Brak Punktów Ulepszeń. Koszt: ${unitDef.pu_cost}, Pozostało: ${remainingImprovementPoints}`);
                return;
            }
        }

        setConfiguredDivision(prev => ({
            ...prev,
            supportUnits: [
                ...prev.supportUnits,
                { id: unitId, assignedTo: null }
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

    const handleRegimentChange = (groupKey, index, newRegimentId) => {
        setConfiguredDivision((prev) => {
            const group = prev[groupKey];
            const newGroup = [...group];
            const newSupportUnits = [...prev.supportUnits];

            // Pre-select defaults when changing regiment type
            const config = { base: {}, additional: {}, improvements: {} };
            const def = getRegimentDefinition(newRegimentId);
            if (def && def.structure && def.structure.base) {
                Object.entries(def.structure.base).forEach(([slotKey, options]) => {
                    const isOptional = slotKey.toLowerCase().startsWith('optional');
                    if (!isOptional && Array.isArray(options) && options.length > 0) {
                        config.base[slotKey] = options[0];
                    } else {
                        config.base[slotKey] = null;
                    }
                });
            }

            newGroup[index] = {
                ...newGroup[index],
                id: newRegimentId,
                config: config,
            };

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

    // ========================================================
    // RENDERERS
    // ========================================================

    const renderRegimentBlock = (regimentGroup, regiments, definitionOptions) => {
        return regiments.map((regiment, index) => {
            const options = definitionOptions[index].options;
            const currentRegimentId = regiment.id;
            const groupKey = regimentGroup;
            const isNone = currentRegimentId === "none";
            const canEdit = !isNone && getRegimentDefinition(currentRegimentId)?.structure;
            const isBase = groupKey === "base";
            const positionKey = `${groupKey}/${index}`;

            // POBIERAMY PEŁNE STATYSTYKI
            const stats = calculateRegimentStats(regiment.config, regiment.id);

            // SPRAWDZENIE SIŁ GŁÓWNYCH
            const isMainForce = mainForceKey === positionKey;
            const finalActivations = stats.activations + (isMainForce ? 1 : 0);
            const finalMotivation = stats.motivation + (isMainForce ? 1 : 0);

            return (
                <div key={`${groupKey}-${index}`} style={{ border: isMainForce ? "2px solid #ff9800" : "1px solid #eee", padding: 12, borderRadius: 8, marginBottom: 10, background: isBase ? "#f7f7f7" : "#fff" }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <div style={{ fontWeight: 700 }}>
                            {isBase ? `Pułk Podstawowy ${index + 1}` : `Pułk Dodatkowy ${index + 1}`}
                            {isBase && <span style={{ color: "red", marginLeft: 5 }}>*</span>}
                            {isMainForce && <span style={{ background: '#ff9800', color: 'white', padding: '2px 6px', borderRadius: 4, marginLeft: 8, fontSize: 11 }}>SIŁY GŁÓWNE</span>}
                        </div>

                        {/* PODSUMOWANIE */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 15 }}>
                            {!isNone && (
                                <div style={{ fontSize: 12, color: '#555', textAlign: 'right' }}>
                                    <div>
                                        Akt.: <strong>{finalActivations}</strong> | Zw.: <strong>{stats.recon}</strong> | Mot.: <strong>{finalMotivation}</strong>
                                    </div>
                                    <div style={{ fontSize: 11, maxWidth: 400, whiteSpace: 'normal', lineHeight: '1.2em', marginTop: 4 }}>
                                        {stats.unitNames.join(', ')}
                                    </div>
                                </div>
                            )}
                            <div style={{ fontWeight: 700, fontSize: 16, color: stats.cost > 0 ? '#1b7e32' : '#666' }}>
                                {stats.cost} pkt
                            </div>
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <button onClick={onBack}>← Powrót do Frakcji</button>

                {/* PRZYCISK EKSPORTU PDF */}
                <PDFDownloadLink
                    document={
                        <ArmyListDocument
                            divisionDefinition={divisionDefinition}
                            configuredDivision={configuredDivision}
                            faction={faction}
                            calculateRegimentStats={calculateRegimentStats}
                            mainForceKey={mainForceKey}
                            totalDivisionCost={totalDivisionCost}
                            remainingImprovementPoints={remainingImprovementPoints}
                            unitsMap={unitsMap}
                        />
                    }
                    fileName={`Rozpiska_${divisionDefinition.name.replace(/\s/g, '_')}.pdf`}
                    style={{
                        textDecoration: "none",
                        padding: "10px 15px",
                        color: "#fff",
                        backgroundColor: "#d32f2f",
                        borderRadius: "5px",
                        fontWeight: "bold"
                    }}
                >
                    {({ blob, url, loading, error }) =>
                        loading ? 'Generowanie PDF...' : 'Eksportuj do PDF 🖨️'
                    }
                </PDFDownloadLink>
            </div>

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
                    {additionalUnitsDefinitions.map((item, idx) => {
                        // OBSŁUGA STRINGA (POJEDYNCZA JEDNOSTKA)
                        if (typeof item === 'string') {
                            const unitId = item;
                            const isPurchased = purchasedUnitIds.includes(unitId);
                            const unitDef = unitsMap[unitId];
                            const costPU = unitDef?.pu_cost ? ` | ${unitDef.pu_cost} PU` : '';

                            return (
                                <button
                                    key={unitId}
                                    onClick={() => handleBuySupportUnit(unitId)}
                                    disabled={isPurchased}
                                    style={{
                                        padding: 10,
                                        border: `1px solid ${isPurchased ? '#aaa' : '#1b7e32'}`,
                                        background: isPurchased ? '#f0f0f0' : '#e6ffe6',
                                        borderRadius: 6,
                                        cursor: isPurchased ? 'not-allowed' : 'pointer',
                                        opacity: isPurchased ? 0.6 : 1
                                    }}
                                >
                                    {isPurchased ? 'POSIADANA' : '+ Kup'} {unitsMap[unitId]?.name || unitId} ({unitsMap[unitId]?.cost || 0} pkt{costPU})
                                </button>
                            );
                        }

                        // OBSŁUGA GRUPY (OBIEKT)
                        else if (typeof item === 'object' && item.type === 'group') {
                            const purchasedOption = item.options.find(opt => purchasedUnitIds.includes(opt));

                            return (
                                <div key={idx} style={{ border: '1px dashed #999', padding: 8, borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'center' }}>
                                    <div style={{ fontWeight: 700, fontSize: 12, color: '#555' }}>{item.name}</div>
                                    <div style={{ display: 'flex', gap: 5 }}>
                                        {item.options.map(optId => {
                                            const isThisPurchased = purchasedUnitIds.includes(optId);
                                            const isLocked = (purchasedOption && purchasedOption !== optId) || isThisPurchased;
                                            const unitDef = unitsMap[optId];
                                            const costPU = unitDef?.pu_cost ? ` | ${unitDef.pu_cost} PU` : '';

                                            return (
                                                <button
                                                    key={optId}
                                                    onClick={() => handleBuySupportUnit(optId)}
                                                    disabled={isLocked}
                                                    style={{
                                                        padding: '8px 12px',
                                                        fontSize: 12,
                                                        border: `1px solid ${isThisPurchased ? '#aaa' : '#1b7e32'}`,
                                                        background: isThisPurchased ? '#ddd' : (isLocked ? '#f0f0f0' : '#e6ffe6'),
                                                        borderRadius: 4,
                                                        cursor: isLocked ? 'not-allowed' : 'pointer',
                                                        opacity: isLocked ? 0.5 : 1,
                                                        minWidth: 80
                                                    }}
                                                >
                                                    {isThisPurchased ? 'POSIADANA' : '+ Kup'}
                                                    <br/>
                                                    {unitsMap[optId]?.name || optId} ({unitsMap[optId]?.cost || 0} pkt{costPU})
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        }
                        return null;
                    })}
                </div>

                {/* WYŚWIETLANIE ZAKUPIONYCH JEDNOSTEK */}
                <div style={{ display: "grid", gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 15 }}>
                    {supportUnits.map((su, index) => {
                        const unitDef = unitsMap[su.id];
                        const unitName = unitDef?.name || su.id;
                        const unitCost = unitDef?.cost || 0;
                        const costPU = unitDef?.pu_cost ? ` | ${unitDef.pu_cost} PU` : '';

                        const assignedRegiment = su.assignedTo ? regimentsList.find(r => r.positionKey === su.assignedTo.positionKey) : null;
                        const assignedRegimentName = assignedRegiment
                            ? getRegimentName(assignedRegiment.id)
                            : '— Nieprzypisana';

                        return (
                            <div key={index} style={{ padding: 12, border: '1px solid #ddd', borderRadius: 8, background: '#fff' }}>
                                <div style={{ fontWeight: 700, marginBottom: 5 }}>{unitName} ({unitCost} pkt{costPU})</div>
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