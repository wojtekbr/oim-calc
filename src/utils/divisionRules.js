import { IDS, GROUP_TYPES } from "../constants";
import { collectRegimentUnits } from "./armyMath";

// --- LOGIKA BIZNESOWA (REGISTRY) ---
export const DIVISION_RULES_REGISTRY = {
    "free_improvement_for_specific_units": {
        calculateDiscount: (regimentConfig, activeUnits, improvementsMap, params) => {
            const targetUnitIds = params?.unit_ids || [];
            const targetImpId = params?.improvement_id;
            const maxPerRegiment = params?.max_per_regiment || 1;

            // Safety check: if missing required params or map, return 0 discount
            if (!targetImpId || targetUnitIds.length === 0 || !improvementsMap) return 0;

            let discount = 0;
            let count = 0;

            for (const unit of activeUnits) {
                if (targetUnitIds.includes(unit.unitId)) {
                    // Check if unit has the specific improvement purchased
                    const unitImps = regimentConfig.improvements?.[unit.key] || [];

                    if (unitImps.includes(targetImpId)) {
                        const impDef = improvementsMap[targetImpId];
                        // Force convert to Number to prevent NaN
                        const cost = Number(impDef?.cost || 0);

                        discount += cost;
                        count++;

                        if (count >= maxPerRegiment) break;
                    }
                }
            }
            return Number(discount) || 0;
        }
    },
    "has_any_additional_regiment": {
        validate: (divisionConfig, unitsMap, getRegimentDefinition, params) => {
            const count = divisionConfig.additional?.filter(r => r.id !== IDS.NONE).length || 0;
            if (count > 0) {
                return [];
            }
            return ["Wymagany przynajmniej jeden pułk dodatkowy."];
        }
    },
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

    "banned_units_in_vanguard": {
        validate: (divisionConfig, unitsMap, getRegimentDefinition, params) => {
            // FIX: Obsługa 'banned_unit_ids' z JSON użytkownika LUB 'unit_ids'
            const bannedUnitIds = params?.banned_unit_ids || params?.unit_ids || [];

            if (bannedUnitIds.length === 0) return [];

            const errors = [];
            const vanguardRegiments = divisionConfig.vanguard || [];

            vanguardRegiments.forEach((reg, index) => {
                if (reg.id !== IDS.NONE) {
                    const def = getRegimentDefinition(reg.id);

                    // 1. Sprawdzamy jednostki wewnątrz pułku (options)
                    const internalUnits = collectRegimentUnits(reg.config || {}, def).map(u => u.unitId);

                    // 2. Sprawdzamy przypisane wsparcie
                    const positionKey = `${GROUP_TYPES.VANGUARD}/${index}`;
                    const supportUnits = (divisionConfig.supportUnits || [])
                        .filter(su => su.assignedTo?.positionKey === positionKey)
                        .map(su => su.id);

                    const allUnitIds = [...internalUnits, ...supportUnits];

                    // Szukamy zakazanych
                    const foundBanned = allUnitIds.find(uid => bannedUnitIds.includes(uid));

                    if (foundBanned) {
                        const unitName = unitsMap[foundBanned]?.name || foundBanned;
                        const regName = def ? def.name : reg.id;
                        errors.push(`Niedozwolona jednostka w Straży Przedniej: "${unitName}" nie może znajdować się w pułku "${regName}".`);
                    }
                }
            });

            return errors;
        }
    },

    "conditional_unit_restriction": {
        validate: (divisionConfig, unitsMap, getRegimentDefinition, params) => {
            const triggerRegimentId = params?.trigger_regiment_id;
            const targetRegimentIds = params?.target_regiment_ids || [];
            const bannedUnitIds = params?.banned_unit_ids || [];

            if (!triggerRegimentId || targetRegimentIds.length === 0 || bannedUnitIds.length === 0) return [];

            const allRegiments = [
                ...(divisionConfig.vanguard || []),
                ...(divisionConfig.base || []),
                ...(divisionConfig.additional || [])
            ];

            const hasTrigger = allRegiments.some(r => r.id === triggerRegimentId);
            if (!hasTrigger) return [];

            const errors = [];

            allRegiments.forEach(reg => {
                if (reg.id !== IDS.NONE && targetRegimentIds.includes(reg.id)) {
                    const def = getRegimentDefinition(reg.id);
                    const units = collectRegimentUnits(reg.config || {}, def);

                    const illegalUnit = units.find(u => bannedUnitIds.includes(u.unitId));

                    if (illegalUnit) {
                        const triggerName = getRegimentDefinition(triggerRegimentId)?.name || triggerRegimentId;
                        const targetName = def?.name || reg.id;
                        const unitName = unitsMap[illegalUnit.unitId]?.name || illegalUnit.unitId;

                        errors.push(
                            `Niedozwolona konfiguracja: Ponieważ wystawiłeś "${triggerName}",\n` +
                            `pułk "${targetName}" nie może zawierać jednostki "${unitName}".`
                        );
                    }
                }
            });

            return errors;
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
            const impName = improvements ? (improvements[improvementId]?.name || improvementId) : improvementId;
            return `Tylko ${maxAmount} pułk(ów) typu "${regNames}" może zostać ulepszonych o "${impName}".`;
        }
    },

    // --- NOWE: Opis zakazu w Vanguard ---
    "banned_units_in_vanguard": {
        title: "Ograniczenia Straży Przedniej",
        getDescription: (params, context) => {
            const { unitsMap } = context;
            const unitIds = params?.banned_unit_ids || params?.unit_ids || [];
            const names = unitIds.map(id => unitsMap[id]?.name || id).join(", ");
            return `Jednostki: "${names}" nie mogą być wystawiane w pułkach Straży Przedniej.`;
        }
    },

    "conditional_unit_restriction": {
        title: "Ograniczenia jednostek",
        getDescription: (params, context) => {
            const { getRegimentDefinition, unitsMap } = context;
            const triggerId = params?.trigger_regiment_id;
            const bannedIds = params?.banned_unit_ids || [];

            const triggerName = getRegimentDefinition(triggerId)?.name || triggerId;
            const unitNames = bannedIds.map(uid => unitsMap[uid]?.name || uid).join(", ");

            return `Jeśli wystawisz "${triggerName}", inne pułki nie mogą zawierać: "${unitNames}".`;
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
    },
    "free_improvement_for_specific_units": {
        title: "Darmowe Ulepszenia",
        getDescription: (params, context) => {
            const { unitsMap, improvements } = context;
            const unitIds = params?.unit_ids || [];
            const unitNames = unitIds.map(id => unitsMap[id]?.name || id).join(", ");
            const impName = improvements ? (improvements[params?.improvement_id]?.name || params?.improvement_id) : params?.improvement_id;

            return `W każdym pułku, dla ${params?.max_per_regiment || 1} jednostki(ek) z listy: "${unitNames}", ulepszenie "${impName}" jest darmowe.`;
        }
    },
    "czaty": {
        title: "Czaty",
        getDescription: () => "W każdym pułku, jednej jednostce (S Mołojców Strzelców i S Rejestrowych lub M Czerni) można za darmo przydzielić Ulepszenie: Partyzanci."
    },
    "tam_duzo_myltykow": {
        title: "Tam dużo myłtyków",
        getDescription: () => "Zasada opisana w podręczniku OiM2"
    },
    "rozlaly_sie_zagony tatarskie": {
        title: "Rozlały się zagony",
        getDescription: () => "Jeżeli Gracz dowodzący tą armią wygra przeciwstawny test Zwiadu i wybierze efekt Zwiadu: Flankowanie, to może zamienić go na Dalekie obejście.\n" +
            "Zamiast w strefie rozstawienia, można jeden pułk jazdy albo dragonów, albo piechoty z zasadą Podragonieni wystawić w kontakcie z boczną krawędzią pola bitwy, nie bliżej niż 12” od krawędzi należącej do przeciwnika lub dowolnej jego Jednostki."
    },
    "jasyr": {
        title: "Jasyr",
        getDescription: () => "Za każdy Czambuł (Beja, Nuradyna, Mirzy, Nogajów) niebędący pułkiem Straży Przedniej, gracz tatarski musi wystawić grupę Jasyr. Po zakończeniu wstawienia, przeciwnik gracza tatarskiego ustawia Jasyr w zasięgu 4” od dowolnej Jednostki tatarskiej w dowolnej podstrefie rozstawienia lub jeżeli nie ma strefy rozstawienia, w 4\" od dowolnej Jednostki tatarskiej z wyłączeniem jednostek z pułku Straży Przedniej. Każdy pułk tatarski otrzymuje +1 motywacji. Jeżeli na koniec gry przynajmniej połowa grup Jasyru przekroczy próg ucieczki, Przeciwnik otrzymuje 1VP (punkty liczone za scenariusz. Przekroczenie progu ucieczki przez każdą grupę Jasyru powoduje, że każdy pułk Tatarski traci 1 punkt motywacji. "
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

export const checkSupportUnitRequirements = (unitConfig, divisionConfig, getRegimentDefinition, unitsMap = null) => {
    // Umożliwiamy unitConfig bycie obiektem z requirements
    const requirements = unitConfig.requirements || [];

    if (requirements.length === 0) {
        return { isAllowed: true, reason: null };
    }

    for (const req of requirements) {
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

        // --- NOWE: has_any_additional_regiment ---
        if (req.type === "has_any_additional_regiment") {
            // Sprawdzamy liczbę nie-pustych pułków w sekcji additional
            const count = divisionConfig.additional?.filter(r => r.id !== IDS.NONE).length || 0;
            if (count === 0) {
                return { isAllowed: false, reason: "Wymagany min. 1 pułk dodatkowy" };
            }
        }
    }

    return { isAllowed: true, reason: null };
};