import React, { useEffect, useState } from "react";
import FactionList from "./pages/FactionList";
import RegimentSelector from "./pages/RegimentSelector";
import RegimentEditor from "./pages/RegimentEditor";

export default function App() {
    const [factions, setFactions] = useState(null);
    const [error, setError] = useState(null);

    // Nowe stany dla flow
    const [screen, setScreen] = useState("list"); // "list" | "selector" | "editor"
    const [selectedFactionKey, setSelectedFactionKey] = useState(null);
    const [selectedDivisionKey, setSelectedDivisionKey] = useState(null);

    // Stan przechowujący CAŁĄ SKONFIGUROWANĄ dywizję z wybranymi pułkami
    const [configuredDivision, setConfiguredDivision] = useState(null);
    // Stan przechowujący indeks pułku do edycji
    const [editingRegimentIndex, setEditingRegimentIndex] = useState(null);
    // Klucz 'base'/'additional' dla edytowanego pułku
    const [editingRegimentGroup, setEditingRegimentGroup] = useState(null);

    useEffect(() => {
        try {
            // eagerly import all units.json, regiments.json and divisions.json
            const unitModules = import.meta.glob("./data/factions/*/units.json", { eager: true, import: "default" });
            const regimentModules = import.meta.glob("./data/factions/*/regiments.json", { eager: true, import: "default" });
            const divisionModules = import.meta.glob("./data/factions/*/divisions.json", { eager: true, import: "default" });


            const map = {};

            // 1. Ładowanie jednostek i meta
            for (const path in unitModules) {
                const parts = path.split("/");
                const key = parts[parts.length - 2];
                map[key] = map[key] || {};
                map[key].units = unitModules[path] || {};
                const metaName = map[key].units && map[key].units._meta && map[key].units._meta.name ? map[key].units._meta.name : key;
                map[key].meta = { key, name: metaName };
            }

            // 2. Ładowanie struktur pułków (co można wybrać w pułku)
            for (const path in regimentModules) {
                const parts = path.split("/");
                const key = parts[parts.length - 2];
                map[key] = map[key] || {};
                map[key].regiments = regimentModules[path] || {};
            }

            // 3. Ładowanie struktur dywizji (lista dostępnych pułków i support_units)
            for (const path in divisionModules) {
                const parts = path.split("/");
                const key = parts[parts.length - 2];
                map[key] = map[key] || {};
                map[key].divisions = divisionModules[path] || {};
                if (!map[key].meta) {
                    const metaName = map[key].divisions && map[key].divisions._meta && map[key].divisions._meta.name ? map[key].divisions._meta.name : key;
                    map[key].meta = { key, name: metaName };
                }
            }


            // ensure keys exist
            Object.keys(map).forEach(k => {
                map[k].units = map[k].units || {};
                map[k].regiments = map[k].regiments || {};
                map[k].divisions = map[k].divisions || {};
                map[k].meta = map[k].meta || { key: k, name: k };
            });

            setFactions(map);
        } catch (e) {
            console.error("Loading error:", e);
            setError(String(e));
        }
    }, []);

    if (error) {
        return <div style={{ padding: 20 }}>Błąd: {error}</div>;
    }
    if (!factions) {
        return <div style={{ padding: 20 }}>Ładowanie danych frakcji...</div>;
    }

    // ========= NAWIGACJA =========

    const openRegimentSelector = (factionKey, divisionKey) => {
        setSelectedFactionKey(factionKey);
        setSelectedDivisionKey(divisionKey);
        setConfiguredDivision(null); // Reset listy pułków przy nowym wyborze
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

    // ========= DANE I KALKULACJE =========

    const selectedFaction = selectedFactionKey ? factions[selectedFactionKey] : null;
    const selectedDivisionDefinition = selectedFaction && selectedDivisionKey ? selectedFaction.divisions[selectedDivisionKey] : null;

    const getRegimentDefinition = (regimentKey) => {
        return selectedFaction?.regiments[regimentKey] || null;
    }

    // --- FUNKCJA WSPOMAGAJĄCA OBLICZANIE KOSZTU ULEPSZEŃ (IMP) ---
    const calculateSingleImprovementCost = (unitDef, impDef) => {
        const improvementBaseCost = unitDef?.improvement_cost || 0;

        if (typeof impDef.cost === 'number') {
            return impDef.cost;
        } else if (impDef.cost === 'double') {
            return improvementBaseCost * 2;
        } else if (impDef.cost === 'triple') {
            return improvementBaseCost * 3;
        } else if (impDef.cost === -1) {
            return Math.max(1, improvementBaseCost - 1);
        } else if (impDef.cost === 1) {
            return improvementBaseCost;
        }
        return 0;
    }

    // NOWA FUNKCJA: Oblicza wykorzystane punkty ulepszeń (IMP)
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

            // A. ULEPSZENIA NA POZIOMIE PUŁKU
            const regimentImprovements = regimentConfig.regimentImprovements || [];

            regimentImprovements.forEach(impId => {
                const impDef = regimentImprovementsDefinition.find(i => i.id === impId);
                if (!impDef) return;

                // Koszt zdefiniowany w 'cost' (odejmuje punkty ulepszeń)
                totalImpCost += (typeof impDef.cost === 'number' ? impDef.cost : 0);
            });


            // B. ULEPSZENIA NA POZIOMIE JEDNOSTKI
            const selectedUnitsByPosition = [
                ...Object.entries(regimentConfig.base || {}).map(([key, unitId]) => ({ key: `base/${key}`, unitId })),
                ...Object.entries(regimentConfig.additional || {}).map(([key, unitId]) => ({ key: `additional/${key}`, unitId })),
                ...(regimentConfig.additionalCustom ? [{ key: regimentConfig.customCostSlotName + "_custom", unitId: regimentConfig.additionalCustom }] : [])
            ];

            // 1. Zliczanie IMP z regularnych slotów pułku
            selectedUnitsByPosition.forEach(({ key: positionKey, unitId }) => {
                if (!unitId) return;

                const unitDef = unitsMap[unitId];
                if (!unitDef || unitDef.rank === 'group') return;

                const unitImprovements = improvementsMap[positionKey] || [];

                unitImprovements.forEach(impId => {
                    const impDef = unitImprovementsDefinition.find(i => i.id === impId);
                    if (!impDef) return;

                    // Używamy funkcji pomocniczej
                    totalImpCost += calculateSingleImprovementCost(unitDef, impDef);
                });
            });

            // 2. Zliczanie IMP z jednostek wsparcia PRZYPISANYCH do tego pułku
            // ZMIANA: Zabezpieczenie dostępu do supportUnits
            if (divisionConfig.supportUnits) {

                const regimentPositionKey = `${regiment.group}/${regiment.index}`;
                const assignedSupportUnits = divisionConfig.supportUnits
                    .filter(su => su.assignedTo?.positionKey === regimentPositionKey);

                assignedSupportUnits.forEach(su => {
                    const supportUnitKey = `support/${su.id}-${regimentPositionKey}`;
                    const supportUnitDef = unitsMap[su.id];

                    if (!supportUnitDef || supportUnitDef.rank === 'group') return;

                    const unitImprovements = improvementsMap[supportUnitKey] || [];

                    unitImprovements.forEach(impId => {
                        const impDef = unitImprovementsDefinition.find(i => i.id === impId);
                        if (!impDef) return;

                        // Używamy funkcji pomocniczej
                        totalImpCost += calculateSingleImprovementCost(supportUnitDef, impDef);
                    });
                });
            }

        });

        return totalImpCost;
    };


    // Oblicza koszt punktowy na podstawie konfiguracji jednostek pułku
    const calculateRegimentCost = (regimentConfig, regimentId, configuredDivision) => {
        if (!selectedFaction) return 0;
        if (!regimentConfig || (!regimentConfig.base && !regimentConfig.additional)) return 0;

        const unitsMap = selectedFaction.units || {};
        const regimentDefinition = getRegimentDefinition(regimentId);

        // 1. KOSZT BAZOWY PUŁKU
        const regimentBaseCost = regimentDefinition?.base_cost || 0;
        let cost = regimentBaseCost;

        const getUnitCost = (unitId) => unitsMap[unitId]?.cost || 0;

        const unitImprovementsDefinition = regimentDefinition?.unit_improvements || [];
        const regimentImprovementsDefinition = regimentDefinition?.regiment_improvements || [];
        const improvementsMap = regimentConfig.improvements || {};
        const regimentImprovements = regimentConfig.regimentImprovements || [];

        // Pomocnicza mapa niestandardowych kosztów jednostek (z unit_custom_cost)
        const customCostMap = (regimentDefinition.structure?.additional?.unit_custom_cost || [])
            .reduce((map, item) => {
                map[item.id] = item.cost;
                return map;
            }, {});


        // A. Dolicz koszt punktowy ulepszeń pułkowych (army_point_cost)
        regimentImprovements.forEach(impId => {
            const impDef = regimentImprovementsDefinition.find(i => i.id === impId);
            if (impDef && typeof impDef.army_point_cost === 'number') {
                cost += impDef.army_point_cost;
            }
        });


        // B. KOSZT JEDNOSTEK Z WŁAŚCIWYCH SLOTÓW I ULEPSZEŃ JEDNOSTKOWYCH

        const selectedUnitsByPosition = [
            ...Object.entries(regimentConfig.base || {}).map(([key, unitId]) => ({ key: `base/${key}`, unitId, isCustom: false })),
            ...Object.entries(regimentConfig.additional || {}).map(([key, unitId]) => ({ key: `additional/${key}`, unitId, isCustom: false })),
            ...(regimentConfig.additionalCustom ? [{ key: regimentConfig.customCostSlotName + "_custom", unitId: regimentConfig.additionalCustom, isCustom: true }] : [])
        ];

        selectedUnitsByPosition.forEach(({ key: positionKey, unitId, isCustom }) => {
            if (!unitId) return;

            const unitDef = unitsMap[unitId];
            if (!unitDef) return;

            let unitBaseCost = getUnitCost(unitId);

            // Nadpisanie kosztu, jeśli to slot dodatkowy z unit_custom_cost
            const customCostSlotName = regimentDefinition.structure?.additional?.unit_custom_cost?.[0]?.depends_on;
            if (isCustom && customCostMap[unitId] !== undefined) {
                unitBaseCost = customCostMap[unitId];
            }

            // Dolicz koszt bazowy jednostki (lub niestandardowy)
            cost += unitBaseCost;

            if (unitDef.rank === 'group') return; // Grupy nie mają ulepszeń

            // Dolicz koszt ulepszeń jednostkowych
            const unitImprovements = improvementsMap[positionKey] || [];

            unitImprovements.forEach(impId => {
                const impDef = unitImprovementsDefinition.find(i => i.id === impId);
                if (!impDef) return;

                cost += calculateSingleImprovementCost(unitDef, impDef);
            });
        });

        // C. KOSZT PRZYPISANYCH JEDNOSTEK WSPARCIA DYWIZYJNEGO
        if (configuredDivision) {
            const allRegiments = configuredDivision.base.concat(configuredDivision.additional);
            const currentRegimentData = allRegiments.find(r => r.id === regimentId && r.config === regimentConfig);

            if (currentRegimentData) {
                const positionKey = `${currentRegimentData.group}/${currentRegimentData.index}`;

                configuredDivision.supportUnits
                    .filter(su => su.assignedTo?.positionKey === positionKey)
                    .forEach(su => {
                        const unitDef = unitsMap[su.id];
                        // Koszt jednostki wsparcia
                        cost += getUnitCost(su.id);

                        // Koszt ulepszeń jednostki wsparcia
                        const supportUnitKey = `support/${su.id}-${positionKey}`;
                        const unitImprovements = improvementsMap[supportUnitKey] || [];
                        const unitImpDef = regimentDefinition.unit_improvements || [];

                        if (unitDef && unitDef.rank !== 'group') {
                            const improvementBaseCost = unitDef.improvement_cost || 0;

                            unitImprovements.forEach(impId => {
                                const impDef = unitImpDef.find(i => i.id === impId);
                                if (!impDef) return;

                                cost += calculateSingleImprovementCost(unitDef, impDef);
                            });
                        }

                    });
            }
        }


        return cost;
    };

    // NOWA FUNKCJA: Oblicza koszt Dywizji (w tym Support Units)
    const calculateDivisionCost = (configuredDivision) => {
        if (!configuredDivision) return 0;

        const divisionDef = configuredDivision.divisionDefinition;
        const divisionBaseCost = divisionDef.base_cost || 0;
        let cost = divisionBaseCost;

        const unitsMap = selectedFaction?.units || {};

        // 1. Koszt Pułków (Wliczając przypisane jednostki wsparcia)
        const allRegiments = configuredDivision.base.concat(configuredDivision.additional);
        allRegiments.forEach(regiment => {
            // Przekazujemy całą configuredDivision, aby calculateRegimentCost mógł znaleźć supportUnits
            cost += calculateRegimentCost(regiment.config, regiment.id, configuredDivision);
        });

        // 2. Koszt Jednostek Wsparcia Dywizyjnego NIEPRZYPISANYCH
        (configuredDivision.supportUnits || [])
            .filter(su => su.assignedTo === null)
            .forEach(su => {
                const unitCost = unitsMap[su.id]?.cost || 0;
                cost += unitCost;
            });

        return cost;
    }

    // Obliczenie całkowitego wykorzystanego budżetu na ulepszenia
    const totalImprovementsUsed = configuredDivision ? calculateImprovementPointsCost(configuredDivision) : 0;
    const improvementPointsLimit = selectedDivisionDefinition?.improvement_points || 0;
    const remainingImprovementPoints = improvementPointsLimit - totalImprovementsUsed;

    // Obliczenie całkowitego kosztu Dywizji
    const totalDivisionCost = configuredDivision ? calculateDivisionCost(configuredDivision) : selectedDivisionDefinition?.base_cost || 0;


    // Pobieranie pułku do edycji
    const getEditingRegiment = () => {
        if (!configuredDivision || editingRegimentGroup === null || editingRegimentIndex === null) return null;

        const regimentStructure = configuredDivision[editingRegimentGroup][editingRegimentIndex];
        const regimentDefinition = getRegimentDefinition(regimentStructure.id);
        const regimentName = regimentStructure.name;

        return {
            ...regimentDefinition, // Struktura base/additional jednostek
            id: regimentStructure.id,
            name: regimentName,
            divisionDefinition: selectedDivisionDefinition
        };
    }

    // ========= WIDOK =========

    return (
        <div style={{ padding: 20, fontFamily: "sans-serif" }}>
            <h1 style={{ marginTop: 0 }}>Army Editor</h1>

            {/* Faction List Screen */}
            {screen === "list" && (
                <FactionList
                    factions={factions}
                    onOpenDivision={(factionKey, divisionKey) => openRegimentSelector(factionKey, divisionKey)}
                />
            )}

            {/* Regiment Selector Screen */}
            {screen === "selector" && selectedFaction && selectedDivisionDefinition && (
                <RegimentSelector
                    faction={selectedFaction}
                    divisionDefinition={selectedDivisionDefinition}
                    configuredDivision={configuredDivision}
                    setConfiguredDivision={setConfiguredDivision}
                    onOpenRegimentEditor={openRegimentEditor}
                    onBack={backToList}
                    getRegimentDefinition={getRegimentDefinition}
                    // ZMIANA: Przekazujemy logiczną funkcję calculateRegimentCost (bez konieczności podawania configuredDivision, bo jest w kontekście App)
                    calculateRegimentCost={(config, id) => calculateRegimentCost(config, id, configuredDivision)}
                    divisionBaseCost={selectedDivisionDefinition.base_cost || 0}
                    remainingImprovementPoints={remainingImprovementPoints}
                    improvementPointsLimit={improvementPointsLimit}
                    totalDivisionCost={totalDivisionCost}
                    // ZMIANA: Używamy klucza 'additional_units'
                    additionalUnitsDefinitions={selectedDivisionDefinition?.additional_units || []}
                    unitsMap={selectedFaction.units}
                />
            )}

            {/* Regiment Editor Screen (poprzedni DivisionEditor) */}
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
                    remainingImprovementPoints={remainingImprovementPoints}
                    unitsMap={selectedFaction.units}
                />
            )}
        </div>
    );
}