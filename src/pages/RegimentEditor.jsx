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
                                           calculateTotalSupplyBonus,
                                           remainingImprovementPoints,
                                           improvementPointsLimit,
                                           unitsMap,
                                       }) {
    // ... (struktury, konfiguracja, sloty - BEZ ZMIAN)
    const structure = regiment.structure || {};
    const base = structure.base || {};
    const additional = structure.additional || {};

    const currentConfig = configuredDivision[regimentGroup][regimentIndex].config;
    const divisionDefinition = regiment.divisionDefinition || {};

    const customCostDefinition = additional.unit_custom_cost;
    const customCostSlotName = customCostDefinition?.[0]?.depends_on;

    const [selectedBase, setSelectedBase] = useState(currentConfig.base || {});
    const [selectedAdditional, setSelectedAdditional] = useState(currentConfig.additional || {});
    const [selectedAdditionalCustom, setSelectedAdditionalCustom] = useState(currentConfig.additionalCustom || null);

    const [improvements, setImprovements] = useState(currentConfig.improvements || {});
    const [regimentImprovements, setRegimentImprovements] = useState(currentConfig.regimentImprovements || []);

    const saveAndGoBack = () => {
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

    useEffect(() => {
        if (Object.keys(currentConfig.base || {}).length === 0) {
            const baseDefaults = {};
            Object.entries(base).forEach(([k, arr]) => {
                const isOptional = k.toLowerCase().startsWith("optional");
                if (isOptional) baseDefaults[k] = null;
                else if (Array.isArray(arr) && arr.length > 0) baseDefaults[k] = arr[0];
                else baseDefaults[k] = null;
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
    // --- NOWOŚĆ: Helper do PU ---
    const getUnitPUCost = (unitId) => unitsMap[unitId]?.pu_cost || 0;

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

    // ... (Logika walidacji opcji, ulepszeń, koszt lokalny IMP - BEZ ZMIAN)
    const isOptionalBaseSelected = useMemo(() => {
        return Object.entries(selectedBase).some(([key, unitId]) => key.toLowerCase().startsWith("optional") && !!unitId);
    }, [selectedBase]);
    const isOptionalAdditionalSelected = useMemo(() => {
        return Object.entries(selectedAdditional).some(([key, unitId]) => key.toLowerCase().startsWith("optional") && !!unitId);
    }, [selectedAdditional]);
    const otherAdditionalCount = useMemo(() => {
        return Object.entries(selectedAdditional).filter(([k, v]) => !k.toLowerCase().startsWith("optional") && !!v).length;
    }, [selectedAdditional]);
    const isAnyOptionalSelected = isOptionalBaseSelected || isOptionalAdditionalSelected;

    const unitLevelImprovements = regiment.unit_improvements || [];
    const regimentLevelImprovements = regiment.regiment_improvements || [];

    const localImprovementCost = useMemo(() => {
        const tempRegimentConfig = {
            id: regiment.id, group: regimentGroup, index: regimentIndex,
            config: { base: selectedBase, additional: selectedAdditional, additionalCustom: selectedAdditionalCustom, improvements: improvements, regimentImprovements: regimentImprovements }
        };
        const hybridConfig = { ...tempRegimentConfig, supportUnits: configuredDivision.supportUnits };
        return calculateImprovementPointsCost(hybridConfig);
    }, [improvements, regimentImprovements, regiment.id, selectedBase, selectedAdditional, selectedAdditionalCustom, configuredDivision.supportUnits]);

    const newRemainingPointsAfterLocalChanges = useMemo(() => {
        if (remainingImprovementPoints === undefined) return 0;
        const totalDivisionLimit = divisionDefinition.improvement_points || 0;
        const tempDivisionConfig = JSON.parse(JSON.stringify(configuredDivision));
        tempDivisionConfig[regimentGroup][regimentIndex].config = {
            base: selectedBase, additional: selectedAdditional, additionalCustom: selectedAdditionalCustom, improvements: improvements, regimentImprovements: regimentImprovements,
        };
        const dynamicSupplyBonus = calculateTotalSupplyBonus ? calculateTotalSupplyBonus(tempDivisionConfig) : 0;
        const dynamicLimit = totalDivisionLimit + dynamicSupplyBonus;
        const totalUsedWithLocalChanges = calculateImprovementPointsCost(tempDivisionConfig);
        return dynamicLimit - totalUsedWithLocalChanges;
    }, [divisionDefinition, configuredDivision, regimentGroup, regimentIndex, selectedBase, selectedAdditional, selectedAdditionalCustom, improvements, regimentImprovements, calculateTotalSupplyBonus, calculateImprovementPointsCost, remainingImprovementPoints]);


    // ... (Handlery ulepszeń - BEZ ZMIAN)
    const handleImprovementToggle = (positionKey, unitId, impId) => {
        const unitDef = unitsMap[unitId];
        if (unitDef?.rank === 'group') return;
        setImprovements(prev => {
            const currentUnitImps = prev[positionKey] || [];
            const impDef = unitLevelImprovements.find(i => i.id === impId);
            if (!impDef) return prev;
            if (currentUnitImps.includes(impId)) return { ...prev, [positionKey]: currentUnitImps.filter(id => id !== impId) };
            else {
                if (impDef.max_amount === 1) {
                    const isAlreadyUsed = Object.entries(improvements).some(([posKey, impList]) => posKey !== positionKey && impList.includes(impId));
                    if (isAlreadyUsed) { alert(`Limit 1 na pułk.`); return prev; }
                }
                if (impDef.limitations && !impDef.limitations.includes(unitId)) { alert(`Ograniczenie jednostki.`); return prev; }
                const improvementBaseCost = unitDef.improvement_cost || 0;
                let potentialIMPCost = 0;
                if (impDef.cost === -1) potentialIMPCost = Math.max(1, improvementBaseCost - 1);
                else if (typeof impDef.cost === 'number') potentialIMPCost = impDef.cost;
                else if (impDef.cost === 'double') potentialIMPCost = improvementBaseCost * 2;
                else if (impDef.cost === 'triple') potentialIMPCost = improvementBaseCost * 3;
                else if (impDef.cost === 1) potentialIMPCost = improvementBaseCost;

                if (newRemainingPointsAfterLocalChanges - potentialIMPCost < 0) { alert(`Brak punktów ulepszeń.`); return prev; }
                return { ...prev, [positionKey]: [...currentUnitImps, impId] };
            }
        });
    };
    const handleRegimentImprovementToggle = (impId) => {
        setRegimentImprovements(prev => {
            const impDef = regimentLevelImprovements.find(i => i.id === impId);
            if (!impDef) return prev;
            const impOccurrences = regimentLevelImprovements.filter(imp => imp.id === impId).length;
            const currentCount = prev.filter(id => id === impId).length;
            if (prev.includes(impId)) {
                const index = prev.lastIndexOf(impId);
                return [...prev.slice(0, index), ...prev.slice(index + 1)];
            } else {
                if (currentCount >= impOccurrences) { alert(`Limit.`); return prev; }
                const potentialIMPCost = typeof impDef.cost === 'number' ? impDef.cost : 0;
                if (newRemainingPointsAfterLocalChanges - potentialIMPCost < 0) { alert(`Brak punktów IMP.`); return prev; }
                return [...prev, impId];
            }
        });
    };

    // === HANDLERY WYBORU JEDNOSTEK (Z NOWĄ WALIDACJĄ PU_COST) ===

    const handleBaseClick = (groupKey, unitId) => {
        const isOptional = groupKey.toLowerCase().startsWith("optional");
        const positionKey = `base/${groupKey}`;

        setSelectedBase((prev) => {
            const current = prev[groupKey];
            const next = current === unitId ? null : unitId;

            // Walidacja PU
            const currentPU = current ? getUnitPUCost(current) : 0;
            const nextPU = next ? getUnitPUCost(next) : 0;
            // Zmiana netto w punktach (dodatnia wartość to KOSZT, więc odejmujemy od pozostałych)
            const puDifference = nextPU - currentPU;

            if (newRemainingPointsAfterLocalChanges - puDifference < 0) {
                alert(`Brak Punktów Ulepszeń na tę jednostkę. Koszt: ${nextPU}, Pozostało: ${newRemainingPointsAfterLocalChanges + currentPU}`);
                return prev;
            }

            if (isOptional) {
                if (!isDeselect(current, unitId) && isOptionalAdditionalSelected) return prev;
                if (current !== next) setImprovements(p => { const n={...p}; delete n[positionKey]; return n; });
                return { ...prev, [groupKey]: next };
            }
            if (current !== unitId) setImprovements(p => { const n={...p}; delete n[positionKey]; return n; });
            return { ...prev, [groupKey]: unitId };
        });
    };
    const isDeselect = (current, next) => current === next || next === null;

    const handleAdditionalSelect = (groupKey, unitId) => {
        const isOptional = groupKey.toLowerCase().startsWith("optional");
        const positionKey = `additional/${groupKey}`;

        setSelectedAdditional((prev) => {
            const current = prev[groupKey];
            const next = current === unitId ? null : unitId;

            // Walidacja PU
            const currentPU = current ? getUnitPUCost(current) : 0;
            const nextPU = next ? getUnitPUCost(next) : 0;
            const puDifference = nextPU - currentPU;

            if (newRemainingPointsAfterLocalChanges - puDifference < 0) {
                alert(`Brak Punktów Ulepszeń na tę jednostkę. Koszt: ${nextPU}`);
                return prev;
            }

            if (isOptional) {
                if (next && next !== 'none' && isOptionalBaseSelected) return prev;
                if (next && next !== 'none' && otherAdditionalCount === 0) { alert("Wymagana inna jednostka."); return prev; }
            }
            if (current !== next) {
                setImprovements(p => { const n={...p}; delete n[positionKey]; return n; });
                if (groupKey === customCostSlotName) setSelectedAdditionalCustom(null);
            }
            return { ...prev, [groupKey]: next };
        });
    };

    const handleCustomSelect = (unitId) => {
        const positionKey = `additional/${customCostSlotName}_custom`;
        const current = selectedAdditionalCustom;
        const next = current === unitId ? null : unitId;

        // Walidacja PU
        const currentPU = current ? getUnitPUCost(current) : 0;
        const nextPU = next ? getUnitPUCost(next) : 0;
        const puDifference = nextPU - currentPU;

        if (newRemainingPointsAfterLocalChanges - puDifference < 0) {
            alert(`Brak Punktów Ulepszeń na tę jednostkę.`);
            return;
        }

        if (next && !selectedAdditional[customCostSlotName]) { alert(`Wymagany wybór w slocie "${customCostSlotName}".`); return; }
        if (current !== next) setImprovements(p => { const n={...p}; delete n[positionKey]; return n; });
        setSelectedAdditionalCustom(next);
    };

    // ... (totalCost i stats calculation - BEZ ZMIAN)
    const totalCost = useMemo(() => {
        let cost = regiment.base_cost || 0;
        regimentImprovements.forEach(impId => {
            const impDef = regimentLevelImprovements.find(i => i.id === impId);
            if (impDef && typeof impDef.army_point_cost === 'number') cost += impDef.army_point_cost;
        });
        const selectedUnitsByPosition = [
            ...Object.entries(selectedBase).map(([k, id]) => ({ key: `base/${k}`, id, isCustom: false })),
            ...Object.entries(selectedAdditional).map(([k, id]) => ({ key: `additional/${k}`, id, isCustom: false })),
            ...(selectedAdditionalCustom ? [{ key: customCostSlotName + "_custom", id: selectedAdditionalCustom, isCustom: true }] : [])
        ];
        selectedUnitsByPosition.forEach(({ key: posKey, id, isCustom }) => {
            if (!id) return;
            cost += getFinalUnitCost(id, isCustom);
            (improvements[posKey] || []).forEach(impId => {
                const impDef = unitLevelImprovements.find(i => i.id === impId);
                if (impDef && typeof impDef.army_point_cost === 'number') cost += impDef.army_point_cost;
            });
        });
        const regimentPositionKey = `${regimentGroup}/${regimentIndex}`;
        configuredDivision.supportUnits
            .filter(su => su.assignedTo?.positionKey === regimentPositionKey)
            .forEach(su => {
                cost += getUnitCost(su.id);
                const supportUnitKey = `support/${su.id}-${su.assignedTo.positionKey}`;
                (improvements[supportUnitKey] || []).forEach(impId => {
                    const impDef = unitLevelImprovements.find(i => i.id === impId);
                    if (impDef && typeof impDef.army_point_cost === 'number') cost += impDef.army_point_cost;
                });
            });
        return cost;
    }, [selectedBase, selectedAdditional, selectedAdditionalCustom, improvements, regimentImprovements, configuredDivision, regiment, regimentGroup, regimentIndex]);

    const { totalRecon, totalMotivation, totalActivations, totalOrders } = useMemo(() => {
        let recon = 0; let motivation = 0; let orders = 0;
        const regimentPositionKey = `${regimentGroup}/${regimentIndex}`;
        const unitPositions = [
            ...Object.entries(selectedBase).map(([k, id]) => ({ id, key: `base/${k}` })),
            ...Object.entries(selectedAdditional).map(([k, id]) => ({ id, key: `additional/${k}` })),
            { id: selectedAdditionalCustom, key: 'custom' }
        ];
        const supportIds = configuredDivision.supportUnits
            .filter(su => su.assignedTo?.positionKey === regimentPositionKey)
            .map(su => ({ id: su.id, key: 'support' }));

        [...unitPositions, ...supportIds].filter(item => item.id && item.id !== 'none').forEach(({ id: uid, key: positionKey }) => {
            const def = unitsMap[uid];
            if (!def) return;
            if (def.is_cavalry) recon++;
            if (def.is_light_cavalry) recon++;
            if (def.has_lances) recon--;
            if (def.is_pike_and_shot) recon--;
            if (def.are_looters_insubordinate) recon--;
            if (def.are_proxy_dragoons) recon++;
            if (def.are_scouts) recon++;
            if (def.are_dragoons) recon++;
            if (def.is_artillery) recon -= 2;
            if (def.are_wagons) recon -= 2;
            if (def.is_harassing) recon++;
            if (def.is_disperse) recon++;
            if (def.rank === 'bronze' || def.rank === 'silver') motivation += 1;
            else if (def.rank === 'gold') motivation += 2;
            if (def.orders) {
                let val = def.orders;
                if (positionKey === 'base/general') val += (regiment.commander_orders_bonus || 0);
                orders += val;
            }
        });
        recon += regiment.recon || 0;
        const isMainForce = regiment.isMainForce;
        if (isMainForce) motivation += 1;
        const activations = (regiment.activations || 0) + (isMainForce ? 1 : 0);
        return { totalRecon: recon, totalMotivation: motivation, totalActivations: activations, totalOrders: orders };
    }, [selectedBase, selectedAdditional, selectedAdditionalCustom, configuredDivision, regiment, unitsMap, regimentGroup, regimentIndex]);

    // --- RENDER FUNCTIONS ---
    const Tile = ({ children, active, onClick, style }) => (
        <div onClick={onClick} style={{ padding: "10px 12px", borderRadius: 8, border: active ? "2px solid #0077ff" : "1px solid #ddd", background: active ? "#e9f3ff" : "#fff", cursor: "pointer", minWidth: 160, textAlign: "center", boxShadow: active ? "0 1px 4px rgba(0,0,0,0.06)" : "none", ...style }}>{children}</div>
    );

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
                        const disabled = !canAdd || (newRemainingPointsAfterLocalChanges - impCost < 0);
                        return (
                            <div key={impId} style={{ display: 'flex', alignItems: 'center', gap: 4, border: '1px solid #ddd', padding: 5, borderRadius: 4 }}>
                                <span style={{ fontWeight: 600 }}>{impId}:</span>
                                <button onClick={disabled ? () => {} : () => handleRegimentImprovementToggle(impId)} style={{ fontSize: 12, padding: '4px 6px', borderRadius: 4, border: !disabled ? "1px solid #0077ff" : "1px solid #aaa", background: "#f0f0f0", color: '#333', cursor: !disabled ? 'pointer' : 'not-allowed', opacity: !disabled ? 1 : 0.4 }}>+ {impId}</button>
                                {currentCount > 0 && <button onClick={() => handleRegimentImprovementToggle(impId)} style={{ fontSize: 12, padding: '4px 6px', borderRadius: 4, background: '#ffcccc', border: '1px solid red', cursor: 'pointer' }}>-1</button>}
                                <span style={{ fontSize: 12, color: '#666' }}>({currentCount} / {impOccurrences})</span>
                            </div>
                        )
                    })}
                </div>
            </div>
        );
    };

    const renderUnitButtonsHelper = (positionKey, unitId) => {
        const unitDef = unitsMap[unitId];
        if (!unitDef || unitDef.rank === 'group' || unitLevelImprovements.length === 0) return null;
        return (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 5 }}>
                {unitLevelImprovements.map(imp => {
                    const isImpActive = (improvements[positionKey] || []).includes(imp.id);
                    let disabled = false;
                    if (imp.limitations && !imp.limitations.includes(unitId)) disabled = true;
                    if (imp.max_amount === 1 && !isImpActive) {
                        const isUsed = Object.entries(improvements).some(([k, arr]) => k !== positionKey && !k.startsWith('support/') && arr.includes(imp.id));
                        if (isUsed) disabled = true;
                    }
                    const improvementBaseCost = unitDef.improvement_cost || 0;
                    let cost = 0;
                    if (imp.cost === -1) cost = Math.max(1, improvementBaseCost - 1);
                    else if (typeof imp.cost === 'number') cost = imp.cost;
                    else if (imp.cost === 'double') cost = improvementBaseCost * 2;
                    else if (imp.cost === 'triple') cost = improvementBaseCost * 3;
                    else if (imp.cost === 1) cost = improvementBaseCost;

                    if (!isImpActive && newRemainingPointsAfterLocalChanges - cost < 0) disabled = true;

                    return (
                        <button key={imp.id} onClick={disabled ? ()=>{} : () => handleImprovementToggle(positionKey, unitId, imp.id)}
                                style={{ fontSize: 10, padding: '4px 6px', borderRadius: 4, border: isImpActive ? "1px solid #1b7e32" : "1px solid #aaa", background: isImpActive ? "#e6ffe6" : "#f0f0f0", color: '#333', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.4 : 1 }}>
                            {isImpActive ? "✅ " : ""}{imp.id}
                        </button>
                    )
                })}
            </div>
        );
    };

    const renderRow = (groupKey, unitIds, type) => {
        if (!Array.isArray(unitIds) || unitIds.length === 0) return null;
        return (
            <div key={groupKey} style={{ marginBottom: 14 }}>
                <div style={{ marginBottom: 8, fontWeight: 700 }}>{groupKey}</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {unitIds.map((uid) => {
                        if (uid === 'none') {
                            const active = type === "base" ? (selectedBase[groupKey] === 'none' || selectedBase[groupKey] === null) : selectedAdditional[groupKey] === 'none';
                            return (
                                <div key="none" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '0 5px 10px 0' }}>
                                    <Tile active={active} onClick={() => type === "base" ? handleBaseClick(groupKey, 'none') : handleAdditionalSelect(groupKey, 'none')}>
                                        <div style={{ fontWeight: 700, color: '#888' }}>Brak</div>
                                    </Tile>
                                </div>
                            );
                        }
                        const unitDef = unitsMap[uid];
                        if (!unitDef) return null;
                        const positionKey = `${type}/${groupKey}`;
                        const active = type === "base" ? selectedBase[groupKey] === uid : selectedAdditional[groupKey] === uid;

                        let ordersDisplay = null;
                        if (unitDef.orders) {
                            let val = unitDef.orders;
                            if (type === 'base' && groupKey === 'general') val += (regiment.commander_orders_bonus || 0);
                            ordersDisplay = val;
                        }

                        return (
                            <div key={uid} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '0 5px 10px 0' }}>
                                <Tile active={active} onClick={() => type === "base" ? handleBaseClick(groupKey, uid) : handleAdditionalSelect(groupKey, uid)}>
                                    <div style={{ fontWeight: 700 }}>{getUnitName(uid)}</div>
                                    <div style={{ fontSize: 11, color: '#666' }}>({getFinalUnitCost(uid, false)} pkt)</div>
                                    {ordersDisplay !== null && <div style={{ fontSize: 11, color: '#673ab7', fontWeight: 700 }}>Rozkazy: {ordersDisplay}</div>}
                                    {unitDef.pu_cost && <div style={{ fontSize: 11, color: '#d32f2f' }}>Koszt PU: {unitDef.pu_cost}</div>}
                                </Tile>
                                {active && renderUnitButtonsHelper(positionKey, uid)}
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    const renderCustomCostSlot = () => {
        if (!customCostDefinition || !customCostSlotName) return null;
        const dependentUnitSelected = selectedAdditional[customCostSlotName];
        const isEnabled = !!dependentUnitSelected && dependentUnitSelected !== 'none';
        const positionKey = `additional/${customCostSlotName}_custom`;
        return (
            <div key={customCostSlotName} style={{ marginBottom: 14 }}>
                <div style={{ marginBottom: 8, fontWeight: 700 }}>Jednostka z niestandardowym kosztem</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", opacity: isEnabled ? 1 : 0.4, pointerEvents: isEnabled ? 'auto' : 'none' }}>
                    {customCostDefinition.map((def) => {
                        const uid = def.id;
                        const active = selectedAdditionalCustom === uid;
                        const finalCost = getFinalUnitCost(uid, true);
                        return (
                            <div key={uid} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '0 5px 10px 0' }}>
                                <Tile active={active} onClick={() => handleCustomSelect(uid)} style={{ marginBottom: 5 }}>
                                    <div style={{ fontWeight: 700 }}>{getUnitName(uid)}</div>
                                    <div style={{ fontSize: 11, color: '#0077ff', fontWeight: 700 }}>({finalCost} pkt)</div>
                                </Tile>
                                {active && renderUnitButtonsHelper(positionKey, uid)}
                            </div>
                        );
                    })}
                </div>
                {!isEnabled && <div style={{ color: 'red', marginTop: 5, fontSize: 12 }}>Wymaga wyboru w slocie "{customCostSlotName}".</div>}
            </div>
        );
    }

    const renderSupportUnitImprovements = () => {
        const regimentPositionKey = `${regimentGroup}/${regimentIndex}`;
        const assignedSupportUnits = configuredDivision.supportUnits.filter(su => su.assignedTo?.positionKey === regimentPositionKey);
        if (assignedSupportUnits.length === 0) return null;

        return (
            <section style={{ marginTop: 18 }}>
                <h3 style={{ marginBottom: 10 }}>Ulepszenia Jednostek Wsparcia</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {assignedSupportUnits.map((su, index) => {
                        const unitDef = unitsMap[su.id];
                        const supportUnitKey = `support/${su.id}-${su.assignedTo.positionKey}`;
                        return (
                            <div key={index} style={{ padding: 10, border: '1px dashed #0077ff', borderRadius: 6, background: '#f5f8ff' }}>
                                <div style={{ fontWeight: 700, marginBottom: 5 }}>Wsparcie: {unitDef.name}</div>
                                {renderUnitButtonsHelper(supportUnitKey, su.id)}
                            </div>
                        )
                    })}
                </div>
            </section>
        );
    };

    const totalDivisionLimit = divisionDefinition.improvement_points || 0;
    const displayTotalLimit = (divisionDefinition.improvement_points || 0) + calculateTotalSupplyBonus(configuredDivision);
    const impColor = newRemainingPointsAfterLocalChanges < 0 ? 'red' : newRemainingPointsAfterLocalChanges === displayTotalLimit ? '#666' : '#1b7e32';

    return (
        <div style={{ display: "flex", gap: 25 }}>
            <div style={{ flex: 1 }}>
                <button onClick={saveAndGoBack} style={{ marginBottom: 14 }}>← Zapisz i Powrót</button>
                <h2 style={{ marginTop: 0 }}>{regiment.name}</h2>
                <p>
                    Koszt bazowy Pułku: <strong>{regiment.base_cost || 0} pkt</strong><br/>
                    Punkty ulepszeń Dywizji: <strong style={{ color: impColor }}>{newRemainingPointsAfterLocalChanges} / {displayTotalLimit}</strong>
                </p>
                <section style={{ marginTop: 12 }}>
                    <h3 style={{ marginBottom: 10 }}>Podstawa Pułku</h3>
                    <RegimentImprovementsBlock />
                    {Object.keys(base).map((k) => renderRow(k, base[k], "base"))}
                </section>
                <section style={{ marginTop: 18 }}>
                    <h3 style={{ marginBottom: 10 }}>Dodatkowe jednostki</h3>
                    {Object.keys(additional).filter(k => k !== 'unit_custom_cost').map((k) => renderRow(k, additional[k], "additional"))}
                    {renderCustomCostSlot()}
                </section>
                {renderSupportUnitImprovements()}
            </div>
            <div style={{ width: 360, padding: 15, border: "1px solid #ddd", borderRadius: 10, height: "fit-content", position: "sticky", top: 20, background: "#fafafa" }}>
                <h3 style={{ marginTop: 0 }}>Podsumowanie Pułku</h3>
                <div style={{ marginBottom: 10 }}><strong>Zwiad:</strong> {totalRecon} | <strong>Motywacja:</strong> {totalMotivation} | <strong>Aktywacje:</strong> {totalActivations} | <strong>Rozkazy:</strong> {totalOrders}</div>
                <div style={{ marginBottom: 15 }}>
                    <strong>Wybrane jednostki:</strong>
                    <ul>
                        {regimentImprovements.length > 0 && <li style={{ color: '#0077ff' }}>Ulepszenia Pułku: {regimentImprovements.join(', ')}</li>}
                        {[
                            ...Object.entries(selectedBase).map(([k, id]) => ({ key: `base/${k}`, id, isCustom: false })),
                            ...Object.entries(selectedAdditional).map(([k, id]) => ({ key: `additional/${k}`, id, isCustom: false })),
                            ...(selectedAdditionalCustom ? [{ key: customCostSlotName + "_custom", id: selectedAdditionalCustom, isCustom: true }] : [])
                        ].filter(u => u.id && u.id !== 'none').map(u => (
                            <li key={u.key}>
                                <strong>{getUnitName(u.id)}</strong> ({getFinalUnitCost(u.id, u.isCustom)} pkt)
                                {(improvements[u.key] || []).length > 0 && <span style={{ fontSize: 11, color: '#1b7e32' }}> (+ {improvements[u.key].join(', ')})</span>}
                            </li>
                        ))}
                        {configuredDivision.supportUnits.filter(su => su.assignedTo?.positionKey === `${regimentGroup}/${regimentIndex}`).map((su, i) => (
                            <li key={`su-${i}`} style={{ color: '#0077ff' }}>
                                <strong>[WSPARCIE] {unitsMap[su.id]?.name}</strong> ({unitsMap[su.id]?.cost || 0} pkt)
                                {(improvements[`support/${su.id}-${su.assignedTo.positionKey}`] || []).length > 0 &&
                                <span style={{ fontSize: 11, color: '#1b7e32' }}> (+ {improvements[`support/${su.id}-${su.assignedTo.positionKey}`].join(', ')})</span>}
                            </li>
                        ))}
                    </ul>
                </div>
                <hr />
                <div style={{ fontSize: 18, fontWeight: 700 }}>Całkowity Koszt: {totalCost} pkt</div>
            </div>
        </div>
    );
}