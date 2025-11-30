import { useState, useMemo } from "react";
import { calculateRegimentStats, calculateMainForceKey, validateVanguardCost, validateAlliedCost } from "../utils/armyMath"; // FIX: Import
import { IDS, GROUP_TYPES } from "../constants";
import { useArmyData } from "../context/ArmyDataContext";
import { checkSupportUnitRequirements } from "../utils/divisionRules";

export const useRegimentSelectorLogic = ({
  configuredDivision,
  setConfiguredDivision,
  getRegimentDefinition,
  additionalUnitsDefinitions,
  unitsMap,
  faction
}) => {
  const { improvements } = useArmyData();
  const [playerName, setPlayerName] = useState("");
  const [divisionCustomName, setDivisionCustomName] = useState("");

  // ... (regimentsList, purchasedSlotsMap, unitsRulesMap - BEZ ZMIAN, skopiuj z poprzedniego pliku) ...
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
    additionalUnitsDefinitions.forEach(item => {
      if (typeof item === 'object' && item.name && !item.type) {
        map[item.name] = item.assignment_rules || {};
      }
      else if (typeof item === 'string') {
        map[item] = {};
      }
    });
    return map;
  }, [additionalUnitsDefinitions]);

  // ... (handleBuySupportUnit, handleRemoveSupportUnit, handleAssignSupportUnit - BEZ ZMIAN) ...
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

  const handleRemoveSupportUnit = (supportUnitIndex) => {
      setConfiguredDivision(prev => {
          const newSupportUnits = [...prev.supportUnits];
          newSupportUnits.splice(supportUnitIndex, 1);
          return { ...prev, supportUnits: newSupportUnits };
      });
  };

  const handleAssignSupportUnit = (supportUnitIndex, positionKey) => {
    if (positionKey === "") {
        setConfiguredDivision(prev => {
            const newSupportUnits = [...prev.supportUnits];
            newSupportUnits[supportUnitIndex] = { ...newSupportUnits[supportUnitIndex], assignedTo: null };
            return { ...prev, supportUnits: newSupportUnits };
        });
        return;
    }
    const [group, index] = positionKey.split('/');
    setConfiguredDivision(prev => {
      const newSupportUnits = [...prev.supportUnits];
      newSupportUnits[supportUnitIndex] = {
        ...newSupportUnits[supportUnitIndex],
        assignedTo: { group, index: parseInt(index, 10), positionKey }
      };
      return { ...prev, supportUnits: newSupportUnits };
    });
  };

  // --- ZMODYFIKOWANY HANDLER ZMIANY PUŁKU ---
  const handleRegimentChange = (groupKey, index, newRegimentId) => {
    // 1. Symulacja
    const tempDivision = JSON.parse(JSON.stringify(configuredDivision));
    const groupArr = tempDivision[groupKey];
    
    const newConfig = { 
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

    const def = getRegimentDefinition(newRegimentId);
    if (def && def.structure && def.structure.base) {
         Object.entries(def.structure.base).forEach(([slotKey, options]) => {
             if (slotKey === 'optional') return;
             const pods = options;
             newConfig.baseSelections[slotKey] = pods.map(pod => {
                 const opts = Object.values(pod).map(u => u?.id).filter(Boolean);
                 return opts.length > 0 ? opts[0] : null;
             });
         });
    }

    groupArr[index] = {
        ...groupArr[index],
        id: newRegimentId,
        customName: "",
        config: newConfig
    };

    if (groupKey === GROUP_TYPES.ADDITIONAL) {
        for (let i = index + 1; i < groupArr.length; i++) {
            groupArr[i] = { ...groupArr[i], id: IDS.NONE, customName: "", config: {} };
        }
    }

    // 2. Walidacja Supportu
    const unitsToRemoveIndices = [];
    const unitsToRemoveNames = [];

    tempDivision.supportUnits.forEach((su, suIdx) => {
        let unitConfig = null;
        if (su.definitionIndex !== undefined) {
            unitConfig = additionalUnitsDefinitions[su.definitionIndex];
        } else {
             unitConfig = additionalUnitsDefinitions.find(u => 
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

    // 3. Walidacja Vanguard Cost
    const vanguardCheck = validateVanguardCost(tempDivision, unitsMap, faction, getRegimentDefinition, improvements);
    if (!vanguardCheck.isValid) {
        alert(vanguardCheck.message);
        return;
    }

    // FIX: 4. Walidacja Allied Cost
    const alliedCheck = validateAlliedCost(tempDivision, unitsMap, faction, getRegimentDefinition, improvements);
    if (!alliedCheck.isValid) {
        alert(alliedCheck.message);
        return;
    }

    // 5. Update
    setConfiguredDivision((prev) => {
      const group = prev[groupKey];
      const newGroup = [...group];
      let newSupportUnits = [...prev.supportUnits];

      if (unitsToRemoveIndices.length > 0) {
          newSupportUnits = newSupportUnits.filter((_, idx) => !unitsToRemoveIndices.includes(idx));
      }

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
      
      const def = getRegimentDefinition(newRegimentId);
      if (def && def.structure && def.structure.base) {
         Object.entries(def.structure.base).forEach(([slotKey, options]) => {
             if (slotKey === 'optional') return;
             const pods = options;
             config.baseSelections[slotKey] = pods.map(pod => {
                 const opts = Object.values(pod).map(u => u?.id).filter(Boolean);
                 return opts.length > 0 ? opts[0] : null;
             });
         });
      }

      newGroup[index] = {
        ...newGroup[index],
        id: newRegimentId,
        customName: "",
        config: config,
      };

      const positionKey = `${groupKey}/${index}`;
      
      if (newRegimentId === IDS.NONE) {
        newSupportUnits.forEach((su, i) => {
          if (su.assignedTo?.positionKey === positionKey) {
            newSupportUnits[i] = { ...su, assignedTo: null };
          }
        });
      } else {
           newSupportUnits.forEach((su, i) => {
            if (su.assignedTo?.positionKey === positionKey) {
              newSupportUnits[i] = { ...su, assignedTo: null };
            }
          });
      }

      if (groupKey === GROUP_TYPES.ADDITIONAL) {
        for (let i = index + 1; i < newGroup.length; i++) {
          const nextPosKey = `${GROUP_TYPES.ADDITIONAL}/${i}`;
          newSupportUnits.forEach((su, sIdx) => {
            if (su.assignedTo?.positionKey === nextPosKey) {
              newSupportUnits[sIdx] = { ...su, assignedTo: null };
            }
          });
          newGroup[i] = { ...newGroup[i], id: IDS.NONE, customName: "", config: {} };
        }
      }

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
      setConfiguredDivision(prev => ({
          ...prev,
          general: unitId
      }));
  };

  const handleMainForceSelect = (positionKey) => {
      setConfiguredDivision(prev => ({
          ...prev,
          preferredMainForceKey: positionKey
      }));
  };

  const mainForceKey = useMemo(() => {
     if (!configuredDivision) return null;
     return calculateMainForceKey(configuredDivision, unitsMap, faction, getRegimentDefinition, improvements);
  }, [configuredDivision, faction, getRegimentDefinition, improvements, unitsMap]);

  return {
    state: {
      playerName, setPlayerName,
      divisionCustomName, setDivisionCustomName,
      regimentsList, 
      purchasedSlotsMap, 
      unitsRulesMap, mainForceKey
    },
    handlers: {
      handleBuySupportUnit, 
      handleAssignSupportUnit,
      handleRemoveSupportUnit,
      handleRegimentChange, 
      handleRegimentNameChange,
      handleGeneralChange,
      handleMainForceSelect
    }
  };
};