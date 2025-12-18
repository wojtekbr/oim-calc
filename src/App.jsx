import React, { useEffect, useState } from "react";
import FactionList from "./pages/FactionList";
import RegimentSelector from "./pages/RegimentSelector";
import RegimentEditor from "./pages/RegimentEditor";
import { ArmyDataProvider, useArmyData } from "./context/ArmyDataContext";
import { SCREENS, IDS, GROUP_TYPES } from "./constants";
import {
    calculateRegimentStats,
    calculateImprovementPointsCost,
    calculateTotalSupplyBonus,
    calculateDivisionCost,
    collectRegimentUnits,
    checkIfImprovementIsMandatory
} from "./utils/armyMath";
import {
    calculateRuleBonuses,
    validateDivisionRules,
    DIVISION_RULES_REGISTRY
} from "./utils/divisionRules";

const getEffectiveImprovements = (regimentDef, divisionDef, regimentId) => {
    const combined = [...(regimentDef.unit_improvements || [])];

    if (divisionDef?.rules) {
        const extraIds = new Set();
        divisionDef.rules.forEach(rule => {
            const ruleImpl = DIVISION_RULES_REGISTRY[rule.id];
            let handledByRegistry = false;

            if (ruleImpl) {
                if (typeof ruleImpl.getInjectedImprovements === 'function') {
                    const injected = ruleImpl.getInjectedImprovements(rule, regimentId);
                    if (Array.isArray(injected)) {
                        injected.forEach(id => extraIds.add(id));
                    }
                    handledByRegistry = true;
                } else if (ruleImpl.injectedImprovements) {
                    ruleImpl.injectedImprovements.forEach(id => extraIds.add(id));
                    handledByRegistry = true;
                }
            }

            if (!handledByRegistry) {
                if (rule.improvement_id) extraIds.add(rule.improvement_id);
                if (rule.improvement_ids && Array.isArray(rule.improvement_ids)) {
                    rule.improvement_ids.forEach(id => extraIds.add(id));
                }
            }
        });

        extraIds.forEach(extraId => {
            if (!combined.find(def => def.id === extraId)) {
                combined.push({ id: extraId });
            }
        });
    }
    return combined;
};

const createDefaultRegiments = (divisionDefinition, getRegimentDefinition, unitsMap, factionKey) => {
    const createRegimentWithDefaults = (group, index, regimentId) => {
        const config = {
            baseSelections: {},
            additionalSelections: {},
            additionalCustom: null,
            additionalEnabled: false,
            optionalEnabled: {},
            optionalSelections: {},
            improvements: {},
            regimentImprovements: [],
            isVanguard: false
        };

        const def = getRegimentDefinition(regimentId, factionKey);

        if (def && def.structure) {
            if (def.structure.base) {
                Object.entries(def.structure.base).forEach(([groupKey, pods]) => {
                    if (groupKey === 'optional') return;
                    config.baseSelections[groupKey] = pods.map(pod => {
                        const optionKeys = Object.keys(pod);
                        return optionKeys.length > 0 ? optionKeys[0] : null;
                    });
                });
            }

            if (def.structure.additional) {
                Object.entries(def.structure.additional).forEach(([groupKey, pods]) => {
                    if (groupKey === 'optional') return;
                    config.additionalSelections[groupKey] = pods.map(pod => {
                        const optionKeys = Object.keys(pod);
                        return optionKeys.length > 0 ? optionKeys[0] : null;
                    });
                });
            }
        }

        if (def && unitsMap) {
            const effectiveImps = getEffectiveImprovements(def, divisionDefinition, regimentId);
            const activeUnits = collectRegimentUnits(config, def);

            activeUnits.forEach(u => {
                const unitDef = unitsMap[u.unitId];
                // Łączymy wszystkie potencjalne źródła ulepszeń
                const allPotentialImps = new Set();
                effectiveImps.forEach(i => allPotentialImps.add(i.id));
                if (unitDef?.mandatory_improvements) unitDef.mandatory_improvements.forEach(id => allPotentialImps.add(id));
                if (u.structureMandatory) u.structureMandatory.forEach(id => allPotentialImps.add(id));

                allPotentialImps.forEach(impId => {
                    let shouldAdd = false;

                    if (checkIfImprovementIsMandatory(u.unitId, impId, divisionDefinition, regimentId, unitsMap)) shouldAdd = true;
                    else if (unitDef?.mandatory_improvements?.includes(impId)) shouldAdd = true;
                    else if (u.structureMandatory?.includes(impId)) shouldAdd = true;

                    if (shouldAdd) {
                        const key = u.key;
                        if (!config.improvements[key]) config.improvements[key] = [];
                        if (!config.improvements[key].includes(impId)) {
                            config.improvements[key].push(impId);
                        }
                    }
                });
            });
        }

        return { group, index, id: regimentId, customName: "", config: config };
    };

    const vanguardRegiments = (divisionDefinition.vanguard || []).map((group, index) =>
        createRegimentWithDefaults(GROUP_TYPES.VANGUARD, index, group.options[0])
    );

    const baseRegiments = divisionDefinition.base.map((group, index) =>
        createRegimentWithDefaults(GROUP_TYPES.BASE, index, group.options[0])
    );

    let additionalRegiments = [];
    if (divisionDefinition.additional_regiments) {
        additionalRegiments = [];
    } else if (divisionDefinition.additional) {
        additionalRegiments = divisionDefinition.additional.map((group, index) => ({
            group: GROUP_TYPES.ADDITIONAL,
            index,
            id: IDS.NONE,
            customName: "",
            config: {},
        }));
    }

    const defaultGeneral = divisionDefinition.general && divisionDefinition.general.length > 0
        ? divisionDefinition.general[0]
        : null;

    return {
        general: defaultGeneral,
        vanguard: vanguardRegiments,
        base: baseRegiments,
        additional: additionalRegiments,
        supportUnits: [],
        divisionDefinition: divisionDefinition
    };
};

function AppContent() {
    const { factions, loading, error, improvements, globalUnits, getRegimentDefinition, regimentRules } = useArmyData();

    const [screen, setScreen] = useState(SCREENS.LIST);
    const [selectedFactionKey, setSelectedFactionKey] = useState(null);
    const [selectedDivisionKey, setSelectedDivisionKey] = useState(null);

    const [configuredDivision, setConfiguredDivision] = useState(null);
    const [editingRegimentIndex, setEditingRegimentIndex] = useState(null);
    const [editingRegimentGroup, setEditingRegimentGroup] = useState(null);

    const selectedFaction = selectedFactionKey ? factions?.[selectedFactionKey] : null;
    const selectedDivisionDefinition = selectedFaction && selectedDivisionKey ? selectedFaction.divisions[selectedDivisionKey] : null;

    const unitsMap = globalUnits;

    useEffect(() => {
        if (screen === SCREENS.SELECTOR && selectedDivisionDefinition && !configuredDivision) {
            setConfiguredDivision(createDefaultRegiments(selectedDivisionDefinition, getRegimentDefinition, unitsMap, selectedFactionKey));
        }
    }, [screen, selectedDivisionDefinition, configuredDivision, getRegimentDefinition, unitsMap, selectedFactionKey]);

    const openRegimentSelector = (factionKey, divisionKey) => {
        setSelectedFactionKey(factionKey);
        setSelectedDivisionKey(divisionKey);
        setConfiguredDivision(null);
        setScreen(SCREENS.SELECTOR);
    };

    const openRegimentEditor = (regimentGroup, index) => {
        setEditingRegimentGroup(regimentGroup);
        setEditingRegimentIndex(index);
        setScreen(SCREENS.EDITOR);
    };

    const backToSelector = () => {
        setScreen(SCREENS.SELECTOR);
        setEditingRegimentGroup(null);
        setEditingRegimentIndex(null);
    };

    const backToList = () => {
        setScreen(SCREENS.LIST);
        setSelectedFactionKey(null);
        setSelectedDivisionKey(null);
        setConfiguredDivision(null);
    };

    const ruleBonuses = configuredDivision && selectedDivisionDefinition
        ? calculateRuleBonuses(configuredDivision, selectedDivisionDefinition, unitsMap, getRegimentDefinition)
        : { improvementPoints: 0, supply: 0 };

    const supplyFromUnits = configuredDivision ? calculateTotalSupplyBonus(configuredDivision, unitsMap, getRegimentDefinition) : 0;
    const supplyBonus = supplyFromUnits + ruleBonuses.supply;

    const totalImprovementsUsed = configuredDivision ? calculateImprovementPointsCost(configuredDivision, unitsMap, getRegimentDefinition, improvements) : 0;
    const improvementPointsLimit = (selectedDivisionDefinition?.improvement_points || 0) + supplyBonus + ruleBonuses.improvementPoints;

    const remainingImprovementPoints = improvementPointsLimit - totalImprovementsUsed;

    const validationErrors = (configuredDivision && selectedDivisionDefinition)
        ? validateDivisionRules(configuredDivision, selectedDivisionDefinition, unitsMap, getRegimentDefinition, improvements)
        : [];

    const totalDivisionCost = configuredDivision
        ? calculateDivisionCost(configuredDivision, unitsMap, getRegimentDefinition, calculateRegimentStats, improvements)
        : (selectedDivisionDefinition?.base_cost || 0);

    const getEditingRegiment = () => {
        if (!configuredDivision || editingRegimentGroup === null || editingRegimentIndex === null) return null;
        const regimentStructure = configuredDivision[editingRegimentGroup][editingRegimentIndex];

        const regDef = getRegimentDefinition(regimentStructure.id, selectedFactionKey);
        if (!regDef) return null;

        return {
            ...regDef,
            id: regimentStructure.id,
            divisionDefinition: selectedDivisionDefinition,
        };
    };

    if (loading) return <div style={{ padding: 20 }}>Ładowanie danych frakcji...</div>;
    if (error) return <div style={{ padding: 20 }}>Błąd krytyczny: {error}</div>;
    if (!factions) return <div style={{ padding: 20 }}>Brak danych.</div>;

    return (
        <div style={{ padding: 0 }}>
            {screen === SCREENS.LIST && (
                <div style={{padding: 20}}>
                    <h1 style={{ marginTop: 0 }}>Kreator Dywizji Ogniem i Mieczem II</h1>
                    <FactionList
                        factions={factions}
                        onOpenDivision={openRegimentSelector}
                    />
                </div>
            )}

            {screen === SCREENS.SELECTOR && selectedFaction && selectedDivisionDefinition && configuredDivision && (
                <RegimentSelector
                    faction={selectedFaction}
                    divisionDefinition={selectedDivisionDefinition}
                    configuredDivision={configuredDivision}
                    setConfiguredDivision={setConfiguredDivision}
                    onOpenRegimentEditor={openRegimentEditor}
                    onBack={backToList}
                    getRegimentDefinition={getRegimentDefinition}

                    divisionBaseCost={selectedDivisionDefinition.base_cost || 0}
                    remainingImprovementPoints={remainingImprovementPoints}
                    improvementPointsLimit={improvementPointsLimit}
                    totalDivisionCost={totalDivisionCost}

                    divisionArtilleryDefinitions={selectedDivisionDefinition?.division_artillery || []}
                    additionalUnitsDefinitions={selectedDivisionDefinition?.additional_units || []}

                    unitsMap={unitsMap}
                    validationErrors={validationErrors}
                />
            )}

            {screen === SCREENS.EDITOR && selectedFaction && configuredDivision && editingRegimentIndex !== null && (
                <RegimentEditor
                    faction={selectedFaction}
                    regiment={getEditingRegiment()}
                    divisionDefinition={selectedDivisionDefinition}
                    onBack={backToSelector}
                    configuredDivision={configuredDivision}
                    setConfiguredDivision={setConfiguredDivision}
                    regimentGroup={editingRegimentGroup}
                    regimentIndex={editingRegimentIndex}

                    calculateImprovementPointsCost={(div) => calculateImprovementPointsCost(div, unitsMap, getRegimentDefinition, improvements)}
                    calculateTotalSupplyBonus={(div) => calculateTotalSupplyBonus(div, unitsMap, getRegimentDefinition)}
                    getRegimentDefinition={getRegimentDefinition}

                    remainingImprovementPoints={remainingImprovementPoints}
                    unitsMap={unitsMap}

                    regimentRules={regimentRules}
                />
            )}
        </div>
    );
}

export default function App() {
    return (
        <ArmyDataProvider>
            <AppContent />
        </ArmyDataProvider>
    );
}