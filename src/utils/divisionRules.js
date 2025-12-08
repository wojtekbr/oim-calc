import { IDS } from "../constants";
import { collectRegimentUnits } from "./armyMath";

// --- LOGIKA BIZNESOWA (REGISTRY) ---
export const DIVISION_RULES_REGISTRY = {
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
    },

    "min_regiments_present": {
        validate: (divisionConfig, unitsMap, getRegimentDefinition, params) => {
            const requirements = params?.requirements || [];
            if (requirements.length === 0) return [];

            const errors = [];

            const currentCounts = {};
            const allRegiments = [
                ...(divisionConfig.vanguard || []),
                ...(divisionConfig.base || []),
                ...(divisionConfig.additional || [])
            ];

            allRegiments.forEach(reg => {
                if (reg.id !== IDS.NONE) {
                    currentCounts[reg.id] = (currentCounts[reg.id] || 0) + 1;
                }
            });

            requirements.forEach(req => {
                const targetIds = Array.isArray(req.regiment_id) ? req.regiment_id : [req.regiment_id];
                const minAmount = req.min_amount || 1;
                
                let currentTotal = 0;
                targetIds.forEach(tid => {
                    currentTotal += (currentCounts[tid] || 0);
                });

                if (currentTotal < minAmount) {
                    const names = targetIds.map(tid => {
                        const def = getRegimentDefinition(tid);
                        return def ? def.name : tid;
                    }).join("\nLUB ");

                    errors.push(`Niespełnione wymaganie: Musisz posiadać jeszcze ${minAmount - currentTotal} pułk(i/ów) z grupy:\n"${names}".`);
                }
            });

            return errors;
        }
    },

    "limit_max_units": {
        validate: (divisionConfig, unitsMap, getRegimentDefinition, params) => {
            const constraints = params?.constraints || [];
            if (constraints.length === 0) return [];

            const errors = [];
            
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
                    allUnitIds = allUnitIds.concat(units.map(u => u.unitId));
                }
            });
            
            if (divisionConfig.supportUnits) {
                const supportIds = divisionConfig.supportUnits.map(su => su.id);
                allUnitIds = allUnitIds.concat(supportIds);
            }

            constraints.forEach(constraint => {
                const targetIds = constraint.unit_ids || [];
                const maxAmount = constraint.max_amount || 0;
                
                const currentCount = allUnitIds.filter(uid => uid && targetIds.includes(uid)).length;

                if (currentCount > maxAmount) {
                     let groupName = constraint.custom_name;
                     if (!groupName) {
                         const uniqueTargetIds = [...new Set(targetIds)];
                         const names = uniqueTargetIds.map(id => unitsMap[id]?.name || id);
                         groupName = names.join(", ");
                     }

                     errors.push(`Przekroczono limit jednostek: ${groupName}.\nLimit: ${maxAmount}, Obecnie: ${currentCount}.`);
                }
            });

            return errors;
        }
    },

    "limit_regiments_with_improvement": {
        validate: (divisionConfig, unitsMap, getRegimentDefinition, params, improvements) => {
            const targetRegimentIds = params?.regiment_ids || [];
            const improvementId = params?.improvement_id;
            const maxAmount = params?.max_amount || 1;

            if (!improvementId || targetRegimentIds.length === 0) return [];

            const allRegiments = [
                ...(divisionConfig.vanguard || []),
                ...(divisionConfig.base || []),
                ...(divisionConfig.additional || [])
            ];

            let count = 0;

            allRegiments.forEach(reg => {
                if (reg.id !== IDS.NONE && targetRegimentIds.includes(reg.id)) {
                    const hasRegimentImp = (reg.config.regimentImprovements || []).includes(improvementId);
                    const hasUnitImp = Object.values(reg.config.improvements || {}).some(imps => imps.includes(improvementId));

                    if (hasRegimentImp || hasUnitImp) {
                        count++;
                    }
                }
            });

            if (count > maxAmount) {
                const regNames = targetRegimentIds.map(rid => {
                     const def = getRegimentDefinition(rid);
                     return def ? def.name : rid;
                }).join(", ");

                const impName = improvements ? (improvements[improvementId]?.name || improvementId) : improvementId;

                return [`Przekroczono limit: Tylko ${maxAmount} pułk(ów) typu:\n"${regNames}"\nmoże posiadać ulepszenie: "${impName}".`];
            }

            return [];
        }
    },

    "panowie_bracia": {
        getRegimentStatsBonus: (divisionConfig, targetRegimentId, params) => {
            const countingIds = params?.counting_regiment_ids || [];
            const excludedFromBonusIds = params?.excluded_regiment_ids || [];

            if (!targetRegimentId || !countingIds.includes(targetRegimentId)) return null;
            if (excludedFromBonusIds.includes(targetRegimentId)) return null;

            let count = 0;
            const allRegiments = [
                ...(divisionConfig.vanguard || []),
                ...(divisionConfig.base || []),
                ...(divisionConfig.additional || [])
            ];

            allRegiments.forEach(reg => {
                if (reg.id !== IDS.NONE && countingIds.includes(reg.id)) {
                    count++;
                }
            });

            const motivationBonus = Math.floor(count / 2);

            if (motivationBonus > 0) {
                return { motivation: motivationBonus };
            }
            return null;
        }
    },
    "extra_regiment_cost": {
        // Zwraca modyfikatory kosztów dla danego pułku
        getRegimentCostModifier: (divisionConfig, targetRegimentId, params) => {
            const targetIds = params?.regiment_ids || [];
            const extraPu = params?.pu_cost || 0;
            const extraPs = params?.ps_cost || 0;

            if (targetRegimentId && targetIds.includes(targetRegimentId)) {
                return { pu: extraPu, ps: extraPs };
            }
            return null;
        }
    },
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
        title: "Maksymalna ilość pułków",
        getDescription: (params, context) => {
            const { getRegimentDefinition } = context;
            const targetId = params?.regiment_id;
            const max = params?.max_amount || 1;

            const regDef = getRegimentDefinition(targetId);
            const regName = regDef ? regDef.name : targetId;

            return `Możesz posiadać maksymalnie ${max} pułk(i/ów) typu: "${regName}".`;
        }
    },

    "min_regiments_present": {
        title: "Wymagany Skład Dywizji",
        getDescription: (params, context) => {
            const { getRegimentDefinition } = context;
            const requirements = params?.requirements || [];

            if (requirements.length === 0) return "Brak wymagań.";

            const requirementsList = requirements.map(req => {
                const targetIds = Array.isArray(req.regiment_id) ? req.regiment_id : [req.regiment_id];
                const min = req.min_amount || 1;
                
                const names = targetIds.map(tid => {
                    const regDef = getRegimentDefinition(tid);
                    return regDef ? regDef.name : tid;
                }).join(" LUB ");

                return `• ${min}x ${names}`;
            }).join("\n");

            return `Dywizja musi zawierać przynajmniej następujące pułki:\n${requirementsList}`;
        }
    },

    "limit_max_units": {
        title: "Limity jednostek",
        getDescription: (params, context) => {
             const constraints = params?.constraints || [];
             if (constraints.length === 0) return "";
             
             const lines = constraints.map(c => {
                 const max = c.max_amount;
                 let name = c.custom_name;
                 
                 if (!name && context.unitsMap && c.unit_ids) {
                     const names = c.unit_ids.slice(0, 3).map(id => context.unitsMap[id]?.name || id);
                     name = names.join(", ") + (c.unit_ids.length > 3 ? "..." : "");
                 }
                 
                 return `• Max ${max}x ${name || "Jednostki"}`;
             });
             
             return `Dywizja posiada następujące ograniczenia ilościowe:\n${lines.join("\n")}`;
        }
    },

    "limit_regiments_with_improvement": {
        title: "Limit Ulepszeń",
        getDescription: (params, context) => {
            const { getRegimentDefinition, improvements } = context;
            const targetRegimentIds = params?.regiment_ids || [];
            const improvementId = params?.improvement_id;
            const maxAmount = params?.max_amount || 1;

            const regNames = targetRegimentIds.map(rid => {
                const def = getRegimentDefinition(rid);
                return def ? def.name : rid;
            }).join(", ");

            // FIX: Pobieranie nazwy ulepszenia ze słownika improvements
            const impName = improvements ? (improvements[improvementId]?.name || improvementId) : improvementId;

            return `Tylko ${maxAmount} pułk(ów) typu "${regNames}" może zostać ulepszonych o "${impName}".`;
        }
    },

    "extra_regiment_cost": {
        title: "Koszty Specjalne",
        getDescription: (params, context) => {
            const { getRegimentDefinition } = context;
            const names = (params?.regiment_ids || []).map(id => {
                 const def = getRegimentDefinition(id);
                 return def ? def.name : id;
            }).join(", ");
            const pu = params?.pu_cost;
            // FIX: Twoja zmiana tekstu
            return `Pułki: ${names} kosztują dodatkowo ${pu} PU.`;
        }
    },

    "panowie_bracia": {
        title: "Panowie Bracia!",
        getDescription: () => "Za każde dwa pułki Jazdy (Koronnej, Litewskiej, Lekkiej, Hetmańskie, Skrzydłowe, Pospolite Ruszenie), każdy z tych pułków (z wyjątkiem Pospolitego Ruszenia) otrzymuje +1 do Motywacji."
    },
    
    "klopoty_skarbowe": {
        title: "Kłopoty Skarbowe",
        getDescription: () => 
            "Armia Rzeczpospolitej wiecznie borykała się z pustkami w skarbu, przez co często wojska były opłacane z prywatnych szkatuł magnatów, a nieopłacane wojsko zawiązywało konfederacje.\n\n" +
            "Przed fazą wystawienia wojsk, Rzuć k10:\n" +
            "• 1-2: Wojsko zostało opłacone na czas z królewskiego skarbca: +1 motywacji dla każdego pułku jazdy: koronnej/litewskiej, lekkiej, Lewego/Prawego skrzydła.\n" +
            "• 3-5: Wojsko zostało opłacone z prywatnej kiesy: Brak efektu.\n" +
            "• 6-9: Została obiecana zapłata na następną kwartę: wylosuj po 1 jednostce w każdym pułku jazdy: koronnej/litewskiej, lekkiej, Lewego/Prawego skrzydła. Oddział dostaje 1D.\n" +
            "• 10: Wojsko zawiązało Konfederację: -1 motywacji dla każdego pułku jazdy: koronnej/litewskiej, lekkiej, Lewego/Prawego skrzydła."
    },

    "na_wlasnej_ziemi_3": {
        title: "Na własnej ziemi (3)",
        getDescription: () => "Zasada opisana w podręcznikach OiM."
    },
    "prawowierni_w_okopach": {
        title: "Prawowierni w okopach swoich",
        getDescription: () => "W bitwach w których gracz Turecki jest Niebieskim Graczem, może za darmo wystawić Jeden element Szańców na każdy wystawiony pułk: Sandżak Sipahów lennych z ejaletów europejskich, Sandżak Sipahów Bośniacki/Albański, Sandżak z ejaletów Anatolijskich."
    },
    "wojsko_wybornym_ozywione_duchem": {
        title: "Wojsko wybornym ożywione duchem",
        getDescription: () => "Połóż przy głównodowodzącym armii 1 znacznik neutralny. Dopóki znacznik znajduje się na stole, jednostki Tureckie (ale nie sojusznicze) z rozkazem Szarża, mogą przerzucać 1 kość w niezdanym teście morale. Jeżeli dowolny z pułków Tureckich zostanie złamany, odrzuć znacznik."
    },
    "allah_allah": {
        title: "Allah Allah",
        getDescription: () => "Zasada opisana w podręczniku Armie II. Zasada przypisana do pułku działa w ramach danego pułku. Zasada przypisana do Dywizji odnosi się do Głównodowodzącego Dywizji."
    },
    "zapelnily_sie_nimi_gory": {
        title: "Zapełniły się nimi góry i równiny",
        getDescription: () => "Jeżeli gracz Turecki jest Czerwonym graczem, wszystkie pułki Tureckie (ale nie sojusznicze) mają Motywację podniesioną o 1. Jeżeli jest graczem Niebieskim wszystkie pułki Tureckie (ale nie sojusznicze) mają Motywację obniżoną o 1."
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

// ZMIANA: Dodano parametr 'improvements'
export const validateDivisionRules = (divisionConfig, divisionDefinition, unitsMap, getRegimentDefinition, improvements) => {
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

// ZMIANA: Dodano parametr 'improvements'
export const getDivisionRulesDescriptions = (divisionDefinition, unitsMap, getRegimentDefinition, improvements) => {
    if (!divisionDefinition?.rules || !Array.isArray(divisionDefinition.rules)) return [];

    return divisionDefinition.rules.map(ruleConfig => {
        const { id, ...params } = ruleConfig;
        const definition = DIVISION_RULES_DEFINITIONS[id];

        if (!definition) return null;

        const description = definition.getDescription(params, { unitsMap, getRegimentDefinition, improvements });

        return {
            id,
            title: definition.title,
            description
        };
    }).filter(Boolean);
};

export const checkSupportUnitRequirements = (unitConfig, divisionConfig, getRegimentDefinition) => {
    if (typeof unitConfig === 'string' || !unitConfig.requirements || unitConfig.requirements.length === 0) {
        return { isAllowed: true, reason: null };
    }

    for (const req of unitConfig.requirements) {
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
    }

    return { isAllowed: true, reason: null };
};