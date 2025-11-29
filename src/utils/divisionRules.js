import { IDS } from "../constants";
import { collectRegimentUnits } from "./armyMath";

// --- LOGIKA BIZNESOWA (REGISTRY) ---
export const DIVISION_RULES_REGISTRY = {
    // ZASADA: Bonus PU za jednostki
    "additional_pu_points_for_units": {
        getBonus: (divisionConfig, unitsMap, getRegimentDefinition, params) => {
            const targetUnitIds = params?.unit_ids || [];
            const requiredAmount = params?.required_unit_amount || 2;
            const bonusPoints = params?.bonus_pu || 6; 

            if (targetUnitIds.length === 0) return null;

            let allUnits = [];
            const allRegiments = [
                ...(divisionConfig.vanguard || []),
                ...(divisionConfig.base || []),
                ...(divisionConfig.additional || [])
            ];

            allRegiments.forEach(reg => {
                if (reg.id !== IDS.NONE) {
                    const def = getRegimentDefinition(reg.id);
                    const units = collectRegimentUnits(reg.config || {}, def);
                    allUnits = allUnits.concat(units.map(u => u.unitId));
                }
            });

            const count = allUnits.filter(uid => uid && targetUnitIds.includes(uid)).length;

            if (count >= requiredAmount) {
                return { improvementPoints: bonusPoints, supply: 0, cost: 0 };
            }
            return null;
        }
    },

    // ZASADA: Limit ilości konkretnego pułku
    "limit_max_same_regiments": {
        validate: (divisionConfig, unitsMap, getRegimentDefinition, params) => {
            const errors = [];
            const targetRegimentId = params?.regiment_id;
            const maxLimit = (params?.max_amount !== undefined) ? params.max_amount : 1;

            if (!targetRegimentId) return [];

            const allRegiments = [
                ...(divisionConfig.vanguard || []),
                ...(divisionConfig.base || []),
                ...(divisionConfig.additional || [])
            ];

            let count = 0;
            allRegiments.forEach(reg => {
                if (reg.id === targetRegimentId) {
                    count++;
                }
            });

            if (count > maxLimit) {
                const def = getRegimentDefinition(targetRegimentId);
                const name = def ? def.name : targetRegimentId;
                errors.push(`Przekroczono limit: Możesz mieć maksymalnie ${maxLimit} pułk(i/ów) typu "${name}".`);
            }

            return errors;
        }
    }
};

// --- LOGIKA PREZENTACJI (DEFINITIONS) ---
export const DIVISION_RULES_DEFINITIONS = {
    "additional_pu_points_for_units": {
        title: "Dodatkowe PU za jednostki",
        getDescription: (params, context) => {
            const { unitsMap } = context;
            const requiredAmount = params?.required_unit_amount || 2;
            const bonusPoints = params?.bonus_pu || 6;
            const unitIds = params?.unit_ids || [];

            const unitNames = unitIds.map(id => unitsMap[id]?.name || id).join(" lub ");

            return `Jeśli Twoja dywizja zawiera przynajmniej ${requiredAmount} jednostek typu "${unitNames}", otrzymasz dodatkowo ${bonusPoints} Punktów Ulepszeń.`;
        }
    },

    "limit_max_same_regiments": {
        title: "Limit Pułków",
        getDescription: (params, context) => {
            const { getRegimentDefinition } = context;
            const targetId = params?.regiment_id;
            const max = params?.max_amount || 1;

            const regDef = getRegimentDefinition(targetId);
            const regName = regDef ? regDef.name : targetId;

            return `Możesz posiadać maksymalnie ${max} pułk(i/ów) typu: "${regName}".`;
        }
    }
};

// --- HELPERS ---

export const checkDivisionConstraints = (divisionConfig, divisionDefinition, candidateRegimentId) => {
    if (!divisionConfig || !divisionDefinition || !candidateRegimentId || candidateRegimentId === IDS.NONE) {
        return true;
    }
    if (!divisionDefinition.rules || !Array.isArray(divisionDefinition.rules)) {
        return true;
    }
    for (const ruleConfig of divisionDefinition.rules) {
        const { id, ...params } = ruleConfig;
        if (id === "limit_max_same_regiments") {
            const targetRegimentId = params?.regiment_id;
            const maxLimit = (params?.max_amount !== undefined) ? params.max_amount : 1;
            if (targetRegimentId === candidateRegimentId) {
                const allRegiments = [
                    ...(divisionConfig.vanguard || []),
                    ...(divisionConfig.base || []),
                    ...(divisionConfig.additional || [])
                ];
                let count = 0;
                allRegiments.forEach(reg => {
                    if (reg.id === targetRegimentId) {
                        count++;
                    }
                });
                if (count >= maxLimit) {
                    return false;
                }
            }
        }
    }
    return true;
};

export const calculateRuleBonuses = (divisionConfig, divisionDefinition, unitsMap, getRegimentDefinition) => {
    const totalBonus = { improvementPoints: 0, supply: 0, cost: 0 };
    if (!divisionDefinition?.rules || !Array.isArray(divisionDefinition.rules)) return totalBonus;

    divisionDefinition.rules.forEach(ruleConfig => {
        const { id, ...params } = ruleConfig;
        const ruleImpl = DIVISION_RULES_REGISTRY[id];
        if (ruleImpl && ruleImpl.getBonus) {
            const bonus = ruleImpl.getBonus(divisionConfig, unitsMap, getRegimentDefinition, params);
            if (bonus) {
                if (bonus.improvementPoints) totalBonus.improvementPoints += bonus.improvementPoints;
                if (bonus.supply) totalBonus.supply += bonus.supply;
                if (bonus.cost) totalBonus.cost += bonus.cost;
            }
        }
    });
    return totalBonus;
};

export const validateDivisionRules = (divisionConfig, divisionDefinition, unitsMap, getRegimentDefinition) => {
    let allErrors = [];
    if (!divisionDefinition?.rules || !Array.isArray(divisionDefinition.rules)) return allErrors;

    divisionDefinition.rules.forEach(ruleConfig => {
        const { id, ...params } = ruleConfig;
        const ruleImpl = DIVISION_RULES_REGISTRY[id];
        if (ruleImpl && ruleImpl.validate) {
            const errors = ruleImpl.validate(divisionConfig, unitsMap, getRegimentDefinition, params);
            if (errors && errors.length > 0) {
                allErrors = allErrors.concat(errors);
            }
        }
    });
    return allErrors;
};

export const getDivisionRulesDescriptions = (divisionDefinition, unitsMap, getRegimentDefinition) => {
    if (!divisionDefinition?.rules || !Array.isArray(divisionDefinition.rules)) return [];

    return divisionDefinition.rules.map(ruleConfig => {
        const { id, ...params } = ruleConfig;
        const definition = DIVISION_RULES_DEFINITIONS[id];

        if (!definition) return null;

        const description = definition.getDescription(params, { unitsMap, getRegimentDefinition });

        return {
            id,
            title: definition.title,
            description
        };
    }).filter(Boolean);
};

// --- NOWA FUNKCJA: Walidacja wymagań jednostek wsparcia ---
export const checkSupportUnitRequirements = (unitConfig, divisionConfig, getRegimentDefinition) => {
    // Jeśli to prosty string lub brak wymagań -> odblokowane
    if (typeof unitConfig === 'string' || !unitConfig.requirements || unitConfig.requirements.length === 0) {
        return { isAllowed: true, reason: null };
    }

    for (const req of unitConfig.requirements) {
        // TYP 1: regiment_contains_unit
        // Wymaga, aby w dywizji istniał pułk o danym ID, który zawiera w sobie (kupioną) jednostkę o danym ID.
        if (req.type === "regiment_contains_unit") {
            const { regiment_id, unit_id, min_amount = 1 } = req;

            // 1. Znajdź aktywne pułki tego typu
            const targetRegiments = [
                ...(divisionConfig.vanguard || []),
                ...(divisionConfig.base || []),
                ...(divisionConfig.additional || [])
            ].filter(r => r.id === regiment_id);

            if (targetRegiments.length === 0) {
                // Jeśli nie ma ani jednego takiego pułku
                // Możemy spróbować pobrać nazwę pułku, ale getRegimentDefinition wymaga ID
                const def = getRegimentDefinition(regiment_id);
                const regName = def ? def.name : regiment_id;
                return { isAllowed: false, reason: `Wymagany aktywny pułk: "${regName}"` };
            }

            // 2. Sprawdź zawartość tych pułków
            let found = false;
            for (const reg of targetRegiments) {
                const def = getRegimentDefinition(reg.id);
                // collectRegimentUnits zwraca TYLKO wybrane/aktywne jednostki
                const units = collectRegimentUnits(reg.config || {}, def);
                
                const count = units.filter(u => u.unitId === unit_id).length;
                if (count >= min_amount) {
                    found = true;
                    break;
                }
            }

            if (!found) {
                return { isAllowed: false, reason: `Wymagana jednostka (x${min_amount}) w pułku docelowym.` };
            }
        }
        // Tu można dodać kolejne typy wymagań (np. "global_unit_count")
    }

    return { isAllowed: true, reason: null };
};