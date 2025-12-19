import { useState, useEffect, useMemo } from "react";
import { IDS, GROUP_TYPES } from "../constants";
import { useArmyData } from "../context/ArmyDataContext";
import {
    canUnitTakeImprovement,
    calculateSingleImprovementIMPCost,
    calculateRegimentStats,
    collectRegimentUnits,
    calculateMainForceKey,
    calculateEffectiveImprovementCount,
    checkIfImprovementIsMandatory
} from "../utils/armyMath";
import { calculateRuleBonuses, checkSupportUnitRequirements } from "../utils/divisionRules";
import { DIVISION_RULES_REGISTRY } from "../utils/divisionRules";
import { validateRegimentRules } from "../utils/regimentRules";

export const useRegimentLogic = ({
                                     regiment,
                                     configuredDivision,
                                     setConfiguredDivision,
                                     regimentGroup,
                                     regimentIndex,
                                     onBack,
                                     calculateImprovementPointsCost,
                                     calculateTotalSupplyBonus,
                                     remainingImprovementPoints,
                                     divisionDefinition: propDivisionDefinition,
                                     unitsMap,
                                     getRegimentDefinition,
                                     faction
                                 }) => {
    const { improvements: commonImprovements } = useArmyData();

    const divisionDefinition = propDivisionDefinition || regiment.divisionDefinition || {};

    const structure = regiment.structure || {};
    const base = structure.base || {};
    const additional = structure.additional || {};

    const currentConfig = configuredDivision?.[regimentGroup]?.[regimentIndex]?.config || {};
    const customCostDefinition = additional?.unit_custom_cost;
    const customCostSlotName = customCostDefinition?.[0]?.depends_on;

    const unitLevelImprovements = regiment.unit_improvements || [];
    const regimentLevelImprovements = regiment.regiment_improvements || [];

    // --- Assigned Support Units ---
    const assignedSupportUnits = useMemo(() => {
        const regimentPositionKey = `${regimentGroup}/${regimentIndex}`;
        return (configuredDivision.supportUnits || [])
            .filter(su => su.assignedTo?.positionKey === regimentPositionKey);
    }, [configuredDivision.supportUnits, regimentGroup, regimentIndex]);

    // --- effectiveUnitLevelImprovements ---
    const effectiveUnitLevelImprovements = useMemo(() => {
        const combined = [...unitLevelImprovements];

        const extraIds = new Set();

        // 1. Z zasad dywizyjnych
        if (divisionDefinition?.rules) {
            divisionDefinition.rules.forEach(rule => {
                const ruleImpl = DIVISION_RULES_REGISTRY[rule.id];
                let handledByRegistry = false;

                if (ruleImpl) {
                    if (typeof ruleImpl.getInjectedImprovements === 'function') {
                        const injected = ruleImpl.getInjectedImprovements(rule, regiment.id);
                        if (Array.isArray(injected)) {
                            injected.forEach(id => extraIds.add(id));
                        }
                        handledByRegistry = true;
                    } else if (ruleImpl.injectedImprovements) {
                        ruleImpl.injectedImprovements.forEach(id => extraIds.add(id));
                        handledByRegistry = true;
                    }
                }

                if (!handledByRegistry) {
                    if (rule.improvement_id) extraIds.add(rule.improvement_id);
                    if (rule.improvement_ids && Array.isArray(rule.improvement_ids)) {
                        rule.improvement_ids.forEach(id => extraIds.add(id));
                    }
                }
            });
        }

        // 2. Z definicji jednostek i struktury
        const tempConfig = currentConfig;
        const activeUnits = collectRegimentUnits(tempConfig, regiment);

        const supportUnitsToCheck = assignedSupportUnits.map(su => ({
            unitId: su.id
        }));
        const allUnitsToCheck = [...activeUnits, ...supportUnitsToCheck];

        allUnitsToCheck.forEach(u => {
            const unitDef = unitsMap[u.unitId];
            if (unitDef?.mandatory_improvements) {
                unitDef.mandatory_improvements.forEach(id => extraIds.add(id));
            }
            if (u.structureMandatory) {
                u.structureMandatory.forEach(id => extraIds.add(id));
            }
        });

        extraIds.forEach(extraId => {
            if (!combined.find(def => def.id === extraId)) {
                combined.push({ id: extraId });
            }
        });

        return combined;
    }, [unitLevelImprovements, divisionDefinition, regiment.id, currentConfig, assignedSupportUnits, unitsMap]);

    const [baseSelections, setBaseSelections] = useState(() => (currentConfig.baseSelections || {}));
    const [additionalSelections, setAdditionalSelections] = useState(() => (currentConfig.additionalSelections || {}));
    const [additionalEnabled, setAdditionalEnabled] = useState(() => !!currentConfig.additionalEnabled || false);
    const [optionalEnabled, setOptionalEnabled] = useState(() => (currentConfig.optionalEnabled || {}));
    const [optionalSelections, setOptionalSelections] = useState(() => (currentConfig.optionalSelections || {}));
    const [selectedAdditionalCustom, setSelectedAdditionalCustom] = useState(currentConfig.additionalCustom || null);
    const [improvements, setImprovements] = useState(currentConfig.improvements || {});
    const [regimentImprovements, setRegimentImprovements] = useState(currentConfig.regimentImprovements || []);

    const getUnitName = (id) => unitsMap?.[id]?.name || id;
    const getUnitCost = (id) => unitsMap?.[id]?.cost || 0;

    const getFinalUnitCost = (id, isCustom) => {
        if (!id) return 0;
        if (isCustom && customCostDefinition) {
            const found = customCostDefinition.find((d) => d.id === id);
            if (found && typeof found.cost === "number") return found.cost;
        }
        return getUnitCost(id);
    };

    const groupKeys = (obj) => (obj && typeof obj === "object" ? Object.keys(obj) : []);

    useEffect(() => {
        const initForGroup = (groupObj, prevSelections = {}) => {
            const out = { ...prevSelections };
            groupKeys(groupObj).forEach((gk) => {
                const arr = groupObj[gk] || [];
                let sel = Array.isArray(out[gk]) ? [...out[gk]].slice(0, arr.length) : [];

                for (let i = 0; i < arr.length; i++) {
                    const pod = arr[i] || {};
                    const optionKeys = Object.keys(pod);

                    const currentChoice = sel[i];
                    const isCurrentChoiceValid = currentChoice && optionKeys.includes(currentChoice);

                    if (currentChoice && !isCurrentChoiceValid) {
                        sel[i] = null;
                    }

                    if (!sel[i]) {
                        if (optionKeys.length > 0) {
                            const firstKey = optionKeys[0];
                            const firstOptionDef = pod[firstKey];
                            if (optionKeys.length === 1 || firstOptionDef?.mandatory) {
                                sel[i] = firstKey;
                            } else {
                                sel[i] = null;
                            }
                        } else {
                            sel[i] = null;
                        }
                    }
                }
                out[gk] = sel;
            });
            return out;
        };

        setBaseSelections(initForGroup(base, currentConfig.baseSelections || {}));
        setAdditionalSelections(initForGroup(additional, currentConfig.additionalSelections || {}));

        const optSelInit = { ...(currentConfig.optionalSelections || {}) };
        const optEnabledInit = { ...(currentConfig.optionalEnabled || {}) };

        const initOptionalGroup = (groupType, groupObj) => {
            if (Array.isArray(groupObj.optional)) {
                const key = `${groupType}/optional`;
                const groupArr = groupObj.optional;

                let currentArr = optSelInit[key];
                if (!Array.isArray(currentArr)) {
                    currentArr = new Array(groupArr.length).fill(null);
                } else {
                    currentArr = currentArr.slice(0, groupArr.length);
                    if (currentArr.length < groupArr.length) {
                        currentArr = [...currentArr, ...new Array(groupArr.length - currentArr.length).fill(null)];
                    }
                }

                currentArr = currentArr.map((val, idx) => {
                    const pod = groupArr[idx] || {};
                    const keys = Object.keys(pod);
                    if (val && !keys.includes(val)) return null;
                    if (!val && keys.length > 0) return keys[0];
                    return val;
                });

                optSelInit[key] = currentArr;

                if (optEnabledInit[key] === undefined) optEnabledInit[key] = !!currentConfig.optionalEnabled?.[key] || false;
            }
        }

        initOptionalGroup(GROUP_TYPES.BASE, base);
        initOptionalGroup(GROUP_TYPES.ADDITIONAL, additional);

        setOptionalSelections(optSelInit);
        setOptionalEnabled(optEnabledInit);
        setAdditionalEnabled(!!currentConfig.additionalEnabled);

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [regiment.id, structure]);

    // --- Effect wymuszający obowiązkowe ulepszenia ---
    useEffect(() => {
        const tempConfig = {
            baseSelections,
            additionalSelections,
            additionalCustom: selectedAdditionalCustom,
            additionalEnabled,
            optionalEnabled,
            optionalSelections
        };

        const activeUnits = collectRegimentUnits(tempConfig, regiment);

        const supportUnitsToCheck = assignedSupportUnits.map(su => ({
            unitId: su.id,
            key: `support/${su.id}-${su.assignedTo.positionKey}/0`
        }));

        const allUnitsToCheck = [...activeUnits, ...supportUnitsToCheck];

        let hasChanges = false;
        const nextImprovements = { ...improvements };

        allUnitsToCheck.forEach(u => {
            const unitDef = unitsMap[u.unitId];
            if (!unitDef) return;

            effectiveUnitLevelImprovements.forEach(imp => {
                let shouldAdd = false;

                if (checkIfImprovementIsMandatory(u.unitId, imp.id, divisionDefinition, regiment.id, unitsMap)) {
                    shouldAdd = true;
                }
                else if (unitDef.mandatory_improvements?.includes(imp.id)) {
                    shouldAdd = true;
                }
                else if (u.structureMandatory?.includes(imp.id)) {
                    shouldAdd = true;
                }

                if (shouldAdd) {
                    const currentList = nextImprovements[u.key] || [];
                    if (!currentList.includes(imp.id)) {
                        nextImprovements[u.key] = [...currentList, imp.id];
                        hasChanges = true;
                    }
                }
            });
        });

        if (hasChanges) {
            setImprovements(nextImprovements);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [baseSelections, additionalSelections, additionalEnabled, optionalSelections, optionalEnabled, selectedAdditionalCustom, regiment.id, divisionDefinition, effectiveUnitLevelImprovements, assignedSupportUnits]);

    const hasAdditionalBaseSelection = useMemo(() => {
        return Object.entries(additionalSelections).some(([key, arr]) => {
            if (key === GROUP_TYPES.OPTIONAL) return false;
            return Array.isArray(arr) && arr.some(val => val !== null && val !== IDS.NONE);
        });
    }, [additionalSelections]);

    const currentLocalConfig = useMemo(() => {
        return {
            baseSelections,
            additionalSelections,
            additionalCustom: selectedAdditionalCustom,
            additionalEnabled,
            optionalEnabled,
            optionalSelections,
            improvements,
            regimentImprovements,
            isVanguard: currentConfig.isVanguard
        };
    }, [baseSelections, additionalSelections, selectedAdditionalCustom, additionalEnabled, optionalEnabled, optionalSelections, improvements, regimentImprovements, currentConfig.isVanguard]);

    const stats = useMemo(() => {
        const tmpDivision = JSON.parse(JSON.stringify(configuredDivision));
        tmpDivision[regimentGroup][regimentIndex].config = currentLocalConfig;

        const rawStats = calculateRegimentStats(
            currentLocalConfig,
            regiment.id,
            tmpDivision,
            unitsMap,
            getRegimentDefinition,
            commonImprovements,
            faction
        );

        const mainForceKey = calculateMainForceKey(
            tmpDivision,
            unitsMap,
            faction,
            getRegimentDefinition,
            commonImprovements
        );

        const currentKey = `${regimentGroup}/${regimentIndex}`;
        const isMainForce = mainForceKey === currentKey;

        return {
            totalRecon: rawStats.recon,
            totalMotivation: rawStats.motivation + (isMainForce ? 1 : 0),
            totalActivations: rawStats.activations + (isMainForce ? 1 : 0),
            totalOrders: rawStats.orders,
            totalAwareness: rawStats.awareness,
            regimentType: rawStats.regimentType,
            cost: rawStats.cost,
            isMainForce
        };
    }, [currentLocalConfig, regiment.id, configuredDivision, unitsMap, getRegimentDefinition, commonImprovements, faction, regimentGroup, regimentIndex]);

    const totalCost = stats.cost;

    const regimentRuleErrors = useMemo(() => {
        const activeUnits = collectRegimentUnits(currentLocalConfig, regiment);
        return validateRegimentRules(activeUnits, regiment, { regimentConfig: currentLocalConfig });
    }, [currentLocalConfig, regiment]);

    const newRemainingPointsAfterLocalChanges = useMemo(() => {
        if (remainingImprovementPoints === undefined) return 0;
        const totalDivisionLimit = divisionDefinition.improvement_points || 0;

        const tmp = JSON.parse(JSON.stringify(configuredDivision));
        tmp[regimentGroup][regimentIndex].config = currentLocalConfig;

        const ruleBonuses = calculateRuleBonuses(tmp, divisionDefinition, unitsMap, getRegimentDefinition);
        const dynamicSupplyBonus = calculateTotalSupplyBonus(tmp, unitsMap, getRegimentDefinition, commonImprovements);
        const dynamicLimit = totalDivisionLimit + dynamicSupplyBonus + ruleBonuses.improvementPoints;
        const totalUsedWithLocalChanges = calculateImprovementPointsCost(tmp, unitsMap, getRegimentDefinition, commonImprovements);
        return dynamicLimit - totalUsedWithLocalChanges;
    }, [currentLocalConfig, configuredDivision, calculateTotalSupplyBonus, calculateImprovementPointsCost, divisionDefinition, remainingImprovementPoints, regimentGroup, regimentIndex, unitsMap, getRegimentDefinition, commonImprovements]);

    const handleSelectInPod = (type, groupKey, index, optionKey) => {
        // ... (logika handleSelectInPod - standardowa)
        let currentSelection = null;
        const isOptionalGroup = groupKey === GROUP_TYPES.OPTIONAL;

        if (isOptionalGroup) {
            currentSelection = optionalSelections[`${type}/optional`]?.[index];
        } else if (type === GROUP_TYPES.BASE) {
            currentSelection = baseSelections[groupKey]?.[index];
        } else if (type === GROUP_TYPES.ADDITIONAL) {
            currentSelection = additionalSelections[groupKey]?.[index];
        }

        const isDeselecting = currentSelection === optionKey;

        const groupDef = type === GROUP_TYPES.BASE ? base : additional;
        const pod = groupDef[groupKey]?.[index];
        const optionDef = pod?.[optionKey];

        const isToggleable = !!optionDef?.is_toggle;

        if (isDeselecting && !isOptionalGroup && !isToggleable) return;

        const newValue = (isDeselecting && (isOptionalGroup || isToggleable)) ? null : optionKey;

        if (newValue !== currentSelection) {
            setImprovements((p) => {
                const m = { ...p };
                const prefix = isOptionalGroup
                    ? `${type}/optional/${index}`
                    : `${type}/${groupKey}/${index}`;
                Object.keys(m).forEach(k => {
                    if (k.startsWith(prefix)) delete m[k];
                });
                return m;
            });
        }

        if (isOptionalGroup) {
            const mapKey = `${type}/optional`;
            const targetKey = mapKey;

            const rivalType = type === GROUP_TYPES.BASE ? GROUP_TYPES.ADDITIONAL : GROUP_TYPES.BASE;
            const rivalKey = `${rivalType}/${groupKey}`;

            const willEnable = newValue !== null;

            setOptionalEnabled(prev => {
                const next = { ...prev };
                next[targetKey] = willEnable;

                if (willEnable) {
                    next[rivalKey] = false;
                }
                return next;
            });

            setOptionalSelections(prev => {
                const next = { ...prev };
                let arr = next[mapKey] ? [...next[mapKey]] : [];
                if (arr.length <= index) {
                    const groupSize = (type === GROUP_TYPES.BASE ? base : additional).optional?.length || 0;
                    const newArr = Array(groupSize).fill(null);
                    arr.forEach((v, i) => newArr[i] = v);
                    arr = newArr;
                }
                arr[index] = newValue;
                next[mapKey] = arr;
                return next;
            });

            setImprovements(prev => {
                const m = { ...prev };
                if (!willEnable) {
                    Object.keys(m).forEach(k => {
                        if (k.startsWith(`${type}/${groupKey}/`)) delete m[k];
                    });
                }
                if (willEnable) {
                    Object.keys(m).forEach(k => {
                        if (k.startsWith(`${rivalType}/${groupKey}/`)) delete m[k];
                    });
                }
                return m;
            });
        } else if (type === GROUP_TYPES.BASE) {
            setBaseSelections(prev => {
                const next = { ...prev };
                const arr = [...(next[groupKey] || [])];
                arr[index] = newValue;
                next[groupKey] = arr;
                return next;
            });
        } else if (type === GROUP_TYPES.ADDITIONAL) {
            setAdditionalSelections(prev => {
                const next = { ...prev };
                const groupDef = additional[groupKey] || [];
                let arr = next[groupKey] ? [...next[groupKey]] : Array(groupDef.length).fill(null);
                arr[index] = newValue;
                next[groupKey] = arr;
                return next;
            });
        }
    };

    const handleCustomSelect = (unitId) => {
        const isDeselecting = selectedAdditionalCustom === unitId;
        const next = isDeselecting ? null : unitId;
        setSelectedAdditionalCustom(next);

        if (next && !additionalEnabled) setAdditionalEnabled(true);

        if (isDeselecting) {
            setImprovements((p) => { const m = { ...p }; delete m[`additional/${customCostSlotName}_custom`]; return m; });
            const hasAnyAdditional = hasAdditionalBaseSelection;
            if (!hasAnyAdditional) {
                setAdditionalEnabled(false);
            }
        }
    };

    const handleImprovementToggle = (positionKey, unitId, impId) => {
        const unitDef = unitsMap[unitId];
        if (unitDef?.rank === "group") return;

        const isMandatory = checkIfImprovementIsMandatory(unitId, impId, divisionDefinition, regiment.id, unitsMap);
        const currentUnitImps = improvements[positionKey] || [];
        const isRemoving = currentUnitImps.includes(impId);

        if (isMandatory && isRemoving) {
            return;
        }

        const canTake = canUnitTakeImprovement(unitDef, impId, regiment, divisionDefinition, unitsMap);
        if (!canTake) return;

        const regImpDef = effectiveUnitLevelImprovements.find(i => i.id === impId);

        const isAdding = !isRemoving;

        if (isAdding && regImpDef?.max_amount) {
            const nextImprovements = { ...improvements };
            const nextList = [...(nextImprovements[positionKey] || []), impId];
            nextImprovements[positionKey] = nextList;

            const nextConfig = {
                ...currentLocalConfig,
                improvements: nextImprovements
            };

            const nextEffectiveCount = calculateEffectiveImprovementCount(nextConfig, regiment, impId, divisionDefinition, unitsMap);

            if (nextEffectiveCount > regImpDef.max_amount) {
                alert(`Osiągnięto limit ulepszeń "${impId}" w tym pułku (${regImpDef.max_amount}).`);
                return;
            }
        }

        setImprovements((prev) => {
            const cur = Array.isArray(prev[positionKey]) ? [...prev[positionKey]] : [];
            if (cur.includes(impId)) {
                return { ...prev, [positionKey]: cur.filter(x => x !== impId) };
            } else {
                return { ...prev, [positionKey]: [...cur, impId] };
            }
        });
    };

    // --- ZMIANA: Obsługa Radio Buttonów (NAPRAWIONE) ---
    const handleRegimentImprovementToggle = (impId) => {
        setRegimentImprovements((prev) => {
            // ZAWSZE pobieramy pełną definicję z commonImprovements, aby mieć dostęp do pola 'group'
            const commonDef = commonImprovements[impId];
            const groupName = commonDef?.group; // Jeśli istnieje, to jest to radio w tej grupie

            // 1. Jeśli to jest część grupy (Radio)
            if (groupName) {
                // Jeśli klikamy w już zaznaczone radio -> nic nie rób (standard zachowania radio)
                if (prev.includes(impId)) {
                    return prev;
                    // Ewentualnie, jeśli chcesz pozwolić na odznaczanie (toggle off) radia, użyj kodu z dołu.
                    // Ale zazwyczaj radio buttona nie da się "odkliknąć" bez kliknięcia innego.
                    // Jeśli chcesz toggle:
                    /*
                    const idx = prev.lastIndexOf(impId);
                    return [...prev.slice(0, idx), ...prev.slice(idx + 1)];
                    */
                }

                // Sprawdzanie kosztu (jeśli dotyczy PU)
                const cost = commonDef?.cost || 0;
                const isArmyCost = commonDef?.army_cost || commonDef?.army_point_cost || commonDef?.army_cost_override;

                if (!isArmyCost && typeof cost === 'number' && newRemainingPointsAfterLocalChanges - cost < 0) {
                    alert("Brak punktów ulepszeń.");
                    return prev;
                }

                // Usuń inne ulepszenia z tej samej grupy
                const othersRemoved = prev.filter(existingId => {
                    // Musimy sprawdzić grupę istniejących ID w bazie commonImprovements
                    const existingDef = commonImprovements[existingId];
                    return existingDef?.group !== groupName;
                });

                return [...othersRemoved, impId];
            }

            // 2. Jeśli to zwykły Checkbox (brak grupy)
            if (prev.includes(impId)) {
                const idx = prev.lastIndexOf(impId);
                return [...prev.slice(0, idx), ...prev.slice(idx + 1)];
            }

            // Sprawdzanie kosztu
            const cost = commonDef?.cost || 0;
            const isArmyCost = commonDef?.army_cost || commonDef?.army_point_cost || commonDef?.army_cost_override;

            if (!isArmyCost && typeof cost === 'number' && newRemainingPointsAfterLocalChanges - cost < 0) {
                alert("Brak punktów ulepszeń.");
                return prev;
            }

            return [...prev, impId];
        });
    };

    const handleToggleOptionalGroup = (type, groupKey) => {
        // ... (bez zmian)
        const targetKey = `${type}/${groupKey}`;
        const rivalType = type === GROUP_TYPES.BASE ? GROUP_TYPES.ADDITIONAL : GROUP_TYPES.BASE;
        const rivalKey = `${rivalType}/${groupKey}`;

        const willEnable = !optionalEnabled[targetKey];

        setOptionalEnabled(prev => {
            const next = { ...prev };
            next[targetKey] = willEnable;

            if (willEnable) {
                next[rivalKey] = false;
            }
            return next;
        });

        setImprovements(prev => {
            const m = { ...prev };
            if (!willEnable) {
                Object.keys(m).forEach(k => {
                    if (k.startsWith(`${type}/${groupKey}/`)) delete m[k];
                });
            }
            if (willEnable) {
                Object.keys(m).forEach(k => {
                    if (k.startsWith(`${rivalType}/${groupKey}/`)) delete m[k];
                });
            }
            return m;
        });
    };

    const handleToggleAdditional = () => {
        // ... (bez zmian)
        setAdditionalEnabled(prev => {
            const next = !prev;
            if (!next) {
                setImprovements(prevImp => {
                    const nextImp = { ...prevImp };
                    Object.keys(nextImp).forEach(key => {
                        if (key.startsWith("additional/")) delete nextImp[key];
                    });
                    return nextImp;
                });
                setOptionalEnabled(optPrev => ({ ...optPrev, "additional/optional": false }));
                setSelectedAdditionalCustom(null);
            }
            return next;
        });
    };

    const saveAndGoBack = () => {
        // ... (bez zmian)
        if (regimentRuleErrors && regimentRuleErrors.length > 0) {
            alert("Popraw błędy w konfiguracji pułku przed zapisaniem.");
            return;
        }

        const activeUnits = collectRegimentUnits(currentLocalConfig, regiment);
        const usedImprovements = new Set();
        activeUnits.forEach(u => {
            (improvements[u.key] || []).forEach(impId => usedImprovements.add(impId));
        });

        for (const impId of usedImprovements) {
            const regImpDef = effectiveUnitLevelImprovements.find(i => i.id === impId);
            if (regImpDef?.max_amount) {
                const effectiveCount = calculateEffectiveImprovementCount(currentLocalConfig, regiment, impId, divisionDefinition, unitsMap);

                if (effectiveCount > regImpDef.max_amount) {
                    const commonDef = commonImprovements[impId];
                    const name = regImpDef.name || commonDef?.name || impId;
                    alert(`Błąd zapisu: Przekroczono limit ulepszenia "${name}".\nDozwolone: ${regImpDef.max_amount}, Obecnie: ${effectiveCount} (płatnych).\n\nProszę usunąć nadmiarowe ulepszenia.`);
                    return;
                }
            }
        }

        const tempDivisionForCheck = JSON.parse(JSON.stringify(configuredDivision));
        const groupRef = tempDivisionForCheck[regimentGroup];

        groupRef[regimentIndex].config = currentLocalConfig;

        const artDefs = divisionDefinition.division_artillery || [];
        const addDefs = divisionDefinition.additional_units || [];
        const allSupportDefinitions = [...artDefs, ...addDefs];

        const keptSupportUnits = [];
        const removedNames = [];

        (tempDivisionForCheck.supportUnits || []).forEach(su => {
            let unitConfig = null;

            if (su.definitionIndex !== undefined) {
                unitConfig = allSupportDefinitions[su.definitionIndex];
            } else {
                unitConfig = allSupportDefinitions.find(u =>
                    (typeof u === 'string' && u === su.id) ||
                    (u.name === su.id)
                );
            }

            if (unitConfig) {
                const check = checkSupportUnitRequirements(unitConfig, tempDivisionForCheck, getRegimentDefinition);
                if (check.isAllowed) {
                    keptSupportUnits.push(su);
                } else {
                    const reasonMsg = check.reason ? ` (${check.reason})` : "";
                    removedNames.push(`${getUnitName(su.id)}${reasonMsg}`);
                }
            } else {
                keptSupportUnits.push(su);
            }
        });

        if (removedNames.length > 0) {
            const confirmed = window.confirm(
                `Zapisanie zmian spowoduje usunięcie następujących jednostek wsparcia (niespełnione wymagania):\n\n- ${removedNames.join("\n- ")}\n\nCzy chcesz kontynuować?`
            );
            if (!confirmed) return;
        }

        setConfiguredDivision((prev) => {
            const next = JSON.parse(JSON.stringify(prev));
            next[regimentGroup][regimentIndex].config = currentLocalConfig;
            next.supportUnits = keptSupportUnits;
            return next;
        });

        onBack();
    };

    return {
        state: {
            baseSelections, additionalSelections, additionalEnabled,
            optionalEnabled, optionalSelections, selectedAdditionalCustom,
            improvements, regimentImprovements, newRemainingPointsAfterLocalChanges,
            stats, totalCost, assignedSupportUnits, hasAdditionalBaseSelection,
            regimentRuleErrors
        },
        definitions: {
            structure, base, additional, customCostDefinition, customCostSlotName,
            unitLevelImprovements: effectiveUnitLevelImprovements,
            regimentLevelImprovements,
            commonImprovements
        },
        handlers: {
            handleSelectInPod,
            handleCustomSelect,
            handleImprovementToggle,
            handleRegimentImprovementToggle,
            handleToggleOptionalGroup,
            handleToggleAdditional,
            saveAndGoBack,
            onBack
        },
        helpers: { getUnitName, getFinalUnitCost, groupKeys }
    };
};