import { useState, useMemo } from "react";
import {
    calculateRegimentStats,
    calculateMainForceKey,
    collectRegimentUnits,
    getEffectiveUnitImprovements // <--- 1. DODANY IMPORT
} from "../utils/armyMath";
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
                                             faction,
                                             divisionDefinition
                                         }) => {
    const { improvements } = useArmyData();
    const [playerName, setPlayerName] = useState("");
    const [divisionCustomName, setDivisionCustomName] = useState("");

    const allSupportDefinitions = useMemo(() => {
        return [...(divisionArtilleryDefinitions || []), ...(additionalUnitsDefinitions || [])];
    }, [divisionArtilleryDefinitions, additionalUnitsDefinitions]);

    // --- 1. Rozszerzona mapa jednostek ---
    const augmentedUnitsMap = useMemo(() => {
        const newMap = { ...unitsMap };
        allSupportDefinitions.forEach(def => {
            if (typeof def === 'object' && def.type === 'group' && Array.isArray(def.options)) {
                def.options.forEach(opt => {
                    if (typeof opt === 'object' && opt.id) {
                        newMap[opt.id] = { ...opt, cost: opt.cost || opt.cost_override || 0 };
                    }
                });
            } else if (typeof def === 'object' && def.id && !def.type) {
                newMap[def.id] = { ...def, cost: def.cost || def.cost_override || 0 };
            }
        });
        return newMap;
    }, [unitsMap, allSupportDefinitions]);

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
        const byIndex = {};
        configuredDivision.supportUnits.forEach(su => {
            if (su.definitionIndex !== undefined) {
                if (!byIndex[su.definitionIndex]) byIndex[su.definitionIndex] = [];
                byIndex[su.definitionIndex].push(su);
            }
        });
        Object.keys(byIndex).forEach(idx => {
            const units = byIndex[idx];
            if (units.length > 0) {
                map[idx] = units[0].sourcePackId || units[0].id;
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
            } else if (typeof item === 'string') {
                map[item] = {};
            }
            if (typeof item === 'object' && item.type === 'group' && Array.isArray(item.options)) {
                item.options.forEach(opt => {
                    if (typeof opt === 'object' && opt.id) {
                        map[opt.id] = opt.assignment_rules || {};
                    } else if (typeof opt === 'string') {
                        map[opt] = {};
                    }
                });
            }
        });
        return map;
    }, [allSupportDefinitions]);

    // --- HELPER: Czyszczenie konfiguracji pułku ze starych wpisów ---
    // (Ta funkcja jest kluczowa dla Twojego fixu z odpinaniem jednostek)
    const cleanUpRegimentConfig = (divisionState, unitId, assignedTo) => {
        if (!assignedTo || !divisionState[assignedTo.group]) return divisionState;

        const groupKey = assignedTo.group;
        const index = assignedTo.index;
        const positionKey = assignedTo.positionKey;

        // Kopia głęboka struktury pułku
        const newGroup = [...divisionState[groupKey]];
        const targetRegiment = { ...newGroup[index] };

        if (!targetRegiment.config) return divisionState;

        const newConfig = { ...targetRegiment.config };
        const newImprovements = { ...(newConfig.improvements || {}) };

        const prefixToRemove = `support/${unitId}-${positionKey}`;

        let hasChanges = false;
        Object.keys(newImprovements).forEach(key => {
            if (key.startsWith(prefixToRemove)) {
                delete newImprovements[key];
                hasChanges = true;
            }
        });

        if (hasChanges) {
            newConfig.improvements = newImprovements;
            targetRegiment.config = newConfig;
            newGroup[index] = targetRegiment;

            return {
                ...divisionState,
                [groupKey]: newGroup
            };
        }

        return divisionState;
    };

    // --- Handlery ---

    const handleBuySupportUnit = (unitId, definitionIndex, currentPoints) => {
        let unitDef = augmentedUnitsMap[unitId];
        if (!unitDef) {
            const allDefs = [...(divisionDefinition.division_artillery || []), ...(divisionDefinition.additional_units || [])];
            const groupDef = allDefs[definitionIndex];
            if (groupDef && groupDef.options) {
                const opt = groupDef.options.find(o => (typeof o === 'string' ? o : o.id) === unitId);
                if (typeof opt === 'object') unitDef = opt;
            } else if (groupDef && (groupDef.id === unitId || groupDef.name === unitId)) {
                unitDef = groupDef;
            }
        }
        if (!unitDef) return;

        setConfiguredDivision(prev => {
            const next = { ...prev };
            const newUnits = [];
            const baseUnit = {
                definitionIndex,
                assignedTo: null,
                improvements: []
            };

            if (unitDef.units && Array.isArray(unitDef.units)) {
                unitDef.units.forEach(subUnitId => {
                    newUnits.push({
                        ...baseUnit,
                        id: subUnitId,
                        sourcePackId: unitId,
                        instanceId: Math.random().toString(36).substr(2, 9)
                    });
                });
            } else {
                newUnits.push({
                    ...baseUnit,
                    id: unitId,
                    instanceId: Math.random().toString(36).substr(2, 9)
                });
            }
            next.supportUnits = [...next.supportUnits, ...newUnits];
            return next;
        });
    };

    const handleRemoveSupportUnit = (definitionIndex) => {
        setConfiguredDivision(prev => {
            let nextState = { ...prev };

            // Znajdź jednostki do usunięcia i wyczyść config
            const unitsToRemove = prev.supportUnits.filter(su => su.definitionIndex === definitionIndex);
            unitsToRemove.forEach(su => {
                if (su.assignedTo) {
                    nextState = cleanUpRegimentConfig(nextState, su.id, su.assignedTo);
                }
            });

            const newSupportUnits = nextState.supportUnits.filter(su => su.definitionIndex !== definitionIndex);
            return { ...nextState, supportUnits: newSupportUnits };
        });
    };

    const handleAssignSupportUnit = (definitionIndex, positionKey, specificInstanceId = null) => {
        let newAssignment = null;
        if (positionKey !== "") {
            const [group, idxStr] = positionKey.split('/');
            newAssignment = { group, index: parseInt(idxStr, 10), positionKey };
        }

        setConfiguredDivision(prev => {
            let nextState = { ...prev };

            const newSupportUnits = nextState.supportUnits.map(su => {
                const isTarget = specificInstanceId
                    ? su.instanceId === specificInstanceId
                    : su.definitionIndex === definitionIndex;

                if (isTarget) {
                    if (su.assignedTo) {
                        if (nextState[su.assignedTo.group] && nextState[su.assignedTo.group][su.assignedTo.index]) {
                            nextState = cleanUpRegimentConfig(nextState, su.id, su.assignedTo);
                        }
                    }
                    return { ...su, assignedTo: newAssignment, improvements: [] };
                }
                return su;
            });

            return { ...nextState, supportUnits: newSupportUnits };
        });
    };

    const handleToggleAdditionalRegiment = (regimentId, sourceIndex, maxAmount) => {
        setConfiguredDivision(prev => {
            const currentAdditional = [...prev.additional];
            const existingIndex = currentAdditional.findIndex(r => r.sourceIndex === sourceIndex);

            if (existingIndex !== -1) {
                // Usuwanie pułku
                currentAdditional.splice(existingIndex, 1);
                const updatedAdditional = currentAdditional.map((r, idx) => ({ ...r, index: idx }));

                let nextState = { ...prev, additional: updatedAdditional };

                const newSupportUnits = prev.supportUnits.map(su => {
                    if (su.assignedTo && su.assignedTo.group === GROUP_TYPES.ADDITIONAL) {
                        const assignedIdx = su.assignedTo.index;
                        if (assignedIdx >= existingIndex) {
                            return { ...su, assignedTo: null, improvements: [] };
                        }
                    }
                    return su;
                });

                return { ...nextState, supportUnits: newSupportUnits };

            } else {
                // Dodawanie pułku
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

        const unitsToRemoveIndices = [];
        const unitsToRemoveNames = [];
        tempDivision[groupKey][index] = { ...tempDivision[groupKey][index], id: newRegimentId };

        tempDivision.supportUnits.forEach((su, suIdx) => {
            let unitConfig = augmentedUnitsMap[su.id];
            if (!unitConfig) {
                const allDefs = allSupportDefinitions;
                unitConfig = allDefs.find(u => u.id === su.id || u.name === su.id);
            }

            if (unitConfig && su.assignedTo?.positionKey === `${groupKey}/${index}`) {
                const check = checkSupportUnitRequirements(unitConfig, tempDivision, getRegimentDefinition, augmentedUnitsMap, 'validate', divisionDefinition);
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
            let nextState = { ...prev };

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

            const newGroup = [...nextState[groupKey]];
            newGroup[index] = { ...newGroup[index], id: newRegimentId, customName: "", config: newConfig };
            nextState[groupKey] = newGroup;

            let newSupportUnits = [...nextState.supportUnits];

            if (unitsToRemoveIndices.length > 0) {
                newSupportUnits = newSupportUnits.filter((_, idx) => !unitsToRemoveIndices.includes(idx));
            }

            const positionKey = `${groupKey}/${index}`;
            newSupportUnits = newSupportUnits.map(su => {
                if (su.assignedTo?.positionKey === positionKey) {
                    return { ...su, assignedTo: null, improvements: [] };
                }
                return su;
            });

            nextState.supportUnits = newSupportUnits;
            return nextState;
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
        return calculateMainForceKey(configuredDivision, augmentedUnitsMap, faction, getRegimentDefinition, improvements);
    }, [configuredDivision, faction, getRegimentDefinition, improvements, augmentedUnitsMap]);

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

    // --- 2. ZMODYFIKOWANA activeRegimentsList (Wyświetlanie ulepszeń) ---
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

            const addUnitToList = (unitId, key, isSupport, explicitImps = null) => {
                const unitDef = unitsMap[unitId];
                if (!unitDef) return;

                // 2a. Pobieramy surowe ID ulepszeń (z configu lub z obiektu wsparcia)
                const rawImps = explicitImps || (r.config.improvements || {})[key] || [];

                // 2b. UŻYWAMY getEffectiveUnitImprovements, żeby połączyć zakupione z obowiązkowymi
                const effectiveImps = getEffectiveUnitImprovements(
                    unitId,
                    rawImps,
                    divisionDefinition,
                    // Dla wsparcia dajemy null jako regimentId, żeby pominąć walidację struktury pułku
                    // (bo jednostki wsparcia nie są w strukturze pułku, a getEffective... może je wyciąć)
                    isSupport ? null : r.id,
                    unitsMap
                );

                const impNames = effectiveImps.map(impId => {
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
            assignedSupport.forEach(su => {
                const key = `support/${su.id}-${regimentPosKey}`;
                // Przekazujemy su.improvements jako explicitImps
                addUnitToList(su.id, key, true, su.improvements);
            });

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
            isAllied,
            currentAlliesCount,
            currentMainForceCost,
            activeRegimentsList,
            unitsMap: augmentedUnitsMap
        },
        handlers: {
            handleBuySupportUnit, handleAssignSupportUnit, handleRemoveSupportUnit,
            handleRegimentChange, handleRegimentNameChange, handleGeneralChange, handleMainForceSelect,
            handleToggleAdditionalRegiment
        }
    };
};