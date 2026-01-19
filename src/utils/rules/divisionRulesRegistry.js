import { IDS, GROUP_TYPES } from "../../constants";
import { collectRegimentUnits, getArtilleryIds } from "../math/structureUtils";

export const DIVISION_RULES_REGISTRY = {
    // --- Królewski Regiment Artylerii ---
    "krolewski_regiment_artylerii": {
        injectedImprovements: ["veterans"],

        calculateDiscount: (regimentConfig, activeUnits, improvementsMap, params, regimentId, context) => {
            const targetImpId = "veterans";
            if (!improvementsMap) return 0;

            const { divisionDefinition, calculateCostFn, unitsMap, regimentDefinition } = context || {};
            const artilleryIds = getArtilleryIds(divisionDefinition);

            let discount = 0;
            for (const unit of activeUnits) {
                if (!artilleryIds.includes(unit.unitId)) continue;

                const unitImps = regimentConfig.improvements?.[unit.key] || [];

                if (unitImps.includes(targetImpId)) {
                    if (calculateCostFn && unitsMap && regimentDefinition) {
                        const cost = calculateCostFn(unitsMap[unit.unitId], targetImpId, regimentDefinition, improvementsMap);
                        discount += cost;
                    } else {
                        const impDef = improvementsMap[targetImpId];
                        const cost = Number(impDef?.cost || 0);
                        discount += cost;
                    }
                }
            }
            return Number(discount) || 0;
        },

        isImprovementFree: (unitId, impId, params, regimentId, unitsMap, divisionDefinition) => {
            if (impId !== "veterans") return false;
            if (!unitId) return false;
            const artilleryIds = getArtilleryIds(divisionDefinition);
            return artilleryIds.includes(unitId);
        },

        isMandatory: (unitId, impId, params, regimentId, unitsMap, divisionDefinition) => {
            if (impId !== "veterans") return false;
            if (!unitId) return false;
            const artilleryIds = getArtilleryIds(divisionDefinition);
            return artilleryIds.includes(unitId);
        }
    },

    "dyscyplina": {
        getRegimentStatsBonus: (divisionConfig, targetRegimentId, params) => {
            return { motivation: 1 };
        }
    },

    "grant_improvements_to_specific_regiments": {
        getInjectedImprovements: (params, regimentId) => {
            const targetRegimentIds = params?.regiment_ids || [];
            if (targetRegimentIds.includes(regimentId)) {
                return params?.improvement_ids || (params?.improvement_id ? [params.improvement_id] : []) || [];
            }
            return [];
        },

        calculateDiscount: (regimentConfig, activeUnits, improvementsMap, params, regimentId, context) => {
            const targetRegimentIds = params?.regiment_ids || [];
            const targetImpIds = params?.improvement_ids || (params?.improvement_id ? [params.improvement_id] : []) || [];

            if (!targetRegimentIds.includes(regimentId) || !improvementsMap) return 0;

            const { unitsMap, regimentDefinition, calculateCostFn } = context || {};

            let discount = 0;
            for (const unit of activeUnits) {
                const unitImps = regimentConfig.improvements?.[unit.key] || [];
                const impsToDiscount = unitImps.filter(imp => targetImpIds.includes(imp));

                impsToDiscount.forEach(impId => {
                    if (calculateCostFn && unitsMap && regimentDefinition) {
                        const cost = calculateCostFn(unitsMap[unit.unitId], impId, regimentDefinition, improvementsMap);
                        discount += cost;
                    } else {
                        const impDef = improvementsMap[impId];
                        const cost = Number(impDef?.cost || 0);
                        discount += cost;
                    }
                });
            }
            return Number(discount) || 0;
        },

        isImprovementFree: (unitId, impId, params, regimentId) => {
            const targetRegimentIds = params?.regiment_ids || [];
            const targetImpIds = params?.improvement_ids || (params?.improvement_id ? [params.improvement_id] : []) || [];

            if (targetRegimentIds.includes(regimentId) && targetImpIds.includes(impId)) {
                return true;
            }
            return false;
        },

        isMandatory: (unitId, impId, params, regimentId) => {
            const targetRegimentIds = params?.regiment_ids || [];
            const targetImpIds = params?.improvement_ids || (params?.improvement_id ? [params.improvement_id] : []) || [];

            if (!targetRegimentIds.includes(regimentId)) return false;
            if (!targetImpIds.includes(impId)) return false;
            if (unitId === null) return true;

            return true;
        }
    },

    "grant_improvement_to_all": {
        getInjectedImprovements: (params, regimentId) => {
            const excludedRegiments = params?.excluded_regiment_ids || [];
            if (excludedRegiments.includes(regimentId)) return [];

            return params?.improvement_ids || (params?.improvement_id ? [params.improvement_id] : []) || [];
        },

        calculateDiscount: (regimentConfig, activeUnits, improvementsMap, params, regimentId, context) => {
            const targetImpIds = params?.improvement_ids || (params?.improvement_id ? [params.improvement_id] : []);
            const excludedRegiments = params?.excluded_regiment_ids || [];
            const excludedUnits = params?.excluded_unit_ids || [];

            if (targetImpIds.length === 0 || !improvementsMap) return 0;

            if (excludedRegiments.includes(regimentId)) return 0;

            const { unitsMap, regimentDefinition, calculateCostFn } = context || {};

            let discount = 0;
            for (const unit of activeUnits) {
                if (excludedUnits.includes(unit.unitId)) continue;

                const unitImps = regimentConfig.improvements?.[unit.key] || [];

                targetImpIds.forEach(targetImpId => {
                    if (unitImps.includes(targetImpId)) {
                        if (calculateCostFn && unitsMap && regimentDefinition) {
                            const cost = calculateCostFn(unitsMap[unit.unitId], targetImpId, regimentDefinition, improvementsMap);
                            discount += cost;
                        } else {
                            const impDef = improvementsMap[targetImpId];
                            const cost = Number(impDef?.cost || 0);
                            discount += cost;
                        }
                    }
                });
            }
            return Number(discount) || 0;
        },

        isImprovementFree: (unitId, impId, params, regimentId) => {
            const targetImpIds = params?.improvement_ids || (params?.improvement_id ? [params.improvement_id] : []);
            if (!targetImpIds.includes(impId)) return false;

            const excludedRegiments = params?.excluded_regiment_ids || [];
            if (excludedRegiments.includes(regimentId)) return false;

            const excludedUnits = params?.excluded_unit_ids || [];
            if (unitId && excludedUnits.includes(unitId)) return false;

            return true;
        },

        isMandatory: (unitId, impId, params, regimentId) => {
            const targetImpIds = params?.improvement_ids || (params?.improvement_id ? [params.improvement_id] : []);
            if (!targetImpIds.includes(impId)) return false;

            const excludedRegiments = params?.excluded_regiment_ids || [];
            if (excludedRegiments.includes(regimentId)) return false;

            if (unitId === null) return true;

            const excludedUnits = params?.excluded_unit_ids || [];
            if (excludedUnits.includes(unitId)) return false;

            return true;
        }
    },

    "free_improvement_for_specific_units": {
        calculateDiscount: (regimentConfig, activeUnits, improvementsMap, params) => {
            const targetUnitIds = params?.unit_ids || [];
            const targetImpId = params?.improvement_id;
            const maxPerRegiment = params?.max_per_regiment || 1;

            if (!targetImpId || targetUnitIds.length === 0 || !improvementsMap) return 0;

            let discount = 0;
            let count = 0;

            for (const unit of activeUnits) {
                if (targetUnitIds.includes(unit.unitId)) {
                    const unitImps = regimentConfig.improvements?.[unit.key] || [];
                    if (unitImps.includes(targetImpId)) {
                        const impDef = improvementsMap[targetImpId];
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
            if (count > 0) return [];
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

            if (count >= requiredAmount) return { improvementPoints: bonusPoints, supply: 0, cost: 0 };
            return null;
        }
    },

    "limit_max_same_regiments": {
        validate: (divisionConfig, unitsMap, getRegimentDefinition, ruleParams) => {
            let rawInput = ruleParams.regiment_ids || ruleParams.regiment_id;
            let targetIds = [];

            if (Array.isArray(rawInput)) {
                targetIds = rawInput;
            } else if (rawInput) {
                targetIds = [rawInput];
            }

            const max = ruleParams.max_amount || 1;

            if (targetIds.length === 0) return [];

            const allRegiments = [
                ...(divisionConfig.vanguard || []),
                ...(divisionConfig.base || []),
                ...(divisionConfig.additional || [])
            ];

            let count = 0;
            allRegiments.forEach(reg => {
                if (reg.id && reg.id !== 'none' && targetIds.includes(reg.id)) {
                    count++;
                }
            });

            if (count > max) {
                const names = targetIds.map(tid => {
                    const def = getRegimentDefinition(tid);
                    return def ? `"${def.name}"` : tid;
                }).join(", ");

                return [`Przekroczono limit (${max}) dla grupy pułków: ${names} (obecnie: ${count}).`];
            }

            return [];
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
            const bannedUnitIds = params?.banned_unit_ids || params?.unit_ids || [];

            if (bannedUnitIds.length === 0) return [];

            const errors = [];
            const vanguardRegiments = divisionConfig.vanguard || [];

            vanguardRegiments.forEach((reg, index) => {
                if (reg.id !== IDS.NONE) {
                    const def = getRegimentDefinition(reg.id);

                    const internalUnits = collectRegimentUnits(reg.config || {}, def).map(u => u.unitId);

                    const positionKey = `${GROUP_TYPES.VANGUARD}/${index}`;
                    const supportUnits = (divisionConfig.supportUnits || [])
                        .filter(su => su.assignedTo?.positionKey === positionKey)
                        .map(su => su.id);

                    const allUnitIds = [...internalUnits, ...supportUnits];

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
    "limit_units_by_size_in_regiments": {
        validate: (divisionConfig, unitsMap, getRegimentDefinition, params) => {
            let targetRegimentIds = params?.regiment_ids || [];
            if (!Array.isArray(targetRegimentIds)) targetRegimentIds = [targetRegimentIds];

            const targetSize = params?.unit_size ? params.unit_size.toLowerCase() : null;
            const maxAmount = params?.max_amount !== undefined ? params.max_amount : 99;

            if (!targetSize || targetRegimentIds.length === 0) return [];

            const suffix = `_${targetSize}`;
            const errors = [];

            const allRegiments = [
                ...(divisionConfig.vanguard || []),
                ...(divisionConfig.base || []),
                ...(divisionConfig.additional || [])
            ];

            allRegiments.forEach(reg => {
                if (reg.id && reg.id !== 'none' && targetRegimentIds.includes(reg.id)) {
                    const def = getRegimentDefinition(reg.id);
                    if (!def) return;

                    const units = collectRegimentUnits(reg.config || {}, def);
                    const count = units.filter(u => u.unitId && u.unitId.toLowerCase().endsWith(suffix)).length;

                    if (count > maxAmount) {
                        const regName = def.name || reg.id;
                        errors.push(
                            `Przekroczono limit rozmiaru w pułku "${regName}".\n` +
                            `Możesz mieć maksymalnie ${maxAmount} jednostek o rozmiarze "${targetSize.toUpperCase()}" (obecnie: ${count}).`
                        );
                    }
                }
            });

            return errors;
        }
    },
    "regiment_dependency": {
        validate: (divisionConfig, unitsMap, getRegimentDefinition, params) => {
            const triggerId = params?.trigger_regiment_id;
            let requiredIds = params?.required_regiment_id;

            if (!triggerId || !requiredIds) return [];
            if (!Array.isArray(requiredIds)) requiredIds = [requiredIds];

            const allRegiments = [
                ...(divisionConfig.vanguard || []),
                ...(divisionConfig.base || []),
                ...(divisionConfig.additional || [])
            ];

            const isTriggerPresent = allRegiments.some(r => r.id === triggerId);
            if (!isTriggerPresent) return [];

            const isRequirementMet = allRegiments.some(r => r.id && r.id !== 'none' && requiredIds.includes(r.id));

            if (!isRequirementMet) {
                const triggerDef = getRegimentDefinition(triggerId);
                const triggerName = triggerDef ? triggerDef.name : triggerId;

                const reqNames = requiredIds.map(rid => {
                    const def = getRegimentDefinition(rid);
                    return def ? `"${def.name}"` : rid;
                }).join(" lub ");

                return [`Wymaganie strukturalne: Aby wystawić "${triggerName}", Twoja dywizja musi zawierać również: ${reqNames}.`];
            }

            return [];
        }
    },

    // --- POPRAWIONO: Sprawdza dolny ORAZ górny limit ilościowy ---
    "mandatory_support_unit_per_regiment": {
        validate: (divisionConfig, unitsMap, getRegimentDefinition, params) => {
            const regimentIds = params?.regiment_ids || [];
            const supportUnitId = params?.support_unit_id;
            const amountPerRegiment = params?.amount_per_regiment || 1;

            // Obsługa flagi (boolean lub string "true")
            const excludeVanguard = params?.exclude_vanguard === true || params?.exclude_vanguard === "true";

            if (!supportUnitId || regimentIds.length === 0) return [];

            // 1. Budujemy listę pułków do sprawdzenia
            let allRegiments = [
                ...(divisionConfig.base || []),
                ...(divisionConfig.additional || [])
            ];

            // Jeśli NIE wykluczamy straży, dodajemy ją do puli
            if (!excludeVanguard) {
                allRegiments = [
                    ...(divisionConfig.vanguard || []),
                    ...allRegiments
                ];
            }

            // 2. Liczymy aktywne pułki z listy
            let regimentCount = 0;
            allRegiments.forEach(reg => {
                if (reg.id && reg.id !== 'none' && regimentIds.includes(reg.id)) {
                    regimentCount++;
                }
            });

            if (regimentCount === 0) return [];

            // 3. Liczymy posiadane jednostki wsparcia tego typu
            const supportCount = (divisionConfig.supportUnits || [])
                .filter(su => su.id === supportUnitId).length;

            const requiredAmount = regimentCount * amountPerRegiment;

            const unitName = unitsMap[supportUnitId]?.name || supportUnitId;
            const regNames = regimentIds.map(rid => {
                const def = getRegimentDefinition(rid);
                return def ? `"${def.name}"` : rid;
            }).join(" lub ");
            const contextInfo = excludeVanguard ? " (poza Strażą Przednią)" : "";

            // --- WALIDACJA: ZA MAŁO ---
            if (supportCount < requiredAmount) {
                return [`Wymagana jednostka wsparcia: Posiadasz ${regimentCount} pułk(i) typu ${regNames}${contextInfo}. Musisz dokupić jeszcze ${requiredAmount - supportCount}x "${unitName}".`];
            }

            // --- NOWE WALIDACJA: ZA DUŻO ---
            if (supportCount > requiredAmount) {
                return [`Nadmiarowa jednostka wsparcia: Posiadasz ${regimentCount} pułk(i) typu ${regNames}${contextInfo}. Limit wynosi ${requiredAmount}, a posiadasz ${supportCount}x "${unitName}". Usuń nadmiarowe jednostki.`];
            }

            return [];
        }
    },
    "block_units_if_regiments_present": {
        validate: (divisionConfig, unitsMap, getRegimentDefinition, params) => {
            const errors = [];
            const triggerIds = params.trigger_regiment_ids || [];
            const forbiddenUnitIds = params.forbidden_unit_ids || [];
            const targetRegimentIds = params.target_regiment_ids || []; // Jeśli puste, dotyczy wszystkich pułków

            if (triggerIds.length === 0 || forbiddenUnitIds.length === 0) return [];

            // 1. Sprawdzamy, czy w dywizji jest "zapalnik" (np. regiment dragonów)
            const allRegiments = [
                ...(divisionConfig.vanguard || []),
                ...(divisionConfig.base || []),
                ...(divisionConfig.additional || [])
            ];

            const foundTrigger = allRegiments.find(r => r.id !== 'none' && triggerIds.includes(r.id));

            if (!foundTrigger) return []; // Nie ma triggera, więc nie ma blokady

            const triggerName = getRegimentDefinition(foundTrigger.id)?.name || foundTrigger.id;

            // 2. Iterujemy po pułkach, żeby sprawdzić ich zawartość
            allRegiments.forEach(reg => {
                if (!reg.id || reg.id === 'none') return;

                // Jeśli zdefiniowano konkretne pułki docelowe (target_regiment_ids), sprawdzamy tylko je
                if (targetRegimentIds.length > 0 && !targetRegimentIds.includes(reg.id)) {
                    return;
                }

                const regDef = getRegimentDefinition(reg.id);
                // Używamy helpera, żeby wyciągnąć listę wszystkich jednostek wybranych w tym pułku
                const activeUnits = collectRegimentUnits(reg.config || {}, regDef);

                // Sprawdzamy czy którakolwiek z aktywnych jednostek jest na liście zakazanych
                const illegalUnit = activeUnits.find(u => u.unitId && forbiddenUnitIds.includes(u.unitId));

                if (illegalUnit) {
                    const unitName = unitsMap[illegalUnit.unitId]?.name || illegalUnit.unitId;
                    const regName = regDef?.name || reg.id;

                    errors.push(
                        `Błąd w pułku "${regName}": Nie możesz wystawić jednostki "${unitName}", ponieważ w dywizji znajduje się "${triggerName}".`
                    );
                }
            });

            return errors;
        }
    },
    "position_based_cost_modifier": {
        getRegimentCostModifier: (divisionConfig, targetRegimentId, params) => {
            const targetIds = params?.regiment_ids || [];
            const targetGroup = params?.group; // "vanguard", "base", "additional"
            const extraPu = params?.pu_cost || 0;
            const extraPs = params?.ps_cost || 0;

            if (!targetGroup || !targetIds.includes(targetRegimentId)) return null;

            const groupRegiments = divisionConfig?.[targetGroup] || [];
            const isPresentInGroup = groupRegiments.some(r => r.id === targetRegimentId);

            if (isPresentInGroup) {
                return { pu: extraPu, ps: extraPs };
            }
            return null;
        }
    },
};