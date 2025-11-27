import React, { useState, useEffect, useMemo } from "react";
import { PDFDownloadLink } from '@react-pdf/renderer';
import { ArmyListDocument } from '../pdf/ArmyListDocument';

const createDefaultRegiments = (divisionDefinition, getRegimentDefinition) => {
    const createRegimentWithDefaults = (group, index, regimentId) => {
        const config = { base: {}, additional: {}, improvements: {}, isVanguard: false };
        const def = getRegimentDefinition(regimentId);
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
        return { group, index, id: regimentId, customName: "", config: config };
    };

    const baseRegiments = divisionDefinition.base.map((group, index) =>
        createRegimentWithDefaults('base', index, group.options[0])
    );

    const additionalRegiments = divisionDefinition.additional.map((group, index) => ({
        group: "additional",
        index,
        id: "none",
        customName: "",
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

    const [playerName, setPlayerName] = useState("");
    const [divisionCustomName, setDivisionCustomName] = useState("");

    useEffect(() => {
        if (!configuredDivision) {
            setConfiguredDivision(createDefaultRegiments(divisionDefinition, getRegimentDefinition));
        }
    }, [divisionDefinition, configuredDivision, setConfiguredDivision, getRegimentDefinition]);

    const regimentsList = useMemo(() => {
        if (!configuredDivision) return [];
        const { base: baseRegiments, additional: additionalRegiments } = configuredDivision;
        return [
            ...baseRegiments.map(r => ({ ...r, positionKey: `base/${r.index}` })),
            ...additionalRegiments.map(r => ({ ...r, positionKey: `additional/${r.index}` })),
        ].filter(r => r.id !== 'none');
    }, [configuredDivision]);

    const purchasedUnitsDataMap = useMemo(() => {
        if (!configuredDivision) return {};
        const map = {};
        configuredDivision.supportUnits.forEach((su, index) => {
            map[su.id] = { ...su, index };
        });
        return map;
    }, [configuredDivision]);

    const purchasedUnitIds = useMemo(() => {
        if (!configuredDivision) return [];
        return configuredDivision.supportUnits.map(su => su.id);
    }, [configuredDivision]);

    // Mapa reguł (dla szybkiego dostępu)
    const unitsRulesMap = useMemo(() => {
        const map = {};
        additionalUnitsDefinitions.forEach(item => {
            if (typeof item === 'object' && item.name && !item.type) {
                map[item.name] = item.assignment_rules || {};
            }
            else if (typeof item === 'string') {
                map[item] = {};
            }
        });
        return map;
    }, [additionalUnitsDefinitions]);


    if (!configuredDivision) {
        return <div style={{ padding: 20 }}>Ładowanie konfiguracji dywizji...</div>;
    }

    const { base: baseRegiments, additional: additionalRegiments, supportUnits } = configuredDivision;

    // ========================================================
    // HANDLERS
    // ========================================================

    const handleBuySupportUnit = (unitId) => {
        if (purchasedUnitsDataMap[unitId]) {
            setConfiguredDivision(prev => ({
                ...prev,
                supportUnits: prev.supportUnits.filter(su => su.id !== unitId)
            }));
            return;
        }

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

    const handleAssignSupportUnit = (unitId, positionKey) => {
        const unitData = purchasedUnitsDataMap[unitId];
        if (!unitData) return;

        const unitIndex = unitData.index;

        if (!positionKey) {
            setConfiguredDivision(prev => {
                const newSupportUnits = [...prev.supportUnits];
                newSupportUnits[unitIndex] = { ...newSupportUnits[unitIndex], assignedTo: null };
                return { ...prev, supportUnits: newSupportUnits };
            });
            return;
        }

        const [group, index] = positionKey.split('/');
        setConfiguredDivision(prev => {
            const newSupportUnits = [...prev.supportUnits];
            newSupportUnits[unitIndex] = {
                ...newSupportUnits[unitIndex],
                assignedTo: { group, index: parseInt(index, 10), positionKey }
            };
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

            const config = { base: {}, additional: {}, improvements: {}, isVanguard: false };
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
                customName: "",
                config: config,
            };

            const positionKey = `${groupKey}/${index}`;
            if (newRegimentId === 'none') {
                newSupportUnits.forEach((su, i) => {
                    if (su.assignedTo?.positionKey === positionKey) {
                        newSupportUnits[i] = { ...su, assignedTo: null };
                    }
                });
            }

            if (groupKey === 'additional') {
                for (let i = index + 1; i < newGroup.length; i++) {
                    const nextPosKey = `additional/${i}`;
                    newSupportUnits.forEach((su, sIdx) => {
                        if (su.assignedTo?.positionKey === nextPosKey) {
                            newSupportUnits[sIdx] = { ...su, assignedTo: null };
                        }
                    });
                    newGroup[i] = { ...newGroup[i], id: 'none', customName: "", config: {} };
                }
            }

            return { ...prev, [groupKey]: newGroup, supportUnits: newSupportUnits };
        });
    };

    const handleRegimentNameChange = (groupKey, index, newName) => {
        setConfiguredDivision(prev => {
            const newGroup = [...prev[groupKey]];
            newGroup[index] = {
                ...newGroup[index],
                customName: newName
            };
            return { ...prev, [groupKey]: newGroup };
        });
    };

    const handleVanguardToggle = (groupKey, index) => {
        setConfiguredDivision(prev => {
            const newGroup = [...prev[groupKey]];
            const currentRegiment = newGroup[index];

            newGroup[index] = {
                ...currentRegiment,
                config: {
                    ...currentRegiment.config,
                    isVanguard: !currentRegiment.config.isVanguard
                }
            };

            return { ...prev, [groupKey]: newGroup };
        });
    };

    const getRegimentName = (regimentId) => {
        if (regimentId === "none") return "Brak";
        return getRegimentDefinition(regimentId)?.name || regimentId;
    }

    // ========================================================
    // RENDERERS
    // ========================================================

    const SelectionTile = ({ unitId, locked = false }) => {
        const unitDef = unitsMap[unitId];
        const isPurchased = !!purchasedUnitsDataMap[unitId];
        const costPU = unitDef?.pu_cost ? ` | ${unitDef.pu_cost} PU` : '';

        const borderColor = isPurchased ? '#0077ff' : '#ccc';
        const bgColor = isPurchased ? '#e9f3ff' : (locked ? '#f5f5f5' : '#fff');
        const opacity = locked ? 0.5 : 1;

        return (
            <div
                onClick={locked ? undefined : () => handleBuySupportUnit(unitId)}
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 10,
                    borderRadius: 8,
                    border: `2px solid ${borderColor}`,
                    backgroundColor: bgColor,
                    opacity: opacity,
                    cursor: locked ? 'not-allowed' : 'pointer',
                    minWidth: 140,
                    minHeight: 80,
                    textAlign: 'center',
                    transition: 'all 0.2s',
                    position: 'relative'
                }}
            >
                <div style={{ fontWeight: 'bold', fontSize: 13, marginBottom: 4 }}>{unitDef?.name || unitId}</div>
                <div style={{ fontSize: 11, color: '#666' }}>{unitDef?.cost || 0} pkt {costPU}</div>
                {isPurchased && <div style={{ position: 'absolute', top: 5, right: 5, color: '#0077ff', fontWeight: 'bold' }}>✔</div>}
            </div>
        );
    };

    const ConfigItem = ({ supportUnit, index }) => {
        const unitDef = unitsMap[supportUnit.id];

        const rules = unitsRulesMap[supportUnit.id] || {};
        const canBeAssigned = rules.can_be_assigned !== false;

        const availableRegiments = useMemo(() => {
            if (!canBeAssigned) return [];

            return regimentsList.filter(r => {
                if (rules?.allowed_regiment_ids && rules.allowed_regiment_ids.length > 0) {
                    if (!rules.allowed_regiment_ids.includes(r.id)) {
                        return false;
                    }
                }

                if (rules?.exclusion_tag) {
                    const otherUnitInRegiment = supportUnits.find(otherSu =>
                        otherSu.id !== supportUnit.id &&
                        otherSu.assignedTo?.positionKey === r.positionKey
                    );

                    if (otherUnitInRegiment) {
                        // FIX: Używamy otherUnitInRegiment zamiast otherSu
                        const otherRules = unitsRulesMap[otherUnitInRegiment.id] || {};

                        if (otherRules.exclusion_tag === rules.exclusion_tag) return false;
                        if (otherUnitInRegiment.id === rules.exclusion_tag) return false;
                        if (otherRules.exclusion_tag === supportUnit.id) return false;
                    }
                }

                return true;
            });
        }, [regimentsList, supportUnits, rules, canBeAssigned, supportUnit.id, unitsRulesMap]);

        const isRequired = rules.assignment_required;
        const isUnassigned = !supportUnit.assignedTo;
        const isError = canBeAssigned && isRequired && isUnassigned;

        return (
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 15,
                padding: 12,
                marginBottom: 8,
                border: isError ? '2px solid red' : '1px solid #ddd',
                borderRadius: 6,
                backgroundColor: isError ? '#fff5f5' : '#fff'
            }}>
                <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 'bold', color: isError ? '#d32f2f' : 'inherit' }}>
                        {unitDef?.name || supportUnit.id}
                        {isError && <span style={{marginLeft: 8, fontSize: 11}}>⚠️ WYMAGANE PRZYPISANIE!</span>}
                    </div>
                    <div style={{ fontSize: 12, color: '#666' }}>Koszt: {unitDef?.cost} pkt {unitDef?.pu_cost ? `| ${unitDef.pu_cost} PU` : ''}</div>
                </div>

                <div style={{ flex: 2 }}>
                    {canBeAssigned ? (
                        <select
                            value={supportUnit.assignedTo?.positionKey || ''}
                            onChange={(e) => handleAssignSupportUnit(supportUnit.id, e.target.value)}
                            style={{
                                width: '100%',
                                padding: 8,
                                borderRadius: 4,
                                border: isError ? '2px solid red' : '1px solid #ccc',
                                color: isError ? 'red' : 'inherit',
                                fontWeight: isError ? 'bold' : 'normal'
                            }}
                        >
                            <option value="">
                                {isError ? "⚠️ WYMAGANE PRZYPISANIE!" : "— Nieprzypisana —"}
                            </option>

                            {regimentsList.map(r => {
                                const isAvailable = availableRegiments.some(ar => ar.positionKey === r.positionKey);
                                const isCurrentlySelected = supportUnit.assignedTo?.positionKey === r.positionKey;

                                if (!isAvailable && !isCurrentlySelected) return null;

                                const regDefName = getRegimentDefinition(r.id)?.name;
                                const displayName = r.customName ? `${r.customName}` : regDefName;
                                const prefix = r.positionKey.startsWith('base') ? '[Podst.]' : '[Dod.]';

                                return (
                                    <option key={r.positionKey} value={r.positionKey} disabled={!isAvailable}>
                                        {prefix} {displayName} {!isAvailable ? "(Zajęte/Niedozwolone)" : ""}
                                    </option>
                                );
                            })}
                        </select>
                    ) : (
                        <div style={{ fontSize: 12, fontStyle: 'italic', color: '#666', textAlign: 'center', border: '1px dashed #ccc', padding: 6, borderRadius: 4 }}>
                            Wsparcie Dywizyjne (Tabor/Artyleria)
                        </div>
                    )}
                </div>

                <button
                    onClick={() => handleBuySupportUnit(supportUnit.id)}
                    style={{
                        padding: '6px 12px',
                        backgroundColor: '#ffebee',
                        color: '#c62828',
                        border: '1px solid #ef9a9a',
                        borderRadius: 4,
                        cursor: 'pointer'
                    }}
                >
                    Usuń
                </button>
            </div>
        );
    };

    const renderRegimentBlock = (regimentGroup, regiments, definitionOptions) => {
        return regiments.map((regiment, index) => {
            const options = definitionOptions[index].options;
            const currentRegimentId = regiment.id;
            const groupKey = regimentGroup;
            const isNone = currentRegimentId === "none";
            const canEdit = !isNone && getRegimentDefinition(currentRegimentId)?.structure;
            const isBase = groupKey === "base";
            const positionKey = `${groupKey}/${index}`;

            let isDisabled = false;
            let disabledMessage = "";
            if (!isBase && index > 0) {
                const previousRegiment = regiments[index - 1];
                if (previousRegiment.id === "none") {
                    isDisabled = true;
                    disabledMessage = "(Wymaga wybrania poprzedniego pułku)";
                }
            }

            const stats = calculateRegimentStats(regiment.config, regiment.id);
            const isMainForce = mainForceKey === positionKey;
            const finalActivations = stats.activations + (isMainForce ? 1 : 0);
            const finalMotivation = stats.motivation + (isMainForce ? 1 : 0);
            const isVanguard = !!regiment.config.isVanguard;

            return (
                <div key={`${groupKey}-${index}`} style={{ border: isMainForce ? "2px solid #ff9800" : "1px solid #eee", padding: 12, borderRadius: 8, marginBottom: 10, background: isBase ? "#f7f7f7" : "#fff", opacity: isDisabled ? 0.5 : 1, pointerEvents: isDisabled ? 'none' : 'auto' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
                            {isBase ? `Pułk Podstawowy ${index + 1}` : `Pułk Dodatkowy ${index + 1}`}
                            {isBase && <span style={{ color: "red" }}>*</span>}
                            {isMainForce && <span style={{ background: '#ff9800', color: 'white', padding: '2px 6px', borderRadius: 4, fontSize: 11 }}>SIŁY GŁÓWNE</span>}

                            {!isNone && (
                                <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 'normal', cursor: 'pointer', border: '1px solid #ddd', padding: '2px 6px', borderRadius: 4, backgroundColor: isVanguard ? '#e3f2fd' : 'transparent' }}>
                                    <input
                                        type="checkbox"
                                        checked={isVanguard}
                                        onChange={() => handleVanguardToggle(groupKey, index)}
                                    />
                                    Straż Przednia
                                </label>
                            )}

                            {isDisabled && <span style={{ color: "#888", fontWeight: "normal", fontSize: 12, marginLeft: 10 }}>{disabledMessage}</span>}
                        </div>

                        {!isDisabled && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 15 }}>
                                {!isNone && (
                                    <div style={{ fontSize: 12, color: '#555', textAlign: 'right' }}>
                                        <div>
                                            Akt.: <strong>{finalActivations}</strong> | Zw.: <strong>{stats.recon}</strong> | Mot.: <strong>{finalMotivation}</strong> | Ryz.: <strong>{stats.awareness}</strong> | Roz.: <strong>{stats.orders}</strong>
                                        </div>
                                        {isVanguard && <div style={{ color: '#d35400', fontWeight: 'bold', marginTop: 2 }}>[STRAŻ PRZEDNIA]</div>}
                                    </div>
                                )}
                                <div style={{ fontWeight: 700, fontSize: 16, color: stats.cost > 0 ? '#1b7e32' : '#666' }}>
                                    {stats.cost} pkt
                                </div>
                            </div>
                        )}
                    </div>

                    {!isNone && !isDisabled && (
                        <div style={{ marginBottom: 8 }}>
                            <input
                                type="text"
                                placeholder="Nadaj nazwę własną pułku..."
                                value={regiment.customName || ""}
                                onChange={(e) => handleRegimentNameChange(groupKey, index, e.target.value)}
                                style={{ width: "100%", padding: "6px", borderRadius: "4px", border: "1px solid #ccc" }}
                            />
                        </div>
                    )}

                    <select
                        value={currentRegimentId}
                        onChange={(e) => handleRegimentChange(groupKey, index, e.target.value)}
                        style={{ padding: 8, minWidth: 250, marginRight: 15 }}
                        disabled={(isBase && options.length === 1) || isDisabled}
                    >
                        {isDisabled ? <option value="none">Zablokowany</option> : null}
                        {options.map((optionId) => (
                            <option key={optionId} value={optionId}>
                                {getRegimentName(optionId)}
                            </option>
                        ))}
                    </select>

                    {canEdit && !isDisabled && (
                        <button
                            onClick={() => onOpenRegimentEditor(groupKey, index)}
                            style={{ padding: '8px 12px', background: '#0077ff', color: 'white', border: 'none', borderRadius: 5, cursor: 'pointer', marginLeft: 10 }}
                        >
                            Edytuj Pułk
                        </button>
                    )}

                    {!isDisabled && (
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
                    )}
                </div>
            );
        });
    };

    const impColor = remainingImprovementPoints < 0 ? 'red' : remainingImprovementPoints === improvementPointsLimit ? '#666' : '#1b7e32';

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <button onClick={onBack}>← Powrót do Frakcji</button>

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
                            getRegimentDefinition={getRegimentDefinition}
                            playerName={playerName}
                            divisionCustomName={divisionCustomName}
                        />
                    }
                    fileName={`Rozpiska_${divisionCustomName || divisionDefinition.name.replace(/\s/g, '_') || 'Armia'}.pdf`}
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

            <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                <input
                    type="text"
                    placeholder="Nazwa Gracza"
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                    style={{ flex: 1, padding: "8px", borderRadius: "4px", border: "1px solid #ccc" }}
                />
                <input
                    type="text"
                    placeholder="Nazwa Własna Dywizji"
                    value={divisionCustomName}
                    onChange={(e) => setDivisionCustomName(e.target.value)}
                    style={{ flex: 2, padding: "8px", borderRadius: "4px", border: "1px solid #ccc" }}
                />
            </div>

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

            {/* --- SEKCJA 1: DOSTĘPNE JEDNOSTKI (SKLEP) --- */}
            <section style={{ marginBottom: 20, padding: 15, backgroundColor: '#fdfdfd', border: '1px solid #eee', borderRadius: 8 }}>
                <h3 style={{ marginTop: 0, marginBottom: 15 }}>1. Wybierz Jednostki Wsparcia</h3>

                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                    {additionalUnitsDefinitions.map((item, idx) => {
                        if (typeof item === 'string') {
                            return <SelectionTile key={item} unitId={item} />;
                        }
                        else if (typeof item === 'object' && item.name && !item.type) {
                            return <SelectionTile key={item.name} unitId={item.name} />;
                        }
                        else if (typeof item === 'object' && item.type === 'group') {
                            const purchasedOption = item.options.find(opt => purchasedUnitsDataMap[opt]);

                            return (
                                <div key={idx} style={{ border: '1px dashed #ccc', padding: 8, borderRadius: 6, display: 'flex', flexDirection: 'column', gap: 8, backgroundColor: '#fafafa' }}>
                                    <div style={{ fontWeight: 700, fontSize: 12, color: '#555', textAlign: 'center' }}>{item.name}</div>
                                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                                        {item.options.map(optId => {
                                            const isLocked = purchasedOption && purchasedOption !== optId;
                                            return <SelectionTile key={optId} unitId={optId} locked={isLocked} />;
                                        })}
                                    </div>
                                </div>
                            );
                        }
                        return null;
                    })}
                </div>
            </section>

            {/* --- SEKCJA 2: KONFIGURACJA (INWENTARZ) --- */}
            {supportUnits.length > 0 && (
                <section style={{ marginBottom: 30, padding: 15, backgroundColor: '#eef6fc', border: '1px solid #cce3f6', borderRadius: 8 }}>
                    <h3 style={{ marginTop: 0, marginBottom: 15, color: '#0056b3' }}>2. Przypisz Zakupione Jednostki</h3>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        {supportUnits.map((su, index) => (
                            <ConfigItem key={su.id} supportUnit={su} index={index} />
                        ))}
                    </div>
                </section>
            )}

            <hr style={{ margin: '30px 0' }} />

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