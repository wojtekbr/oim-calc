import { IDS, GROUP_TYPES, RANK_TYPES } from "../../constants";
import { DIVISION_RULES_REGISTRY } from "../rules/divisionRulesRegistry";
import { REGIMENT_RULES_REGISTRY } from "../regimentRules";
import { collectRegimentUnits } from "./structureUtils";
import { calculateRegimentStats, calculateMainForceKey, isRegimentAllied } from "./statsUtils";

export const canUnitTakeImprovement = (unitDef, improvementId, regimentDefinition, divisionDefinition = null, unitsMap = null) => {
    if (!unitDef || !regimentDefinition) return false;
    if (unitDef.rank === RANK_TYPES.GROUP || unitDef.rank === 'group') return false;

    // Bypass: Jeśli ulepszenie jest obowiązkowe z dywizji, to można (nawet jeśli są inne ograniczenia)
    if (divisionDefinition && unitsMap && regimentDefinition) {
        if (checkIfImprovementIsMandatory(unitDef.id, improvementId, divisionDefinition, regimentDefinition.id, unitsMap)) {
            return true;
        }
    }

    const regImpDef = regimentDefinition.unit_improvements?.find(i => i.id === improvementId);
    if (!regImpDef) return false;

    // 1. Sprawdzenie ograniczeń w samej jednostce (units.json)
    if (unitDef.improvement_limitations?.includes(improvementId)) return false;

    // 2. Biała lista (units_allowed / limitations) - jeśli zdefiniowana, jednostka MUSI na niej być
    if (regImpDef.units_allowed && Array.isArray(regImpDef.units_allowed)) {
        if (!regImpDef.units_allowed.includes(unitDef.id)) return false;
    } else if (regImpDef.limitations && Array.isArray(regImpDef.limitations)) {
        if (!regImpDef.limitations.includes(unitDef.id)) return false;
    }

    // 3. NOWOŚĆ: Czarna lista (units_excluded) - jeśli zdefiniowana, jednostka NIE MOŻE na niej być
    if (regImpDef.units_excluded && Array.isArray(regImpDef.units_excluded)) {
        if (regImpDef.units_excluded.includes(unitDef.id)) return false;
    }

    return true;
};

// ... (reszta pliku bez zmian: checkIfImprovementIsMandatory, checkIfImprovementWouldBeFree itd.)

export const checkIfImprovementIsMandatory = (unitId, impId, divisionDefinition = null, regimentId = null, unitsMap = null) => {
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

export const checkIfImprovementWouldBeFree = (regimentConfig, regimentDefinition, targetUnitId, targetImpId, divisionDefinition = null, unitsMap = null) => {
    if (!regimentDefinition) return false;

    const activeUnits = collectRegimentUnits(regimentConfig, regimentDefinition);
    
    const rulesUsageState = {};
    if (regimentDefinition.special_rules) {
        regimentDefinition.special_rules.forEach((ruleEntry, idx) => {
            rulesUsageState[idx] = { usedCount: 0 };
        });
    }

    let isTargetFree = false;

    activeUnits.forEach(u => {
        const unitImps = regimentConfig.improvements?.[u.key] || [];
        const impsToCheck = (u.unitId === targetUnitId) ? [...unitImps, targetImpId] : unitImps;

        impsToCheck.forEach(impId => {
            if (regimentDefinition.special_rules) {
                regimentDefinition.special_rules.forEach((ruleEntry, ruleIdx) => {
                    const ruleId = typeof ruleEntry === 'string' ? ruleEntry : ruleEntry.id;
                    const params = typeof ruleEntry === 'object' ? ruleEntry : {};
                    const ruleImpl = REGIMENT_RULES_REGISTRY[ruleId];

                    if (ruleImpl && ruleImpl.isImprovementFree) {
                        const isFree = ruleImpl.isImprovementFree(u.unitId, impId, params, rulesUsageState[ruleIdx]);
                        if (u.unitId === targetUnitId && impId === targetImpId && isFree) {
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

            if (regimentDefinition.special_rules) {
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
        return {
            isValid: false,
            message: `Niedozwolona konfiguracja!\n\nStraż Przednia (${maxVanguardName}: ${maxVanguardCost} PS) nie może być droższa od Sił Głównych (${mainForceCost} PS).`
        };
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

    const allRegiments = [
        ...(divisionConfig.vanguard || []),
        ...(divisionConfig.base || []),
        ...(divisionConfig.additional || [])
    ];

    for (const reg of allRegiments) {
        if (reg.id !== IDS.NONE && isRegimentAllied(reg.id, selectedFaction, getRegimentDefinition)) {
            const stats = calculateRegimentStats(reg.config, reg.id, divisionConfig, unitsMap, getRegimentDefinition, commonImprovements);

            if (stats.cost > mainForceCost) {
                const def = getRegimentDefinition(reg.id);
                const name = def ? def.name : reg.id;

                return {
                    isValid: false,
                    message: `Niedozwolona konfiguracja!\n\nPułk sojuszniczy (${name}: ${stats.cost} PS) nie może mieć więcej punktów siły niż Siły Główne (${mainForceCost} PS).`
                };
            }
        }
    }

    return { isValid: true };
};