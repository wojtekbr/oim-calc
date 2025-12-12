// src/utils/regimentRules.js

// --- REJESTR LOGIKI (Działanie zasad) ---
export const REGIMENT_RULES_REGISTRY = {
    
    // "Jeżeli wystawisz Piechotę łanową, pułk staje się Mieszany."
    "lanowa_makes_mixed": {
        modifyStats: (stats, activeUnits) => {
            const hasLanowa = activeUnits.some(u => u.unitId.includes("piechota_lanowa"));
            if (hasLanowa) {
                return { regimentType: "Mieszany" };
            }
            return null;
        }
    },

    // "Żeby wystawić Lekkie działa należy wystawić przynajmniej jedną jednostkę Piechoty Łanowej w rozmiarze M."
    "artillery_req_lanowa_m": {
        validate: (activeUnits) => {
            const hasArtillery = activeUnits.some(u => u.unitId.includes("light_art") || u.unitId.includes("medium_art"));
            
            if (!hasArtillery) return null;

            const hasLanowaM = activeUnits.some(u => u.unitId === "cro_piechota_lanowa_m");
            
            if (!hasLanowaM) {
                return "Zasada 'Wymagania Artylerii': Aby wystawić Działa, musisz posiadać Piechotę Łanową (M).";
            }
            return null;
        }
    },

    // "Żeby wystawić Pospolite Ruszenie po Husarsku nie można wystawić Piechoty Łanowej."
    "hus_no_lanowa": {
        validate: (activeUnits) => {
             const hasHussars = activeUnits.some(u => u.unitId.includes("pospolite_hus"));
             const hasLanowa = activeUnits.some(u => u.unitId.includes("piechota_lanowa"));
             
             if (hasHussars && hasLanowa) {
                 return "Zasada 'Ograniczenie Husarskie': Nie można łączyć Pospolitego Ruszenia po Husarsku z Piechotą Łanową.";
             }
             return null;
        }
    },

    // "Żeby wystawić Pospolite Ruszenie po Husarsku w rozmiarze M należy wystawić przynajmniej 2 jednostki Pospolitego Ruszenia w rozmiarze L (M)."
    "hus_m_req_pospolite_l_x2": {
         validate: (activeUnits) => {
             const hasHussarsM = activeUnits.some(u => u.unitId === "cro_pospolite_hus_m");
             if (!hasHussarsM) return null;
             
             const pospoliteLCount = activeUnits.filter(u => u.unitId === "cro_pospolite_l").length;
             
             if (pospoliteLCount < 2) {
                 return "Zasada 'Wymagania Husarskie M': Pospolite Ruszenie po Husarsku (M) wymaga przynajmniej 2 jednostek Pospolitego Ruszenia (L).";
             }
             return null;
         }
    },

    "chlopscy_szpiedzy": {
        modifyStats: (stats, activeUnits) => {
            const peasantCount = activeUnits.filter(u => u.unitId.includes("czer")).length;

            if (peasantCount > 0) {
                return {
                    recon: (stats.recon || 0) + peasantCount,
                    awareness: (stats.awareness || 0) + 1
                };
            }
            return {
                recon: (stats.recon || 0),
                awareness: (stats.awareness || 0)
            };
        }
    }
};

// --- DEFINICJE OPISÓW (Teksty dla gracza) ---
export const REGIMENT_RULES_DEFINITIONS = {
  "allah_allah": {
    title: "Allah! Allah!",
    description: "Zasada działania opisana w podręcznikach do gry Ogniem i Mieczem."
  },
  "z_calego_imperium": {
    title: "Z całego Imperium zebrani (1)",
    description: "Zasada działania opisana w podręcznikach do gry Ogniem i Mieczem."
  },
  "sipahi_better_equipment": {
    title: "Ulepszenia sipahów",
    description: "Sipahowie mają ulepszenie Lepsze uzbrojenie ochronne i Weterani"
  },
  "aga_is_dizbar": {
    title: "Aga ma statystyki Dizbara",
    description: "Dowódca tego pułku korzysta ze statystyk i zasad specjalnych Dizbara zamiast standardowego Agi."
  },
  "kethuda_is_aga": {
    title: "Kethuda ma statystyki Agi",
    description: "Kethuda w tym pułku posiada statystyki Agi (G1)."
  },
  "posluch_kor": {
    title: "Posłuch",
    description: "Każdy Pułkownik z Partii Wolontarskiej, raz podczas wydawania rozkazu jednostce Wolontarzy może pominąć zasadę Niesubordynacja. Gracz musi poinformować przeciwnika w momencie korzystania z tej zasady."
  },
  "pospolitacy": {
    title: "Pospolitacy",
    description: "Zasada specjalna opisana w podręczniku (1)."
  },
  "lanowa_makes_mixed": {
    title: "Piechota Łanowa",
    description: "Jeżeli wystawisz Piechotę łanową, pułk staje się Mieszany."
  },
  "artillery_req_lanowa_m": {
    title: "Wymagania Artylerii",
    description: "Żeby wystawić Lekkie działa należy wystawić przynajmniej jedną jednostkę Piechoty Łanowej w rozmiarze M."
  },
  "hus_no_lanowa": {
    title: "Ograniczenie Husarskie",
    description: "Żeby wystawić Pospolite Ruszenie po Husarsku nie można wystawić Piechoty Łanowej."
  },
  "hus_m_req_pospolite_l_x2": {
    title: "Wymagania Husarskie M",
    description: "Żeby wystawić Pospolite Ruszenie po Husarsku w rozmiarze M należy wystawić przynajmniej 2 jednostki Pospolitego Ruszenia w rozmiarze L (M)."
  },
  "roznorodne_wyposazenie": {
    title: "Różnorodne wyposażenie",
    description: "Zasada specjalna opisana w podręczniku (1)."
  },
  "posluch_cos": {
        title: "Posłuch",
        description: "Raz podczas wydawania rozkazu jednostce można pominąć zasadę Niesubordynacja. Gracz musi poinformować przeciwnika w momencie korzystania z tej zasady."
    },

    "chlopscy_szpiedzy": {
        title: "Chłopscy szpiedzy",
        description: "Wystawiając Pułk Czerni, Dywizja dostaje dodatkowo tyle wartości wywiadu, ile Jednostek Czerni zostało wystawionych i +1 Czujności"
    },
};

// --- HELPERS ---

export const validateRegimentRules = (activeUnits, regimentDefinition) => {
    const errors = [];
    if (!regimentDefinition?.special_rules) return errors;

    // Przyjmujemy activeUnits z zewnątrz, aby uniknąć cyklicznego importu collectRegimentUnits
    regimentDefinition.special_rules.forEach(ruleId => {
        const ruleImpl = REGIMENT_RULES_REGISTRY[ruleId];
        if (ruleImpl && ruleImpl.validate) {
            const error = ruleImpl.validate(activeUnits);
            if (error) errors.push(error);
        }
    });
    return errors;
};

export const applyRegimentRuleStats = (baseStats, activeUnits, regimentDefinition) => {
    if (!regimentDefinition?.special_rules) return baseStats;

    let newStats = { ...baseStats };

    regimentDefinition.special_rules.forEach(ruleId => {
        const ruleImpl = REGIMENT_RULES_REGISTRY[ruleId];
        if (ruleImpl && ruleImpl.modifyStats) {
            const mods = ruleImpl.modifyStats(newStats, activeUnits);
            if (mods) {
                newStats = { ...newStats, ...mods };
            }
        }
    });
    return newStats;
};

export const getRegimentRulesDescriptions = (regimentDefinition) => {
    if (!regimentDefinition?.special_rules) return [];
    
    return regimentDefinition.special_rules.map(ruleId => {
        const def = REGIMENT_RULES_DEFINITIONS[ruleId];
        if (!def) return null;
        return { id: ruleId, title: def.title, description: def.description };
    }).filter(Boolean);
};