import { IDS, GROUP_TYPES, RANK_TYPES } from "../../constants";
import { DIVISION_RULES_REGISTRY } from "../divisionRules";
import { applyRegimentRuleStats, applyRegimentRuleCosts } from "../regimentRules"; // <--- ZMIANA IMPORTU
import { collectRegimentUnits } from "./structureUtils";
import { calculateSingleImprovementArmyCost } from "./costUtils";
import { getEffectiveUnitImprovements } from "./validationUtils";

// Helper isRegimentAllied (przeniesiony wyżej, by był dostępny wewnątrz pliku)
export const isRegimentAllied = (regId, selectedFaction, getRegimentDefinition) => {
    if (!selectedFaction || !selectedFaction.regiments) return false;
    if (selectedFaction.regiments[regId]) return false;
    const def = getRegimentDefinition(regId);
    if (def && def._sourceFaction === 'mercenaries') return false;
    return true;
};

// ZMIANA SYGNATURY: dodano 'faction' na końcu
export const calculateRegimentStats = (regimentConfig, regimentId, configuredDivision, unitsMap, getRegimentDefinition, commonImprovements, faction = null) => {
    let stats = {
        cost: 0, recon: 0, motivation: 0, activations: 0, orders: 0, awareness: 0, isVanguard: false, regimentType: "-", unitNames: []
    };
    if (!unitsMap || !regimentId) return stats;

    const regimentDefinition = getRegimentDefinition(regimentId);
    if (!regimentDefinition) return stats;

    stats.cost = regimentDefinition.base_cost || 0;
    stats.recon = regimentDefinition.recon || 0;
    stats.activations = regimentDefinition.activations || 0;
    stats.awareness = regimentDefinition.awareness || 0;

    // --- ZMIANA: Obsługa kosztów z zasad pułku (np. -2 PS) ---
    // Musimy wiedzieć czy jest sojuszniczy
    const isAllied = faction ? isRegimentAllied(regimentId, faction, getRegimentDefinition) : false;
    const ruleContext = { isAllied, unitsMap };

    stats.cost = applyRegimentRuleCosts(stats.cost, regimentDefinition, ruleContext);
    // -----------------------------------------------------------

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
        const allRegiments = [ ...(configuredDivision.vanguard || []), ...(configuredDivision.base || []), ...(configuredDivision.additional || []) ];
        const currentRegimentData = allRegiments.find(r => r.config === regimentConfig);

        if (currentRegimentData) {
            const positionKey = `${currentRegimentData.group}/${currentRegimentData.index}`;

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

    const totalCombatUnits = mountedCount + footCount;
    if (totalCombatUnits > 0) {
        if (footCount === 0) { stats.regimentType = "Konny"; }
        else if (footCount < totalCombatUnits / 2) { stats.regimentType = "Mieszany"; }
        else { stats.regimentType = "Pieszy"; }
    }

    // --- ZMIANA: Przekazujemy context (isAllied, unitsMap) do zasad pułku ---
    stats = applyRegimentRuleStats(stats, activeUnits, regimentDefinition, ruleContext);

    if (configuredDivision && configuredDivision.divisionDefinition?.rules) {
        configuredDivision.divisionDefinition.rules.forEach(rule => {
            const ruleImpl = DIVISION_RULES_REGISTRY[rule.id];
            if (ruleImpl && ruleImpl.getRegimentStatsBonus) {
                const bonus = ruleImpl.getRegimentStatsBonus(configuredDivision, regimentId, rule);
                if (bonus && bonus.motivation) stats.motivation += bonus.motivation;
            }
            if (ruleImpl && ruleImpl.getRegimentCostModifier) {
                const costMod = ruleImpl.getRegimentCostModifier(configuredDivision, regimentId, rule);
                if (costMod && costMod.ps) stats.cost += costMod.ps;
            }
        });
    }

    return stats;
};

// ... reszta pliku bez zmian ...
export const calculateTotalSupplyBonus = (divisionConfig, unitsMap, getRegimentDefinition) => {
    // ...
    if (!unitsMap || !divisionConfig) return 0;
    let supplyBonus = 0;
    const checkUnit = (unitId) => {
        if (!unitId || unitId === IDS.NONE) return;
        const unitDef = unitsMap[unitId];
        if (unitDef && typeof unitDef.additional_supply === 'number') { supplyBonus += unitDef.additional_supply; }
    };
    if (divisionConfig.general) checkUnit(divisionConfig.general);
    const allRegiments = [ ...(divisionConfig.vanguard || []), ...(divisionConfig.base || []), ...(divisionConfig.additional || []) ];
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

export const calculateDivisionCost = (configuredDivision, unitsMap, getRegimentDefinition, commonImprovements) => {
    // ... (tutaj nie musimy zmieniać, bo nie mamy faction pod ręką, ale to funkcja zbiorcza)
    // UWAGA: Jeśli 'calculateDivisionCost' ma uwzględniać bonusy pułkowe zależne od frakcji,
    // to też powinna dostać faction. Na razie zostawiamy bez zmian, bo zazwyczaj wywołujemy
    // calculateRegimentStats bezpośrednio w Selectorze/Editorze.
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
    // ... bez zmian
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

// ... reszta bez zmian ...
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
        // Tu warto by dodać faction, ale 'selectedFaction' już jest dostępne!
        const stats = calculateRegimentStats(reg.config, reg.id, configuredDivision, unitsMap, getRegimentDefinition, commonImprovements, selectedFaction);
        regimentCosts[reg.key] = stats.cost;
        if (stats.cost > maxCost) maxCost = stats.cost;
    });
    const candidates = eligibleRegiments.filter(r => regimentCosts[r.key] === maxCost);
    const preferredKey = configuredDivision.preferredMainForceKey;
    if (preferredKey && candidates.some(r => r.key === preferredKey)) return preferredKey;
    return candidates.length > 0 ? candidates[0].key : null;
};