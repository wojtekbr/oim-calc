import React, { useEffect, useState } from "react";
import FactionList from "./pages/FactionList";
import RegimentSelector from "./pages/RegimentSelector";
import RegimentEditor from "./pages/RegimentEditor";

export default function App() {
    const [factions, setFactions] = useState(null);
    const [error, setError] = useState(null);

    const [screen, setScreen] = useState("list");
    const [selectedFactionKey, setSelectedFactionKey] = useState(null);
    const [selectedDivisionKey, setSelectedDivisionKey] = useState(null);

    const [configuredDivision, setConfiguredDivision] = useState(null);
    const [editingRegimentIndex, setEditingRegimentIndex] = useState(null);
    const [editingRegimentGroup, setEditingRegimentGroup] = useState(null);

    useEffect(() => {
        try {
            const unitModules = import.meta.glob("./data/factions/*/units.json", { eager: true, import: "default" });
            const regimentModules = import.meta.glob("./data/factions/*/regiments.json", { eager: true, import: "default" });
            const divisionModules = import.meta.glob("./data/factions/*/divisions.json", { eager: true, import: "default" });
            const commonUnitModules = import.meta.glob("./data/common/units.json", { eager: true, import: "default" });

            let commonUnits = {};
            for (const path in commonUnitModules) {
                Object.assign(commonUnits, commonUnitModules[path]);
            }

            const map = {};

            const loadModules = (modules, type) => {
                for (const path in modules) {
                    const parts = path.split("/");
                    const key = parts[parts.length - 2];
                    map[key] = map[key] || {};
                    if (type === 'meta') {
                        const metaName = modules[path]._meta?.name ? modules[path]._meta.name : key;
                        map[key].meta = { key, name: metaName };
                    }
                    map[key][type] = modules[path] || {};
                }
            };

            loadModules(unitModules, 'units');
            loadModules(regimentModules, 'regiments');
            loadModules(divisionModules, 'divisions');

            Object.keys(map).forEach(k => {
                map[k].units = { ...commonUnits, ...(map[k].units || {}) };
                if (!map[k].meta) map[k].meta = { key: k, name: k };
            });

            setFactions(map);
        } catch (e) {
            console.error("Loading error:", e);
            setError(String(e));
        }
    }, []);

    if (error) return <div style={{ padding: 20 }}>Błąd: {error}</div>;
    if (!factions) return <div style={{ padding: 20 }}>Ładowanie danych frakcji...</div>;

    const openRegimentSelector = (factionKey, divisionKey) => {
        setSelectedFactionKey(factionKey);
        setSelectedDivisionKey(divisionKey);
        setConfiguredDivision(null);
        setScreen("selector");
    };

    const openRegimentEditor = (regimentGroup, index) => {
        setEditingRegimentGroup(regimentGroup);
        setEditingRegimentIndex(index);
        setScreen("editor");
    };

    const backToSelector = () => {
        setScreen("selector");
        setEditingRegimentGroup(null);
        setEditingRegimentIndex(null);
    };

    const backToList = () => {
        setScreen("list");
        setSelectedFactionKey(null);
        setSelectedDivisionKey(null);
        setConfiguredDivision(null);
    };

    const selectedFaction = selectedFactionKey ? factions[selectedFactionKey] : null;
    const selectedDivisionDefinition = selectedFaction && selectedDivisionKey ? selectedFaction.divisions[selectedDivisionKey] : null;

    const getRegimentDefinition = (regimentKey) => selectedFaction?.regiments[regimentKey] || null;

    // --- Helpers ---
    const calculateSingleImprovementIMPCost = (unitDef, impDef) => {
        const improvementBaseCost = unitDef?.improvement_cost || 0;
        if (impDef.cost === -1) return Math.max(1, improvementBaseCost - 1);
        if (typeof impDef.cost === 'number') return impDef.cost;
        if (impDef.cost === 'double') return improvementBaseCost * 2;
        if (impDef.cost === 'triple') return improvementBaseCost * 3;
        if (impDef.cost === 1) return improvementBaseCost;
        return 0;
    }

    const calculateSingleImprovementCost = (unitDef, impDef, type = 'imp') => {
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

    const calculateTotalSupplyBonus = (divisionConfig) => {
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

        const allRegiments = [];
        if (divisionConfig.base || divisionConfig.additional) {
            allRegiments.push(...(divisionConfig.base || []));
            allRegiments.push(...(divisionConfig.additional || []));
        } else {
            allRegiments.push(divisionConfig);
        }

        allRegiments.forEach(regiment => {
            const regimentConfig = regiment.config || {};
            Object.values(regimentConfig.base || {}).forEach(uid => checkUnit(uid));
            Object.values(regimentConfig.additional || {}).forEach(uid => checkUnit(uid));
            if (regimentConfig.additionalCustom) checkUnit(regimentConfig.additionalCustom);
        });

        if (divisionConfig.supportUnits && Array.isArray(divisionConfig.supportUnits)) {
            divisionConfig.supportUnits.forEach(su => checkUnit(su.id));
        }

        return supplyBonus;
    };

    // ZLICZANIE IMP
    const calculateImprovementPointsCost = (divisionConfig) => {
        if (!selectedFaction || !divisionConfig) return 0;
        const unitsMap = selectedFaction.units || {};
        let totalImpCost = 0;

        const allRegiments = [];
        if (divisionConfig.base || divisionConfig.additional) {
            allRegiments.push(...(divisionConfig.base || []));
            allRegiments.push(...(divisionConfig.additional || []));
        } else {
            allRegiments.push(divisionConfig);
        }

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

            const selectedUnitsByPosition = [
                ...Object.entries(regimentConfig.base || {}).map(([key, unitId]) => ({ key: `base/${key}`, unitId })),
                ...Object.entries(regimentConfig.additional || {}).map(([key, unitId]) => ({ key: `additional/${key}`, unitId })),
                ...(regimentConfig.additionalCustom ? [{ key: regimentConfig.customCostSlotName + "_custom", unitId: regimentConfig.additionalCustom }] : [])
            ];

            selectedUnitsByPosition.forEach(({ key: positionKey, unitId }) => {
                if (!unitId || unitId === 'none') return;
                const unitDef = unitsMap[unitId];
                if (!unitDef || unitDef.rank === 'group') return;
                if (typeof unitDef.pu_cost === 'number') totalImpCost += unitDef.pu_cost;

                (improvementsMap[positionKey] || []).forEach(impId => {
                    const impDef = unitImprovementsDefinition.find(i => i.id === impId);
                    if (impDef) totalImpCost += calculateSingleImprovementIMPCost(unitDef, impDef);
                });
            });

            if (divisionConfig.supportUnits && Array.isArray(divisionConfig.supportUnits)) {
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

        if (divisionConfig.supportUnits && Array.isArray(divisionConfig.supportUnits)) {
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

    // --- GŁÓWNY KALKULATOR STATYSTYK PUŁKU ---
    const calculateRegimentStats = (regimentConfig, regimentId, configuredDivision) => {
        // Added awareness & isVanguard
        const stats = {
            cost: 0,
            recon: 0,
            motivation: 0,
            activations: 0,
            orders: 0,
            awareness: 0, // RYZYKO
            isVanguard: regimentConfig?.isVanguard || false, // STRAŻ PRZEDNIA
            unitNames: []
        };
        if (!selectedFaction || !regimentId) return stats;

        const unitsMap = selectedFaction.units || {};
        const regimentDefinition = getRegimentDefinition(regimentId);
        if (!regimentDefinition) return stats;

        stats.cost = regimentDefinition.base_cost || 0;
        stats.recon = regimentDefinition.recon || 0;
        stats.activations = regimentDefinition.activations || 0;
        stats.awareness = regimentDefinition.awareness || 0; // Zczytujemy ryzyko z definicji

        const unitImprovementsDefinition = regimentDefinition.unit_improvements || [];
        const regimentImprovementsDefinition = regimentDefinition.regiment_improvements || [];
        const improvementsMap = regimentConfig.improvements || {};

        const customCostMap = (regimentDefinition.structure?.additional?.unit_custom_cost || [])
            .reduce((map, item) => { map[item.id] = item.cost; return map; }, {});

        (regimentConfig.regimentImprovements || []).forEach(impId => {
            const impDef = regimentImprovementsDefinition.find(i => i.id === impId);
            if (impDef && typeof impDef.army_point_cost === 'number') {
                stats.cost += impDef.army_point_cost;
            }
        });

        const selectedUnitsByPosition = [
            ...Object.entries(regimentConfig.base || {}).map(([key, unitId]) => ({ key: `base/${key}`, unitId, isCustom: false })),
            ...Object.entries(regimentConfig.additional || {}).map(([key, unitId]) => ({ key: `additional/${key}`, unitId, isCustom: false })),
            ...(regimentConfig.additionalCustom ? [{ key: regimentConfig.customCostSlotName + "_custom", unitId: regimentConfig.additionalCustom, isCustom: true }] : [])
        ];

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
                if (positionKey === 'base/general') {
                    ordersValue += (regimentDefinition.commander_orders_bonus || 0);
                }
                stats.orders += ordersValue;
            }
        };

        selectedUnitsByPosition.forEach(({ key: positionKey, unitId, isCustom }) => {
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

        if (configuredDivision && configuredDivision.supportUnits) {
            const allRegiments = configuredDivision.base.concat(configuredDivision.additional);
            const currentRegimentData = allRegiments.find(r => r.id === regimentId && r.config === regimentConfig);

            if (currentRegimentData) {
                const positionKey = `${currentRegimentData.group}/${currentRegimentData.index}`;
                configuredDivision.supportUnits
                    .filter(su => su.assignedTo?.positionKey === positionKey)
                    .forEach(su => {
                        stats.cost += (unitsMap[su.id]?.cost || 0);
                        addUnitStats(su.id, null);
                    });
            }
        }

        return stats;
    };

    const findMainForceKey = (divisionConfig) => {
        if (!divisionConfig) return null;
        let maxCost = -1;
        let mainKey = null;

        const allRegiments = [
            ...divisionConfig.base.map(r => ({ ...r, key: `base/${r.index}` })),
            ...divisionConfig.additional.map(r => ({ ...r, key: `additional/${r.index}` }))
        ].filter(r => r.id !== 'none');

        allRegiments.forEach(reg => {
            const stats = calculateRegimentStats(reg.config, reg.id, divisionConfig);
            if (stats.cost > maxCost) {
                maxCost = stats.cost;
                mainKey = reg.key;
            }
        });

        return mainKey;
    };

    const calculateDivisionCost = (configuredDivision) => {
        if (!configuredDivision) return 0;
        const divisionDef = configuredDivision.divisionDefinition;
        let cost = divisionDef.base_cost || 0;
        const unitsMap = selectedFaction?.units || {};

        const allRegiments = configuredDivision.base.concat(configuredDivision.additional);
        allRegiments.forEach(regiment => {
            cost += calculateRegimentStats(regiment.config, regiment.id, configuredDivision).cost;
        });

        (configuredDivision.supportUnits || [])
            .filter(su => su.assignedTo === null)
            .forEach(su => {
                cost += (unitsMap[su.id]?.cost || 0);
            });

        return cost;
    }

    const totalImprovementsUsed = configuredDivision ? calculateImprovementPointsCost(configuredDivision) : 0;
    const supplyBonus = configuredDivision ? calculateTotalSupplyBonus(configuredDivision) : 0;
    const improvementPointsLimit = (selectedDivisionDefinition?.improvement_points || 0) + supplyBonus;
    const remainingImprovementPoints = improvementPointsLimit - totalImprovementsUsed;
    const totalDivisionCost = configuredDivision ? calculateDivisionCost(configuredDivision) : selectedDivisionDefinition?.base_cost || 0;
    const mainForceKey = configuredDivision ? findMainForceKey(configuredDivision) : null;

    const getEditingRegiment = () => {
        if (!configuredDivision || editingRegimentGroup === null || editingRegimentIndex === null) return null;
        const regimentStructure = configuredDivision[editingRegimentGroup][editingRegimentIndex];
        const regimentDefinition = getRegimentDefinition(regimentStructure.id);
        const currentKey = `${editingRegimentGroup}/${editingRegimentIndex}`;
        return {
            ...regimentDefinition,
            id: regimentStructure.id,
            name: regimentStructure.name,
            divisionDefinition: selectedDivisionDefinition,
            isMainForce: mainForceKey === currentKey
        };
    }

    return (
        <div style={{ padding: 20, fontFamily: "sans-serif" }}>
            <h1 style={{ marginTop: 0 }}>Army Editor</h1>

            {screen === "list" && (
                <FactionList
                    factions={factions}
                    onOpenDivision={(factionKey, divisionKey) => openRegimentSelector(factionKey, divisionKey)}
                />
            )}

            {screen === "selector" && selectedFaction && selectedDivisionDefinition && (
                <RegimentSelector
                    faction={selectedFaction}
                    divisionDefinition={selectedDivisionDefinition}
                    configuredDivision={configuredDivision}
                    setConfiguredDivision={setConfiguredDivision}
                    onOpenRegimentEditor={openRegimentEditor}
                    onBack={backToList}
                    getRegimentDefinition={getRegimentDefinition}
                    calculateRegimentStats={(config, id) => calculateRegimentStats(config, id, configuredDivision)}
                    divisionBaseCost={selectedDivisionDefinition.base_cost || 0}
                    remainingImprovementPoints={remainingImprovementPoints}
                    improvementPointsLimit={improvementPointsLimit}
                    totalDivisionCost={totalDivisionCost}
                    additionalUnitsDefinitions={selectedDivisionDefinition?.additional_units || []}
                    unitsMap={selectedFaction.units}
                    mainForceKey={mainForceKey}
                />
            )}

            {screen === "editor" && selectedFaction && configuredDivision && editingRegimentIndex !== null && editingRegimentGroup !== null && (
                <RegimentEditor
                    faction={selectedFaction}
                    regiment={getEditingRegiment()}
                    onBack={backToSelector}
                    configuredDivision={configuredDivision}
                    setConfiguredDivision={setConfiguredDivision}
                    regimentGroup={editingRegimentGroup}
                    regimentIndex={editingRegimentIndex}
                    calculateImprovementPointsCost={calculateImprovementPointsCost}
                    calculateTotalSupplyBonus={calculateTotalSupplyBonus}
                    remainingImprovementPoints={remainingImprovementPoints}
                    unitsMap={selectedFaction.units}
                    improvementPointsLimit={improvementPointsLimit}
                />
            )}
        </div>
    );
}