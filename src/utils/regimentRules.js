// src/utils/regimentRules.js
import { RANK_TYPES } from "../constants"; // Upewnij się, że masz ten import, jeśli korzystasz z RANK_TYPES w logice

// --- REJESTR LOGIKI (Działanie zasad) ---
export const REGIMENT_RULES_REGISTRY = {

    // "Jeżeli wystawisz Piechotę łanową, pułk staje się Mieszany."
    "lanowa_makes_mixed": {
        modifyStats: (stats, activeUnits) => {
            const hasLanowa = activeUnits.some(u => u.unitId.includes("piechota_lanowa"));
            if (hasLanowa) {
                return { regimentType: "Mieszany" };
            }
            return null;
        }
    },

    // "Żeby wystawić Lekkie działa należy wystawić przynajmniej jedną jednostkę Piechoty Łanowej w rozmiarze M."
    "artillery_req_lanowa_m": {
        validate: (activeUnits) => {
            const hasArtillery = activeUnits.some(u => u.unitId.includes("light_art") || u.unitId.includes("medium_art"));

            if (!hasArtillery) return null;

            const hasLanowaM = activeUnits.some(u => u.unitId === "cro_piechota_lanowa_m");

            if (!hasLanowaM) {
                return "Zasada 'Wymagania Artylerii': Aby wystawić Działa, musisz posiadać Piechotę Łanową (M).";
            }
            return null;
        }
    },

    // "Żeby wystawić Pospolite Ruszenie po Husarsku nie można wystawić Piechoty Łanowej."
    "hus_no_lanowa": {
        validate: (activeUnits) => {
            const hasHussars = activeUnits.some(u => u.unitId.includes("pospolite_hus"));
            const hasLanowa = activeUnits.some(u => u.unitId.includes("piechota_lanowa"));

            if (hasHussars && hasLanowa) {
                return "Zasada 'Ograniczenie Husarskie': Nie można łączyć Pospolitego Ruszenia po Husarsku z Piechotą Łanową.";
            }
            return null;
        }
    },

    // "Żeby wystawić Pospolite Ruszenie po Husarsku w rozmiarze M należy wystawić przynajmniej 2 jednostki Pospolitego Ruszenia w rozmiarze L (M)."
    "hus_m_req_pospolite_l_x2": {
        validate: (activeUnits) => {
            const hasHussarsM = activeUnits.some(u => u.unitId === "cro_pospolite_hus_m");
            if (!hasHussarsM) return null;

            const pospoliteLCount = activeUnits.filter(u => u.unitId === "cro_pospolite_l").length;

            if (pospoliteLCount < 2) {
                return "Zasada 'Wymagania Husarskie M': Pospolite Ruszenie po Husarsku (M) wymaga przynajmniej 2 jednostek Pospolitego Ruszenia (L).";
            }
            return null;
        }
    },

    "chlopscy_szpiedzy": {
        modifyStats: (stats, activeUnits) => {
            const peasantCount = activeUnits.filter(u => u.unitId.includes("czer")).length;

            if (peasantCount > 0) {
                return {
                    recon: (stats.recon || 0) + peasantCount,
                    awareness: (stats.awareness || 0) + 1
                };
            }
            return {
                recon: (stats.recon || 0),
                awareness: (stats.awareness || 0)
            };
        }
    },
    "free_unit_improvement": {
        // 1. Zniżka Kosztu (PU) - Poprawione: Sumuje zniżkę tylko dla pierwszych N ulepszeń
        calculateImprovementDiscount: (activeUnits, config, improvementsMap, params, unitsMap, regimentDefinition, costCalculator) => {
            const targetUnitIds = params?.unit_ids || [];
            let targetImpIds = params?.improvement_ids || [];
            if (params?.improvement_id) targetImpIds.push(params.improvement_id);

            if (targetUnitIds.length === 0 || targetImpIds.length === 0 || !improvementsMap) return 0;

            // Pobieramy limit darmowych ulepszeń (domyślnie 1)
            const limit = params?.free_improvements_amount || params?.max_per_regiment || 1;
            let totalDiscount = 0;
            let usedCount = 0;

            for (const unit of activeUnits) {
                if (targetUnitIds.includes(unit.unitId)) {
                    const unitImps = config.improvements?.[unit.key] || [];

                    // Znajdujemy wszystkie pasujące ulepszenia wykupione przez tę jednostkę
                    const foundImpIds = unitImps.filter(impId => targetImpIds.includes(impId));

                    for (const foundImpId of foundImpIds) {
                        if (usedCount < limit) {
                            const unitDef = unitsMap[unit.unitId];
                            let realCost = 0;
                            if (costCalculator && unitDef) {
                                realCost = costCalculator(unitDef, foundImpId, regimentDefinition, improvementsMap);
                            } else {
                                const impDef = improvementsMap[foundImpId];
                                realCost = Number(impDef?.cost || 0);
                            }
                            totalDiscount += (Number(realCost) || 0);
                            usedCount++;
                        }
                    }

                    if (usedCount >= limit) break; // Osiągnięto limit darmowych ulepszeń dla całego pułku
                }
            }
            return totalDiscount;
        },

        // 2. Darmowość Slotu (nie wlicza się do limitu) - Poprawione: Respektuje limit ilościowy
        isImprovementFree: (unitId, impId, params, usageState) => {
            const targetUnitIds = params?.unit_ids || [];
            let targetImpIds = params?.improvement_ids || [];
            if (params?.improvement_id) targetImpIds.push(params.improvement_id);

            const limit = params?.free_improvements_amount || params?.max_per_regiment || 1;

            if (targetUnitIds.includes(unitId) && targetImpIds.includes(impId)) {
                if (usageState.usedCount < limit) {
                    usageState.usedCount++;
                    return true;
                }
            }
            return false;
        }
    },
    "za_mna_bracia_kozacy": {
        name: "Za mną bracia kozacy!",
        description: "Za każde trzy złote jednostki w pułku, motywacja pułku rośnie o 1. Pułk nie korzysta z zasady jeżeli jest sojuszniczy (Obniż PS pułku o 2).",
        modifyStats: (stats, activeUnits, params, context) => {
            const { isAllied, unitsMap } = context || {};

            // Jeśli sojuszniczy -> brak bonusu do motywacji
            if (isAllied) return stats;

            let goldCount = 0;
            activeUnits.forEach(u => {
                const def = unitsMap?.[u.unitId];
                if (def && def.rank === RANK_TYPES.GOLD) {
                    goldCount++;
                }
            });

            const bonus = Math.floor(goldCount / 3);
            if (bonus > 0) {
                return { ...stats, motivation: stats.motivation + bonus };
            }
            return stats;
        },
        modifyCost: (currentCost, params, context) => {
            // Zawsze obniża koszt o 2 (zgodnie z opisem w nawiasie, to cecha pułku)
            return currentCost - 2;
        }
    },
    "cossack_registered_rules": {
        name: "Pułki Rejestrowe",
        description: "Zasady specjalne wynikające z wybranego regionu (np. Kijowski, Białocerkiewski).",

        modifyStats: (stats, activeUnits, params, context) => {
            const { regimentConfig } = context || {};
            const imps = regimentConfig?.regimentImprovements || [];

            // Region Kijowski: Motywacja +1
            if (imps.includes("region_kijowski")) {
                stats.motivation += 1;
            }
            // Region Białocerkiewski: Wszystkie stany +1 (tutaj tylko Motywacja globalnie, reszta per unit?)
            // Opis mówi "wszystkie stany zwiększone o 1". To zazwyczaj Profil.
            // Ale jeśli to wpływa na globalne staty pułku:
            if (imps.includes("region_bialocerkiewski")) {
                // stats.recon += 1; // ??? Zależy od interpretacji "stany"
                // stats.activations += 1;
                // stats.motivation += 1;
                // Przyjmijmy bezpiecznie Motywację, resztę trzeba by w units injectować
            }
            // Region Korsuński: Motywacja +1
            if (imps.includes("region_korsunski")) {
                stats.motivation += 1;
            }
            // Region Czehryński: Motywacja +2
            if (imps.includes("region_czehrynski")) {
                stats.motivation += 2;
            }
            // Region Kaniowski: +1 kość zwiadu (czyli Zwiad +1)
            if (imps.includes("region_kaniowski")) {
                stats.recon += 1;
            }
            // Region Perejasławski: Motywacja +2
            if (imps.includes("region_perejaslawski")) {
                stats.motivation += 2;
            }

            return stats;
        },

        validate: (activeUnits, params, context) => {
            const { regimentConfig } = context || {};
            const imps = regimentConfig?.regimentImprovements || [];

            // Białocerkiewski / Niżyński: Nie może mieć w składzie jednostek mniejszych niż M
            if (imps.includes("region_bialocerkiewski") || imps.includes("region_nizynski")) {
                const hasSmall = activeUnits.some(u => u.unitId.endsWith("_s")); // Prosta heurystyka po ID
                if (hasSmall) {
                    return "Wybrany region zabrania wystawiania jednostek w rozmiarze S.";
                }
            }
            return null;
        }
    },
    "max_one_l_unit": {
        name: "Limit jednostek L",
        validate: (activeUnits) => {
            // Filtrujemy jednostki, których ID kończy się na "_l"
            // (zakładamy konwencję nazewnictwa: nazwa_jednostki_l)
            const countL = activeUnits.filter(u => u.unitId && u.unitId.endsWith("_l")).length;

            if (countL > 1) {
                return "Ograniczenie Rozmiaru: Regiment może posiadać tylko jedną jednostkę w rozmiarze L.";
            }
            return null;
        }
    }
};

// --- DEFINICJE OPISÓW (Teksty dla gracza) ---
export const REGIMENT_RULES_DEFINITIONS = {
    "allah_allah": {
        title: "Allah! Allah!",
        description: "Zasada działania opisana w podręcznikach do gry Ogniem i Mieczem."
    },
    "z_calego_imperium": {
        title: "Z całego Imperium zebrani (1)",
        description: "Zasada działania opisana w podręcznikach do gry Ogniem i Mieczem."
    },
    "sipahi_better_equipment": {
        title: "Ulepszenia sipahów",
        description: "Sipahowie mają ulepszenie Lepsze uzbrojenie ochronne i Weterani"
    },
    "aga_is_dizbar": {
        title: "Aga ma statystyki Dizbara",
        description: "Dowódca tego pułku korzysta ze statystyk i zasad specjalnych Dizbara zamiast standardowego Agi."
    },
    "kethuda_is_aga": {
        title: "Kethuda ma statystyki Agi",
        description: "Kethuda w tym pułku posiada statystyki Agi (G1)."
    },
    "posluch_kor": {
        title: "Posłuch",
        description: "Każdy Pułkownik z Partii Wolontarskiej, raz podczas wydawania rozkazu jednostce Wolontarzy może pominąć zasadę Niesubordynacja. Gracz musi poinformować przeciwnika w momencie korzystania z tej zasady."
    },
    "pospolitacy": {
        title: "Pospolitacy",
        description: "Zasada specjalna opisana w podręczniku (1)."
    },
    "lanowa_makes_mixed": {
        title: "Piechota Łanowa",
        description: "Jeżeli wystawisz Piechotę łanową, pułk staje się Mieszany."
    },
    "artillery_req_lanowa_m": {
        title: "Wymagania Artylerii",
        description: "Żeby wystawić Lekkie działa należy wystawić przynajmniej jedną jednostkę Piechoty Łanowej w rozmiarze M."
    },
    "hus_no_lanowa": {
        title: "Ograniczenie Husarskie",
        description: "Żeby wystawić Pospolite Ruszenie po Husarsku nie można wystawić Piechoty Łanowej."
    },
    "hus_m_req_pospolite_l_x2": {
        title: "Wymagania Husarskie M",
        description: "Żeby wystawić Pospolite Ruszenie po Husarsku w rozmiarze M należy wystawić przynajmniej 2 jednostki Pospolitego Ruszenia w rozmiarze L (M)."
    },
    "roznorodne_wyposazenie": {
        title: "Różnorodne wyposażenie",
        description: "Zasada specjalna opisana w podręczniku (1)."
    },
    "posluch_cos": {
        title: "Posłuch",
        description: "Raz podczas wydawania rozkazu jednostce można pominąć zasadę Niesubordynacja. Gracz musi poinformować przeciwnika w momencie korzystania z tej zasady."
    },

    "chlopscy_szpiedzy": {
        title: "Chłopscy szpiedzy",
        description: "Wystawiając Pułk Czerni, Dywizja dostaje dodatkowo tyle wartości wywiadu, ile Jednostek Czerni zostało wystawionych i +1 Czujności"
    },
    "cossack_registered_rules": {
        title: "Pułki rejestrowe",
        description: "Przed rozpoczęciem powstania Chmielnickiego kozacy na służbie Rzeczypospolitej byli podzieleni na Pułki z czego każdy z nich miał swój indywidualny charakter, a wielu z nich było dowodzonych przez znanych Pułkowników.\n" +
            "W momencie tworzenia pułku wybierz z jakiego regionu pochodzi (W całej armii możesz mieć tylko jeden pułk z danego regionu)\n"
    },
    "max_one_l_unit": {
        title: "Ograniczenie rozmiaru jednostek",
        description: "W składzie tego regimentu może znajdować się maksymalnie jedna jednostka o rozmiarze L."
    },
    "free_unit_improvement": {
        title: "Darmowe Ulepszenie",
        getDescription: (params) => {
            const impNames = (params?.improvement_ids || [params?.improvement_id]).join(" lub ");
            const amount = params?.free_improvements_amount || params?.max_per_regiment || 1;
            const amountText = amount > 1 ? `${amount} wybranych jednostek może` : "Wybrana jednostka może";
            return `${amountText} otrzymać darmowe ulepszenie: ${impNames}. Nie wlicza się ono do limitu ulepszeń.`;
        }
    }
};

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

// --- ZMODYFIKOWANA FUNKCJA: Pobiera opis z Definitions LUB z Registry ---
export const getRegimentRulesDescriptions = (regimentDefinition) => {
    if (!regimentDefinition?.special_rules) return [];

    return regimentDefinition.special_rules.map(ruleEntry => {
        const ruleId = typeof ruleEntry === 'string' ? ruleEntry : ruleEntry.id;
        const params = typeof ruleEntry === 'object' ? ruleEntry : {};

        // 1. Najpierw szukamy w słowniku definicji (opisy tekstowe)
        let def = REGIMENT_RULES_DEFINITIONS[ruleId];

        // 2. Jeśli nie ma w definicjach, szukamy w rejestrze logiki (fallback)
        if (!def) {
            const registryItem = REGIMENT_RULES_REGISTRY[ruleId];
            if (registryItem && registryItem.name) {
                // Tworzymy tymczasową definicję na podstawie rejestru
                def = {
                    title: registryItem.name,
                    description: registryItem.description
                };
            }
        }

        if (!def) return null;

        // Obsługa override nazwy i dynamicznego opisu
        const title = params.name_override || def.title;
        const description = typeof def.description === 'function'
            ? def.description(params)
            : def.description;

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