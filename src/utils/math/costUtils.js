import { IDS, GROUP_TYPES, RANK_TYPES } from "../../constants";
import { DIVISION_RULES_REGISTRY } from "../rules/divisionRulesRegistry";
import { REGIMENT_RULES_REGISTRY } from "../regimentRules";
import { collectRegimentUnits } from "./structureUtils";

const resolveCostRule = (baseCost, rule) => {
    const safeBase = Number(baseCost) || 0;
    if (rule === 'normal') return safeBase;
    if (rule === 'double') return safeBase * 2;
    if (rule === 'triple') return safeBase * 3;
    if (typeof rule === 'number') {
        if (rule > 0) return safeBase * rule;
        if (rule < 0) return Math.max(1, safeBase + rule);
    }
    return 0;
};

export const calculateSingleImprovementIMPCost = (unitDef, impId, regimentDefinition, commonImprovements) => {
    const improvementBaseCost = Number(unitDef?.improvement_cost || 0);
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

export const calculateSingleImprovementArmyCost = (unitDef, impId, regimentDefinition, commonImprovements) => {
    const regImpRef = regimentDefinition?.regiment_improvements?.find(i => i.id === impId);
    const commonImpDef = commonImprovements?.[impId];

    if (regImpRef || (commonImpDef && commonImpDef.type === 'regiment')) {
        let val = 0;
        if (regImpRef?.army_cost_override !== undefined) val = regImpRef.army_cost_override;
        else if (regImpRef?.army_point_cost !== undefined) val = regImpRef.army_point_cost;
        else if (regImpRef?.army_cost !== undefined) val = regImpRef.army_cost;

        else if (commonImpDef?.army_point_cost !== undefined) val = commonImpDef.army_point_cost;
        else if (commonImpDef?.army_cost !== undefined) val = commonImpDef.army_cost;

        return Number(val) || 0;
    }
    return 0;
};

export const calculateRegimentImprovementPoints = (
    regimentConfig,
    regimentId,
    unitsMap,
    getRegimentDefinition,
    commonImprovements,
    assignedSupportUnits = [],
    divisionDefinition = null
) => {
    if (!unitsMap || !regimentId || regimentId === IDS.NONE) return 0;
    const regimentDefinition = getRegimentDefinition(regimentId);
    if (!regimentDefinition) return 0;

    let totalImpCost = 0;

    // --- ZMIANA: Obsługa pu_cost ---
    if (regimentDefinition.pu_cost) {
        totalImpCost += Number(regimentDefinition.pu_cost) || 0;
    } else if (regimentDefinition.improvement_points_cost) {
        totalImpCost += Number(regimentDefinition.improvement_points_cost) || 0;
    }

    const getUnitPUCost = (unitId) => {
        if (!unitId || unitId === IDS.NONE) return 0;
        const u = unitsMap[unitId];
        if (!u) return 0;
        return Number(u.improvement_points_cost || u.pu_cost || 0);
    };

    const regimentImprovementsDefinition = regimentDefinition.regiment_improvements || [];
    (regimentConfig.regimentImprovements || []).forEach(impId => {
        const regImpRef = regimentImprovementsDefinition.find(i => i.id === impId);
        const commonImpDef = commonImprovements?.[impId];

        let cost = 0;
        if (regImpRef?.cost_override !== undefined) cost = regImpRef.cost_override;
        else if (regImpRef?.cost !== undefined) cost = regImpRef.cost;
        else if (commonImpDef?.cost !== undefined) cost = commonImpDef.cost;

        // Ignorujemy koszty PS (są liczone gdzie indziej)
        const isArmyCost = regImpRef?.army_cost || commonImpDef?.army_cost || commonImpDef?.army_point_cost;
        if (!isArmyCost) {
            totalImpCost += Number(cost) || 0;
        }
    });

    const improvementsMap = regimentConfig.improvements || {};
    const activeUnits = collectRegimentUnits(regimentConfig, regimentDefinition);

    activeUnits.forEach((unitObj) => {
        const { key: positionKey, unitId, structureMandatory, puCostOverride } = unitObj;

        if (!unitId || unitId === IDS.NONE) return;
        const unitDef = unitsMap[unitId];
        if (!unitDef || unitDef.rank === RANK_TYPES.GROUP) return;

        if (puCostOverride !== undefined) {
            totalImpCost += Number(puCostOverride);
        } else {
            totalImpCost += getUnitPUCost(unitId);
        }

        (improvementsMap[positionKey] || []).forEach(impId => {
            if (unitDef.mandatory_improvements?.includes(impId)) {
                return;
            }
            if (structureMandatory?.includes(impId)) {
                return;
            }

            const cost = calculateSingleImprovementIMPCost(unitDef, impId, regimentDefinition, commonImprovements);
            totalImpCost += Number(cost) || 0;
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
                    if (supportUnitDef.mandatory_improvements?.includes(impId)) {
                        return;
                    }

                    const cost = calculateSingleImprovementIMPCost(supportUnitDef, impId, regimentDefinition, commonImprovements);
                    totalImpCost += Number(cost) || 0;
                });
            }
        });
    }

    if (regimentDefinition.special_rules) {
        regimentDefinition.special_rules.forEach(ruleEntry => {
            const ruleId = typeof ruleEntry === 'string' ? ruleEntry : ruleEntry.id;
            const params = typeof ruleEntry === 'object' ? ruleEntry : {};
            const ruleImpl = REGIMENT_RULES_REGISTRY[ruleId];
            if (ruleImpl && ruleImpl.calculateImprovementDiscount) {
                const discount = ruleImpl.calculateImprovementDiscount(
                    activeUnits,
                    regimentConfig,
                    commonImprovements,
                    params,
                    unitsMap,
                    regimentDefinition,
                    calculateSingleImprovementIMPCost
                );
                totalImpCost -= (Number(discount) || 0);
            }
        });
    }

    if (divisionDefinition?.rules) {
        const activeUnitsList = collectRegimentUnits(regimentConfig, regimentDefinition);
        divisionDefinition.rules.forEach(ruleConfig => {
            let ruleId = ruleConfig.id;
            let params = ruleConfig;
            if (ruleId === "czaty") {
                ruleId = "free_improvement_for_specific_units";
                params = { unit_ids: ["koz_moloytsy_s", "koz_registered_s", "koz_czer_m"], improvement_id: "partisans", max_per_regiment: 1 };
            }
            const ruleImpl = DIVISION_RULES_REGISTRY[ruleId];
            if (ruleImpl && ruleImpl.calculateDiscount) {
                const discount = ruleImpl.calculateDiscount(
                    regimentConfig,
                    activeUnitsList,
                    commonImprovements,
                    params,
                    regimentDefinition.id,
                    {
                        unitsMap,
                        regimentDefinition,
                        calculateCostFn: calculateSingleImprovementIMPCost,
                        divisionDefinition
                    }
                );
                totalImpCost -= (Number(discount) || 0);
            }
        });
    }

    return Math.max(0, totalImpCost);
};

export const calculateImprovementPointsCost = (divisionConfig, unitsMap, getRegimentDefinition, commonImprovements) => {
    if (!unitsMap || !divisionConfig) return 0;
    let totalImpCost = 0;

    const getUnitPUCost = (unitId) => {
        if (!unitId || unitId === IDS.NONE) return 0;
        const u = unitsMap[unitId];
        if (!u) return 0;
        return Number(u.improvement_points_cost || u.pu_cost || 0);
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
        const attachedSupport = (divisionConfig.supportUnits || []).filter(su => su.assignedTo?.positionKey === posKey);

        totalImpCost += calculateRegimentImprovementPoints(
            regiment.config,
            regiment.id,
            unitsMap,
            getRegimentDefinition,
            commonImprovements,
            attachedSupport,
            divisionConfig.divisionDefinition
        );

        if (divisionConfig.divisionDefinition?.rules) {
            divisionConfig.divisionDefinition.rules.forEach(rule => {
                const ruleImpl = DIVISION_RULES_REGISTRY[rule.id];
                if (ruleImpl && ruleImpl.getRegimentCostModifier) {
                    const mod = ruleImpl.getRegimentCostModifier(divisionConfig, regiment.id, rule);
                    if (mod && mod.pu) {
                        totalImpCost += Number(mod.pu) || 0;
                    }
                }
            });
        }
    });

    if (divisionConfig.supportUnits) {
        divisionConfig.supportUnits.filter(su => !su.assignedTo).forEach(su => { totalImpCost += getUnitPUCost(su.id); });
    }

    return totalImpCost;
};