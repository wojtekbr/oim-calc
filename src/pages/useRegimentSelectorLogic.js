import { useState, useMemo } from "react";
import { calculateRegimentStats, calculateMainForceKey } from "../utils/armyMath";
import { IDS, GROUP_TYPES } from "../constants";
import { useArmyData } from "../context/ArmyDataContext";
import { checkSupportUnitRequirements } from "../utils/divisionRules";

export const useRegimentSelectorLogic = ({
  configuredDivision,
  setConfiguredDivision,
  getRegimentDefinition,
  // ZMIANA: Odbieramy dwie listy definicji
  divisionArtilleryDefinitions, 
  additionalUnitsDefinitions,
  unitsMap,
  faction
}) => {
  const { improvements } = useArmyData();
  const [playerName, setPlayerName] = useState("");
  const [divisionCustomName, setDivisionCustomName] = useState("");

  // ZMIANA: Scalamy definicje w jedną listę dla logiki, aby indeksy były unikalne
  const allSupportDefinitions = useMemo(() => {
      return [...(divisionArtilleryDefinitions || []), ...(additionalUnitsDefinitions || [])];
  }, [divisionArtilleryDefinitions, additionalUnitsDefinitions]);

  const regimentsList = useMemo(() => {
    if (!configuredDivision) return [];
    const { vanguard, base, additional } = configuredDivision;
    return [
      ...(vanguard || []).map(r => ({ ...r, positionKey: `${GROUP_TYPES.VANGUARD}/${r.index}` })),
      ...base.map(r => ({ ...r, positionKey: `${GROUP_TYPES.BASE}/${r.index}` })),
      ...additional.map(r => ({ ...r, positionKey: `${GROUP_TYPES.ADDITIONAL}/${r.index}` })),
    ].filter(r => r.id !== IDS.NONE);
  }, [configuredDivision]);

  const purchasedSlotsMap = useMemo(() => {
    if (!configuredDivision) return {};
    const map = {};
    configuredDivision.supportUnits.forEach((su) => {
        if (su.definitionIndex !== undefined) {
            map[su.definitionIndex] = su.id;
        }
    });
    return map;
  }, [configuredDivision]);

  const unitsRulesMap = useMemo(() => {
    const map = {};
    allSupportDefinitions.forEach(item => {
      if (typeof item === 'object' && item.name && !item.type) {
        map[item.name] = item.assignment_rules || {};
      }
      else if (typeof item === 'string') {
        map[item] = {};
      }
    });
    return map;
  }, [allSupportDefinitions]);

  const handleBuySupportUnit = (unitId, definitionIndex, remainingPoints) => {
    setConfiguredDivision(prev => {
        const currentSupportUnits = [...prev.supportUnits];
        const existingIndex = currentSupportUnits.findIndex(su => su.definitionIndex === definitionIndex);
        
        if (existingIndex !== -1 && currentSupportUnits[existingIndex].id === unitId) {
            currentSupportUnits.splice(existingIndex, 1);
            return { ...prev, supportUnits: currentSupportUnits };
        }
        
        if (existingIndex !== -1) {
            const unitDef = unitsMap[unitId];
            if (unitDef && unitDef.pu_cost) {
                 const oldId = currentSupportUnits[existingIndex].id;
                 const oldDef = unitsMap[oldId];
                 const oldCost = oldDef?.pu_cost || 0;
                 
                 if (remainingPoints + oldCost - unitDef.pu_cost < 0) {
                    alert(`Brak Punktów Ulepszeń na zamianę. Potrzebujesz: ${unitDef.pu_cost - oldCost} więcej.`);
                    return prev;
                 }
            }
            currentSupportUnits[existingIndex] = { 
                ...currentSupportUnits[existingIndex], 
                id: unitId,
                assignedTo: null 
            };
            return { ...prev, supportUnits: currentSupportUnits };
        }

        const unitDef = unitsMap[unitId];
        if (unitDef && unitDef.pu_cost) {
            if (remainingPoints - unitDef.pu_cost < 0) {
                alert(`Brak Punktów Ulepszeń. Koszt: ${unitDef.pu_cost}, Pozostało: ${remainingPoints}`);
                return prev;
            }
        }
        currentSupportUnits.push({ 
            id: unitId, 
            definitionIndex: definitionIndex,
            assignedTo: null 
        });
        return { ...prev, supportUnits: currentSupportUnits };
    });
  };

  const handleRemoveSupportUnit = (definitionIndex) => {
      setConfiguredDivision(prev => {
          const newSupportUnits = prev.supportUnits.filter(su => su.definitionIndex !== definitionIndex);
          return { ...prev, supportUnits: newSupportUnits };
      });
  };

  const handleAssignSupportUnit = (definitionIndex, positionKey) => {
    let assignment = null;
    if (positionKey !== "") {
        const [group, idxStr] = positionKey.split('/');
        assignment = { group, index: parseInt(idxStr, 10), positionKey };
    }
    setConfiguredDivision(prev => {
      const newSupportUnits = prev.supportUnits.map(su => {
          if (su.definitionIndex === definitionIndex) {
              return { ...su, assignedTo: assignment };
          }
          return su;
      });
      return { ...prev, supportUnits: newSupportUnits };
    });
  };

  const handleRegimentChange = (groupKey, index, newRegimentId) => {
    const tempDivision = JSON.parse(JSON.stringify(configuredDivision));
    
    // Tworzymy domyślny konfig dla nowego pułku
    const newConfig = { 
        baseSelections: {}, additionalSelections: {}, additionalCustom: null, additionalEnabled: false, 
        optionalEnabled: {}, optionalSelections: {}, improvements: {}, regimentImprovements: [], isVanguard: false 
    };

    const def = getRegimentDefinition(newRegimentId, faction.meta.key);
    if (def && def.structure) {
        if (def.structure.base) {
            Object.entries(def.structure.base).forEach(([slotKey, pods]) => {
                if (slotKey === 'optional') return;
                newConfig.baseSelections[slotKey] = pods.map(pod => Object.keys(pod)[0] || null);
            });
        }
        if (def.structure.additional) {
             Object.entries(def.structure.additional).forEach(([slotKey, pods]) => {
                if (slotKey === 'optional') return;
                newConfig.additionalSelections[slotKey] = pods.map(pod => Object.keys(pod)[0] || null);
             });
        }
    }

    // Aplikujemy zmianę w kopii, aby walidator widział nowy stan
    tempDivision[groupKey][index] = {
        ...tempDivision[groupKey][index],
        id: newRegimentId,
        config: newConfig // Ważne: musimy ustawić config, żeby walidator mógł przeliczyć jednostki
    };

    const unitsToRemoveIndices = [];
    const unitsToRemoveNames = [];

    tempDivision.supportUnits.forEach((su, suIdx) => {
        let unitConfig = null;
        if (su.definitionIndex !== undefined) {
            unitConfig = allSupportDefinitions[su.definitionIndex]; // Używamy scalonej listy definicji
        } else {
             unitConfig = allSupportDefinitions.find(u => 
                (typeof u === 'string' && u === su.id) || 
                (u.name === su.id)
            );
        }

        if (unitConfig) {
            const check = checkSupportUnitRequirements(unitConfig, tempDivision, getRegimentDefinition);
            if (!check.isAllowed) {
                unitsToRemoveIndices.push(suIdx);
                unitsToRemoveNames.push(unitsMap[su.id]?.name || su.id);
            }
        }
    });

    if (unitsToRemoveNames.length > 0) {
        const confirmed = window.confirm(
            `Zmiana pułku spowoduje usunięcie następujących jednostek wsparcia (niespełnione wymagania):\n\n- ${unitsToRemoveNames.join("\n- ")}\n\nCzy chcesz kontynuować?`
        );
        if (!confirmed) return;
    }

    setConfiguredDivision((prev) => {
      const group = prev[groupKey];
      const newGroup = [...group];
      let newSupportUnits = [...prev.supportUnits];

      if (unitsToRemoveIndices.length > 0) {
          newSupportUnits = newSupportUnits.filter((_, idx) => !unitsToRemoveIndices.includes(idx));
      }

      newGroup[index] = {
        ...newGroup[index],
        id: newRegimentId,
        customName: "",
        config: newConfig,
      };

      // Reset przypisania tylko dla tego slotu
      const positionKey = `${groupKey}/${index}`;
      newSupportUnits.forEach((su, i) => {
        if (su.assignedTo?.positionKey === positionKey) {
          newSupportUnits[i] = { ...su, assignedTo: null };
        }
      });

      return { ...prev, [groupKey]: newGroup, supportUnits: newSupportUnits };
    });
  };

  const handleRegimentNameChange = (groupKey, index, newName) => {
    setConfiguredDivision(prev => {
      const newGroup = [...prev[groupKey]];
      newGroup[index] = { ...newGroup[index], customName: newName };
      return { ...prev, [groupKey]: newGroup };
    });
  };

  const handleGeneralChange = (unitId) => {
      setConfiguredDivision(prev => ({ ...prev, general: unitId }));
  };

  const handleMainForceSelect = (positionKey) => {
      setConfiguredDivision(prev => ({ ...prev, preferredMainForceKey: positionKey }));
  };

  const mainForceKey = useMemo(() => {
     if (!configuredDivision) return null;
     return calculateMainForceKey(configuredDivision, unitsMap, faction, (id) => getRegimentDefinition(id, faction.meta.key), improvements);
  }, [configuredDivision, faction, getRegimentDefinition, improvements, unitsMap]);

  return {
    state: {
      playerName, setPlayerName,
      divisionCustomName, setDivisionCustomName,
      regimentsList, purchasedSlotsMap, unitsRulesMap, mainForceKey
    },
    handlers: {
      handleBuySupportUnit, handleAssignSupportUnit, handleRemoveSupportUnit,
      handleRegimentChange, handleRegimentNameChange, handleGeneralChange, handleMainForceSelect
    }
  };
};