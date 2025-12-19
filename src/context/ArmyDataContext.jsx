import React, { createContext, useContext, useEffect, useState } from 'react';

const ArmyDataContext = createContext(null);

export const useArmyData = () => {
    const context = useContext(ArmyDataContext);
    if (!context) {
        throw new Error("useArmyData must be used within an ArmyDataProvider");
    }
    return context;
};

// Helper do głębokiego łączenia obiektów (dla structure_overrides)
const deepMerge = (target, source) => {
    for (const key in source) {
        const sourceVal = source[key];
        const targetVal = target[key];

        // Jeśli oba są obiektami (i NIE są tablicami), wchodzimy głębiej (rekurencja)
        if (sourceVal && typeof sourceVal === 'object' && !Array.isArray(sourceVal)) {
            if (targetVal && typeof targetVal === 'object' && !Array.isArray(targetVal)) {
                deepMerge(targetVal, sourceVal);
            } else {
                // Jeśli target nie był obiektem, po prostu go nadpisujemy
                target[key] = sourceVal;
            }
        } else {
            // Jeśli źródło to tablica (Array) lub typ prosty (string, number, boolean)
            // -> NADPISUJEMY CAŁOŚĆ (Replace).
            // To pozwala na całkowitą wymianę listy jednostek w wariancie frakcyjnym.
            target[key] = sourceVal;
        }
    }
    return target;
};

export const ArmyDataProvider = ({ children }) => {
    const [factions, setFactions] = useState(null);
    const [improvements, setImprovements] = useState({});
    const [globalUnits, setGlobalUnits] = useState({});
    const [globalRegiments, setGlobalRegiments] = useState({});
    const [regimentRules, setRegimentRules] = useState({});
    
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
                const regimentRulesModules = import.meta.glob("../data/common/regiment_rules.json", { eager: true, import: "default" });
                
                const factionsDefModule = import.meta.glob("../data/common/factions.json", { eager: true, import: "default" });
                const factionsSettings = Object.values(factionsDefModule)[0] || {};

                // 1. Ulepszenia
                let commonImprovements = {};
                for (const path in improvementModules) {
                    Object.assign(commonImprovements, improvementModules[path]);
                }
                setImprovements(commonImprovements);

                // 2. Zasady specjalne pułków
                let commonRegimentRules = {};
                for (const path in regimentRulesModules) {
                    Object.assign(commonRegimentRules, regimentRulesModules[path]);
                }
                setRegimentRules(commonRegimentRules);

                // 3. Jednostki Wspólne
                let commonUnits = {};
                for (const path in commonUnitModules) {
                    Object.assign(commonUnits, commonUnitModules[path]);
                }

                const map = {};
                let allUnitsAccumulator = { ...commonUnits };
                let allRegimentsAccumulator = {};

                const loadModules = (modules, type) => {
                    for (const path in modules) {
                        const parts = path.split("/");
                        const key = parts[parts.length - 2]; 
                        map[key] = map[key] || {};
                        
                        if (type === 'meta' || !map[key].meta) {
                            const configEntry = Object.values(factionsSettings).find(f => f.dir === key);
                            
                            let metaName = configEntry ? configEntry.name : key;
                            
                            if (!configEntry && modules[path]._meta?.name) {
                                metaName = modules[path]._meta.name;
                            }

                            map[key].meta = { 
                                key, 
                                name: metaName,
                                hidden: configEntry?.hidden || false
                            };
                        }
                        
                        const data = modules[path] || {};
                        map[key][type] = data;

                        if (type === 'units') {
                            const { _meta, ...unitsData } = data;
                            Object.assign(allUnitsAccumulator, unitsData);
                        } else if (type === 'regiments') {
                             // Oznaczamy pułk jego frakcją źródłową
                             Object.keys(data).forEach(regId => {
                                 if (typeof data[regId] === 'object') {
                                     data[regId]._sourceFaction = key;
                                 }
                             });
                             Object.assign(allRegimentsAccumulator, data);
                        }
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

    const getRegimentDefinition = (regimentKey, factionKey = null) => {
        if (!regimentKey || regimentKey === 'none') return null;
        
        const baseDef = globalRegiments[regimentKey];
        if (!baseDef) return null;

        if (!factionKey || !baseDef.faction_variants || !baseDef.faction_variants[factionKey]) {
            return baseDef;
        }

        // Deep copy bazy
        const variantDef = JSON.parse(JSON.stringify(baseDef));
        const variantRules = baseDef.faction_variants[factionKey];

        if (variantRules.special_rules_replace) {
            variantDef.special_rules = variantRules.special_rules_replace;
        }
        // A. Dodawanie zasad specjalnych (pozostaje jako opcja dla innych przypadków)
        else if (variantRules.special_rules_add) {
            variantDef.special_rules = [
                ...(variantDef.special_rules || []),
                ...variantRules.special_rules_add
            ];
        }

        // B. Nadpisywanie struktury (Deep Merge z podmienianiem tablic)
        if (variantRules.structure_overrides) {
            deepMerge(variantDef.structure, variantRules.structure_overrides);
        }

        return variantDef;
    };

    const value = {
        factions,
        improvements,
        regimentRules,
        globalUnits,
        globalRegiments,
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