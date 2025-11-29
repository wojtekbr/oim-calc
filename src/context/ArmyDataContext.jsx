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
    const [improvements, setImprovements] = useState({}); // Nowy stan
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadData = async () => {
            try {
                // Ładowanie modułów
                const unitModules = import.meta.glob("../data/factions/*/units.json", { eager: true, import: "default" });
                const regimentModules = import.meta.glob("../data/factions/*/regiments.json", { eager: true, import: "default" });
                const divisionModules = import.meta.glob("../data/factions/*/divisions.json", { eager: true, import: "default" });
                const commonUnitModules = import.meta.glob("../data/common/units.json", { eager: true, import: "default" });
                
                // NOWE: Ładowanie definicji ulepszeń
                const improvementModules = import.meta.glob("../data/common/improvements.json", { eager: true, import: "default" });

                // Przetwarzanie ulepszeń
                let commonImprovements = {};
                for (const path in improvementModules) {
                    Object.assign(commonImprovements, improvementModules[path]);
                }
                setImprovements(commonImprovements);

                // Przetwarzanie jednostek wspólnych
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
                setLoading(false);
            } catch (e) {
                console.error("Loading error:", e);
                setError(String(e));
                setLoading(false);
            }
        };

        loadData();
    }, []);

    const getRegimentDefinition = (factionKey, regimentKey) => {
        if (!factions || !factionKey || !regimentKey || regimentKey === 'none') return null;
        return factions[factionKey]?.regiments?.[regimentKey] || null;
    };

    const value = {
        factions,
        improvements, // Udostępniamy
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