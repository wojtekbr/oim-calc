import React, { createContext, useContext, useEffect, useState } from 'react';

const ArmyDataContext = createContext(null);

export const useArmyData = () => {
    const context = useContext(ArmyDataContext);
    if (!context) {
        throw new Error("useArmyData must be used within an ArmyDataProvider");
    }
    return context;
};

export const ArmyDataProvider = ({ children }) => {
    const [factions, setFactions] = useState(null);
    const [improvements, setImprovements] = useState({});
    // NOWE: Globalne słowniki
    const [globalUnits, setGlobalUnits] = useState({});
    const [globalRegiments, setGlobalRegiments] = useState({});
    
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadData = async () => {
            try {
                const unitModules = import.meta.glob("../data/factions/*/units.json", { eager: true, import: "default" });
                const regimentModules = import.meta.glob("../data/factions/*/regiments.json", { eager: true, import: "default" });
                const divisionModules = import.meta.glob("../data/factions/*/divisions.json", { eager: true, import: "default" });
                const commonUnitModules = import.meta.glob("../data/common/units.json", { eager: true, import: "default" });
                const improvementModules = import.meta.glob("../data/common/improvements.json", { eager: true, import: "default" });

                // 1. Ulepszenia
                let commonImprovements = {};
                for (const path in improvementModules) {
                    Object.assign(commonImprovements, improvementModules[path]);
                }
                setImprovements(commonImprovements);

                // 2. Jednostki Wspólne
                let commonUnits = {};
                for (const path in commonUnitModules) {
                    Object.assign(commonUnits, commonUnitModules[path]);
                }

                const map = {};
                
                // Tymczasowe kontenery na dane globalne
                let allUnitsAccumulator = { ...commonUnits };
                let allRegimentsAccumulator = {};

                const loadModules = (modules, type) => {
                    for (const path in modules) {
                        const parts = path.split("/");
                        const key = parts[parts.length - 2];
                        map[key] = map[key] || {};
                        
                        if (type === 'meta') {
                            const metaName = modules[path]._meta?.name ? modules[path]._meta.name : key;
                            map[key].meta = { key, name: metaName };
                        }
                        
                        const data = modules[path] || {};
                        map[key][type] = data;

                        // NOWE: Agregacja do globalnych słowników
                        if (type === 'units') {
                            // Pamiętaj, że units.json może mieć klucz _meta, pomijamy go przy mergowaniu jednostek
                            const { _meta, ...unitsData } = data;
                            Object.assign(allUnitsAccumulator, unitsData);
                        } else if (type === 'regiments') {
                             Object.assign(allRegimentsAccumulator, data);
                        }
                    }
                };

                loadModules(unitModules, 'units');
                loadModules(regimentModules, 'regiments');
                loadModules(divisionModules, 'divisions');

                // Finalizacja struktury frakcji
                Object.keys(map).forEach(k => {
                    map[k].units = { ...commonUnits, ...(map[k].units || {}) };
                    if (!map[k].meta) map[k].meta = { key: k, name: k };
                });

                setFactions(map);
                
                // NOWE: Ustawienie stanu globalnego
                setGlobalUnits(allUnitsAccumulator);
                setGlobalRegiments(allRegimentsAccumulator);

                setLoading(false);
            } catch (e) {
                console.error("Loading error:", e);
                setError(String(e));
                setLoading(false);
            }
        };

        loadData();
    }, []);

    // ZMIANA: getRegimentDefinition szuka teraz w globalnym rejestrze
    // Dzięki temu znajdzie pułk tatarski nawet jak jesteś w Turcji
    const getRegimentDefinition = (regimentKey) => {
        if (!regimentKey || regimentKey === 'none') return null;
        return globalRegiments[regimentKey] || null;
    };

    const value = {
        factions,
        improvements,
        globalUnits,      // Eksportujemy
        globalRegiments,  // Eksportujemy (opcjonalnie, bo mamy getRegimentDefinition)
        loading,
        error,
        getRegimentDefinition
    };

    return (
        <ArmyDataContext.Provider value={value}>
            {children}
        </ArmyDataContext.Provider>
    );
};