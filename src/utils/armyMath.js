import { IDS, GROUP_TYPES, RANK_TYPES } from "../constants";
import { DIVISION_RULES_REGISTRY } from "./divisionRules";
import { applyRegimentRuleStats } from "./regimentRules";

// Pomocnicza: Oblicza koszt ulepszenia
const resolveCostRule = (baseCost, rule) => {
    // NOWE: Obsługa kosztu "normal" (x1)
    if (rule === 'normal') return baseCost;
    
    if (rule === 'double') return baseCost * 2;
    if (rule === 'triple') return baseCost * 3;

    if (typeof rule === 'number') {
        if (rule > 0) {
            // Np. 1 -> mnożnik (jeśli używane zamiennie z 'normal' lub dla innych wartości)
            return baseCost * rule;
        }
        if (rule < 0) {
            // Np. -1 -> odejmowanie (nie mniej niż 1)
            return Math.max(1, baseCost + rule);
        }
    }
    return 0;
};

// Oblicza koszt PU (Punktów Ulepszeń) dla pojedynczego ulepszenia jednostki
export const calculateSingleImprovementIMPCost = (unitDef, impId, regimentDefinition, commonImprovements) => {
    const improvementBaseCost = unitDef?.improvement_cost || 0;
    const regImpDef = regimentDefinition?.unit_improvements?.find(i => i.id === impId);
    const commonImpDef = commonImprovements?.[impId];

    let rule = 0;
    if (regImpDef) {
        if (regImpDef.cost_override !== undefined) rule = regImpDef.cost_override;
        else if (regImpDef.cost !== undefined) rule = regImpDef.cost;
        else if (commonImpDef?.cost !== undefined) rule = commonImpDef.cost;
    } else if (commonImpDef) {
        rule = commonImpDef.cost;
    }

    return resolveCostRule(improvementBaseCost, rule);
};

// Oblicza koszt PS (Punktów Siły) dla ulepszenia (zazwyczaj pułkowego)
export const calculateSingleImprovementArmyCost = (unitDef, impId, regimentDefinition, commonImprovements) => {
    const regImpRef = regimentDefinition?.regiment_improvements?.find(i => i.id === impId);
    const commonImpDef = commonImprovements?.[impId];

    // Logika dla ulepszeń pułkowych lub jednostkowych płatnych w PS
    if (regImpRef || (commonImpDef && commonImpDef.type === 'regiment')) {
        // Priorytet: Override w pułku > Definicja w pułku > Definicja wspólna
        if (regImpRef?.army_cost_override !== undefined) return regImpRef.army_cost_override;
        if (regImpRef?.army_point_cost !== undefined) return regImpRef.army_point_cost;
        if (commonImpDef?.army_point_cost !== undefined) return commonImpDef.army_point_cost;
        return 0;
    }
    return 0;
};

// Sprawdza czy jednostka może wziąć ulepszenie
export const canUnitTakeImprovement = (unitDef, improvementId, regimentDefinition) => {
    if (!unitDef || !regimentDefinition) return false;
    
    // Grupy (dowódcy, tabory) zazwyczaj nie biorą ulepszeń jednostkowych
    if (unitDef.rank === RANK_TYPES.GROUP || unitDef.rank === 'group') return false;

    const regImpDef = regimentDefinition.unit_improvements?.find(i => i.id === improvementId);
    if (!regImpDef) return false; 
    
    if (unitDef.improvement_limitations?.includes(improvementId)) return false; 
    
    if (regImpDef.units_allowed && Array.isArray(regImpDef.units_allowed)) {
        if (!regImpDef.units_allowed.includes(unitDef.id)) return false;
    } else if (regImpDef.limitations && Array.isArray(regImpDef.limitations)) {
        if (!regImpDef.limitations.includes(unitDef.id)) return false;
    }
    return true;
};

// Zbiera płaską listę wszystkich jednostek w pułku na podstawie konfiguracji
export const collectRegimentUnits = (regimentConfig, regimentDefinition) => {
    const units = [];
    if (!regimentDefinition) return units;
    
    const structure = regimentDefinition.structure || {};
    
    const processGroup = (type, structureGroup, selections, isEnabled, optSelections, optEnabled) => {
        if (!structureGroup) return;
        if (!isEnabled) return;

        Object.keys(structureGroup).forEach(groupKey => {
            if (groupKey === GROUP_TYPES.OPTIONAL) {
                const mapKey = `${type}/optional`;
                if (!optEnabled?.[mapKey]) return;
                
                const pods = structureGroup.optional || [];
                const selectedKeys = optSelections?.[mapKey] || [];

                pods.forEach((pod, idx) => {
                     let choiceKey = selectedKeys[idx];
                     if (choiceKey === undefined) {
                         const keys = Object.keys(pod);
                         if (keys.length === 1) choiceKey = keys[0];
                     }

                     if (choiceKey && pod[choiceKey]) {
                         const choiceDef = pod[choiceKey];
                         const unitIds = choiceDef.units || (choiceDef.id ? [choiceDef.id] : []);
                         
                         const costOverride = choiceDef.cost_override;
                         const extraCost = choiceDef.extra_cost || 0;

                         unitIds.forEach((uid, uIdx) => {
                             if (uid && uid !== IDS.NONE) {
                                 let appliedCostOverride = undefined;
                                 let appliedExtraCost = 0;

                                 if (costOverride !== undefined) {
                                     appliedCostOverride = (uIdx === 0) ? costOverride : 0;
                                 }
                                 
                                 if (extraCost > 0 && uIdx === 0) {
                                     appliedExtraCost = extraCost;
                                 }

                                 units.push({ 
                                     key: `${type}/optional/${idx}/${uIdx}`, 
                                     unitId: uid,
                                     costOverride: appliedCostOverride,
                                     extraCost: appliedExtraCost
                                 });
                             }
                         });
                     }
                });
                return;
            }

            const pods = structureGroup[groupKey] || [];
            const selectedKeys = selections?.[groupKey] || [];

            pods.forEach((pod, idx) => {
                let choiceKey = selectedKeys[idx];
                if (choiceKey === undefined) {
                     const keys = Object.keys(pod);
                     if (keys.length === 1) choiceKey = keys[0]; 
                }

                if (choiceKey && pod[choiceKey]) {
                    const choiceDef = pod[choiceKey];
                    const unitIds = choiceDef.units || (choiceDef.id ? [choiceDef.id] : []);
                    
                    const costOverride = choiceDef.cost_override;
                    const extraCost = choiceDef.extra_cost || 0;

                    unitIds.forEach((uid, uIdx) => {
                        if (uid && uid !== IDS.NONE) {
                            let appliedCostOverride = undefined;
                            let appliedExtraCost = 0;

                            if (costOverride !== undefined) {
                                appliedCostOverride = (uIdx === 0) ? costOverride : 0;
                            }
                            if (extraCost > 0 && uIdx === 0) {
                                appliedExtraCost = extraCost;
                            }

                            units.push({ 
                                key: `${type}/${groupKey}/${idx}/${uIdx}`, 
                                unitId: uid,
                                costOverride: appliedCostOverride,
                                extraCost: appliedExtraCost
                            });
                        }
                    });
                }
            });
        });
    };

    processGroup(GROUP_TYPES.BASE, structure.base, regimentConfig.baseSelections, true, regimentConfig.optionalSelections, regimentConfig.optionalEnabled);

    const additionalEnabled = !!regimentConfig.additionalEnabled;
    processGroup(GROUP_TYPES.ADDITIONAL, structure.additional, regimentConfig.additionalSelections, additionalEnabled, regimentConfig.optionalSelections, regimentConfig.optionalEnabled);

    if (regimentConfig.additionalCustom) {
         const customDef = structure.additional?.unit_custom_cost;
         const slotName = customDef?.[0]?.depends_on || "custom";
         units.push({ key: `additional/${slotName}_custom`, unitId: regimentConfig.additionalCustom, isCustom: true });
    }

    return units;
};

// Główna funkcja licząca statystyki pułku
export const calculateRegimentStats = (regimentConfig, regimentId, configuredDivision, unitsMap, getRegimentDefinition, commonImprovements) => {
    let stats = {
        cost: 0,
        recon: 0,
        motivation: 0,
        activations: 0,
        orders: 0,
        awareness: 0,
        isVanguard: false,
        regimentType: "-",
        unitNames: []
    };
    if (!unitsMap || !regimentId) return stats; 

    const regimentDefinition = getRegimentDefinition(regimentId);
    if (!regimentDefinition) return stats;

    stats.cost = regimentDefinition.base_cost || 0;
    stats.recon = regimentDefinition.recon || 0;
    stats.activations = regimentDefinition.activations || 0;
    stats.awareness = regimentDefinition.awareness || 0; 

    const customCostMap = (regimentDefinition.structure?.additional?.unit_custom_cost || [])
        .reduce((map, item) => { map[item.id] = item.cost; return map; }, {});

    (regimentConfig.regimentImprovements || []).forEach(impId => {
        stats.cost += calculateSingleImprovementArmyCost(null, impId, regimentDefinition, commonImprovements);
    });

    const activeUnits = collectRegimentUnits(regimentConfig, regimentDefinition);

    let mountedCount = 0;
    let footCount = 0;

    const addUnitStats = (unitId, positionKey) => {
        const unitDef = unitsMap[unitId];
        if (!unitDef) return;

        stats.unitNames.push(unitDef.name);

        if (unitDef.rank !== RANK_TYPES.GROUP) {
            const isMounted = unitDef.is_cavalry || unitDef.are_dragoons || unitDef.are_proxy_dragoons;
            if (isMounted) mountedCount++;
            else footCount++;
        }

        if (unitDef.is_cavalry) stats.recon += 1;
        if (unitDef.is_light_cavalry) stats.recon += 1;
        if (unitDef.has_lances) stats.recon -= 1;
        if (unitDef.is_pike_and_shot) stats.recon -= 1;
        if (unitDef.are_looters_insubordinate) stats.recon -= 1;
        if (unitDef.are_proxy_dragoons) stats.recon += 1;
        if (unitDef.are_scouts) stats.recon += 1;
        if (unitDef.are_dragoons) stats.recon += 1;
        if (unitDef.is_artillery) stats.recon -= 2;
        if (unitDef.are_wagons) stats.recon -= 2;
        if (unitDef.is_harassing) stats.recon += 1;
        if (unitDef.is_disperse) stats.recon += 1;

        if (unitDef.rank === RANK_TYPES.BRONZE || unitDef.rank === RANK_TYPES.SILVER) stats.motivation += 1;
        else if (unitDef.rank === RANK_TYPES.GOLD) stats.motivation += 2;

        if (unitDef.orders) {
            let ordersValue = unitDef.orders;
            if (positionKey && positionKey.startsWith("base/general")) {
                ordersValue += (regimentDefinition.commander_orders_bonus || 0);
            }
            stats.orders += ordersValue;
        }
    };

    activeUnits.forEach((entry) => {
        const { key: positionKey, unitId, isCustom, costOverride, extraCost } = entry;
        
        if (!unitId || unitId === IDS.NONE) return;

        let unitBaseCost = 0;

        if (costOverride !== undefined) {
            unitBaseCost = costOverride;
        } 
        else if (isCustom && customCostMap[unitId] !== undefined) {
            unitBaseCost = customCostMap[unitId];
        } 
        else {
            unitBaseCost = unitsMap[unitId]?.cost || 0;
        }

        if (extraCost) {
            unitBaseCost += extraCost;
        }

        stats.cost += unitBaseCost;

        addUnitStats(unitId, positionKey);

        const improvementsMap = regimentConfig.improvements || {};
        (improvementsMap[positionKey] || []).forEach(impId => {
             stats.cost += calculateSingleImprovementArmyCost(unitsMap[unitId], impId, regimentDefinition, commonImprovements);
        });
    });

    if (configuredDivision && configuredDivision.supportUnits) {
        const allRegiments = [
            ...(configuredDivision.vanguard || []),
            ...(configuredDivision.base || []), 
            ...(configuredDivision.additional || [])
        ];
        const currentRegimentData = allRegiments.find(r => r.config === regimentConfig);

        if (currentRegimentData) {
            const positionKey = `${currentRegimentData.group}/${currentRegimentData.index}`;
            const improvementsMap = regimentConfig.improvements || {};
            
            configuredDivision.supportUnits
                .filter(su => su.assignedTo?.positionKey === positionKey)
                .forEach(su => {
                    stats.cost += (unitsMap[su.id]?.cost || 0);
                    addUnitStats(su.id, null);
                    
                    const supportUnitKey = `support/${su.id}-${positionKey}`;
                    (improvementsMap[supportUnitKey] || []).forEach(impId => {
                         stats.cost += calculateSingleImprovementArmyCost(unitsMap[su.id], impId, regimentDefinition, commonImprovements);
                    });
                });
        }
    }

    const totalCombatUnits = mountedCount + footCount;
    if (totalCombatUnits > 0) {
        if (footCount === 0) {
            stats.regimentType = "Konny";
        } else if (footCount < totalCombatUnits / 2) {
            stats.regimentType = "Mieszany";
        } else {
            stats.regimentType = "Pieszy";
        }
    }

    stats = applyRegimentRuleStats(stats, activeUnits, regimentDefinition);

    if (configuredDivision && configuredDivision.divisionDefinition?.rules) {
         configuredDivision.divisionDefinition.rules.forEach(rule => {
            const ruleImpl = DIVISION_RULES_REGISTRY[rule.id];
            if (ruleImpl && ruleImpl.getRegimentStatsBonus) {
                const bonus = ruleImpl.getRegimentStatsBonus(configuredDivision, regimentId, rule);
                if (bonus) {
                    if (bonus.motivation) stats.motivation += bonus.motivation;
                }
            }
        });
    }

    return stats;
};

export const calculateRegimentImprovementPoints = (regimentConfig, regimentId, unitsMap, getRegimentDefinition, commonImprovements, assignedSupportUnits = []) => {
    if (!unitsMap || !regimentId || regimentId === IDS.NONE) return 0;
    const regimentDefinition = getRegimentDefinition(regimentId);
    if (!regimentDefinition) return 0;

    let totalImpCost = 0;

    const getUnitPUCost = (unitId) => {
        if (!unitId || unitId === IDS.NONE) return 0;
        const u = unitsMap[unitId];
        if (!u) return 0;
        return u.improvement_points_cost || u.pu_cost || 0;
    };

    const regimentImprovementsDefinition = regimentDefinition.regiment_improvements || [];
    (regimentConfig.regimentImprovements || []).forEach(impId => {
        const regImpRef = regimentImprovementsDefinition.find(i => i.id === impId);
        const commonImpDef = commonImprovements?.[impId];
        
        if (regImpRef?.cost_override !== undefined) {
            totalImpCost += regImpRef.cost_override;
        } else if (regImpRef?.cost !== undefined) {
            totalImpCost += regImpRef.cost;
        } else if (commonImpDef?.cost !== undefined) {
            totalImpCost += commonImpDef.cost;
        }
    });

    const improvementsMap = regimentConfig.improvements || {};
    const activeUnits = collectRegimentUnits(regimentConfig, regimentDefinition);

    activeUnits.forEach(({ key: positionKey, unitId }) => {
        if (!unitId || unitId === IDS.NONE) return;
        const unitDef = unitsMap[unitId];
        if (!unitDef || unitDef.rank === RANK_TYPES.GROUP) return;
        
        totalImpCost += getUnitPUCost(unitId);

        (improvementsMap[positionKey] || []).forEach(impId => {
            totalImpCost += calculateSingleImprovementIMPCost(unitDef, impId, regimentDefinition, commonImprovements);
        });
    });

    if (assignedSupportUnits && assignedSupportUnits.length > 0) {
        assignedSupportUnits.forEach(su => {
            const supportUnitDef = unitsMap[su.id];
            if (!supportUnitDef || supportUnitDef.rank === RANK_TYPES.GROUP) return;

            totalImpCost += getUnitPUCost(su.id);

            const regimentPosKey = su.assignedTo?.positionKey;
            if (regimentPosKey) {
                const supportUnitKey = `support/${su.id}-${regimentPosKey}`;
                (improvementsMap[supportUnitKey] || []).forEach(impId => {
                    totalImpCost += calculateSingleImprovementIMPCost(supportUnitDef, impId, regimentDefinition, commonImprovements);
                });
            }
        });
    }

    return totalImpCost;
};

export const calculateImprovementPointsCost = (divisionConfig, unitsMap, getRegimentDefinition, commonImprovements) => {
    if (!unitsMap || !divisionConfig) return 0;
    let totalImpCost = 0;

    const getUnitPUCost = (unitId) => {
        if (!unitId || unitId === IDS.NONE) return 0;
        const u = unitsMap[unitId];
        if (!u) return 0;
        return u.improvement_points_cost || u.pu_cost || 0;
    };

    if (divisionConfig.general) {
        totalImpCost += getUnitPUCost(divisionConfig.general);
    }

    const allRegiments = [
        ...(divisionConfig.vanguard || []).map(r => ({...r, groupKey: GROUP_TYPES.VANGUARD})),
        ...(divisionConfig.base || []).map(r => ({...r, groupKey: GROUP_TYPES.BASE})),
        ...(divisionConfig.additional || []).map(r => ({...r, groupKey: GROUP_TYPES.ADDITIONAL}))
    ];

    allRegiments.forEach(regiment => {
        if (regiment.id === IDS.NONE) return;
        
        const posKey = `${regiment.group}/${regiment.index}`;
        
        const attachedSupport = (divisionConfig.supportUnits || [])
            .filter(su => su.assignedTo?.positionKey === posKey);

        totalImpCost += calculateRegimentImprovementPoints(
            regiment.config, 
            regiment.id, 
            unitsMap, 
            getRegimentDefinition, 
            commonImprovements, 
            attachedSupport
        );
    });

    if (divisionConfig.supportUnits) {
        divisionConfig.supportUnits
            .filter(su => !su.assignedTo)
            .forEach(su => {
                totalImpCost += getUnitPUCost(su.id);
            });
    }

    return totalImpCost;
};

export const calculateTotalSupplyBonus = (divisionConfig, unitsMap, getRegimentDefinition) => {
    if (!unitsMap || !divisionConfig) return 0;
    let supplyBonus = 0;

    const checkUnit = (unitId) => {
        if (!unitId || unitId === IDS.NONE) return;
        const unitDef = unitsMap[unitId];
        if (unitDef && typeof unitDef.additional_supply === 'number') {
            supplyBonus += unitDef.additional_supply;
        }
    };

    if (divisionConfig.general) {
        checkUnit(divisionConfig.general);
    }

    const allRegiments = [
        ...(divisionConfig.vanguard || []),
        ...(divisionConfig.base || []),
        ...(divisionConfig.additional || [])
    ];

    allRegiments.forEach(regiment => {
        if (regiment.id === IDS.NONE) return;
        const def = getRegimentDefinition(regiment.id);
        const units = collectRegimentUnits(regiment.config || {}, def);
        units.forEach(u => checkUnit(u.unitId));
    });

    if (divisionConfig.supportUnits && Array.isArray(divisionConfig.supportUnits)) {
        divisionConfig.supportUnits.forEach(su => checkUnit(su.id));
    }

    return supplyBonus;
};

export const calculateDivisionCost = (configuredDivision, unitsMap, getRegimentDefinition, calculateRegimentStats, commonImprovements) => {
    if (!configuredDivision) return 0;
    const divisionDef = configuredDivision.divisionDefinition;
    let cost = divisionDef.base_cost || 0;

    if (configuredDivision.general) {
        const genDef = unitsMap[configuredDivision.general];
        if (genDef) {
            cost += (genDef.cost || 0);
        }
    }

    const allRegiments = [
        ...(configuredDivision.vanguard || []),
        ...(configuredDivision.base || []), 
        ...(configuredDivision.additional || [])
    ];
    
    allRegiments.forEach(regiment => {
        if (regiment.id !== IDS.NONE) {
            cost += calculateRegimentStats(regiment.config, regiment.id, configuredDivision, unitsMap, getRegimentDefinition, commonImprovements).cost;
        }
    });

    (configuredDivision.supportUnits || [])
        .filter(su => su.assignedTo === null)
        .forEach(su => {
            cost += (unitsMap[su.id]?.cost || 0);
        });

    return cost;
};

export const calculateDivisionType = (configuredDivision, unitsMap, getRegimentDefinition, commonImprovements) => {
    if (!configuredDivision || !unitsMap) return "-";

    const allRegiments = [
        ...(configuredDivision.vanguard || []),
        ...(configuredDivision.base || []),
        ...(configuredDivision.additional || [])
    ].filter(r => r.id !== IDS.NONE);

    if (allRegiments.length === 0) return "-";

    let horseRegimentsCount = 0;
    let footRegimentsCount = 0;

    allRegiments.forEach(regiment => {
        const stats = calculateRegimentStats(regiment.config, regiment.id, configuredDivision, unitsMap, getRegimentDefinition, commonImprovements);

        if (stats.regimentType === "Konny") {
            horseRegimentsCount++;
        } else if (stats.regimentType === "Pieszy" || stats.regimentType === "Mieszany") {
            footRegimentsCount++;
        }
    });

    const hasUnassignedArtillery = (configuredDivision.supportUnits || [])
        .filter(su => su.assignedTo === null)
        .some(su => unitsMap[su.id]?.is_artillery);

    if (hasUnassignedArtillery) {
        footRegimentsCount++;
    }

    if (footRegimentsCount <= 1) {
        return "Dywizja Konna";
    }
    if (footRegimentsCount > horseRegimentsCount) {
        return "Dywizja Piesza";
    }
    return "Dywizja Mieszana";
};

// --- Helper do sprawdzania sojusznika (z obsługą najemników) ---
const isRegimentAllied = (regId, selectedFaction, getRegimentDefinition) => {
    if (!selectedFaction || !selectedFaction.regiments) return false;
    // 1. Jeśli jest na liście pułków frakcji -> Nie jest sojusznikiem (jest rodzimy)
    if (selectedFaction.regiments[regId]) return false;
    
    // 2. Jeśli pochodzi z frakcji "mercenaries" -> Nie jest sojusznikiem
    const def = getRegimentDefinition(regId);
    if (def && def._sourceFaction === 'mercenaries') return false;

    // 3. W przeciwnym razie -> Jest sojusznikiem
    return true;
};

export const calculateMainForceKey = (configuredDivision, unitsMap, selectedFaction, getRegimentDefinition, commonImprovements) => {
    if (!configuredDivision) return null;

    // Używamy helpera z obsługą najemników
    const isAllied = (regId) => isRegimentAllied(regId, selectedFaction, getRegimentDefinition);

    const eligibleRegiments = [
        ...(configuredDivision.base || []).map(r => ({ ...r, key: `${GROUP_TYPES.BASE}/${r.index}` })),
        ...(configuredDivision.additional || []).map(r => ({ ...r, key: `${GROUP_TYPES.ADDITIONAL}/${r.index}` }))
    ].filter(r => r.id !== IDS.NONE && !isAllied(r.id));

    if (eligibleRegiments.length === 0) return null;

    let maxCost = -1;
    const regimentCosts = {};

    eligibleRegiments.forEach(reg => {
        const stats = calculateRegimentStats(reg.config, reg.id, configuredDivision, unitsMap, getRegimentDefinition, commonImprovements);
        regimentCosts[reg.key] = stats.cost;
        if (stats.cost > maxCost) {
            maxCost = stats.cost;
        }
    });

    const candidates = eligibleRegiments.filter(r => regimentCosts[r.key] === maxCost);
    const preferredKey = configuredDivision.preferredMainForceKey;

    if (preferredKey && candidates.some(r => r.key === preferredKey)) {
        return preferredKey;
    }

    return candidates.length > 0 ? candidates[0].key : null;
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

    const isAllied = (regId) => {
        if (!selectedFaction || !selectedFaction.regiments) return false;
        return !selectedFaction.regiments[regId];
    };

    const allRegiments = [
        ...(divisionConfig.vanguard || []),
        ...(divisionConfig.base || []),
        ...(divisionConfig.additional || [])
    ];

    for (const reg of allRegiments) {
        if (reg.id !== IDS.NONE && isAllied(reg.id)) {
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