import React, { useEffect, useState, useMemo } from "react";

export default function RegimentEditor({
                                           faction,
                                           regiment,
                                           onBack,
                                           configuredDivision,
                                           setConfiguredDivision,
                                           regimentGroup,
                                           regimentIndex,
                                           calculateImprovementPointsCost,
                                           remainingImprovementPoints,
                                           unitsMap, // Otrzymana mapa jednostek
                                       }) {
    // === PRZYGOTOWANIE DANYCH ===
    const structure = regiment.structure || {};
    const base = structure.base || {};
    const additional = structure.additional || {};

    // Wczytanie obecnej konfiguracji pułku z configuredDivision
    const currentConfig = configuredDivision[regimentGroup][regimentIndex].config;
    const divisionDefinition = regiment.divisionDefinition || {};

    // Niestandardowe definicje slotów
    const customCostDefinition = additional.unit_custom_cost;
    const customCostSlotName = customCostDefinition?.[0]?.depends_on;

    const [selectedBase, setSelectedBase] = useState(currentConfig.base || {});
    const [selectedAdditional, setSelectedAdditional] = useState(currentConfig.additional || {});
    const [selectedAdditionalCustom, setSelectedAdditionalCustom] = useState(currentConfig.additionalCustom || null);

    const [improvements, setImprovements] = useState(currentConfig.improvements || {});
    const [regimentImprovements, setRegimentImprovements] = useState(currentConfig.regimentImprovements || []);


    // Funkcja do aktualizacji głównego stanu Division w App.jsx
    const saveAndGoBack = () => {
        // Zapis stanu pułku do configuredDivision
        setConfiguredDivision(prev => {
            const newDivision = { ...prev };
            const newGroup = [...newDivision[regimentGroup]];

            newGroup[regimentIndex] = {
                ...newGroup[regimentIndex],
                config: {
                    base: selectedBase,
                    additional: selectedAdditional,
                    additionalCustom: selectedAdditionalCustom,
                    improvements: improvements,
                    regimentImprovements: regimentImprovements,
                },
            };

            newDivision[regimentGroup] = newGroup;
            return newDivision;
        });

        onBack();
    };

    // Ustawienie domyślnych wartości przy pierwszym wejściu (jeśli brak konfiguracji)
    useEffect(() => {
        if (Object.keys(currentConfig.base || {}).length === 0) {
            const baseDefaults = {};
            Object.entries(base).forEach(([k, arr]) => {
                const isOptional = k.toLowerCase().startsWith("optional");

                if (isOptional) {
                    baseDefaults[k] = null;
                } else if (Array.isArray(arr) && arr.length > 0) {
                    baseDefaults[k] = arr[0];
                } else {
                    baseDefaults[k] = null;
                }
            });
            setSelectedBase(baseDefaults);
        }

        if (Object.keys(currentConfig.additional || {}).length === 0) {
            const addDefaults = {};
            Object.keys(additional).filter(k => k !== 'unit_custom_cost').forEach((k) => {
                addDefaults[k] = null;
            });
            setSelectedAdditional(addDefaults);
        }
    }, [regiment.id]);

    const getUnitName = (unitId) => unitsMap[unitId]?.name || unitId;
    const getUnitCost = (unitId) => unitsMap[unitId]?.cost || 0;

    const getUnitCustomCost = (unitId) => {
        if (!customCostDefinition) return null;
        const item = customCostDefinition.find(def => def.id === unitId);
        return item ? item.cost : null;
    }

    const getFinalUnitCost = (unitId, isCustomSlot) => {
        if (!unitId) return 0;
        if (isCustomSlot) {
            const customCost = getUnitCustomCost(unitId);
            return customCost !== null ? customCost : getUnitCost(unitId);
        }
        return getUnitCost(unitId);
    }

    // ========================================================
    // LOGIKA BIZNESOWA: Walidacja i Koszty
    // ========================================================

    // Logika walidacji jednostek opcjonalnych
    const isOptionalBaseSelected = useMemo(() => {
        return Object.entries(selectedBase).some(([key, unitId]) =>
            key.toLowerCase().startsWith("optional") && !!unitId
        );
    }, [selectedBase]);

    const isOptionalAdditionalSelected = useMemo(() => {
        return Object.entries(selectedAdditional).some(([key, unitId]) =>
            key.toLowerCase().startsWith("optional") && !!unitId
        );
    }, [selectedAdditional]);

    const otherAdditionalCount = useMemo(() => {
        return Object.entries(selectedAdditional)
            .filter(([k, v]) => !k.toLowerCase().startsWith("optional") && !!v)
            .length;
    }, [selectedAdditional]);

    const isAnyOptionalSelected = isOptionalBaseSelected || isOptionalAdditionalSelected;


    // Logika ulepszeń
    const unitLevelImprovements = regiment.unit_improvements || [];
    const regimentLevelImprovements = regiment.regiment_improvements || [];

    // Lokalnie wykorzystane punkty ulepszeń w TYM pułku
    const localImprovementCost = useMemo(() => {
        const tempRegimentConfig = {
            id: regiment.id,
            config: {
                base: selectedBase,
                additional: selectedAdditional,
                improvements: improvements,
                regimentImprovements: regimentImprovements
            }
        };
        return calculateImprovementPointsCost(tempRegimentConfig);

    }, [improvements, regimentImprovements, regiment.id, selectedBase, selectedAdditional]);

    // Obliczanie pozostałych punktów, biorąc pod uwagę bieżącą edycję
    const newRemainingPointsAfterLocalChanges = useMemo(() => {
        if (remainingImprovementPoints === undefined) return 0;

        const totalDivisionLimit = divisionDefinition.improvement_points || 0;

        const tempDivisionConfig = JSON.parse(JSON.stringify(configuredDivision));

        tempDivisionConfig[regimentGroup][regimentIndex].config = {
            base: selectedBase,
            additional: selectedAdditional,
            additionalCustom: selectedAdditionalCustom,
            improvements: improvements,
            regimentImprovements: regimentImprovements,
        };

        const totalUsedWithLocalChanges = calculateImprovementPointsCost(tempDivisionConfig);

        return totalDivisionLimit - totalUsedWithLocalChanges;

    }, [localImprovementCost, divisionDefinition, configuredDivision, regimentGroup, regimentIndex, selectedBase, selectedAdditional, selectedAdditionalCustom, regimentImprovements]);


    // --- FUNKCJA OBSŁUGUJĄCA ULEPSZENIA JEDNOSTKOWE (unit_level) ---
    const handleImprovementToggle = (positionKey, unitId, impId) => {
        const unitDef = unitsMap[unitId];
        if (unitDef?.rank === 'group') return;

        setImprovements(prev => {
            const currentUnitImps = prev[positionKey] || [];
            const impDef = unitLevelImprovements.find(i => i.id === impId);

            if (!impDef) return prev;

            if (currentUnitImps.includes(impId)) {
                // Usuwanie
                return {
                    ...prev,
                    [positionKey]: currentUnitImps.filter(id => id !== impId)
                };
            } else {
                // Dodawanie

                // 1. Walidacja limitu max_amount (1) w pułku
                if (impDef?.max_amount === 1) {
                    const isAlreadyUsed = Object.entries(improvements).some(([posKey, impList]) =>
                        posKey !== positionKey && impList.includes(impId)
                    );
                    if (isAlreadyUsed) {
                        alert(`Ulepszenie "${impId}" może być użyte tylko raz w Pułku.`);
                        return prev;
                    }
                }

                // 2. Walidacja ograniczeń jednostek (limitations)
                if (impDef?.limitations && !impDef.limitations.includes(unitId)) {
                    alert(`Jednostka "${getUnitName(unitId)}" nie może otrzymać ulepszenia "${impId}".`);
                    return prev;
                }

                // 3. Walidacja limitu punktów (Symulacja kosztu)
                const improvementBaseCost = unitDef.improvement_cost || 0;
                let potentialCost = 0;

                if (typeof impDef.cost === 'number') {
                    potentialCost = impDef.cost;
                } else if (impDef.cost === 'double') {
                    potentialCost = improvementBaseCost * 2;
                } else if (impDef.cost === 'triple') {
                    potentialCost = improvementBaseCost * 3;
                } else if (impDef.cost === -1) {
                    potentialCost = Math.max(1, improvementBaseCost - 1);
                } else if (impDef.cost === 1) {
                    potentialCost = improvementBaseCost;
                }

                if (newRemainingPointsAfterLocalChanges - potentialCost < 0) {
                    alert(`Brak wystarczającej liczby punktów ulepszeń w Dywizji. Potrzeba: ${potentialCost} pkt. Pozostało: ${newRemainingPointsAfterLocalChanges} pkt.`);
                    return prev;
                }

                return {
                    ...prev,
                    [positionKey]: [...currentUnitImps, impId]
                };
            }
        });
    };

    // --- FUNKCJA OBSŁUGUJĄCA ULEPSZENIA PUŁKOWE (regiment_level) ---
    const handleRegimentImprovementToggle = (impId) => {
        setRegimentImprovements(prev => {
            const impDef = regimentLevelImprovements.find(i => i.id === impId);
            if (!impDef) return prev;

            const impOccurrences = regimentLevelImprovements.filter(imp => imp.id === impId).length;
            const currentCount = prev.filter(id => id === impId).length;

            if (prev.includes(impId)) {
                // Usuwanie: Usuwamy tylko jeden, ostatni wpis
                const index = prev.lastIndexOf(impId);
                return [
                    ...prev.slice(0, index),
                    ...prev.slice(index + 1)
                ];
            } else {
                // Dodawanie

                // 1. Walidacja max_amount
                if (currentCount >= impOccurrences) {
                    alert(`Osiągnięto maksymalną liczbę (${impOccurrences}) ulepszeń pułkowych "${impId}" w Pułku.`);
                    return prev;
                }

                // 2. Walidacja limitu punktów
                const potentialImpCost = typeof impDef.cost === 'number' ? impDef.cost : 0;

                if (newRemainingPointsAfterLocalChanges - potentialImpCost < 0) {
                    alert(`Brak wystarczającej liczby punktów ulepszeń w Dywizji. Potrzeba: ${potentialImpCost} pkt. Pozostało: ${newRemainingPointsAfterLocalChanges} pkt.`);
                    return prev;
                }

                return [...prev, impId];
            }
        });
    };


    // Obsługa kliknięć (z logiką walidacji) - Dodano czyszczenie ulepszeń przy zmianie jednostki
    const handleBaseClick = (groupKey, unitId) => {
        const isOptional = groupKey.toLowerCase().startsWith("optional");
        const positionKey = `base/${groupKey}`;

        setSelectedBase((prev) => {
            const current = prev[groupKey];
            const next = current === unitId ? null : unitId;

            if (isOptional) {
                const isDeselecting = current === unitId;

                if (!isDeselecting && isOptionalAdditionalSelected) {
                    return prev;
                }

                if (current !== next) {
                    setImprovements(prevImps => {
                        const newImps = { ...prevImps };
                        delete newImps[positionKey];
                        return newImps;
                    });
                }

                return { ...prev, [groupKey]: next };
            }

            if (current !== unitId) {
                setImprovements(prevImps => {
                    const newImps = { ...prevImps };
                    delete newImps[positionKey];
                    return newImps;
                });
            }

            return { ...prev, [groupKey]: unitId };
        });
    };

    const handleAdditionalSelect = (groupKey, unitId) => {
        const isOptional = groupKey.toLowerCase().startsWith("optional");
        const positionKey = `additional/${groupKey}`;

        setSelectedAdditional((prev) => {
            const current = prev[groupKey];
            const next = current === unitId ? null : unitId;

            if (isOptional) {
                if (next && isOptionalBaseSelected) {
                    return prev;
                }

                if (next && otherAdditionalCount === 0) {
                    alert("Aby wybrać jednostkę opcjonalną z dodatkowych jednostek, musisz wybrać przynajmniej jedną inną jednostkę dodatkową.");
                    return prev;
                }
            }

            if (current !== next) {
                setImprovements(prevImps => {
                    const newImps = { ...prevImps };
                    delete newImps[positionKey];
                    return newImps;
                });

                // Jeśli slot 'unit5' jest odznaczany/zmieniany, czyścimy slot zależny (unit_custom_cost)
                if (groupKey === customCostSlotName) {
                    setSelectedAdditionalCustom(null);
                }
            }

            return { ...prev, [groupKey]: next };
        });
    };

    // NOWA FUNKCJA: Obsługa kliknięć w slocie niestandardowym
    const handleCustomSelect = (unitId) => {
        const positionKey = `additional/${customCostSlotName}_custom`; // Unikalny klucz dla slotu niestandardowego
        const current = selectedAdditionalCustom;
        const next = current === unitId ? null : unitId;

        // Walidacja zależności (jeśli slot macierzysty jest pusty, nie można wybrać)
        if (next && !selectedAdditional[customCostSlotName]) {
            alert(`Aby wybrać tę jednostkę, musisz najpierw wybrać jednostkę w slocie "${customCostSlotName}".`);
            return;
        }

        setSelectedAdditionalCustom(next);

        // Czyszczenie ulepszeń przy zmianie
        if (current !== next) {
            setImprovements(prevImps => {
                const newImps = { ...prevImps };
                delete newImps[positionKey];
                return newImps;
            });
        }
    };


    // Koszt Pułku (Lokalna kalkulacja)
    const totalCost = useMemo(() => {
        const regimentBaseCost = regiment.base_cost || 0;
        let cost = regimentBaseCost;

        // --- 1. KOSZT ULEPSZEŃ PUŁKOWYCH (army_point_cost) ---
        regimentImprovements.forEach(impId => {
            const impDef = regimentLevelImprovements.find(i => i.id === impId);
            if (impDef && typeof impDef.army_point_cost === 'number') {
                cost += impDef.army_point_cost;
            }
        });

        // --- 2. KOSZT JEDNOSTEK I ULEPSZEŃ JEDNOSTKOWYCH ---
        const selectedUnitsByPosition = [
            ...Object.entries(selectedBase || {}).map(([key, unitId]) => ({ key: `base/${key}`, unitId, isCustom: false })),
            ...Object.entries(selectedAdditional || {}).map(([key, unitId]) => ({ key: `additional/${key}`, unitId, isCustom: false })),
            ...(selectedAdditionalCustom ? [{ key: customCostSlotName + "_custom", unitId: selectedAdditionalCustom, isCustom: true }] : [])
        ];

        const unitLevelImps = unitLevelImprovements;


        selectedUnitsByPosition.forEach(({ key: positionKey, unitId, isCustom }) => {
            if (!unitId) return;

            const unitDef = unitsMap[unitId];
            if (!unitDef) return;

            // KOSZT JEDNOSTKI (Bazowy lub Niestandardowy)
            let unitBaseCost = getUnitCost(unitId);
            if (isCustom) {
                const customCost = getUnitCustomCost(unitId);
                unitBaseCost = customCost !== null ? customCost : getUnitCost(unitId);
            }
            cost += unitBaseCost;

            if (unitDef.rank === 'group') return;

            // KOSZT ULEPSZEŃ
            const unitImprovements = improvements[positionKey] || [];

            unitImprovements.forEach(impId => {
                const impDef = unitLevelImps.find(i => i.id === impId);
                if (!impDef) return;

                const improvementBaseCost = unitDef.improvement_cost || 0;
                let improvementCostValue = 0;

                if (typeof impDef.cost === 'number') {
                    improvementCostValue = impDef.cost;
                } else if (impDef.cost === 'double') {
                    improvementCostValue = improvementBaseCost * 2;
                } else if (impDef.cost === 'triple') {
                    improvementCostValue = improvementBaseCost * 3;
                } else if (impDef.cost === -1) {
                    improvementCostValue = Math.max(1, improvementBaseCost - 1);
                } else if (impDef.cost === 1) {
                    improvementCostValue = improvementBaseCost;
                }

                cost += improvementCostValue;
            });
        });

        return cost;
    }, [selectedBase, selectedAdditional, selectedAdditionalCustom, improvements, regimentImprovements, regiment]);

    // NOWA LOGIKA: Zwiad i Motywacja
    const { totalRecon, totalMotivation } = useMemo(() => {
        let recon = 0;
        let motivation = 0;

        const regimentPositionKey = `${regimentGroup}/${regimentIndex}`;

        // Jednostki Pułku (w slotach)
        const unitPositions = [
            ...Object.entries(selectedBase || {}).map(([key, id]) => ({ type: 'base', key, id })),
            ...Object.entries(selectedAdditional || {}).map(([key, id]) => ({ type: 'additional', key, id })),
            ...(selectedAdditionalCustom ? [{ type: 'additional', key: customCostSlotName + "_custom", id: selectedAdditionalCustom }] : [])
        ];

        // Jednostki Wsparcia Dywizyjnego przypisane do tego Pułku
        const assignedSupportUnits = configuredDivision.supportUnits
            .filter(su => su.assignedTo?.positionKey === regimentPositionKey);

        // --- Iteracja jednostek Pułku ---
        unitPositions.filter(({ id }) => id).forEach(({ id: unitId }) => {
            const unitDef = unitsMap[unitId];
            if (!unitDef) return;

            // ZWIAD
            if (unitDef.is_cavalry) recon += 1;
            if (unitDef.is_light_cavalry) recon += 1;
            if (unitDef.has_lances) recon -= 1;
            if (unitDef.is_pike_and_shot) recon -= 1;
            if (unitDef.are_looters_insubordinate) recon -= 1;
            if (unitDef.are_proxy_dragoons) recon += 1;
            if (unitDef.are_scouts) recon += 1;
            if (unitDef.are_dragoons) recon += 1;
            if (unitDef.is_artillery) recon -= 2;
            if (unitDef.are_wagons) recon -= 2;
            if (unitDef.is_harassing) recon += 1;
            if (unitDef.is_disperse) recon += 1;

            // MOTYWACJA
            const rank = unitDef.rank;
            if (rank === 'bronze' || rank === 'silver') {
                motivation += 1;
            } else if (rank === 'gold') {
                motivation += 2;
            }
        });

        // --- Iteracja jednostek Wsparcia (Support Units) ---
        assignedSupportUnits.forEach(su => {
            const unitDef = unitsMap[su.id];
            if (!unitDef) return;

            // ZWIAD
            if (unitDef.is_cavalry) recon += 1;
            if (unitDef.is_light_cavalry) recon += 1;
            if (unitDef.has_lances) recon -= 1;
            if (unitDef.is_pike_and_shot) recon -= 1;
            if (unitDef.are_looters_insubordinate) recon -= 1;
            if (unitDef.are_proxy_dragoons) recon += 1;
            if (unitDef.are_scouts) recon += 1;
            if (unitDef.are_dragoons) recon += 1;
            if (unitDef.is_artillery) recon -= 2;
            if (unitDef.are_wagons) recon -= 2;
            if (unitDef.is_harassing) recon += 1;
            if (unitDef.is_disperse) recon += 1;

            // MOTYWACJA
            const rank = unitDef.rank;
            if (rank === 'bronze' || rank === 'silver') {
                motivation += 1;
            } else if (rank === 'gold') {
                motivation += 2;
            }
        });


        // Dodaj bazowy Zwiad Pułku
        recon += regiment.recon || 0;

        return { totalRecon: recon, totalMotivation: motivation };
    }, [selectedBase, selectedAdditional, selectedAdditionalCustom, unitsMap, regiment, configuredDivision, regimentGroup, regimentIndex]);


    // WIDOK
    const totalDivisionLimit = divisionDefinition.improvement_points || 0;
    const impColor = newRemainingPointsAfterLocalChanges < 0 ? 'red' : newRemainingPointsAfterLocalChanges === totalDivisionLimit ? '#666' : '#1b7e32';


    const Tile = ({ children, active, onClick, style }) => (
        <div
            onClick={onClick}
            style={{
                padding: "10px 12px",
                borderRadius: 8,
                border: active ? "2px solid #0077ff" : "1px solid #ddd",
                background: active ? "#e9f3ff" : "#fff",
                cursor: "pointer",
                minWidth: 160,
                textAlign: "center",
                boxShadow: active ? "0 1px 4px rgba(0,0,0,0.06)" : "none",
                ...style
            }}
        >
            {children}
        </div>
    );

    // NOWY KOMPONENT: Renderuje interfejs ulepszeń pułkowych (regiment_improvements)
    const RegimentImprovementsBlock = () => {
        if (regimentLevelImprovements.length === 0) return null;

        const uniqueImpIds = [...new Set(regimentLevelImprovements.map(imp => imp.id))];

        return (
            <div style={{ marginBottom: 14, padding: 10, border: '1px solid #ccc', borderRadius: 8, background: '#f5f5f5' }}>
                <div style={{ marginBottom: 8, fontWeight: 700, fontSize: 15 }}>Ulepszenia Pułkowe</div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 14 }}>
                    {uniqueImpIds.map(impId => {
                        const impDefs = regimentLevelImprovements.filter(imp => imp.id === impId);
                        const impDef = impDefs[0];

                        const currentCount = regimentImprovements.filter(id => id === impId).length;
                        const impOccurrences = impDefs.length;

                        const canAdd = currentCount < impOccurrences;

                        const impCost = typeof impDef.cost === 'number' ? impDef.cost : 0;
                        const armyCost = typeof impDef.army_point_cost === 'number' ? impDef.army_point_cost : 0;

                        let impDisabled = false;
                        if (!canAdd || newRemainingPointsAfterLocalChanges - impCost < 0) {
                            impDisabled = true;
                        }

                        const addButton = (
                            <button
                                onClick={impDisabled ? () => {} : () => handleRegimentImprovementToggle(impId)}
                                style={{
                                    fontSize: 12,
                                    padding: '4px 6px',
                                    borderRadius: 4,
                                    border: canAdd ? "1px solid #0077ff" : "1px solid #aaa",
                                    background: "#f0f0f0",
                                    color: '#333',
                                    cursor: impDisabled ? 'not-allowed' : 'pointer',
                                    opacity: impDisabled ? 0.4 : 1,
                                    marginRight: 5
                                }}
                                title={`Koszt: ${impCost} Ulepszeń, ${armyCost} pkt armii. Można dodać ${impOccurrences - currentCount} razy.`}
                            >
                                + {impId}
                            </button>
                        );

                        const removeButton = currentCount > 0 && (
                            <button
                                onClick={() => handleRegimentImprovementToggle(impId)}
                                style={{
                                    fontSize: 12,
                                    padding: '4px 6px',
                                    borderRadius: 4,
                                    background: '#ffcccc',
                                    border: '1px solid red',
                                    cursor: 'pointer'
                                }}
                            >
                                -1
                            </button>
                        );

                        return (
                            <div key={impId} style={{ display: 'flex', alignItems: 'center', gap: 4, border: '1px solid #ddd', padding: 5, borderRadius: 4 }}>
                                <span style={{ fontWeight: 600 }}>{impId}:</span>
                                {addButton}
                                {removeButton}
                                <span style={{ fontSize: 12, color: '#666' }}>({currentCount} / {impOccurrences})</span>
                            </div>
                        )
                    })}
                </div>
            </div>
        );
    };


    const renderRow = (groupKey, unitIds, type) => {
        if (!Array.isArray(unitIds) || unitIds.length === 0) return null;

        const isOptionalGroup = groupKey.toLowerCase().startsWith("optional");
        let groupDisabledMessage = null;

        return (
            <div key={groupKey} style={{ marginBottom: 14 }}>
                <div style={{ marginBottom: 8, fontWeight: 700 }}>{groupKey}</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {unitIds.map((uid) => {
                        const unitDef = unitsMap[uid];
                        const isGroupUnit = unitDef?.rank === 'group';
                        const positionKey = `${type}/${groupKey}`;

                        const active =
                            type === "base"
                                ? selectedBase[groupKey] === uid
                                : selectedAdditional[groupKey] === uid;

                        let isDisabled = false;

                        // Logika walidacji jednostek
                        if (isOptionalGroup && !active) {
                            if (type === "base" && isOptionalAdditionalSelected) {
                                isDisabled = true;
                                groupDisabledMessage = "Wybrano już jednostkę opcjonalną w Dodatkowych Jednostkach.";
                            } else if (type === "additional" && isOptionalBaseSelected) {
                                isDisabled = true;
                                groupDisabledMessage = "Wybrano już jednostkę opcjonalną w Podstawie Pułku.";
                            }
                        }

                        if (isOptionalGroup && type === "additional" && !active && !isDisabled) {
                            if (otherAdditionalCount === 0) {
                                isDisabled = true;
                                groupDisabledMessage = "Wymagana jest przynajmniej jedna inna jednostka dodatkowa.";
                            }
                        }

                        return (
                            <div key={uid} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '0 5px 10px 0' }}>
                                <Tile
                                    active={active}
                                    onClick={isDisabled ? () => {} : () =>
                                        type === "base"
                                            ? handleBaseClick(groupKey, uid)
                                            : handleAdditionalSelect(groupKey, uid)
                                    }
                                    style={{ opacity: isDisabled ? 0.4 : 1, cursor: isDisabled ? 'not-allowed' : 'pointer', marginBottom: 5 }}
                                >
                                    <div style={{ fontWeight: 700 }}>{getUnitName(uid)}</div>
                                    <div style={{ fontSize: 11, color: '#666' }}>({getFinalUnitCost(uid, false)} pkt)</div>
                                </Tile>

                                {/* INTERFEJS ULEPSZEŃ JEDNOSTKOWYCH */}
                                {active && unitLevelImprovements.length > 0 && !isGroupUnit && (
                                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 5 }}>
                                        {unitLevelImprovements.map(imp => {
                                            const isImpActive = improvements[positionKey]?.includes(imp.id);

                                            let impDisabled = false;

                                            // 1. Walidacja limitations
                                            if (imp.limitations && !imp.limitations.includes(uid)) {
                                                impDisabled = true;
                                            }

                                            // 2. Walidacja max_amount
                                            if (imp.max_amount === 1 && !isImpActive) {
                                                const isAlreadyUsed = Object.entries(improvements).some(([posKey, impList]) =>
                                                    posKey !== positionKey && impList.includes(imp.id)
                                                );
                                                if (isAlreadyUsed) {
                                                    impDisabled = true;
                                                }
                                            }

                                            // 3. Walidacja punktów (tylko dla dodawania)
                                            if (!isImpActive && newRemainingPointsAfterLocalChanges <= 0) {
                                                impDisabled = true;
                                            }

                                            return (
                                                <button
                                                    key={imp.id}
                                                    onClick={impDisabled ? () => {} : () => handleImprovementToggle(positionKey, uid, imp.id)}
                                                    style={{
                                                        fontSize: 10,
                                                        padding: '4px 6px',
                                                        borderRadius: 4,
                                                        border: isImpActive ? "1px solid #1b7e32" : "1px solid #aaa",
                                                        background: isImpActive ? "#e6ffe6" : "#f0f0f0",
                                                        color: '#333',
                                                        cursor: impDisabled ? 'not-allowed' : 'pointer',
                                                        opacity: impDisabled ? 0.4 : 1
                                                    }}
                                                    title={impDisabled ? "Niedostępne dla tej jednostki lub brak punktów ulepszeń." : imp.id}
                                                >
                                                    {isImpActive ? "✅ " : ""}{imp.id}
                                                </button>
                                            )
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {groupDisabledMessage && (
                    <div style={{ color: 'red', marginTop: 5, fontSize: 12 }}>
                        {groupDisabledMessage}
                    </div>
                )}
            </div>
        );
    };

    // NOWA FUNKCJA: Renderuje sloty niestandardowego kosztu
    const renderCustomCostSlot = () => {
        if (!customCostDefinition || !customCostSlotName) return null;

        const dependentUnitSelected = selectedAdditional[customCostSlotName];
        const isEnabled = !!dependentUnitSelected;
        const positionKey = `additional/${customCostSlotName}_custom`;

        return (
            <div key={customCostSlotName} style={{ marginBottom: 14 }}>
                <div style={{ marginBottom: 8, fontWeight: 700 }}>
                    Jednostka z niestandardowym kosztem (zależna od {customCostSlotName})
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", opacity: isEnabled ? 1 : 0.4, pointerEvents: isEnabled ? 'auto' : 'none' }}>

                    {customCostDefinition.map((def) => {
                        const uid = def.id;
                        const active = selectedAdditionalCustom === uid;
                        const finalCost = getFinalUnitCost(uid, true);
                        const unitDef = unitsMap[uid];
                        const isGroupUnit = unitDef?.rank === 'group';

                        return (
                            <div key={uid} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '0 5px 10px 0' }}>
                                <Tile
                                    active={active}
                                    onClick={() => handleCustomSelect(uid)}
                                    style={{ marginBottom: 5 }}
                                >
                                    <div style={{ fontWeight: 700 }}>{getUnitName(uid)}</div>
                                    <div style={{ fontSize: 11, color: '#0077ff', fontWeight: 700 }}>({finalCost} pkt)</div>
                                </Tile>

                                {/* INTERFEJS ULEPSZEŃ JEDNOSTKOWYCH */}
                                {active && unitLevelImprovements.length > 0 && !isGroupUnit && (
                                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 5 }}>
                                        {unitLevelImprovements.map(imp => {
                                            const isImpActive = improvements[positionKey]?.includes(imp.id);

                                            let impDisabled = false;

                                            // 1. Walidacja limitations
                                            if (imp.limitations && !imp.limitations.includes(uid)) { impDisabled = true; }

                                            // 2. Walidacja max_amount
                                            if (imp.max_amount === 1 && !isImpActive) {
                                                const isAlreadyUsed = Object.entries(improvements).some(([posKey, impList]) =>
                                                    posKey !== positionKey && impList.includes(imp.id)
                                                );
                                                if (isAlreadyUsed) { impDisabled = true; }
                                            }

                                            // 3. Walidacja punktów (tylko dla dodawania)
                                            if (!isImpActive && newRemainingPointsAfterLocalChanges <= 0) { impDisabled = true; }

                                            return (
                                                <button
                                                    key={imp.id}
                                                    onClick={impDisabled ? () => {} : () => handleImprovementToggle(positionKey, uid, imp.id)}
                                                    style={{
                                                        fontSize: 10,
                                                        padding: '4px 6px',
                                                        borderRadius: 4,
                                                        border: isImpActive ? "1px solid #1b7e32" : "1px solid #aaa",
                                                        background: isImpActive ? "#e6ffe6" : "#f0f0f0",
                                                        color: '#333',
                                                        cursor: impDisabled ? 'not-allowed' : 'pointer',
                                                        opacity: impDisabled ? 0.4 : 1
                                                    }}
                                                    title={impDisabled ? "Niedostępne dla tej jednostki lub brak punktów ulepszeń." : imp.id}
                                                >
                                                    {isImpActive ? "✅ " : ""}{imp.id}
                                                </button>
                                            )
                                        })}
                                    </div>
                                )}

                            </div>
                        );
                    })}
                </div>
                {!isEnabled && (
                    <div style={{ color: 'red', marginTop: 5, fontSize: 12 }}>
                        Wymaga wyboru jednostki w slocie "{customCostSlotName}".
                    </div>
                )}
            </div>
        );
    }


    return (
        <div style={{ display: "flex", gap: 25 }}>
            {/* LEWA STRONA — WYBÓR JEDNOSTEK */}
            <div style={{ flex: 1 }}>
                <button onClick={saveAndGoBack} style={{ marginBottom: 14 }}>← Zapisz i Powrót do Wyboru Pułków</button>

                <h2 style={{ marginTop: 0 }}>{regiment.name}</h2>
                <div style={{ color: "#444", marginBottom: 12 }}>
                    Frakcja: <strong>{faction.meta?.name ?? faction.meta?.key}</strong>
                </div>

                <p>
                    Koszt bazowy Pułku: <strong>{regiment.base_cost || 0} pkt</strong>
                    <br/>
                    Dostępne punkty ulepszeń w Dywizji:
                    <strong style={{ color: impColor, marginLeft: 5 }}>
                        {newRemainingPointsAfterLocalChanges} / {totalDivisionLimit}
                    </strong>
                    {newRemainingPointsAfterLocalChanges < 0 && <span style={{ color: 'red', marginLeft: 10 }}>[PRZEKROCZONO LIMIT!]</span>}

                </p>

                <section style={{ marginTop: 12 }}>
                    <h3 style={{ marginBottom: 10 }}>Podstawa Pułku</h3>

                    {/* Wstawienie interfejsu ulepszeń pułkowych na początku Podstawy */}
                    <RegimentImprovementsBlock />

                    {Object.keys(base)
                        .map((k) => renderRow(k, base[k], "base"))}
                </section>

                <section style={{ marginTop: 18 }}>
                    <h3 style={{ marginBottom: 10 }}>Dodatkowe jednostki w Pułku</h3>

                    {Object.keys(additional).filter(k => k !== 'unit_custom_cost').map((k) =>
                        renderRow(k, additional[k], "additional")
                    )}

                    {/* Renderowanie slotu niestandardowego kosztu */}
                    {renderCustomCostSlot()}
                </section>
            </div>

            {/* PRAWA KOLUMNA — PODSUMOWANIE */}
            <div
                style={{
                    width: 360,
                    padding: 15,
                    border: "1px solid #ddd",
                    borderRadius: 10,
                    height: "fit-content",
                    position: "sticky",
                    top: 20,
                    background: "#fafafa"
                }}
            >
                <h3 style={{ marginTop: 0 }}>Podsumowanie Pułku</h3>

                <div style={{ marginBottom: 10 }}>
                    <strong>Zwiad (Recon):</strong> {totalRecon}
                </div>
                <div style={{ marginBottom: 15 }}>
                    <strong>Motywacja (Mot.):</strong> {totalMotivation} pkt
                </div>

                <div style={{ marginBottom: 10 }}>
                    <strong>Koszt Bazowy Pułku:</strong> {regiment.base_cost || 0} pkt
                </div>

                <div style={{ marginBottom: 15 }}>
                    <strong>Wybrane jednostki:</strong>
                    <ul>
                        {/* Wybrane ulepszenia pułkowe */}
                        {regimentImprovements.length > 0 && (
                            <li style={{ color: '#0077ff', fontWeight: 600 }}>
                                Ulepszenia Pułku: {regimentImprovements.join(', ')}
                            </li>
                        )}

                        {/* Zestawienie jednostek PUŁKU */}
                        {[
                            ...Object.entries(selectedBase).map(([key, id]) => ({ type: 'base', key, id, isCustom: false })),
                            ...Object.entries(selectedAdditional).map(([key, id]) => ({ type: 'additional', key, id, isCustom: false })),
                            ...(selectedAdditionalCustom ? [{ type: 'additional', key: customCostSlotName + "_custom", id: selectedAdditionalCustom, isCustom: true }] : [])
                        ]
                            .filter(({ id }) => id)
                            .map(({ type, key, id, isCustom }) => {
                                const positionKey = isCustom ? `${type}/${customCostSlotName}_custom` : `${type}/${key}`;
                                const finalCost = getFinalUnitCost(id, isCustom);

                                return (
                                    <li key={positionKey}>
                                        <strong>{getUnitName(id)}</strong> ({finalCost} pkt)

                                        {improvements[positionKey] && improvements[positionKey].length > 0 && (
                                            <span style={{ fontSize: 11, color: '#1b7e32', marginLeft: 5 }}>
                                                (+ Ulepszenia: {improvements[positionKey].join(', ')})
                                            </span>
                                        )}
                                    </li>
                                )
                            })}

                        {/* NOWOŚĆ: JEDNOSTKI WSPARCIA PRZYPISANE DO TEGO PUŁKU */}
                        {configuredDivision.supportUnits
                            .filter(su => su.assignedTo?.positionKey === `${regimentGroup}/${regimentIndex}`)
                            .map((su, index) => (
                                <li key={`su-${index}`} style={{ color: '#0077ff' }}>
                                    <strong>[WSPARCIE] {unitsMap[su.id]?.name}</strong> ({unitsMap[su.id]?.cost || 0} pkt)
                                </li>
                            ))}
                    </ul>
                </div>

                <hr />

                {/* SEKCJA: Definicje Ulepszeń */}
                {(unitLevelImprovements.length > 0 || regimentLevelImprovements.length > 0) && (
                    <div style={{ marginBottom: 15 }}>
                        <strong>Definicje Ulepszeń:</strong>
                        <ul style={{ fontSize: 14, marginTop: 5, paddingLeft: 20 }}>
                            {regimentLevelImprovements.map(imp => (
                                <li key={imp.id + '_r'} style={{ color: '#0077ff' }}>
                                    {imp.id} ({imp.cost} IMP) (+{imp.army_point_cost} pkt armii) [PUŁK]
                                </li>
                            ))}
                            {unitLevelImprovements.map(imp => (
                                <li key={imp.id + '_u'} style={{ opacity: 0.6 }}>
                                    {imp.id} ({imp.cost} IMP) [JEDNOSTKA]
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
                <hr />

                <div style={{ marginTop: 10, fontSize: 18, fontWeight: 700 }}>
                    Całkowity Koszt Pułku: {totalCost} pkt
                </div>
            </div>
        </div>
    );
}