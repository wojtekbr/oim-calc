import { IDS, GROUP_TYPES, RANK_TYPES } from "../../constants";
import { DIVISION_RULES_REGISTRY } from "../rules/divisionRulesRegistry";
import { applyRegimentRuleStats, applyRegimentRuleCosts } from "../regimentRules";
import { collectRegimentUnits } from "./structureUtils";
import { calculateSingleImprovementArmyCost } from "./costUtils";
import { getEffectiveUnitImprovements } from "./validationUtils";

export const isRegimentAllied = (regId, selectedFaction, getRegimentDefinition) => {
    if (!selectedFaction || !selectedFaction.regiments) return false;
    if (selectedFaction.regiments[regId]) return false;
    const def = getRegimentDefinition(regId);
    if (def && def._sourceFaction === 'mercenaries') return false;
    return true;
};

export const calculateRegimentStats = (regimentConfig, regimentId, configuredDivision, unitsMap, getRegimentDefinition, commonImprovements, faction = null) => {
    let stats = {
        cost: 0, recon: 0, motivation: 0, activations: 0, orders: 0, awareness: 0, isVanguard: false, regimentType: "-", unitNames: []
    };
    if (!unitsMap || !regimentId) return stats;

    const regimentDefinition = getRegimentDefinition(regimentId);
    if (!regimentDefinition) return stats;

    // --- DEBUG LOG START ---
    const debugLog = [];
    const logRecon = (msg, val) => debugLog.push(`${msg}: ${val > 0 ? '+' : ''}${val}`);
    // ----------------------

    // Identyfikacja instancji (dla zasad dywizyjnych)
    let currentRegimentInstance = null;
    if (configuredDivision) {
        const allRegiments = [ ...(configuredDivision.vanguard || []), ...(configuredDivision.base || []), ...(configuredDivision.additional || []) ];
        currentRegimentInstance = allRegiments.find(r => r.config === regimentConfig);
    }

    stats.cost = regimentDefinition.base_cost || 0;

    // 1. Baza zwiadu z definicji pułku
    stats.recon = regimentDefinition.recon || 0;
    if (stats.recon !== 0) logRecon(`Baza Pułku (${regimentDefinition.name})`, stats.recon);

    stats.activations = regimentDefinition.activations || 0;
    stats.awareness = regimentDefinition.awareness || 0;

    const isAllied = faction ? isRegimentAllied(regimentId, faction, getRegimentDefinition) : false;
    const ruleContext = { isAllied, unitsMap, improvements: commonImprovements, regimentConfig };

    stats.cost = applyRegimentRuleCosts(stats.cost, regimentDefinition, ruleContext);

    const customCostMap = (regimentDefinition.structure?.additional?.unit_custom_cost || [])
        .reduce((map, item) => { map[item.id] = item.cost; return map; }, {});

    (regimentConfig.regimentImprovements || []).forEach(impId => {
        stats.cost += calculateSingleImprovementArmyCost(null, impId, regimentDefinition, commonImprovements);
    });

    const activeUnits = collectRegimentUnits(regimentConfig, regimentDefinition);

    let mountedCount = 0;
    let footCount = 0;

    const divisionDefinition = configuredDivision?.divisionDefinition;

    const addUnitStats = (unitId, positionKey, unitSpecificImps = []) => {
        const unitDef = unitsMap[unitId];
        if (!unitDef) return;
        stats.unitNames.push(unitDef.name);

        if (unitDef.rank !== RANK_TYPES.GROUP) {
            const isMounted = unitDef.is_cavalry || unitDef.are_dragoons || unitDef.are_proxy_dragoons;
            if (isMounted) mountedCount++; else footCount++;
        }

        if (unitDef.is_cavalry) stats.recon += 1;
        if (unitDef.are_dragoons) stats.recon += 1;
        if (unitDef.are_proxy_dragoons) stats.recon += 1;
        if (unitDef.open_order) stats.recon += 1;
        if (unitDef.is_disperse) stats.recon += 1;
        if (unitDef.are_scouts) stats.recon += 1;
        if (unitDef.is_harassing) stats.recon += 1;
        if (unitDef.are_looters_insubordinate) stats.recon -= 1;
        if (unitDef.has_lances) stats.recon -= 1;
        if (unitDef.is_pike_and_shot) stats.recon -= 1;
        if (unitDef.is_artillery) stats.recon -= 2;
        if (unitDef.are_wagons) stats.recon -= 2;

        if (unitDef.rank === RANK_TYPES.BRONZE) {
            stats.motivation += 0.5;
        } else if (unitDef.rank === RANK_TYPES.SILVER) {
            stats.motivation += 1;
        } else if (unitDef.rank === RANK_TYPES.GOLD) {
            stats.motivation += 2;
        }

        if (unitDef.orders) {
            let ordersValue = unitDef.orders;
            if (positionKey && positionKey.startsWith("base/general")) {
                ordersValue += (regimentDefinition.commander_orders_bonus || 0);
            }
            stats.orders += ordersValue;
        }

        const effectiveImps = getEffectiveUnitImprovements(unitId, unitSpecificImps, divisionDefinition, regimentId, unitsMap);

        effectiveImps.forEach(impId => {
            stats.cost += calculateSingleImprovementArmyCost(unitDef, impId, regimentDefinition, commonImprovements);
        });
    };

    activeUnits.forEach((entry) => {
        const { key: positionKey, unitId, isCustom, costOverride, extraCost } = entry;
        if (!unitId || unitId === IDS.NONE) return;

        let unitBaseCost = 0;
        if (costOverride !== undefined) { unitBaseCost = costOverride; }
        else if (isCustom && customCostMap[unitId] !== undefined) { unitBaseCost = customCostMap[unitId]; }
        else { unitBaseCost = unitsMap[unitId]?.cost || 0; }

        if (extraCost) { unitBaseCost += extraCost; }
        stats.cost += unitBaseCost;

        const currentImps = regimentConfig.improvements?.[positionKey] || [];
        addUnitStats(unitId, positionKey, currentImps);
    });

    if (configuredDivision && configuredDivision.supportUnits) {
        if (currentRegimentInstance) {
            const positionKey = `${currentRegimentInstance.group}/${currentRegimentInstance.index}`;

            configuredDivision.supportUnits
                .filter(su => su.assignedTo?.positionKey === positionKey)
                .forEach(su => {
                    stats.cost += (unitsMap[su.id]?.cost || 0);

                    let supportImps = [];
                    const specificKey = `support/${su.id}-${positionKey}/0`;
                    if (regimentConfig.improvements?.[specificKey]) {
                        supportImps = regimentConfig.improvements[specificKey];
                    } else {
                        const oldKey = `support/${su.id}-${positionKey}`;
                        if (regimentConfig.improvements?.[oldKey]) {
                            supportImps = regimentConfig.improvements[oldKey];
                        }
                    }

                    addUnitStats(su.id, null, supportImps);
                });
        }
    }

    stats.motivation = Math.ceil(stats.motivation);

    const totalCombatUnits = mountedCount + footCount;
    if (totalCombatUnits > 0) {
        if (footCount === 0) { stats.regimentType = "Konny"; }
        else if (footCount < totalCombatUnits / 2) { stats.regimentType = "Mieszany"; }
        else { stats.regimentType = "Pieszy"; }
    }

    // --- ZASTOSOWANIE ZASAD PUŁKOWYCH (modifyStats) ---
    stats = applyRegimentRuleStats(stats, activeUnits, regimentDefinition, ruleContext);

    // Sprawdzamy czy applyRegimentRuleStats zmieniło zwiad (trudne do wykrycia bezpośrednio, ale możemy sprawdzić różnicę, jeśli zrobilibyśmy snapshot przed)
    // Uprośćmy: w applyRegimentRuleStats nie mamy logów, więc jeśli tam się dzieje magia, zobaczymy to w wyniku końcowym.

    // --- ZASADY DYWIZYJNE ---
    if (configuredDivision && configuredDivision.divisionDefinition?.rules) {
        configuredDivision.divisionDefinition.rules.forEach(rule => {
            const ruleImpl = DIVISION_RULES_REGISTRY[rule.id];
            if (ruleImpl && ruleImpl.getRegimentStatsBonus) {
                const bonus = ruleImpl.getRegimentStatsBonus(configuredDivision, regimentId, rule, currentRegimentInstance);
                if (bonus) {
                    if (bonus.motivation) stats.motivation += bonus.motivation;
                    if (bonus.recon) {
                        stats.recon += bonus.recon;
                        logRecon(`Zasada Dywizji [${rule.id}]`, bonus.recon);
                    }
                    if (bonus.awareness) stats.awareness += bonus.awareness;
                }
            }
            if (ruleImpl && ruleImpl.getRegimentCostModifier) {
                const costMod = ruleImpl.getRegimentCostModifier(configuredDivision, regimentId, rule);
                if (costMod && costMod.ps) stats.cost += costMod.ps;
            }
        });
    }

    // --- FINALNY LOG W KONSOLI ---
    // Logujemy tylko jeśli zwiad > 0, żeby nie śmiecić przy pustych slotach
    if (stats.recon !== 0 || debugLog.length > 0) {
        console.groupCollapsed(`🔍 DEBUG ZWIADU: ${regimentDefinition.name} (Suma: ${stats.recon})`);
        debugLog.forEach(l => console.log(l));
        console.log("-> Wynik końcowy:", stats.recon);
        console.groupEnd();
    }
    // -----------------------------

    return stats;
};

export const calculateTotalSupplyBonus = (divisionConfig, unitsMap, getRegimentDefinition, commonImprovements) => {
    if (!unitsMap || !divisionConfig) return 0;
    let supplyBonus = 0;

    const checkUnit = (unitId) => {
        if (!unitId || unitId === IDS.NONE) return;
        const unitDef = unitsMap[unitId];
        if (unitDef && typeof unitDef.additional_supply === 'number') {
            supplyBonus += unitDef.additional_supply;
        }
    };

    if (divisionConfig.general) checkUnit(divisionConfig.general);

    const allRegiments = [ ...(divisionConfig.vanguard || []), ...(divisionConfig.base || []), ...(divisionConfig.additional || []) ];

    allRegiments.forEach(regiment => {
        if (regiment.id === IDS.NONE) return;
        const def = getRegimentDefinition(regiment.id);
        if (def && typeof def.additional_supply === 'number') {
            supplyBonus += def.additional_supply;
        }

        const config = regiment.config || {};

        const units = collectRegimentUnits(config, def);
        units.forEach(u => checkUnit(u.unitId));

        if (config.regimentImprovements && commonImprovements) {
            config.regimentImprovements.forEach(impId => {
                const impDef = commonImprovements[impId];
                if (impDef && typeof impDef.division_pu_bonus === 'number') {
                    supplyBonus += impDef.division_pu_bonus;
                }
            });
        }
    });

    if (divisionConfig.supportUnits && Array.isArray(divisionConfig.supportUnits)) {
        divisionConfig.supportUnits.forEach(su => checkUnit(su.id));
    }

    return supplyBonus;
};

export const calculateDivisionCost = (configuredDivision, unitsMap, getRegimentDefinition, commonImprovements) => {
    if (!configuredDivision) return 0;
    const divisionDef = configuredDivision.divisionDefinition;
    let cost = divisionDef.base_cost || 0;
    if (configuredDivision.general) {
        const genDef = unitsMap[configuredDivision.general];
        if (genDef) cost += (genDef.cost || 0);
    }
    const allRegiments = [ ...(configuredDivision.vanguard || []), ...(configuredDivision.base || []), ...(configuredDivision.additional || []) ];
    allRegiments.forEach(regiment => {
        if (regiment.id !== IDS.NONE) {
            cost += calculateRegimentStats(regiment.config, regiment.id, configuredDivision, unitsMap, getRegimentDefinition, commonImprovements).cost;
        }
    });
    (configuredDivision.supportUnits || [])
        .filter(su => su.assignedTo === null)
        .forEach(su => { cost += (unitsMap[su.id]?.cost || 0); });
    return cost;
};

export const calculateDivisionType = (configuredDivision, unitsMap, getRegimentDefinition, commonImprovements) => {
    if (!configuredDivision || !unitsMap) return "-";
    const allRegiments = [ ...(configuredDivision.vanguard || []), ...(configuredDivision.base || []), ...(configuredDivision.additional || []) ].filter(r => r.id !== IDS.NONE);
    if (allRegiments.length === 0) return "-";
    let horseRegimentsCount = 0;
    let footRegimentsCount = 0;
    allRegiments.forEach(regiment => {
        const stats = calculateRegimentStats(regiment.config, regiment.id, configuredDivision, unitsMap, getRegimentDefinition, commonImprovements);
        if (stats.regimentType === "Konny") horseRegimentsCount++;
        else if (stats.regimentType === "Pieszy" || stats.regimentType === "Mieszany") footRegimentsCount++;
    });
    const hasUnassignedArtillery = (configuredDivision.supportUnits || []).filter(su => su.assignedTo === null).some(su => unitsMap[su.id]?.is_artillery);
    if (hasUnassignedArtillery) footRegimentsCount++;
    if (footRegimentsCount <= 1) return "Dywizja Konna";
    if (footRegimentsCount > horseRegimentsCount) return "Dywizja Piesza";
    return "Dywizja Mieszana";
};

export const calculateMainForceKey = (configuredDivision, unitsMap, selectedFaction, getRegimentDefinition, commonImprovements) => {
    if (!configuredDivision) return null;
    const isAllied = (regId) => isRegimentAllied(regId, selectedFaction, getRegimentDefinition);
    const eligibleRegiments = [
        ...(configuredDivision.base || []).map(r => ({ ...r, key: `${GROUP_TYPES.BASE}/${r.index}` })),
        ...(configuredDivision.additional || []).map(r => ({ ...r, key: `${GROUP_TYPES.ADDITIONAL}/${r.index}` }))
    ].filter(r => r.id !== IDS.NONE && !isAllied(r.id));
    if (eligibleRegiments.length === 0) return null;
    let maxCost = -1;
    const regimentCosts = {};
    eligibleRegiments.forEach(reg => {
        const stats = calculateRegimentStats(reg.config, reg.id, configuredDivision, unitsMap, getRegimentDefinition, commonImprovements, selectedFaction);
        regimentCosts[reg.key] = stats.cost;
        if (stats.cost > maxCost) maxCost = stats.cost;
    });
    const candidates = eligibleRegiments.filter(r => regimentCosts[r.key] === maxCost);
    const preferredKey = configuredDivision.preferredMainForceKey;
    if (preferredKey && candidates.some(r => r.key === preferredKey)) return preferredKey;
    return candidates.length > 0 ? candidates[0].key : null;
};