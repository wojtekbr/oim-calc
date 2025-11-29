import { useState, useMemo } from "react";
import { calculateRegimentStats } from "../utils/armyMath";
import { IDS } from "../constants";

export const useRegimentSelectorLogic = ({
  configuredDivision,
  setConfiguredDivision,
  getRegimentDefinition,
  additionalUnitsDefinitions,
  unitsMap,
  faction
}) => {
  const [playerName, setPlayerName] = useState("");
  const [divisionCustomName, setDivisionCustomName] = useState("");

  const regimentsList = useMemo(() => {
    if (!configuredDivision) return [];
    const { base, additional } = configuredDivision;
    return [
      ...base.map(r => ({ ...r, positionKey: `base/${r.index}` })),
      ...additional.map(r => ({ ...r, positionKey: `additional/${r.index}` })),
    ].filter(r => r.id !== IDS.NONE);
  }, [configuredDivision]);

  const purchasedUnitsDataMap = useMemo(() => {
    if (!configuredDivision) return {};
    const map = {};
    configuredDivision.supportUnits.forEach((su, index) => {
      map[su.id] = { ...su, index };
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

  // Handlers
  const handleBuySupportUnit = (unitId, remainingPoints) => {
    if (purchasedUnitsDataMap[unitId]) {
      // Sprzedaż
      setConfiguredDivision(prev => ({
        ...prev,
        supportUnits: prev.supportUnits.filter(su => su.id !== unitId)
      }));
      return;
    }

    // Kupno
    const unitDef = unitsMap[unitId];
    if (unitDef && unitDef.pu_cost) {
      if (remainingPoints - unitDef.pu_cost < 0) {
        alert(`Brak Punktów Ulepszeń. Koszt: ${unitDef.pu_cost}, Pozostało: ${remainingPoints}`);
        return;
      }
    }

    setConfiguredDivision(prev => ({
      ...prev,
      supportUnits: [
        ...prev.supportUnits,
        { id: unitId, assignedTo: null }
      ]
    }));
  };

  const handleAssignSupportUnit = (unitId, positionKey) => {
    const unitData = purchasedUnitsDataMap[unitId];
    if (!unitData) return;
    const unitIndex = unitData.index;

    if (!positionKey) {
      setConfiguredDivision(prev => {
        const newSupportUnits = [...prev.supportUnits];
        newSupportUnits[unitIndex] = { ...newSupportUnits[unitIndex], assignedTo: null };
        return { ...prev, supportUnits: newSupportUnits };
      });
      return;
    }

    const [group, index] = positionKey.split('/');
    setConfiguredDivision(prev => {
      const newSupportUnits = [...prev.supportUnits];
      newSupportUnits[unitIndex] = {
        ...newSupportUnits[unitIndex],
        assignedTo: { group, index: parseInt(index, 10), positionKey }
      };
      return { ...prev, supportUnits: newSupportUnits };
    });
  };

  const handleRegimentChange = (groupKey, index, newRegimentId) => {
    setConfiguredDivision((prev) => {
      const group = prev[groupKey];
      const newGroup = [...group];
      const newSupportUnits = [...prev.supportUnits];

      const config = { base: {}, additional: {}, improvements: {}, isVanguard: false };
      const def = getRegimentDefinition(newRegimentId);
      
      if (def && def.structure && def.structure.base) {
         Object.entries(def.structure.base).forEach(([slotKey, options]) => {
             const isOptional = slotKey.toLowerCase().startsWith('optional');
             if (!isOptional && Array.isArray(options) && options.length > 0) {
                 // default selection logic handled deep in editor usually
             }
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
      }

      if (groupKey === 'additional') {
        for (let i = index + 1; i < newGroup.length; i++) {
          const nextPosKey = `additional/${i}`;
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

  const handleVanguardToggle = (groupKey, index) => {
    setConfiguredDivision(prev => {
      const newGroup = [...prev[groupKey]];
      const currentRegiment = newGroup[index];
      newGroup[index] = {
        ...currentRegiment,
        config: {
          ...currentRegiment.config,
          isVanguard: !currentRegiment.config.isVanguard
        }
      };
      return { ...prev, [groupKey]: newGroup };
    });
  };
  
  const mainForceKey = useMemo(() => {
     if (!configuredDivision) return null;
     let maxCost = -1;
     let mainKey = null;

     const allRegiments = [
         ...configuredDivision.base.map(r => ({ ...r, key: `base/${r.index}` })),
         ...configuredDivision.additional.map(r => ({ ...r, key: `additional/${r.index}` }))
     ].filter(r => r.id !== IDS.NONE);

     allRegiments.forEach(reg => {
         const stats = calculateRegimentStats(reg.config, reg.id, configuredDivision, faction, getRegimentDefinition);
         if (stats.cost > maxCost) {
             maxCost = stats.cost;
             mainKey = reg.key;
         }
     });
     return mainKey;
  }, [configuredDivision, faction, getRegimentDefinition]);

  return {
    state: {
      playerName, setPlayerName,
      divisionCustomName, setDivisionCustomName,
      regimentsList, purchasedUnitsDataMap, unitsRulesMap, mainForceKey
    },
    handlers: {
      handleBuySupportUnit, handleAssignSupportUnit,
      handleRegimentChange, handleRegimentNameChange, handleVanguardToggle
    }
  };
};