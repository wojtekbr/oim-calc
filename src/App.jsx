import React, { useEffect, useState, useCallback } from "react";
import FactionList from "./pages/FactionList";
import RegimentSelector from "./pages/RegimentSelector";
import RegimentEditor from "./pages/RegimentEditor";
import { ArmyDataProvider, useArmyData } from "./context/ArmyDataContext";
import { SCREENS, IDS, GROUP_TYPES } from "./constants";
import { 
    calculateRegimentStats, 
    calculateImprovementPointsCost, 
    calculateTotalSupplyBonus, 
    calculateDivisionCost
} from "./utils/armyMath";
import { calculateRuleBonuses, validateDivisionRules } from "./utils/divisionRules";

const createDefaultRegiments = (divisionDefinition, getRegimentDefinition) => {
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
        
        const def = getRegimentDefinition(regimentId);
        
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

    // --- NAPRAWA: Contextual Get Definition ---
    // Tworzymy funkcję, która automatycznie dokleja klucz frakcji do zapytań o definicję.
    // Dzięki temu calculateRegimentStats otrzyma wersję ze 'structure_overrides'.
    const boundGetRegimentDefinition = useCallback((id) => {
        return getRegimentDefinition(id, selectedFactionKey);
    }, [getRegimentDefinition, selectedFactionKey]);

    useEffect(() => {
        if (screen === SCREENS.SELECTOR && selectedDivisionDefinition && !configuredDivision) {
            // Tutaj używamy boundGetRegimentDefinition, aby domyślne wybory uwzględniały warianty
            setConfiguredDivision(createDefaultRegiments(selectedDivisionDefinition, boundGetRegimentDefinition));
        }
    }, [screen, selectedDivisionDefinition, configuredDivision, boundGetRegimentDefinition]);

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

    // Używamy boundGetRegimentDefinition we wszystkich kalkulacjach
    const ruleBonuses = configuredDivision && selectedDivisionDefinition 
        ? calculateRuleBonuses(configuredDivision, selectedDivisionDefinition, unitsMap, boundGetRegimentDefinition)
        : { improvementPoints: 0, supply: 0 };

    const supplyFromUnits = configuredDivision ? calculateTotalSupplyBonus(configuredDivision, unitsMap, boundGetRegimentDefinition) : 0;
    const supplyBonus = supplyFromUnits + ruleBonuses.supply;

    const totalImprovementsUsed = configuredDivision ? calculateImprovementPointsCost(configuredDivision, unitsMap, boundGetRegimentDefinition, improvements) : 0;
    const improvementPointsLimit = (selectedDivisionDefinition?.improvement_points || 0) + supplyBonus + ruleBonuses.improvementPoints;
    
    const remainingImprovementPoints = improvementPointsLimit - totalImprovementsUsed;
    
    const validationErrors = (configuredDivision && selectedDivisionDefinition)
        ? validateDivisionRules(configuredDivision, selectedDivisionDefinition, unitsMap, boundGetRegimentDefinition, improvements)
        : [];

    // FIX: Usunięto nadmiarowy argument calculateRegimentStats (nowy costUtils go importuje sam)
    // FIX: Użyto boundGetRegimentDefinition
    const totalDivisionCost = configuredDivision 
        ? calculateDivisionCost(configuredDivision, unitsMap, boundGetRegimentDefinition, improvements) 
        : (selectedDivisionDefinition?.base_cost || 0);

    const getEditingRegiment = () => {
        if (!configuredDivision || editingRegimentGroup === null || editingRegimentIndex === null) return null;
        const regimentStructure = configuredDivision[editingRegimentGroup][editingRegimentIndex];
        
        // Tutaj też używamy bound, chociaż w tym miejscu to akurat działało (bo było jawnie przekazywane)
        const regDef = boundGetRegimentDefinition(regimentStructure.id);
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
                    getRegimentDefinition={boundGetRegimentDefinition} // PRZEKAZUJEMY BOUND
                    
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
                    
                    // Wszystkie helpery korzystają teraz z boundGetRegimentDefinition
                    calculateImprovementPointsCost={(div) => calculateImprovementPointsCost(div, unitsMap, boundGetRegimentDefinition, improvements)}
                    calculateTotalSupplyBonus={(div) => calculateTotalSupplyBonus(div, unitsMap, boundGetRegimentDefinition)}
                    getRegimentDefinition={boundGetRegimentDefinition}
                    
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