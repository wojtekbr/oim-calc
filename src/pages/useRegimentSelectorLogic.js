import { useState, useMemo } from "react";
import {
    calculateRegimentStats,
    calculateMainForceKey,
    collectRegimentUnits,
    getEffectiveUnitImprovements
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

    // --- 1. Rozszerzona mapa jednostek (NAPRAWIONA) ---
    const augmentedUnitsMap = useMemo(() => {
        // Zaczynamy od oryginalnej mapy jednostek (z units.json)
        const newMap = { ...unitsMap };

        allSupportDefinitions.forEach(def => {
            if (!def || typeof def !== 'object') return;

            // Logika wyciągania ID (identyczna jak w rulesMap)
            let targetIds = [];

            if (def.type === 'group' && def.options) {
                def.options.forEach(opt => {
                    const optId = typeof opt === 'object' ? opt.id : opt;
                    if (optId) targetIds.push({ id: optId, override: opt });
                });
            } else {
                let id = def.id || def.name;

                // Obsługa struktury { unit1: ["id"] }
                if (!id) {
                    const keys = Object.keys(def);
                    const unitArrayKey = keys.find(k => Array.isArray(def[k]) && def[k].length > 0 && typeof def[k][0] === 'string');
                    if (unitArrayKey) {
                        id = def[unitArrayKey][0];
                    }
                }

                if (id) targetIds.push({ id, override: def });
            }

            // Aktualizacja mapy (BEZ NADPISYWANIA ISTNIEJĄCYCH DANYCH PUSTYMI OBIEKTAMI)
            targetIds.forEach(({ id, override }) => {
                const originalUnit = newMap[id];

                if (originalUnit) {
                    // SCENARIUSZ A: Jednostka istnieje w units.json.
                    // Sprawdzamy tylko, czy w divisions.json jest nadpisany koszt (cost_override)
                    const costOverride = override.cost || override.cost_override;

                    if (costOverride !== undefined) {
                        newMap[id] = { ...originalUnit, cost: costOverride };
                    }
                    // W przeciwnym razie ZOSTAWIAMY ORYGINAŁ (nie nadpisujemy go strukturą slotu!)
                } else {
                    // SCENARIUSZ B: Jednostki nie ma w units.json (rzadki przypadek, np. generyczny wóz)
                    // Wtedy używamy definicji z dywizji jako jedynej dostępnej
                    newMap[id] = { ...override, id: id, name: override.name || id, cost: override.cost || 0 };
                }
            });
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

    // --- 2. Mapa Zasad (Ta część działała dobrze, ale musi być spójna) ---
    const unitsRulesMap = useMemo(() => {
        const map = {};
        allSupportDefinitions.forEach(def => {
            if (!def) return;

            // 1. Obsługa GRUP
            if (typeof def === 'object' && def.type === 'group' && Array.isArray(def.options)) {
                def.options.forEach(opt => {
                    const optId = typeof opt === 'object' ? opt.id : opt;
                    if (optId) {
                        const rules = (typeof opt === 'object' ? opt.assignment_rules : null) || {};
                        map[optId] = rules;
                    }
                });
                return;
            }

            // 2. Obsługa prostych stringów
            if (typeof def === 'string') {
                map[def] = {};
                return;
            }

            // 3. Obsługa Obiektów (Standardowe i "pułkowe")
            if (typeof def === 'object') {
                let targetId = def.id || def.name;

                // Wyciąganie ID z formatu { unit1: ["id"] }
                if (!targetId) {
                    const keys = Object.keys(def);
                    const unitArrayKey = keys.find(k => Array.isArray(def[k]) && def[k].length > 0 && typeof def[k][0] === 'string');
                    if (unitArrayKey) {
                        targetId = def[unitArrayKey][0];
                    }
                }

                if (targetId) {
                    map[targetId] = def.assignment_rules || {};
                }
            }
        });
        return map;
    }, [allSupportDefinitions]);

    // --- HELPER: Czyszczenie konfiguracji pułku ze starych wpisów ---
    const cleanUpRegimentConfig = (divisionState, unitId, assignedTo) => {
        if (!assignedTo || !divisionState[assignedTo.group]) return divisionState;

        const groupKey = assignedTo.group;
        const index = assignedTo.index;
        const positionKey = assignedTo.positionKey;

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
        // Używamy augmentedUnitsMap, która teraz powinna mieć poprawne dane
        let unitDef = augmentedUnitsMap[unitId];

        // Fallback (zabezpieczenie)
        if (!unitDef) {
            const groupDef = allSupportDefinitions[definitionIndex];
            if (groupDef) {
                // ... (istniejąca logika fallbackowa) ...
                if (groupDef.options) {
                    const opt = groupDef.options.find(o => (typeof o === 'string' ? o : o.id) === unitId);
                    if (typeof opt === 'object') unitDef = opt;
                } else if (!groupDef.id && !groupDef.name) {
                    const keys = Object.keys(groupDef);
                    const unitArrayKey = keys.find(k => Array.isArray(groupDef[k]) && groupDef[k].includes(unitId));
                    if (unitArrayKey) unitDef = groupDef;
                } else if (groupDef.id === unitId || groupDef.name === unitId) {
                    unitDef = groupDef;
                }
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

                const rawImps = explicitImps || (r.config.improvements || {})[key] || [];

                const effectiveImps = getEffectiveUnitImprovements(
                    unitId,
                    rawImps,
                    divisionDefinition,
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