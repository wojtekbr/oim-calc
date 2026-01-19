import { RANK_TYPES } from "../../constants";

export const REGIMENT_RULES_REGISTRY = {

    "lanowa_makes_mixed": {
        modifyStats: (stats, activeUnits) => {
            const hasLanowa = activeUnits.some(u => u.unitId.includes("piechota_lanowa"));
            if (hasLanowa) {
                return { regimentType: "Mieszany" };
            }
            return null;
        }
    },
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
        // 1. Zniżka Kosztu (PU)
        calculateImprovementDiscount: (activeUnits, config, improvementsMap, params, unitsMap, regimentDefinition, costCalculator) => {
            const targetUnitIds = params?.unit_ids || [];
            let targetImpIds = params?.improvement_ids || [];
            if (params?.improvement_id) targetImpIds.push(params.improvement_id);

            if (targetUnitIds.length === 0 || targetImpIds.length === 0 || !improvementsMap) return 0;

            const limit = params?.free_improvements_amount || params?.max_per_regiment || 1;
            let totalDiscount = 0;
            let usedCount = 0;

            for (const unit of activeUnits) {
                if (targetUnitIds.includes(unit.unitId)) {
                    const unitImps = config.improvements?.[unit.key] || [];
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
                    if (usedCount >= limit) break;
                }
            }
            return totalDiscount;
        },
        // 2. Darmowość Slotu
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
            return currentCost - 2;
        }
    },
    "cossack_registered_rules": {
        name: "Pułki Rejestrowe",
        description: "Zasady specjalne wynikające z wybranego regionu (np. Kijowski, Białocerkiewski).",
        modifyStats: (stats, activeUnits, params, context) => {
            const { regimentConfig } = context || {};
            const imps = regimentConfig?.regimentImprovements || [];
            if (imps.includes("region_kijowski")) { stats.motivation += 1; }
            if (imps.includes("region_korsunski")) { stats.motivation += 1; }
            if (imps.includes("region_czehrynski")) { stats.motivation += 2; }
            if (imps.includes("region_kaniowski")) { stats.recon += 1; }
            if (imps.includes("region_perejaslawski")) { stats.motivation += 2; }
            return stats;
        },
        validate: (activeUnits, params, context) => {
            const { regimentConfig } = context || {};
            const imps = regimentConfig?.regimentImprovements || [];
            if (imps.includes("region_bialocerkiewski") || imps.includes("region_nizynski")) {
                const hasSmall = activeUnits.some(u => u.unitId.endsWith("_s"));
                if (hasSmall) {
                    return "Wybrany region zabrania wystawiania jednostek w rozmiarze S.";
                }
            }
            return null;
        }
    },
    "unit_dependency": {
        name: "Zależność jednostek",
        validate: (activeUnits, params, context) => {
            const dependentIds = Array.isArray(params.dependent_unit_id)
                ? params.dependent_unit_id
                : [params.dependent_unit_id];

            const requiredIds = Array.isArray(params.required_unit_id)
                ? params.required_unit_id
                : [params.required_unit_id];

            const presentDependent = activeUnits.find(u => dependentIds.includes(u.unitId));

            if (presentDependent) {
                const hasRequired = activeUnits.some(u => requiredIds.includes(u.unitId));

                if (!hasRequired) {
                    const { unitsMap } = context || {};
                    const depName = unitsMap?.[presentDependent.unitId]?.name || presentDependent.unitId;
                    const reqNames = requiredIds.map(id => unitsMap?.[id]?.name || id).join(" lub ");

                    return `Aby wystawić "${depName}", musisz posiadać w pułku również: "${reqNames}".`;
                }
            }
            return null;
        }
    },
    "max_one_l_unit": {
        name: "Limit jednostek L",
        validate: (activeUnits) => {
            const countL = activeUnits.filter(u => u.unitId && u.unitId.endsWith("_l")).length;
            if (countL > 1) {
                return "Ograniczenie Rozmiaru: Regiment może posiadać tylko jedną jednostkę w rozmiarze L.";
            }
            return null;
        }
    },
    "restricted_unit_size": {
        name: "Ograniczenie rozwoju jednostek",
        validate: (activeUnits, params, context) => {
            const { regimentConfig, unitsMap } = context || {};

            const targetSize = (params.target_size || "").toLowerCase(); // np. "l" lub "m"
            const suffix = `_${targetSize}`;

            const hasTargetSizeUnit = activeUnits.some(u => u.unitId && u.unitId.toLowerCase().endsWith(suffix));

            if (!hasTargetSizeUnit) return null;

            if (params.requires_level_1 && !regimentConfig?.additionalEnabled) {
                return `Ograniczenie Rozmiaru: Jednostki mogą zostać rozwinięte do rozmiaru ${targetSize.toUpperCase()} tylko jeżeli Regiment ma wykupiony Poziom I.`;
            }

            if (params.forbidden_unit_ids && Array.isArray(params.forbidden_unit_ids)) {
                const foundForbidden = activeUnits.find(u => params.forbidden_unit_ids.includes(u.unitId));

                if (foundForbidden) {
                    const forbiddenName = unitsMap?.[foundForbidden.unitId]?.name || foundForbidden.unitId;
                    return `Ograniczenie Rozmiaru: Nie można wystawić jednostek w rozmiarze ${targetSize.toUpperCase()}, ponieważ w pułku znajdują się: "${forbiddenName}".`;
                }
            }

            return null;
        }
    },
    "unit_blocks_improvements": {
        name: "Jednostka blokuje ulepszenia",
        validate: (activeUnits, params, context) => {
            const {
                regimentConfig,
                unitsMap,
                improvements,
                divisionDefinition,
                regimentDefinition,
                checkIfImprovementIsMandatory
            } = context || {};

            const triggerUnitIds = params.trigger_unit_ids || [];
            const forbiddenImpIds = params.forbidden_improvement_ids || [];

            if (triggerUnitIds.length === 0 || forbiddenImpIds.length === 0) return null;

            const presentTrigger = activeUnits.find(u => triggerUnitIds.includes(u.unitId));
            if (!presentTrigger) return null;

            for (const unit of activeUnits) {
                const unitImps = regimentConfig?.improvements?.[unit.key] || [];
                const regImps = regimentConfig?.regimentImprovements || [];

                const allActiveImps = new Set([...unitImps, ...regImps]);

                const foundForbidden = forbiddenImpIds.filter(id => allActiveImps.has(id));

                for (const forbiddenId of foundForbidden) {
                    if (checkIfImprovementIsMandatory && checkIfImprovementIsMandatory(unit.unitId, forbiddenId, divisionDefinition, regimentDefinition?.id, unitsMap)) {
                        continue;
                    }

                    if (regimentDefinition?.rules) {
                        const grantedByOtherRule = regimentDefinition.rules.some(r => {
                            if (r.id === "free_unit_improvement") {
                                const targetUnits = r.unit_ids || [];
                                const targetImps = r.improvement_ids || (r.improvement_id ? [r.improvement_id] : []);
                                if (targetUnits.includes(unit.unitId) && targetImps.includes(forbiddenId)) {
                                    return true;
                                }
                            }
                            return false;
                        });

                        if (grantedByOtherRule) continue;
                    }

                    const triggerName = unitsMap?.[presentTrigger.unitId]?.name || presentTrigger.unitId;
                    const impName = improvements ? (improvements[forbiddenId]?.name || forbiddenId) : forbiddenId;

                    return `Niedozwolona konfiguracja: Ponieważ w pułku znajduje się "${triggerName}", nie możesz wykupić ulepszenia "${impName}".`;
                }
            }

            return null;
        }
    },
};