import { REGIMENT_RULES_REGISTRY } from "./rules/regimentRulesRegistry";
import { REGIMENT_RULES_DEFINITIONS } from "./rules/regimentRulesDefinitions";

// CZYSTY EXPORT DLA RESZTY SYSTEMU
export { REGIMENT_RULES_REGISTRY, REGIMENT_RULES_DEFINITIONS };

// --- HELPERS ---

export const validateRegimentRules = (activeUnits, regimentDefinition, context) => {
    const errors = [];
    if (!regimentDefinition?.special_rules) return errors;

    regimentDefinition.special_rules.forEach(ruleEntry => {
        const ruleId = typeof ruleEntry === 'string' ? ruleEntry : ruleEntry.id;
        const params = typeof ruleEntry === 'object' ? ruleEntry : {};

        const ruleImpl = REGIMENT_RULES_REGISTRY[ruleId];
        if (ruleImpl && ruleImpl.validate) {
            const error = ruleImpl.validate(activeUnits, params, context);
            if (error) errors.push(error);
        }
    });
    return errors;
};

export const applyRegimentRuleStats = (baseStats, activeUnits, regimentDefinition, context) => {
    if (!regimentDefinition?.special_rules) return baseStats;

    let newStats = { ...baseStats };

    regimentDefinition.special_rules.forEach(ruleEntry => {
        const ruleId = typeof ruleEntry === 'string' ? ruleEntry : ruleEntry.id;
        const params = typeof ruleEntry === 'object' ? ruleEntry : {};

        const ruleImpl = REGIMENT_RULES_REGISTRY[ruleId];
        if (ruleImpl && ruleImpl.modifyStats) {
            const mods = ruleImpl.modifyStats(newStats, activeUnits, params, context);
            if (mods) {
                newStats = { ...newStats, ...mods };
            }
        }
    });
    return newStats;
};

// --- FIX: Poprawiona obsługa getDescription vs description ---
export const getRegimentRulesDescriptions = (regimentDefinition, unitsMap) => {
    if (!regimentDefinition?.special_rules) return [];

    return regimentDefinition.special_rules.map(ruleEntry => {
        const ruleId = typeof ruleEntry === 'string' ? ruleEntry : ruleEntry.id;
        const params = typeof ruleEntry === 'object' ? ruleEntry : {};

        let def = REGIMENT_RULES_DEFINITIONS[ruleId];

        if (!def) {
            const registryItem = REGIMENT_RULES_REGISTRY[ruleId];
            if (registryItem && registryItem.name) {
                def = {
                    title: registryItem.name,
                    description: registryItem.description
                };
            }
        }

        if (!def) return null;

        const title = params.name_override || def.title;

        let description = "";

        // 1. Sprawdzamy czy istnieje funkcja getDescription (dla dynamicznych opisów)
        if (typeof def.getDescription === 'function') {
            description = def.getDescription(params, { unitsMap });
        }
        // 2. Sprawdzamy czy description jest funkcją (alternatywny zapis)
        else if (typeof def.description === 'function') {
            description = def.description(params, { unitsMap });
        }
        // 3. Traktujemy description jako zwykły string
        else {
            description = def.description;
        }

        return { id: ruleId, title, description };
    }).filter(Boolean);
};

export const applyRegimentRuleCosts = (baseCost, regimentDefinition, context) => {
    if (!regimentDefinition?.special_rules) return baseCost;

    let newCost = baseCost;
    regimentDefinition.special_rules.forEach(rule => {
        const ruleId = typeof rule === 'string' ? rule : rule.id;
        const params = typeof rule === 'object' ? rule : {};

        const ruleImpl = REGIMENT_RULES_REGISTRY[ruleId];
        if (ruleImpl && ruleImpl.modifyCost) {
            newCost = ruleImpl.modifyCost(newCost, params, context);
        }
    });
    return newCost;
};