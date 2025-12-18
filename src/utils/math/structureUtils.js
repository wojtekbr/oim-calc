import { IDS, GROUP_TYPES } from "../../constants";

export const getArtilleryIds = (divisionDefinition) => {
    if (!divisionDefinition?.division_artillery) return [];
    const ids = [];
    divisionDefinition.division_artillery.forEach(entry => {
        if (typeof entry === 'string') {
            ids.push(entry);
        } else if (entry.options) { // group
            entry.options.forEach(opt => {
                ids.push(typeof opt === 'string' ? opt : opt.id);
            });
        } else if (entry.id) {
            ids.push(entry.id);
        }
    });
    return ids;
};

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
                        // NOWOŚĆ: Pobieramy obowiązkowe ulepszenia ze struktury
                        const structureMandatory = choiceDef.mandatory_improvements || [];

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
                                    extraCost: appliedExtraCost,
                                    structureMandatory: structureMandatory // Przekazujemy dalej
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
                    // NOWOŚĆ: Pobieramy obowiązkowe ulepszenia ze struktury
                    const structureMandatory = choiceDef.mandatory_improvements || [];

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
                                extraCost: appliedExtraCost,
                                structureMandatory: structureMandatory // Przekazujemy dalej
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