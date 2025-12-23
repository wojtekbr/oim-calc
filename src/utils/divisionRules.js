import { IDS, GROUP_TYPES } from "../constants";
import { collectRegimentUnits } from "./math/structureUtils";
import { DIVISION_RULES_REGISTRY } from "./rules/divisionRulesRegistry";
import { DIVISION_RULES_DEFINITIONS } from "./rules/divisionRulesDefinitions";

export { DIVISION_RULES_REGISTRY, DIVISION_RULES_DEFINITIONS };

// --- ZMIANA: Dodano divisionDefinition jako ostatni argument ---
export const checkSupportUnitRequirements = (unitConfig, divisionConfig, getRegimentDefinition, unitsMap = null, mode = 'purchase', divisionDefinition = null) => {

    const myUnitId = unitConfig.id || unitConfig.name;

    // 1. NOWOŚĆ: Sprawdzanie limitu wynikającego z zasady "mandatory_support_unit_per_regiment"
    // Jeśli zasada nakazuje mieć X jednostek, to traktujemy to też jako MAX X jednostek.
    if (divisionDefinition?.rules) {
        const mandatoryRule = divisionDefinition.rules.find(r =>
            r.id === "mandatory_support_unit_per_regiment" &&
            r.support_unit_id === myUnitId
        );

        if (mandatoryRule) {
            const { regiment_ids, amount_per_regiment = 1, exclude_vanguard } = mandatoryRule;

            let allRegiments = [
                ...(divisionConfig.base || []),
                ...(divisionConfig.additional || [])
            ];

            // Jeśli NIE wykluczamy straży, dodajemy ją do puli
            if (exclude_vanguard !== true && exclude_vanguard !== "true") {
                allRegiments = [ ...(divisionConfig.vanguard || []), ...allRegiments ];
            }

            const activeRegimentCount = allRegiments.filter(r =>
                r.id !== IDS.NONE && regiment_ids.includes(r.id)
            ).length;

            const limit = activeRegimentCount * amount_per_regiment;

            const currentCount = (divisionConfig.supportUnits || []).filter(su => su.id === myUnitId).length;

            if (mode === 'validate') {
                if (currentCount > limit) {
                    return { isAllowed: false, reason: `Przekroczono limit wynikający z pułków: ${currentCount}/${limit}` };
                }
            } else {
                // Tryb zakupu
                if (currentCount >= limit) {
                    return { isAllowed: false, reason: `Limit: ${limit} (Zależny od liczby pułków)` };
                }
            }
        }
    }

    // 2. Stara logika flagi niezależności (pozostaje bez zmian, ale działa równolegle)
    if (unitConfig.can_be_bought_independently === false) {
        const limitRule = (unitConfig.requirements || []).find(r => r.type === 'limit_per_regiment_count');

        if (!limitRule) {
            // Jeśli nie ma limit_per_regiment_count w unit.requirements, a jest mandatory rule w division,
            // to powyższy blok (pkt 1) już obsłużył limit.
            // Jeśli jednak nie ma ani tu ani tam reguły wiążącej, blokujemy.

            // Sprawdzamy czy mandatoryRule obsłużyło sprawę:
            const coveredByMandatory = divisionDefinition?.rules?.some(r =>
                r.id === "mandatory_support_unit_per_regiment" &&
                r.support_unit_id === myUnitId
            );

            if (!coveredByMandatory) {
                return { isAllowed: false, reason: "Jednostka nie może być kupiona samodzielnie." };
            }
        } else {
            // Istnieje limit_per_regiment_count w definicji jednostki - sprawdzamy "czy w ogóle mam pułk"
            const { regiment_ids, exclude_vanguard } = limitRule;
            let allRegiments = [
                ...(divisionConfig.base || []),
                ...(divisionConfig.additional || [])
            ];
            if (exclude_vanguard !== true) {
                allRegiments = [ ...(divisionConfig.vanguard || []), ...allRegiments ];
            }

            const hasParentRegiment = allRegiments.some(r => r.id !== IDS.NONE && regiment_ids.includes(r.id));

            if (!hasParentRegiment) {
                const names = regiment_ids.map(rid => {
                    const def = getRegimentDefinition(rid);
                    return def ? def.name : rid;
                }).join("\nLUB ");
                return { isAllowed: false, reason: `Wymagany pułk:\n${names}` };
            }
        }
    }

    // ... Reszta funkcji (pętle po requirements) bez zmian ...
    const requirements = unitConfig.requirements || [];
    if (requirements.length === 0) {
        return { isAllowed: true, reason: null };
    }

    for (const req of requirements) {
        // ... (tutaj wklej resztę starej funkcji checkSupportUnitRequirements) ...
        if (req.type === "regiment_contains_unit") {
            const { regiment_id, unit_id, min_amount = 1 } = req;
            const targetRegiments = [
                ...(divisionConfig.vanguard || []),
                ...(divisionConfig.base || []),
                ...(divisionConfig.additional || [])
            ].filter(r => r.id === regiment_id);

            if (targetRegiments.length === 0) {
                const def = getRegimentDefinition(regiment_id);
                const regName = def ? def.name : regiment_id;
                return { isAllowed: false, reason: `Wymagany aktywny pułk: "${regName}"` };
            }

            let found = false;
            for (const reg of targetRegiments) {
                const def = getRegimentDefinition(reg.id);
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

        if (req.type === "division_contains_any_regiment") {
            const { regiment_ids } = req;
            const allRegiments = [
                ...(divisionConfig.vanguard || []),
                ...(divisionConfig.base || []),
                ...(divisionConfig.additional || [])
            ];

            const found = allRegiments.some(r => r.id !== IDS.NONE && regiment_ids.includes(r.id));

            if (!found) {
                const names = regiment_ids.map(rid => {
                    const def = getRegimentDefinition(rid);
                    return def ? def.name : rid;
                }).join("\nLUB ");

                return { isAllowed: false, reason: `Wymagany jeden z pułków:\n${names}` };
            }
        }

        if (req.type === "division_contains_any_unit") {
            const { unit_ids, min_amount = 1 } = req;

            let allUnitIds = [];
            const allRegiments = [
                ...(divisionConfig.vanguard || []),
                ...(divisionConfig.base || []),
                ...(divisionConfig.additional || [])
            ];

            allRegiments.forEach(reg => {
                if (reg.id !== IDS.NONE) {
                    const def = getRegimentDefinition(reg.id);
                    const units = collectRegimentUnits(reg.config || {}, def);
                    allUnitIds.push(...units.map(u => u.unitId));
                }
            });

            if (divisionConfig.supportUnits) {
                allUnitIds.push(...divisionConfig.supportUnits.map(su => su.id));
            }

            const count = allUnitIds.filter(uid => unit_ids.includes(uid)).length;

            if (count < min_amount) {
                let names = unit_ids.join(" lub ");
                if (unitsMap) {
                    names = unit_ids.map(id => unitsMap[id]?.name || id).join(" lub ");
                }
                return { isAllowed: false, reason: `Wymagana jednostka w dywizji: ${names}` };
            }
        }

        if (req.type === "has_any_additional_regiment") {
            const count = divisionConfig.additional?.filter(r => r.id !== IDS.NONE).length || 0;
            if (count === 0) {
                return { isAllowed: false, reason: "Wymagany min. 1 pułk dodatkowy" };
            }
        }

        if (req.type === "division_excludes_unit") {
            const { unit_ids } = req;

            const currentSupportIds = (divisionConfig.supportUnits || []).map(su => su.id);
            const conflict = unit_ids.find(id => currentSupportIds.includes(id));

            if (conflict) {
                let conflictName = conflict;
                if (unitsMap && unitsMap[conflict]) {
                    conflictName = unitsMap[conflict].name;
                }
                return { isAllowed: false, reason: `Konflikt: Nie można łączyć z "${conflictName}"` };
            }
        }

        if (req.type === "limit_per_regiment_count") {
            const { regiment_ids, amount_per_regiment, exclude_vanguard } = req;

            let allRegiments = [
                ...(divisionConfig.base || []),
                ...(divisionConfig.additional || [])
            ];

            if (exclude_vanguard !== true) {
                allRegiments = [ ...(divisionConfig.vanguard || []), ...allRegiments ];
            }

            const activeRegimentCount = allRegiments.filter(r =>
                r.id !== IDS.NONE && regiment_ids.includes(r.id)
            ).length;

            const limit = activeRegimentCount * amount_per_regiment;

            const myUnitId = unitConfig.id || unitConfig.name;
            const currentCount = (divisionConfig.supportUnits || []).filter(su => su.id === myUnitId).length;

            if (mode === 'validate') {
                if (currentCount > limit) {
                    return { isAllowed: false, reason: `Przekroczono limit: ${currentCount}/${limit} (Max ${amount_per_regiment} na pułk)` };
                }
            } else {
                if (currentCount >= limit) {
                    return { isAllowed: false, reason: `Limit: ${limit} (Max ${amount_per_regiment} na każdy wystawiony pułk)` };
                }
            }
        }
    }

    return { isAllowed: true, reason: null };
};

// ... reszta pliku bez zmian
export const checkDivisionConstraints = (divisionConfig, divisionDefinition, candidateRegimentId) => {
    // ... (bez zmian)
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
    // ... (bez zmian)
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

export const validateDivisionRules = (divisionConfig, divisionDefinition, unitsMap, getRegimentDefinition, improvements) => {
    // ... (bez zmian)
    let allErrors = [];
    if (!divisionDefinition?.rules || !Array.isArray(divisionDefinition.rules)) return allErrors;

    divisionDefinition.rules.forEach(ruleConfig => {
        const { id, ...params } = ruleConfig;
        const ruleImpl = DIVISION_RULES_REGISTRY[id];
        if (ruleImpl && ruleImpl.validate) {
            const errors = ruleImpl.validate(divisionConfig, unitsMap, getRegimentDefinition, params, improvements);
            if (errors && errors.length > 0) {
                allErrors = allErrors.concat(errors);
            }
        }
    });
    return allErrors;
};

export const getDivisionRulesDescriptions = (divisionDefinition, unitsMap, getRegimentDefinition, improvements) => {
    // ... (bez zmian)
    if (!divisionDefinition?.rules || !Array.isArray(divisionDefinition.rules)) return [];

    return divisionDefinition.rules.map(ruleConfig => {
        const { id, ...params } = ruleConfig;
        const definition = DIVISION_RULES_DEFINITIONS[id];

        if (!definition) return null;

        const description = definition.getDescription(params, { unitsMap, getRegimentDefinition, improvements });

        return {
            id,
            title: params.name_override || definition.title,
            description
        };
    }).filter(Boolean);
};