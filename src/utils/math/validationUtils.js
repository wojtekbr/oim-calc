import { IDS, GROUP_TYPES, RANK_TYPES } from "../../constants";
import { DIVISION_RULES_REGISTRY } from "../rules/divisionRulesRegistry";
import { REGIMENT_RULES_REGISTRY } from "../regimentRules";
import { collectRegimentUnits } from "./structureUtils";
import { calculateRegimentStats, calculateMainForceKey, isRegimentAllied } from "./statsUtils";

export const canUnitTakeImprovement = (unitDef, improvementId, regimentDefinition, divisionDefinition = null, unitsMap = null) => {
    if (!unitDef || !regimentDefinition) return false;
    if (unitDef.rank === RANK_TYPES.GROUP || unitDef.rank === 'group') return false;

    // 1. Sprawdzenie ulepszeń WYMUSZONYCH (Mandatory) przez dywizję/zasady
    if (divisionDefinition && unitsMap && regimentDefinition) {
        if (checkIfImprovementIsMandatory(unitDef.id, improvementId, divisionDefinition, regimentDefinition.id, unitsMap)) {
            return true;
        }
    }

    // 2. Sprawdzenie ulepszeń WYMUSZONYCH przez definicję jednostki
    if (unitDef.mandatory_improvements && unitDef.mandatory_improvements.includes(improvementId)) {
        return true;
    }

    // --- NOWA LOGIKA: BIAŁA LISTA (ALLOWED_IMPROVEMENTS) ---
    // Jeśli jednostka ma zdefiniowaną listę dozwolonych ulepszeń,
    // to improvementId MUSI się na niej znajdować.
    if (unitDef.allowed_improvements && Array.isArray(unitDef.allowed_improvements)) {
        if (!unitDef.allowed_improvements.includes(improvementId)) {
            return false;
        }
    }
    // -------------------------------------------------------

    // 3. Sprawdzenie czy ulepszenie w ogóle istnieje w pułku
    const regImpDef = regimentDefinition.unit_improvements?.find(i => i.id === improvementId);
    if (!regImpDef) return false;

    // 4. Sprawdzenie Czarnej Listy (IMPROVEMENT_LIMITATIONS) w jednostce
    if (unitDef.improvement_limitations?.includes(improvementId)) return false;

    // 5. Sprawdzenie ograniczeń w definicji ulepszenia (units_allowed / limitations / units_excluded)
    if (regImpDef.units_allowed && Array.isArray(regImpDef.units_allowed)) {
        if (!regImpDef.units_allowed.includes(unitDef.id)) return false;
    } else if (regImpDef.limitations && Array.isArray(regImpDef.limitations)) {
        if (!regImpDef.limitations.includes(unitDef.id)) return false;
    }

    if (regImpDef.units_excluded && Array.isArray(regImpDef.units_excluded)) {
        if (regImpDef.units_excluded.includes(unitDef.id)) return false;
    }

    return true;
};

export const checkIfImprovementIsMandatory = (unitId, impId, divisionDefinition = null, regimentId = null, unitsMap = null) => {
    if (unitsMap && unitId) {
        const unitDef = unitsMap[unitId];
        if (unitDef?.rank === RANK_TYPES.GROUP || unitDef?.rank === 'group') return false;

        if (unitDef?.mandatory_improvements?.includes(impId)) {
            return true;
        }
    }

    if (!divisionDefinition?.rules) return false;

    let isMandatory = false;
    divisionDefinition.rules.forEach(ruleConfig => {
        const ruleImpl = DIVISION_RULES_REGISTRY[ruleConfig.id];
        if (ruleImpl && ruleImpl.isMandatory) {
            if (ruleImpl.isMandatory(unitId, impId, ruleConfig, regimentId, unitsMap, divisionDefinition)) {
                isMandatory = true;
            }
        }
    });
    return isMandatory;
};

// --- FIX: Zmiana targetUnitId na targetUnitKey dla precyzji ---
export const checkIfImprovementWouldBeFree = (regimentConfig, regimentDefinition, targetUnitKey, targetImpId, divisionDefinition = null, unitsMap = null) => {
    if (!regimentDefinition) return false;

    const activeUnits = collectRegimentUnits(regimentConfig, regimentDefinition);

    // Znajdź jednostkę po kluczu pozycji, aby pobrać jej ID definicji
    const targetUnitObj = activeUnits.find(u => u.key === targetUnitKey);
    if (!targetUnitObj) return false;

    const targetUnitId = targetUnitObj.unitId;

    // Sprawdzenie wrodzonych (units.json)
    if (unitsMap && targetUnitId) {
        const unitDef = unitsMap[targetUnitId];
        if (unitDef?.rank === RANK_TYPES.GROUP || unitDef?.rank === 'group') return false;

        if (unitDef?.mandatory_improvements?.includes(targetImpId)) {
            return true;
        }
    }

    // Sprawdzenie strukturalnych (regiments.json)
    if (targetUnitObj.structureMandatory?.includes(targetImpId)) {
        return true;
    }

    const rulesUsageState = {};
    if (regimentDefinition.special_rules) {
        regimentDefinition.special_rules.forEach((ruleEntry, idx) => {
            rulesUsageState[idx] = { usedCount: 0 };
        });
    }

    let isTargetFree = false;

    activeUnits.forEach(u => {
        const unitImps = regimentConfig.improvements?.[u.key] || [];

        // FIX: Sprawdzamy konkretny klucz (u.key), a nie typ jednostki (u.unitId)
        // Symulujemy dodanie ulepszenia TYLKO do tej jednej, konkretnej jednostki
        const impsToCheck = (u.key === targetUnitKey) ? [...unitImps, targetImpId] : unitImps;

        impsToCheck.forEach(impId => {
            if (regimentDefinition.special_rules) {
                regimentDefinition.special_rules.forEach((ruleEntry, ruleIdx) => {
                    const ruleId = typeof ruleEntry === 'string' ? ruleEntry : ruleEntry.id;
                    const params = typeof ruleEntry === 'object' ? ruleEntry : {};
                    const ruleImpl = REGIMENT_RULES_REGISTRY[ruleId];

                    if (ruleImpl && ruleImpl.isImprovementFree) {
                        // Zasady nadal sprawdzają po ID typu (u.unitId), bo tak są zdefiniowane (np. "dla wszystkich ordyńców")
                        const isFree = ruleImpl.isImprovementFree(u.unitId, impId, params, rulesUsageState[ruleIdx]);

                        // Ale wynik przypisujemy tylko jeśli to jest ta konkretna instancja i to konkretne ulepszenie
                        if (u.key === targetUnitKey && impId === targetImpId && isFree) {
                            isTargetFree = true;
                        }
                    }
                });
            }
        });
    });

    if (isTargetFree) return true;

    if (divisionDefinition?.rules) {
        let isFreeByDivision = false;
        divisionDefinition.rules.forEach(ruleConfig => {
            const ruleImpl = DIVISION_RULES_REGISTRY[ruleConfig.id];
            if (ruleImpl && ruleImpl.isImprovementFree) {
                if (ruleImpl.isImprovementFree(targetUnitId, targetImpId, ruleConfig, regimentDefinition.id, unitsMap, divisionDefinition)) {
                    isFreeByDivision = true;
                }
            }
        });
        if (isFreeByDivision) return true;
    }

    return false;
};

export const calculateEffectiveImprovementCount = (regimentConfig, regimentDefinition, improvementId, divisionDefinition = null, unitsMap = null) => {
    if (!regimentDefinition) return 0;

    const activeUnits = collectRegimentUnits(regimentConfig, regimentDefinition);

    const rulesUsageState = {};
    if (regimentDefinition.special_rules) {
        regimentDefinition.special_rules.forEach((ruleEntry, idx) => {
            rulesUsageState[idx] = { usedCount: 0 };
        });
    }

    let count = 0;

    activeUnits.forEach(u => {
        const unitImps = regimentConfig.improvements?.[u.key] || [];

        if (unitImps.includes(improvementId)) {
            let isFree = false;

            if (unitsMap) {
                const unitDef = unitsMap[u.unitId];
                if (unitDef?.mandatory_improvements?.includes(improvementId)) {
                    isFree = true;
                }
            }

            if (!isFree && u.structureMandatory?.includes(improvementId)) {
                isFree = true;
            }

            if (!isFree && regimentDefinition.special_rules) {
                regimentDefinition.special_rules.forEach((ruleEntry, ruleIdx) => {
                    const ruleId = typeof ruleEntry === 'string' ? ruleEntry : ruleEntry.id;
                    const params = typeof ruleEntry === 'object' ? ruleEntry : {};
                    const ruleImpl = REGIMENT_RULES_REGISTRY[ruleId];

                    if (ruleImpl && ruleImpl.isImprovementFree) {
                        if (ruleImpl.isImprovementFree(u.unitId, improvementId, params, rulesUsageState[ruleIdx])) {
                            isFree = true;
                        }
                    }
                });
            }

            if (!isFree && divisionDefinition?.rules) {
                divisionDefinition.rules.forEach(ruleConfig => {
                    const ruleImpl = DIVISION_RULES_REGISTRY[ruleConfig.id];
                    if (ruleImpl && ruleImpl.isImprovementFree) {
                        if (ruleImpl.isImprovementFree(u.unitId, improvementId, ruleConfig, regimentDefinition.id, unitsMap, divisionDefinition)) {
                            isFree = true;
                        }
                    }
                });
            }

            if (!isFree) {
                count++;
            }
        }
    });

    return count;
};

export const getEffectiveUnitImprovements = (unitId, currentImprovements, divisionDefinition, regimentId, unitsMap) => {
    const unitDef = unitsMap?.[unitId];
    if (unitDef?.rank === RANK_TYPES.GROUP || unitDef?.rank === 'group') {
        return [];
    }

    const active = new Set(currentImprovements || []);

    if (unitDef?.mandatory_improvements) {
        unitDef.mandatory_improvements.forEach(id => active.add(id));
    }

    if (divisionDefinition?.rules) {
        divisionDefinition.rules.forEach(rule => {
            const ruleImpl = DIVISION_RULES_REGISTRY[rule.id];
            if (!ruleImpl) return;

            let candidates = [];
            if (typeof ruleImpl.getInjectedImprovements === 'function') {
                const injected = ruleImpl.getInjectedImprovements(rule, regimentId);
                if (Array.isArray(injected)) candidates.push(...injected);
            } else if (ruleImpl.injectedImprovements) {
                candidates.push(...ruleImpl.injectedImprovements);
            }
            if (rule.improvement_id) candidates.push(rule.improvement_id);
            if (rule.improvement_ids) candidates.push(...rule.improvement_ids);

            candidates.forEach(impId => {
                if (ruleImpl.isMandatory && ruleImpl.isMandatory(unitId, impId, rule, regimentId, unitsMap, divisionDefinition)) {
                    active.add(impId);
                }
            });
        });
    }

    return Array.from(active);
};

// ... (validateVanguardCost, validateAlliedCost bez zmian)
export const validateVanguardCost = (divisionConfig, unitsMap, selectedFaction, getRegimentDefinition, commonImprovements) => {
    const mainForceKey = calculateMainForceKey(divisionConfig, unitsMap, selectedFaction, getRegimentDefinition, commonImprovements);
    let mainForceCost = 0;
    if (mainForceKey) {
        const [group, idxStr] = mainForceKey.split('/');
        const idx = parseInt(idxStr, 10);
        let reg = null;
        if (group === GROUP_TYPES.BASE) reg = divisionConfig.base[idx];
        else if (group === GROUP_TYPES.ADDITIONAL) reg = divisionConfig.additional[idx];
        if (reg) {
            mainForceCost = calculateRegimentStats(reg.config, reg.id, divisionConfig, unitsMap, getRegimentDefinition, commonImprovements).cost;
        }
    }

    let maxVanguardCost = 0;
    let maxVanguardName = "";
    const vanguardRegiments = divisionConfig.vanguard || [];
    vanguardRegiments.forEach(reg => {
        if (reg.id !== IDS.NONE) {
            const stats = calculateRegimentStats(reg.config, reg.id, divisionConfig, unitsMap, getRegimentDefinition, commonImprovements);
            if (stats.cost > maxVanguardCost) {
                maxVanguardCost = stats.cost;
                const def = getRegimentDefinition(reg.id);
                maxVanguardName = def ? def.name : reg.id;
            }
        }
    });

    if (maxVanguardCost > mainForceCost) {
        return { isValid: false, message: `Niedozwolona konfiguracja!\n\nStraż Przednia (${maxVanguardName}: ${maxVanguardCost} PS) nie może być droższa od Sił Głównych (${mainForceCost} PS).` };
    }
    return { isValid: true };
};

export const validateAlliedCost = (divisionConfig, unitsMap, selectedFaction, getRegimentDefinition, commonImprovements) => {
    const mainForceKey = calculateMainForceKey(divisionConfig, unitsMap, selectedFaction, getRegimentDefinition, commonImprovements);
    let mainForceCost = 0;
    if (mainForceKey) {
        const [group, idxStr] = mainForceKey.split('/');
        const idx = parseInt(idxStr, 10);
        let reg = null;
        if (group === GROUP_TYPES.BASE) reg = divisionConfig.base[idx];
        else if (group === GROUP_TYPES.ADDITIONAL) reg = divisionConfig.additional[idx];
        if (reg) {
            mainForceCost = calculateRegimentStats(reg.config, reg.id, divisionConfig, unitsMap, getRegimentDefinition, commonImprovements).cost;
        }
    }

    const allRegiments = [ ...(divisionConfig.vanguard || []), ...(divisionConfig.base || []), ...(divisionConfig.additional || []) ];
    for (const reg of allRegiments) {
        if (reg.id !== IDS.NONE && isRegimentAllied(reg.id, selectedFaction, getRegimentDefinition)) {
            const stats = calculateRegimentStats(reg.config, reg.id, divisionConfig, unitsMap, getRegimentDefinition, commonImprovements);
            if (stats.cost > mainForceCost) {
                const def = getRegimentDefinition(reg.id);
                const name = def ? def.name : reg.id;
                return { isValid: false, message: `Niedozwolona konfiguracja!\n\nPułk sojuszniczy (${name}: ${stats.cost} PS) nie może mieć więcej punktów siły niż Siły Główne (${mainForceCost} PS).` };
            }
        }
    }
    return { isValid: true };
};