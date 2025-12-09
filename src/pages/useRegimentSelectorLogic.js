import { useState, useMemo } from "react";
import { calculateRegimentStats, calculateMainForceKey, collectRegimentUnits } from "../utils/armyMath";
import { IDS, GROUP_TYPES } from "../constants";
import { useArmyData } from "../context/ArmyDataContext";
import { checkSupportUnitRequirements } from "../utils/divisionRules";

export const useRegimentSelectorLogic = ({
                                             configuredDivision,
                                             setConfiguredDivision,
                                             getRegimentDefinition,
                                             divisionArtilleryDefinitions,
                                             additionalUnitsDefinitions,
                                             unitsMap,
                                             faction
                                         }) => {
    const { improvements } = useArmyData();
    const [playerName, setPlayerName] = useState("");
    const [divisionCustomName, setDivisionCustomName] = useState("");

    const allSupportDefinitions = useMemo(() => {
        return [...(divisionArtilleryDefinitions || []), ...(additionalUnitsDefinitions || [])];
    }, [divisionArtilleryDefinitions, additionalUnitsDefinitions]);

    const regimentsList = useMemo(() => {
        if (!configuredDivision) return [];
        const { vanguard, base, additional } = configuredDivision;
        return [
            ...(vanguard || []).map(r => ({ ...r, positionKey: `${GROUP_TYPES.VANGUARD}/${r.index}` })),
            ...base.map(r => ({ ...r, positionKey: `${GROUP_TYPES.BASE}/${r.index}` })),
            ...additional.map(r => ({ ...r, positionKey: `${GROUP_TYPES.ADDITIONAL}/${r.index}` })),
        ].filter(r => r.id !== IDS.NONE);
    }, [configuredDivision]);

    const purchasedSlotsMap = useMemo(() => {
        if (!configuredDivision) return {};
        const map = {};
        configuredDivision.supportUnits.forEach((su) => {
            if (su.definitionIndex !== undefined) {
                map[su.definitionIndex] = su.id;
            }
        });
        return map;
    }, [configuredDivision]);

    const unitsRulesMap = useMemo(() => {
        const map = {};
        allSupportDefinitions.forEach(item => {
            if (typeof item === 'object' && (item.name || item.id) && !item.type) {
                const key = item.name || item.id;
                map[key] = item.assignment_rules || {};
            }
            else if (typeof item === 'string') {
                map[item] = {};
            }
        });
        return map;
    }, [allSupportDefinitions]);

    // --- Handlery (bez zmian) ---
    const handleBuySupportUnit = (unitId, definitionIndex, remainingPoints) => {
        setConfiguredDivision(prev => {
            const currentSupportUnits = [...prev.supportUnits];
            const existingIndex = currentSupportUnits.findIndex(su => su.definitionIndex === definitionIndex);

            if (existingIndex !== -1 && currentSupportUnits[existingIndex].id === unitId) {
                currentSupportUnits.splice(existingIndex, 1);
                return { ...prev, supportUnits: currentSupportUnits };
            }

            if (existingIndex !== -1) {
                const unitDef = unitsMap[unitId];
                if (unitDef && unitDef.pu_cost) {
                    const oldId = currentSupportUnits[existingIndex].id;
                    const oldDef = unitsMap[oldId];
                    const oldCost = oldDef?.pu_cost || 0;
                    if (remainingPoints + oldCost - unitDef.pu_cost < 0) {
                        alert(`Brak Punktów Ulepszeń na zamianę. Potrzebujesz: ${unitDef.pu_cost - oldCost} więcej.`);
                        return prev;
                    }
                }
                currentSupportUnits[existingIndex] = {
                    ...currentSupportUnits[existingIndex],
                    id: unitId,
                    assignedTo: null
                };
                return { ...prev, supportUnits: currentSupportUnits };
            }

            const unitDef = unitsMap[unitId];
            if (unitDef && unitDef.pu_cost) {
                if (remainingPoints - unitDef.pu_cost < 0) {
                    alert(`Brak Punktów Ulepszeń. Koszt: ${unitDef.pu_cost}, Pozostało: ${remainingPoints}`);
                    return prev;
                }
            }
            currentSupportUnits.push({
                id: unitId,
                definitionIndex: definitionIndex,
                assignedTo: null
            });
            return { ...prev, supportUnits: currentSupportUnits };
        });
    };

    const handleRemoveSupportUnit = (definitionIndex) => {
        setConfiguredDivision(prev => {
            const newSupportUnits = prev.supportUnits.filter(su => su.definitionIndex !== definitionIndex);
            return { ...prev, supportUnits: newSupportUnits };
        });
    };

    const handleAssignSupportUnit = (definitionIndex, positionKey) => {
        let assignment = null;
        if (positionKey !== "") {
            const [group, idxStr] = positionKey.split('/');
            assignment = { group, index: parseInt(idxStr, 10), positionKey };
        }
        setConfiguredDivision(prev => {
            const newSupportUnits = prev.supportUnits.map(su => {
                if (su.definitionIndex === definitionIndex) {
                    return { ...su, assignedTo: assignment };
                }
                return su;
            });
            return { ...prev, supportUnits: newSupportUnits };
        });
    };

    const handleToggleAdditionalRegiment = (regimentId, sourceIndex, maxAmount) => {
        setConfiguredDivision(prev => {
            const currentAdditional = [...prev.additional];
            const existingIndex = currentAdditional.findIndex(r => r.sourceIndex === sourceIndex);

            if (existingIndex !== -1) {
                currentAdditional.splice(existingIndex, 1);
                const updatedAdditional = currentAdditional.map((r, idx) => ({ ...r, index: idx }));
                const newSupportUnits = prev.supportUnits.map(su => {
                    if (su.assignedTo && su.assignedTo.group === GROUP_TYPES.ADDITIONAL) {
                        return { ...su, assignedTo: null };
                    }
                    return su;
                });
                return { ...prev, additional: updatedAdditional, supportUnits: newSupportUnits };
            } else {
                if (currentAdditional.length >= maxAmount) {
                    alert(`Osiągnięto limit ${maxAmount} pułków dodatkowych.`);
                    return prev;
                }
                const newConfig = {
                    baseSelections: {}, additionalSelections: {}, additionalCustom: null, additionalEnabled: false,
                    optionalEnabled: {}, optionalSelections: {}, improvements: {}, regimentImprovements: [], isVanguard: false
                };
                const def = getRegimentDefinition(regimentId, faction?.meta?.key);
                if (def && def.structure) {
                    if (def.structure.base) {
                        Object.entries(def.structure.base).forEach(([slotKey, pods]) => {
                            if (slotKey === 'optional') return;
                            newConfig.baseSelections[slotKey] = pods.map(pod => Object.keys(pod)[0] || null);
                        });
                    }
                    if (def.structure.additional) {
                        Object.entries(def.structure.additional).forEach(([slotKey, pods]) => {
                            if (slotKey === 'optional') return;
                            newConfig.additionalSelections[slotKey] = pods.map(pod => Object.keys(pod)[0] || null);
                        });
                    }
                }
                const newRegiment = {
                    group: GROUP_TYPES.ADDITIONAL,
                    index: currentAdditional.length,
                    id: regimentId,
                    sourceIndex: sourceIndex,
                    customName: "",
                    config: newConfig
                };
                return { ...prev, additional: [...currentAdditional, newRegiment] };
            }
        });
    };

    const handleRegimentChange = (groupKey, index, newRegimentId) => {
        const tempDivision = JSON.parse(JSON.stringify(configuredDivision));
        const newConfig = {
            baseSelections: {}, additionalSelections: {}, additionalCustom: null, additionalEnabled: false,
            optionalEnabled: {}, optionalSelections: {}, improvements: {}, regimentImprovements: [], isVanguard: false
        };

        const def = getRegimentDefinition(newRegimentId);
        if (def && def.structure) {
            if (def.structure.base) {
                Object.entries(def.structure.base).forEach(([slotKey, pods]) => {
                    if (slotKey === 'optional') return;
                    newConfig.baseSelections[slotKey] = pods.map(pod => Object.keys(pod)[0] || null);
                });
            }
            if (def.structure.additional) {
                Object.entries(def.structure.additional).forEach(([slotKey, pods]) => {
                    if (slotKey === 'optional') return;
                    newConfig.additionalSelections[slotKey] = pods.map(pod => Object.keys(pod)[0] || null);
                });
            }
        }
        const unitsToRemoveIndices = [];
        const unitsToRemoveNames = [];
        tempDivision[groupKey][index] = { ...tempDivision[groupKey][index], id: newRegimentId };
        tempDivision.supportUnits.forEach((su, suIdx) => {
            let unitConfig = null;
            if (su.definitionIndex !== undefined) {
                unitConfig = allSupportDefinitions[su.definitionIndex];
            } else {
                unitConfig = allSupportDefinitions.find(u => (typeof u === 'string' && u === su.id) || (u.name === su.id));
            }
            if (unitConfig) {
                const check = checkSupportUnitRequirements(unitConfig, tempDivision, getRegimentDefinition);
                if (!check.isAllowed) {
                    unitsToRemoveIndices.push(suIdx);
                    unitsToRemoveNames.push(unitsMap[su.id]?.name || su.id);
                }
            }
        });

        if (unitsToRemoveNames.length > 0) {
            const confirmed = window.confirm(
                `Zmiana pułku spowoduje usunięcie następujących jednostek wsparcia (niespełnione wymagania):\n\n- ${unitsToRemoveNames.join("\n- ")}\n\nCzy chcesz kontynuować?`
            );
            if (!confirmed) return;
        }

        setConfiguredDivision((prev) => {
            const group = prev[groupKey];
            const newGroup = [...group];
            let newSupportUnits = [...prev.supportUnits];
            if (unitsToRemoveIndices.length > 0) {
                newSupportUnits = newSupportUnits.filter((_, idx) => !unitsToRemoveIndices.includes(idx));
            }
            newGroup[index] = { ...newGroup[index], id: newRegimentId, customName: "", config: newConfig };
            const positionKey = `${groupKey}/${index}`;
            newSupportUnits.forEach((su, i) => {
                if (su.assignedTo?.positionKey === positionKey) {
                    newSupportUnits[i] = { ...su, assignedTo: null };
                }
            });
            return { ...prev, [groupKey]: newGroup, supportUnits: newSupportUnits };
        });
    };

    const handleRegimentNameChange = (groupKey, index, newName) => {
        setConfiguredDivision(prev => {
            const newGroup = [...prev[groupKey]];
            newGroup[index] = { ...newGroup[index], customName: newName };
            return { ...prev, [groupKey]: newGroup };
        });
    };

    const handleGeneralChange = (unitId) => {
        setConfiguredDivision(prev => ({ ...prev, general: unitId }));
    };

    const handleMainForceSelect = (positionKey) => {
        setConfiguredDivision(prev => ({ ...prev, preferredMainForceKey: positionKey }));
    };

    const mainForceKey = useMemo(() => {
        if (!configuredDivision) return null;
        return calculateMainForceKey(configuredDivision, unitsMap, faction, getRegimentDefinition, improvements);
    }, [configuredDivision, faction, getRegimentDefinition, improvements, unitsMap]);

    // --- OBLICZENIA DLA VIEW (PRZENIESIONE Z KOMPONENTU) ---

    const calcStatsWrapper = (config, id) => calculateRegimentStats(config, id, configuredDivision, unitsMap, getRegimentDefinition, improvements);

    const isAllied = (regId) => {
        if (regId === IDS.NONE) return false;
        if (faction.regiments && faction.regiments[regId]) return false;
        const def = getRegimentDefinition(regId);
        if (def && def._sourceFaction === 'mercenaries') return false;
        return true;
    };

    const currentAlliesCount = useMemo(() => {
        const all = [...configuredDivision.vanguard, ...configuredDivision.base, ...configuredDivision.additional];
        return all.filter(r => r.id !== IDS.NONE && isAllied(r.id)).length;
    }, [configuredDivision]);

    const currentMainForceCost = useMemo(() => {
        if (!mainForceKey) return 0;
        const [group, idxStr] = mainForceKey.split('/');
        const index = parseInt(idxStr, 10);
        let reg = null;
        if (group === GROUP_TYPES.BASE) reg = configuredDivision.base[index];
        else if (group === GROUP_TYPES.ADDITIONAL) reg = configuredDivision.additional[index];
        if (reg) return calcStatsWrapper(reg.config, reg.id).cost;
        return 0;
    }, [mainForceKey, configuredDivision]);

    const activeRegimentsList = useMemo(() => {
        const all = [
            ...(configuredDivision.vanguard || []).map(r => ({ ...r, group: GROUP_TYPES.VANGUARD })),
            ...configuredDivision.base.map(r => ({ ...r, group: GROUP_TYPES.BASE })),
            ...configuredDivision.additional.map(r => ({ ...r, group: GROUP_TYPES.ADDITIONAL }))
        ];

        return all.filter(r => r.id !== IDS.NONE).map(r => {
            const def = getRegimentDefinition(r.id);
            const stats = calcStatsWrapper(r.config, r.id);
            const isMain = mainForceKey === `${r.group}/${r.index}`;
            const regimentPosKey = `${r.group}/${r.index}`;
            const regimentUnitsList = [];

            const addUnitToList = (unitId, key, isSupport) => {
                const unitDef = unitsMap[unitId];
                if (!unitDef) return;
                const imps = (r.config.improvements || {})[key] || [];
                const impNames = imps.map(impId => {
                    const impDef = improvements[impId];
                    const regImpDef = def.unit_improvements?.find(ui => ui.id === impId);
                    return impDef?.name || regImpDef?.name || impId;
                }).sort();
                const isCommander = unitDef.orders > 0 || (key && key.includes('general'));
                regimentUnitsList.push({ name: unitDef.name, imps: impNames, isCommander, orders: unitDef.orders, isSupport });
            };
            const collectedUnits = collectRegimentUnits(r.config, def);
            collectedUnits.forEach(item => addUnitToList(item.unitId, item.key, false));
            const assignedSupport = configuredDivision.supportUnits.filter(su => su.assignedTo?.positionKey === regimentPosKey);
            assignedSupport.forEach(su => { const key = `support/${su.id}-${regimentPosKey}`; addUnitToList(su.id, key, true); });
            const regImpNames = (r.config.regimentImprovements || []).map(impId => {
                const impDef = improvements[impId];
                const regImpDef = def.regiment_improvements?.find(ri => ri.id === impId);
                return impDef?.name || regImpDef?.name || impId;
            });
            return { id: r.id, name: def?.name || r.id, customName: r.customName, stats, isMain, isVanguard: r.group === GROUP_TYPES.VANGUARD, units: regimentUnitsList, regImps: regImpNames };
        });
    }, [configuredDivision, mainForceKey, improvements]);

    return {
        state: {
            playerName, setPlayerName,
            divisionCustomName, setDivisionCustomName,
            regimentsList, purchasedSlotsMap, unitsRulesMap, mainForceKey,

            // Nowe dane obliczone (Derived State)
            isAllied,
            currentAlliesCount,
            currentMainForceCost,
            activeRegimentsList
        },
        handlers: {
            handleBuySupportUnit, handleAssignSupportUnit, handleRemoveSupportUnit,
            handleRegimentChange, handleRegimentNameChange, handleGeneralChange, handleMainForceSelect,
            handleToggleAdditionalRegiment
        }
    };
};