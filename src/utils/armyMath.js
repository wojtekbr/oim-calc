// Pomocnicza: oblicza koszt pojedynczego ulepszenia (PU)
export const calculateSingleImprovementIMPCost = (unitDef, impDef) => {
    const improvementBaseCost = unitDef?.improvement_cost || 0;
    if (impDef.cost === -1) return Math.max(1, improvementBaseCost - 1);
    if (typeof impDef.cost === 'number') return impDef.cost;
    if (impDef.cost === 'double') return improvementBaseCost * 2;
    if (impDef.cost === 'triple') return improvementBaseCost * 3;
    if (impDef.cost === 1) return improvementBaseCost;
    return 0;
};

// Pomocnicza: oblicza koszt pojedynczego ulepszenia (PS - Punkty Siły)
export const calculateSingleImprovementCost = (unitDef, impDef, type = 'imp') => {
    const improvementBaseCost = unitDef?.improvement_cost || 0;
    const targetCost = type === 'imp' ? impDef.cost : impDef.army_point_cost;

    if (targetCost === undefined || targetCost === null) return 0;
    if (targetCost === -1) return Math.max(1, improvementBaseCost - 1);
    if (typeof targetCost === 'number') return targetCost;
    if (targetCost === 'double') return improvementBaseCost * 2;
    if (targetCost === 'triple') return improvementBaseCost * 3;
    if (targetCost === 1) return improvementBaseCost;
    return 0;
};

// Zbiera płaską listę jednostek z konfiguracji pułku
export const collectRegimentUnits = (regimentConfig, regimentDefinition) => {
    const units = [];
    if (!regimentDefinition) return units;
    
    const structure = regimentDefinition.structure || {};
    
    const processGroup = (type, structureGroup, selections, isEnabled, optSelections, optEnabled) => {
        if (!structureGroup) return;
        if (!isEnabled) return;

        Object.keys(structureGroup).forEach(groupKey => {
            // Optional
            if (groupKey === "optional") {
                const mapKey = `${type}/optional`;
                if (!optEnabled?.[mapKey]) return;
                
                const pods = structureGroup.optional || [];
                const selectedIds = optSelections?.[mapKey] || [];

                pods.forEach((pod, idx) => {
                     let unitId = selectedIds[idx];
                     if (!unitId) {
                         const opts = Object.values(pod).map(u => u?.id).filter(Boolean);
                         if (opts.length === 1) unitId = opts[0];
                     }
                     if (unitId && unitId !== 'none') {
                         units.push({ key: `${type}/optional/${idx}`, unitId });
                     }
                });
                return;
            }

            // Standard Groups
            const pods = structureGroup[groupKey] || [];
            const selectedIds = selections?.[groupKey] || [];

            pods.forEach((pod, idx) => {
                let unitId = selectedIds[idx];
                if (!unitId) {
                     // Fallback logic
                     if (regimentConfig[type] && regimentConfig[type][groupKey]) {
                         const opts = Object.values(pod).map(u => u?.id).filter(Boolean);
                         if (opts.length > 0) unitId = opts[0]; 
                     } else {
                         const opts = Object.values(pod).map(u => u?.id).filter(Boolean);
                         if (opts.length === 1) unitId = opts[0];
                         else if (opts.length > 0) unitId = opts[0];
                     }
                }

                if (unitId && unitId !== 'none') {
                    units.push({ key: `${type}/${groupKey}/${idx}`, unitId });
                }
            });
        });
    };

    processGroup("base", structure.base, regimentConfig.baseSelections, true, regimentConfig.optionalSelections, regimentConfig.optionalEnabled);

    const additionalEnabled = !!regimentConfig.additionalEnabled;
    processGroup("additional", structure.additional, regimentConfig.additionalSelections, additionalEnabled, regimentConfig.optionalSelections, regimentConfig.optionalEnabled);

    if (regimentConfig.additionalCustom) {
         const customDef = structure.additional?.unit_custom_cost;
         const slotName = customDef?.[0]?.depends_on || "custom";
         units.push({ key: `additional/${slotName}_custom`, unitId: regimentConfig.additionalCustom, isCustom: true });
    }

    return units;
};

// Oblicza statystyki pojedynczego pułku
export const calculateRegimentStats = (regimentConfig, regimentId, configuredDivision, selectedFaction, getRegimentDefinition) => {
    const stats = {
        cost: 0,
        recon: 0,
        motivation: 0,
        activations: 0,
        orders: 0,
        awareness: 0,
        isVanguard: regimentConfig?.isVanguard || false,
        unitNames: []
    };
    if (!selectedFaction || !regimentId) return stats;

    const unitsMap = selectedFaction.units || {};
    const regimentDefinition = getRegimentDefinition(regimentId);
    if (!regimentDefinition) return stats;

    stats.cost = regimentDefinition.base_cost || 0;
    stats.recon = regimentDefinition.recon || 0;
    stats.activations = regimentDefinition.activations || 0;
    stats.awareness = regimentDefinition.awareness || 0; 

    const unitImprovementsDefinition = regimentDefinition.unit_improvements || [];
    const regimentImprovementsDefinition = regimentDefinition.regiment_improvements || [];
    const improvementsMap = regimentConfig.improvements || {};

    const customCostMap = (regimentDefinition.structure?.additional?.unit_custom_cost || [])
        .reduce((map, item) => { map[item.id] = item.cost; return map; }, {});

    // Ulepszenia pułku (koszt PS)
    (regimentConfig.regimentImprovements || []).forEach(impId => {
        const impDef = regimentImprovementsDefinition.find(i => i.id === impId);
        if (impDef && typeof impDef.army_point_cost === 'number') {
            stats.cost += impDef.army_point_cost;
        }
    });

    const activeUnits = collectRegimentUnits(regimentConfig, regimentDefinition);

    const addUnitStats = (unitId, positionKey) => {
        const unitDef = unitsMap[unitId];
        if (!unitDef) return;

        stats.unitNames.push(unitDef.name);

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

        if (unitDef.rank === 'bronze' || unitDef.rank === 'silver') stats.motivation += 1;
        else if (unitDef.rank === 'gold') stats.motivation += 2;

        if (unitDef.orders) {
            let ordersValue = unitDef.orders;
            if (positionKey && positionKey.startsWith("base/general")) {
                ordersValue += (regimentDefinition.commander_orders_bonus || 0);
            }
            stats.orders += ordersValue;
        }
    };

    activeUnits.forEach(({ key: positionKey, unitId, isCustom }) => {
        if (!unitId || unitId === 'none') return;

        let unitBaseCost = unitsMap[unitId]?.cost || 0;
        if (isCustom && customCostMap[unitId] !== undefined) {
            unitBaseCost = customCostMap[unitId];
        }
        stats.cost += unitBaseCost;

        addUnitStats(unitId, positionKey);

        (improvementsMap[positionKey] || []).forEach(impId => {
            const impDef = unitImprovementsDefinition.find(i => i.id === impId);
            if (impDef) {
                stats.cost += calculateSingleImprovementCost(unitsMap[unitId], impDef, 'army');
            }
        });
    });

    // Support Units attached to this regiment
    if (configuredDivision && configuredDivision.supportUnits) {
        const allRegiments = [...(configuredDivision.base || []), ...(configuredDivision.additional || [])];
        const currentRegimentData = allRegiments.find(r => r.config === regimentConfig);

        if (currentRegimentData) {
            const positionKey = `${currentRegimentData.group}/${currentRegimentData.index}`;
            configuredDivision.supportUnits
                .filter(su => su.assignedTo?.positionKey === positionKey)
                .forEach(su => {
                    stats.cost += (unitsMap[su.id]?.cost || 0);
                    addUnitStats(su.id, null);
                    
                    const supportUnitKey = `support/${su.id}-${positionKey}`;
                    (improvementsMap[supportUnitKey] || []).forEach(impId => {
                         const impDef = unitImprovementsDefinition.find(i => i.id === impId);
                         if (impDef) {
                             stats.cost += calculateSingleImprovementCost(unitsMap[su.id], impDef, 'army');
                         }
                    });
                });
        }
    }

    return stats;
};

// Oblicza zużycie Punktów Ulepszeń (PU)
export const calculateImprovementPointsCost = (divisionConfig, selectedFaction, getRegimentDefinition) => {
    if (!selectedFaction || !divisionConfig) return 0;
    const unitsMap = selectedFaction.units || {};
    let totalImpCost = 0;

    const allRegiments = [
        ...(divisionConfig.base || []),
        ...(divisionConfig.additional || [])
    ];

    allRegiments.forEach(regiment => {
        const regimentId = regiment.id;
        const regimentConfig = regiment.config || {};
        const regimentDefinition = getRegimentDefinition(regimentId);
        
        if (regimentId === 'none' || !regimentDefinition) return;

        const unitImprovementsDefinition = regimentDefinition.unit_improvements || [];
        const regimentImprovementsDefinition = regimentDefinition.regiment_improvements || [];
        const improvementsMap = regimentConfig.improvements || {};

        (regimentConfig.regimentImprovements || []).forEach(impId => {
            const impDef = regimentImprovementsDefinition.find(i => i.id === impId);
            if (impDef && typeof impDef.cost === 'number') totalImpCost += impDef.cost;
        });

        const activeUnits = collectRegimentUnits(regimentConfig, regimentDefinition);

        activeUnits.forEach(({ key: positionKey, unitId }) => {
            if (!unitId || unitId === 'none') return;
            const unitDef = unitsMap[unitId];
            if (!unitDef || unitDef.rank === 'group') return;
            
            if (typeof unitDef.pu_cost === 'number') totalImpCost += unitDef.pu_cost;

            (improvementsMap[positionKey] || []).forEach(impId => {
                const impDef = unitImprovementsDefinition.find(i => i.id === impId);
                if (impDef) totalImpCost += calculateSingleImprovementIMPCost(unitDef, impDef);
            });
        });

        if (divisionConfig.supportUnits) {
            const regimentPositionKey = `${regiment.group}/${regiment.index}`;
            divisionConfig.supportUnits
                .filter(su => su.assignedTo?.positionKey === regimentPositionKey)
                .forEach(su => {
                    const supportUnitKey = `support/${su.id}-${regimentPositionKey}`;
                    const supportUnitDef = unitsMap[su.id];
                    if (!supportUnitDef || supportUnitDef.rank === 'group') return;
                    if (typeof supportUnitDef.pu_cost === 'number') totalImpCost += supportUnitDef.pu_cost;

                    (improvementsMap[supportUnitKey] || []).forEach(impId => {
                        const impDef = unitImprovementsDefinition.find(i => i.id === impId);
                        if (impDef) totalImpCost += calculateSingleImprovementIMPCost(supportUnitDef, impDef);
                    });
                });
        }
    });

    if (divisionConfig.supportUnits) {
        divisionConfig.supportUnits
            .filter(su => !su.assignedTo)
            .forEach(su => {
                const supportUnitDef = unitsMap[su.id];
                if (supportUnitDef && typeof supportUnitDef.pu_cost === 'number') {
                    totalImpCost += supportUnitDef.pu_cost;
                }
            });
    }

    return totalImpCost;
};

// Oblicza bonus do zaopatrzenia
export const calculateTotalSupplyBonus = (divisionConfig, selectedFaction, getRegimentDefinition) => {
    if (!selectedFaction || !divisionConfig) return 0;
    const unitsMap = selectedFaction.units || {};
    let supplyBonus = 0;

    const checkUnit = (unitId) => {
        if (!unitId || unitId === 'none') return;
        const unitDef = unitsMap[unitId];
        if (unitDef && typeof unitDef.additional_supply === 'number') {
            supplyBonus += unitDef.additional_supply;
        }
    };

    const allRegiments = [
        ...(divisionConfig.base || []),
        ...(divisionConfig.additional || [])
    ];

    allRegiments.forEach(regiment => {
        if (regiment.id === 'none') return;
        const def = getRegimentDefinition(regiment.id);
        const units = collectRegimentUnits(regiment.config || {}, def);
        units.forEach(u => checkUnit(u.unitId));
    });

    if (divisionConfig.supportUnits && Array.isArray(divisionConfig.supportUnits)) {
        divisionConfig.supportUnits.forEach(su => checkUnit(su.id));
    }

    return supplyBonus;
};

// Oblicza całkowity koszt dywizji
export const calculateDivisionCost = (configuredDivision, selectedFaction, getRegimentDefinition, calculateRegimentStats) => {
    if (!configuredDivision) return 0;
    const divisionDef = configuredDivision.divisionDefinition;
    let cost = divisionDef.base_cost || 0;
    const unitsMap = selectedFaction?.units || {};

    const allRegiments = [...(configuredDivision.base || []), ...(configuredDivision.additional || [])];
    allRegiments.forEach(regiment => {
        if (regiment.id !== 'none') {
            cost += calculateRegimentStats(regiment.config, regiment.id, configuredDivision, selectedFaction, getRegimentDefinition).cost;
        }
    });

    (configuredDivision.supportUnits || [])
        .filter(su => su.assignedTo === null)
        .forEach(su => {
            cost += (unitsMap[su.id]?.cost || 0);
        });

    return cost;
};