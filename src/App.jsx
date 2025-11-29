import React, { useEffect, useState } from "react";
import FactionList from "./pages/FactionList";
import RegimentSelector from "./pages/RegimentSelector";
import RegimentEditor from "./pages/RegimentEditor";
import { ArmyDataProvider, useArmyData } from "./context/ArmyDataContext";
import { SCREENS, IDS } from "./constants";
import { 
    calculateRegimentStats, 
    calculateImprovementPointsCost, 
    calculateTotalSupplyBonus, 
    calculateDivisionCost
} from "./utils/armyMath";
import ErrorBoundary from "./components/ErrorBoundary";

// Helper do tworzenia domyślnej struktury (przeniesiony do utils/armyMath.js lub zostawiony tutaj jako helper UI)
// Dla przejrzystości zostawiam tutaj, ale korzysta on teraz z clean constants
const createDefaultRegiments = (divisionDefinition, getRegimentDefinition) => {
    const createRegimentWithDefaults = (group, index, regimentId) => {
        const config = { base: {}, additional: {}, improvements: {}, isVanguard: false };
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

    const baseRegiments = divisionDefinition.base.map((group, index) =>
        createRegimentWithDefaults('base', index, group.options[0])
    );

    const additionalRegiments = divisionDefinition.additional.map((group, index) => ({
        group: "additional",
        index,
        id: IDS.NONE,
        customName: "",
        config: {},
    }));

    return {
        base: baseRegiments,
        additional: additionalRegiments,
        supportUnits: [],
        divisionDefinition: divisionDefinition
    };
};

// --- GŁÓWNA ZAWARTOŚĆ APLIKACJI (Konsument Danych) ---
function AppContent() {
    // Pobieramy dane z Contextu zamiast ładować je tutaj
    const { factions, loading, error } = useArmyData();

    const [screen, setScreen] = useState(SCREENS.LIST);
    const [selectedFactionKey, setSelectedFactionKey] = useState(null);
    const [selectedDivisionKey, setSelectedDivisionKey] = useState(null);

    const [configuredDivision, setConfiguredDivision] = useState(null);
    const [editingRegimentIndex, setEditingRegimentIndex] = useState(null);
    const [editingRegimentGroup, setEditingRegimentGroup] = useState(null);

    // --- Derived State Helpers ---
    const selectedFaction = selectedFactionKey ? factions?.[selectedFactionKey] : null;
    const selectedDivisionDefinition = selectedFaction && selectedDivisionKey ? selectedFaction.divisions[selectedDivisionKey] : null;
    
    // Wrapper na getRegimentDefinition dla aktualnie wybranej frakcji
    const getRegimentDefinition = (regimentKey) => selectedFaction?.regiments[regimentKey] || null;

    // --- Init Configured Division ---
    useEffect(() => {
        if (screen === SCREENS.SELECTOR && selectedDivisionDefinition && !configuredDivision) {
            setConfiguredDivision(createDefaultRegiments(selectedDivisionDefinition, getRegimentDefinition));
        }
    }, [screen, selectedDivisionDefinition, configuredDivision]);

    // --- Routing Handlers ---
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

    // --- Calculations ---
    const supplyBonus = configuredDivision ? calculateTotalSupplyBonus(configuredDivision, selectedFaction, getRegimentDefinition) : 0;
    const totalImprovementsUsed = configuredDivision ? calculateImprovementPointsCost(configuredDivision, selectedFaction, getRegimentDefinition) : 0;
    const improvementPointsLimit = (selectedDivisionDefinition?.improvement_points || 0) + supplyBonus;
    const remainingImprovementPoints = improvementPointsLimit - totalImprovementsUsed;
    
    const totalDivisionCost = configuredDivision 
        ? calculateDivisionCost(configuredDivision, selectedFaction, getRegimentDefinition, calculateRegimentStats) 
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

    // --- Render Loading/Error ---
    if (loading) return <div style={{ padding: 20 }}>Ładowanie danych frakcji...</div>;
    if (error) return <div style={{ padding: 20 }}>Błąd krytyczny: {error}</div>;
    if (!factions) return <div style={{ padding: 20 }}>Brak danych.</div>;

    // --- Render Screens ---
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
                <ErrorBoundary>
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
                    />
                </ErrorBoundary>
            )}

            {screen === SCREENS.EDITOR && selectedFaction && configuredDivision && editingRegimentIndex !== null && (
                <ErrorBoundary>
                    <RegimentEditor
                        faction={selectedFaction}
                        regiment={getEditingRegiment()}
                        onBack={backToSelector}
                        configuredDivision={configuredDivision}
                        setConfiguredDivision={setConfiguredDivision}
                        regimentGroup={editingRegimentGroup}
                        regimentIndex={editingRegimentIndex}
                        
                        // Passing math helpers with bound context
                        calculateImprovementPointsCost={(div) => calculateImprovementPointsCost(div, selectedFaction, getRegimentDefinition)}
                        calculateTotalSupplyBonus={(div) => calculateTotalSupplyBonus(div, selectedFaction, getRegimentDefinition)}
                        remainingImprovementPoints={remainingImprovementPoints}
                        unitsMap={selectedFaction.units}
                    />
                </ErrorBoundary>
            )}
        </div>
    );
}

// --- APP WRAPPER (To inject Context) ---
export default function App() {
    return (
        <ArmyDataProvider>
            <AppContent />
        </ArmyDataProvider>
    );
}