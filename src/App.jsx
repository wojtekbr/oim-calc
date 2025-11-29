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
    calculateDivisionCost
} from "./utils/armyMath";
import { calculateRuleBonuses, validateDivisionRules } from "./utils/divisionRules";

const createDefaultRegiments = (divisionDefinition, getRegimentDefinition) => {
    const createRegimentWithDefaults = (group, index, regimentId) => {
        const config = { base: {}, additional: {}, improvements: {} };
        const def = getRegimentDefinition(regimentId);
        if (def && def.structure && def.structure.base) {
            Object.entries(def.structure.base).forEach(([slotKey, options]) => {
                const isOptional = slotKey.toLowerCase().startsWith('optional');
                if (!isOptional && Array.isArray(options) && options.length > 0) {
                    config.base[slotKey] = options[0]; 
                } else {
                    config.base[slotKey] = null;
                }
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

    const additionalRegiments = divisionDefinition.additional.map((group, index) => ({
        group: GROUP_TYPES.ADDITIONAL,
        index,
        id: IDS.NONE,
        customName: "",
        config: {},
    }));

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
    const { factions, loading, error, improvements } = useArmyData();

    const [screen, setScreen] = useState(SCREENS.LIST);
    const [selectedFactionKey, setSelectedFactionKey] = useState(null);
    const [selectedDivisionKey, setSelectedDivisionKey] = useState(null);

    const [configuredDivision, setConfiguredDivision] = useState(null);
    const [editingRegimentIndex, setEditingRegimentIndex] = useState(null);
    const [editingRegimentGroup, setEditingRegimentGroup] = useState(null);

    const selectedFaction = selectedFactionKey ? factions?.[selectedFactionKey] : null;
    const selectedDivisionDefinition = selectedFaction && selectedDivisionKey ? selectedFaction.divisions[selectedDivisionKey] : null;
    const getRegimentDefinition = (regimentKey) => selectedFaction?.regiments[regimentKey] || null;

    useEffect(() => {
        if (screen === SCREENS.SELECTOR && selectedDivisionDefinition && !configuredDivision) {
            setConfiguredDivision(createDefaultRegiments(selectedDivisionDefinition, getRegimentDefinition));
        }
    }, [screen, selectedDivisionDefinition, configuredDivision]);

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
        ? calculateRuleBonuses(configuredDivision, selectedDivisionDefinition, selectedFaction.units, getRegimentDefinition)
        : { improvementPoints: 0, supply: 0 };

    const supplyFromUnits = configuredDivision ? calculateTotalSupplyBonus(configuredDivision, selectedFaction, getRegimentDefinition) : 0;
    const supplyBonus = supplyFromUnits + ruleBonuses.supply;

    const totalImprovementsUsed = configuredDivision ? calculateImprovementPointsCost(configuredDivision, selectedFaction, getRegimentDefinition, improvements) : 0;
    const improvementPointsLimit = (selectedDivisionDefinition?.improvement_points || 0) + supplyBonus + ruleBonuses.improvementPoints;
    
    const remainingImprovementPoints = improvementPointsLimit - totalImprovementsUsed;
    
    const validationErrors = (configuredDivision && selectedDivisionDefinition)
        ? validateDivisionRules(configuredDivision, selectedDivisionDefinition, selectedFaction.units, getRegimentDefinition)
        : [];

    const totalDivisionCost = configuredDivision 
        ? calculateDivisionCost(configuredDivision, selectedFaction, getRegimentDefinition, calculateRegimentStats, improvements) 
        : (selectedDivisionDefinition?.base_cost || 0);

    const getEditingRegiment = () => {
        if (!configuredDivision || editingRegimentGroup === null || editingRegimentIndex === null) return null;
        const regimentStructure = configuredDivision[editingRegimentGroup][editingRegimentIndex];
        return {
            ...getRegimentDefinition(regimentStructure.id),
            id: regimentStructure.id,
            name: regimentStructure.name,
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
                     <h1 style={{ marginTop: 0 }}>Army Editor</h1>
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
                    
                    additionalUnitsDefinitions={selectedDivisionDefinition?.additional_units || []}
                    unitsMap={selectedFaction.units}
                    
                    validationErrors={validationErrors}
                />
            )}

            {screen === SCREENS.EDITOR && selectedFaction && configuredDivision && editingRegimentIndex !== null && (
                <RegimentEditor
                    faction={selectedFaction}
                    regiment={getEditingRegiment()}
                    onBack={backToSelector}
                    configuredDivision={configuredDivision}
                    setConfiguredDivision={setConfiguredDivision}
                    regimentGroup={editingRegimentGroup}
                    regimentIndex={editingRegimentIndex}
                    
                    calculateImprovementPointsCost={(div) => calculateImprovementPointsCost(div, selectedFaction, getRegimentDefinition, improvements)}
                    calculateTotalSupplyBonus={(div) => calculateTotalSupplyBonus(div, selectedFaction, getRegimentDefinition)}
                    // ZMIANA: Przekazujemy getRegimentDefinition, aby hook mógł liczyć zasady
                    getRegimentDefinition={getRegimentDefinition}
                    
                    remainingImprovementPoints={remainingImprovementPoints}
                    unitsMap={selectedFaction.units}
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