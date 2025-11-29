import React, { createContext, useContext, useEffect, useState } from 'react';

// Tworzymy kontekst
const ArmyDataContext = createContext(null);

// Hook ułatwiający dostęp do danych w komponentach
export const useArmyData = () => {
    const context = useContext(ArmyDataContext);
    if (!context) {
        throw new Error("useArmyData must be used within an ArmyDataProvider");
    }
    return context;
};

// Provider - komponent oplatający aplikację
export const ArmyDataProvider = ({ children }) => {
    const [factions, setFactions] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadData = async () => {
            try {
                // Dynamiczny import plików JSON (Vite glob import)
                const unitModules = import.meta.glob("../data/factions/*/units.json", { eager: true, import: "default" });
                const regimentModules = import.meta.glob("../data/factions/*/regiments.json", { eager: true, import: "default" });
                const divisionModules = import.meta.glob("../data/factions/*/divisions.json", { eager: true, import: "default" });
                const commonUnitModules = import.meta.glob("../data/common/units.json", { eager: true, import: "default" });

                // Scalanie wspólnych jednostek
                let commonUnits = {};
                for (const path in commonUnitModules) {
                    Object.assign(commonUnits, commonUnitModules[path]);
                }

                const map = {};

                // Funkcja pomocnicza do mapowania modułów
                const loadModules = (modules, type) => {
                    for (const path in modules) {
                        const parts = path.split("/");
                        // Zakładamy strukturę: ../data/factions/NAZWA_FRAKCJI/plik.json
                        // parts[parts.length - 2] to nazwa folderu frakcji
                        const key = parts[parts.length - 2];
                        map[key] = map[key] || {};
                        
                        // Metadata (jeśli istnieje)
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

                // Finalizacja struktury mapy
                Object.keys(map).forEach(k => {
                    // Dodaj wspólne jednostki do jednostek frakcji
                    map[k].units = { ...commonUnits, ...(map[k].units || {}) };
                    // Upewnij się, że meta istnieje
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

    // Helper: pobieranie definicji pułku (bezpiecznie)
    const getRegimentDefinition = (factionKey, regimentKey) => {
        if (!factions || !factionKey || !regimentKey || regimentKey === 'none') return null;
        return factions[factionKey]?.regiments?.[regimentKey] || null;
    };

    const value = {
        factions,
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