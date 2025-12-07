import { useState, useEffect, useMemo } from "react";
import { IDS, GROUP_TYPES } from "../constants";
import { useArmyData } from "../context/ArmyDataContext";
import { 
    canUnitTakeImprovement, 
    calculateSingleImprovementIMPCost, 
    calculateRegimentStats,
    collectRegimentUnits,
    calculateMainForceKey // NOWY IMPORT
} from "../utils/armyMath";
import { calculateRuleBonuses, checkSupportUnitRequirements } from "../utils/divisionRules";
import { validateRegimentRules } from "../utils/regimentRules";

export const useRegimentLogic = ({
  regiment,
  configuredDivision,
  setConfiguredDivision,
  regimentGroup,
  regimentIndex,
  onBack,
  calculateImprovementPointsCost,
  calculateTotalSupplyBonus,
  remainingImprovementPoints,
  divisionDefinition: propDivisionDefinition,
  unitsMap,
  getRegimentDefinition,
  faction
}) => {
  const { improvements: commonImprovements } = useArmyData();

  const divisionDefinition = propDivisionDefinition || regiment.divisionDefinition || {};
  const structure = regiment.structure || {};
  const base = structure.base || {};
  const additional = structure.additional || {};
  const currentConfig = configuredDivision?.[regimentGroup]?.[regimentIndex]?.config || {};
  const customCostDefinition = additional?.unit_custom_cost;
  const customCostSlotName = customCostDefinition?.[0]?.depends_on;
  const unitLevelImprovements = regiment.unit_improvements || [];
  const regimentLevelImprovements = regiment.regiment_improvements || [];

  const [baseSelections, setBaseSelections] = useState(() => (currentConfig.baseSelections || {}));
  const [additionalSelections, setAdditionalSelections] = useState(() => (currentConfig.additionalSelections || {}));
  const [additionalEnabled, setAdditionalEnabled] = useState(() => !!currentConfig.additionalEnabled || false);
  const [optionalEnabled, setOptionalEnabled] = useState(() => (currentConfig.optionalEnabled || {}));
  const [optionalSelections, setOptionalSelections] = useState(() => (currentConfig.optionalSelections || {}));
  const [selectedAdditionalCustom, setSelectedAdditionalCustom] = useState(currentConfig.additionalCustom || null);
  const [improvements, setImprovements] = useState(currentConfig.improvements || {});
  const [regimentImprovements, setRegimentImprovements] = useState(currentConfig.regimentImprovements || []);

  const getUnitName = (id) => unitsMap?.[id]?.name || id;
  const getUnitCost = (id) => unitsMap?.[id]?.cost || 0;
  
  const getFinalUnitCost = (id, isCustom) => {
    if (!id) return 0;
    if (isCustom && customCostDefinition) {
      const found = customCostDefinition.find((d) => d.id === id);
      if (found && typeof found.cost === "number") return found.cost;
    }
    return getUnitCost(id);
  };
  
  const groupKeys = (obj) => (obj && typeof obj === "object" ? Object.keys(obj) : []);

  useEffect(() => {
    const initForGroup = (groupObj, prevSelections = {}) => {
      const out = { ...prevSelections };
      groupKeys(groupObj).forEach((gk) => {
        const arr = groupObj[gk] || [];
        const sel = Array.isArray(out[gk]) ? [...out[gk]] : [];
        for (let i = 0; i < arr.length; i++) {
          if (sel[i] !== undefined && sel[i] !== null) continue;
          
          const pod = arr[i] || {};
          const optionKeys = Object.keys(pod);
          
          if (optionKeys.length > 0) {
              sel[i] = optionKeys[0];
          } else {
              sel[i] = null;
          }
        }
        out[gk] = sel;
      });
      return out;
    };

    setBaseSelections(initForGroup(base, currentConfig.baseSelections || {}));
    setAdditionalSelections(initForGroup(additional, currentConfig.additionalSelections || {}));
    
    const optSelInit = { ...(currentConfig.optionalSelections || {}) };
    const optEnabledInit = { ...(currentConfig.optionalEnabled || {}) };
    
    const initOptionalGroup = (groupType, groupObj) => {
        if (Array.isArray(groupObj.optional)) {
            const key = `${groupType}/optional`;
            
            if (!optSelInit[key]) {
                optSelInit[key] = groupObj.optional.map(pod => {
                    const keys = Object.keys(pod);
                    return keys.length > 0 ? keys[0] : null;
                });
            } else {
                optSelInit[key] = optSelInit[key].map((currentVal, idx) => {
                    if (currentVal) return currentVal;
                    const pod = groupObj.optional[idx] || {};
                    const keys = Object.keys(pod);
                    return keys.length > 0 ? keys[0] : null;
                });
            }

            if (optEnabledInit[key] === undefined) optEnabledInit[key] = !!currentConfig.optionalEnabled?.[key] || false;
        }
    }

    initOptionalGroup(GROUP_TYPES.BASE, base);
    initOptionalGroup(GROUP_TYPES.ADDITIONAL, additional);
    
    setOptionalSelections(optSelInit);
    setOptionalEnabled(optEnabledInit);
    setAdditionalEnabled(!!currentConfig.additionalEnabled);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regiment.id]);

  const assignedSupportUnits = useMemo(() => {
    const regimentPositionKey = `${regimentGroup}/${regimentIndex}`;
    return (configuredDivision.supportUnits || [])
        .filter(su => su.assignedTo?.positionKey === regimentPositionKey);
  }, [configuredDivision.supportUnits, regimentGroup, regimentIndex]);

  const hasAdditionalBaseSelection = useMemo(() => {
      return Object.entries(additionalSelections).some(([key, arr]) => {
          if (key === GROUP_TYPES.OPTIONAL) return false;
          return Array.isArray(arr) && arr.some(val => val !== null && val !== IDS.NONE);
      });
  }, [additionalSelections]);

  const currentLocalConfig = useMemo(() => {
      return {
          baseSelections,
          additionalSelections,
          additionalCustom: selectedAdditionalCustom,
          additionalEnabled,
          optionalEnabled,
          optionalSelections,
          improvements,
          regimentImprovements,
          isVanguard: currentConfig.isVanguard
      };
  }, [baseSelections, additionalSelections, selectedAdditionalCustom, additionalEnabled, optionalEnabled, optionalSelections, improvements, regimentImprovements, currentConfig.isVanguard]);

  const stats = useMemo(() => {
      // 1. Tworzymy tymczasową dywizję z AKTUALNYM stanem edytowanego pułku
      // Musimy to zrobić, aby calculateMainForceKey wzięło pod uwagę zmiany kosztów, które właśnie robisz
      const tmpDivision = JSON.parse(JSON.stringify(configuredDivision));
      tmpDivision[regimentGroup][regimentIndex].config = currentLocalConfig;

      // 2. Liczymy statystyki bazowe pułku
      const rawStats = calculateRegimentStats(
          currentLocalConfig,
          regiment.id,
          tmpDivision,
          unitsMap,
          getRegimentDefinition,
          commonImprovements
      );

      // 3. Sprawdzamy czy w NOWYM układzie sił ten pułk jest Siłami Głównymi
      const mainForceKey = calculateMainForceKey(
          tmpDivision, 
          unitsMap, 
          faction, 
          getRegimentDefinition, 
          commonImprovements
      );
      
      const currentKey = `${regimentGroup}/${regimentIndex}`;
      const isMainForce = mainForceKey === currentKey;

      // 4. Aplikujemy bonusy (zazwyczaj +1 Motywacja, +1 Aktywacja)
      return {
          totalRecon: rawStats.recon,
          totalMotivation: rawStats.motivation + (isMainForce ? 1 : 0),
          totalActivations: rawStats.activations + (isMainForce ? 1 : 0),
          totalOrders: rawStats.orders,
          totalAwareness: rawStats.awareness,
          regimentType: rawStats.regimentType,
          cost: rawStats.cost,
          isMainForce // Zwracamy flagę, żeby wyświetlić badge w UI
      };
  }, [currentLocalConfig, regiment.id, configuredDivision, unitsMap, getRegimentDefinition, commonImprovements, faction, regimentGroup, regimentIndex]);

  const totalCost = stats.cost;

  // Obliczanie błędów zasad pułkowych
  const regimentRuleErrors = useMemo(() => {
      const activeUnits = collectRegimentUnits(currentLocalConfig, regiment);
      return validateRegimentRules(activeUnits, regiment);
  }, [currentLocalConfig, regiment]);

  const newRemainingPointsAfterLocalChanges = useMemo(() => {
    if (remainingImprovementPoints === undefined) return 0;
    const totalDivisionLimit = divisionDefinition.improvement_points || 0;
    
    const tmp = JSON.parse(JSON.stringify(configuredDivision));
    tmp[regimentGroup][regimentIndex].config = currentLocalConfig;

    const ruleBonuses = calculateRuleBonuses(tmp, divisionDefinition, unitsMap, getRegimentDefinition);
    const dynamicSupplyBonus = calculateTotalSupplyBonus(tmp, unitsMap, getRegimentDefinition);
    const dynamicLimit = totalDivisionLimit + dynamicSupplyBonus + ruleBonuses.improvementPoints;
    const totalUsedWithLocalChanges = calculateImprovementPointsCost(tmp, unitsMap, getRegimentDefinition, commonImprovements);
    return dynamicLimit - totalUsedWithLocalChanges;
  }, [currentLocalConfig, configuredDivision, calculateTotalSupplyBonus, calculateImprovementPointsCost, divisionDefinition, remainingImprovementPoints, regimentGroup, regimentIndex, unitsMap, getRegimentDefinition, commonImprovements]);

  const handleSelectInPod = (type, groupKey, index, optionKey) => {
    let currentSelection = null;
    const isOptionalGroup = groupKey === GROUP_TYPES.OPTIONAL;
    
    if (isOptionalGroup) {
        currentSelection = optionalSelections[`${type}/optional`]?.[index];
    } else if (type === GROUP_TYPES.BASE) {
        currentSelection = baseSelections[groupKey]?.[index];
    } else if (type === GROUP_TYPES.ADDITIONAL) {
        currentSelection = additionalSelections[groupKey]?.[index];
    }

    const isDeselecting = currentSelection === optionKey;
    
    const groupDef = type === GROUP_TYPES.BASE ? base : additional;
    const pod = groupDef[groupKey]?.[index];
    const optionDef = pod?.[optionKey];
    
    const isToggleable = !!optionDef?.is_toggle;

    if (isDeselecting && !isOptionalGroup && !isToggleable) return;

    const newValue = (isDeselecting && (isOptionalGroup || isToggleable)) ? null : optionKey;
    
    if (newValue !== currentSelection) {
        setImprovements((p) => { 
            const m = { ...p }; 
            const prefix = isOptionalGroup 
                ? `${type}/optional/${index}` 
                : `${type}/${groupKey}/${index}`;
            Object.keys(m).forEach(k => {
                if (k.startsWith(prefix)) delete m[k];
            });
            return m; 
        });
    }

    if (isOptionalGroup) {
        const mapKey = `${type}/optional`;
        const targetKey = mapKey;
        
        const rivalType = type === GROUP_TYPES.BASE ? GROUP_TYPES.ADDITIONAL : GROUP_TYPES.BASE;
        const rivalKey = `${rivalType}/optional`;

        const willEnable = !optionalEnabled[targetKey];

        setOptionalEnabled(prev => {
            const next = { ...prev };
            next[targetKey] = willEnable;
            
            if (willEnable) {
                next[rivalKey] = false;
            }
            return next;
        });
        
        setImprovements(prev => {
            const m = { ...prev };
            if (!willEnable) {
               Object.keys(m).forEach(k => {
                  if (k.startsWith(`${type}/${groupKey}/`)) delete m[k];
              });
            }
            if (willEnable) {
               Object.keys(m).forEach(k => {
                  if (k.startsWith(`${rivalType}/${groupKey}/`)) delete m[k];
              });
          }
          return m;
       });
    } else if (type === GROUP_TYPES.BASE) {
        setBaseSelections(prev => {
            const next = { ...prev };
            const arr = [...(next[groupKey] || [])];
            arr[index] = newValue;
            next[groupKey] = arr;
            return next;
        });
    } else if (type === GROUP_TYPES.ADDITIONAL) {
        setAdditionalSelections(prev => {
            const next = { ...prev };
            const groupDef = additional[groupKey] || [];
            let arr = next[groupKey] ? [...next[groupKey]] : Array(groupDef.length).fill(null);
            arr[index] = newValue;
            next[groupKey] = arr;
            return next;
        });
    }
  };

  const handleCustomSelect = (unitId) => {
    const isDeselecting = selectedAdditionalCustom === unitId;
    const next = isDeselecting ? null : unitId;
    setSelectedAdditionalCustom(next);
    
    if (next && !additionalEnabled) setAdditionalEnabled(true);
    
    if (isDeselecting) {
         setImprovements((p) => { const m = { ...p }; delete m[`additional/${customCostSlotName}_custom`]; return m; });
         const hasAnyAdditional = hasAdditionalBaseSelection;
         if (!hasAnyAdditional) {
             setAdditionalEnabled(false);
         }
    }
  };

  const handleImprovementToggle = (positionKey, unitId, impId) => {
    const unitDef = unitsMap[unitId];
    if (unitDef?.rank === "group") return;
    const canTake = canUnitTakeImprovement(unitDef, impId, regiment);
    if (!canTake) return;
    
    const regImpDef = unitLevelImprovements.find(i => i.id === impId);
    if (regImpDef?.max_amount === 1) {
        const usedElsewhere = Object.entries(improvements).some(([k, arr]) => k !== positionKey && arr.includes(impId));
        if (usedElsewhere) {
            alert(`Ulepszenie "${impId}" może być użyte tylko raz w pułku.`);
            return;
        }
    }

    setImprovements((prev) => {
      const cur = Array.isArray(prev[positionKey]) ? [...prev[positionKey]] : [];
      if (cur.includes(impId)) {
        return { ...prev, [positionKey]: cur.filter(x => x !== impId) };
      } else {
        const cost = calculateSingleImprovementIMPCost(unitDef, impId, regiment, commonImprovements);
        if (newRemainingPointsAfterLocalChanges - cost < 0) {
          alert("Brak punktów ulepszeń.");
          return prev;
        }
        return { ...prev, [positionKey]: [...cur, impId] };
      }
    });
  };

  const handleRegimentImprovementToggle = (impId) => {
    setRegimentImprovements((prev) => {
        if (prev.includes(impId)) {
             const idx = prev.lastIndexOf(impId);
             return [...prev.slice(0, idx), ...prev.slice(idx + 1)];
        }
        const impDef = regimentLevelImprovements.find(i => i.id === impId) || commonImprovements[impId];
        const cost = impDef?.cost || 0;
        if (typeof cost === 'number' && newRemainingPointsAfterLocalChanges - cost < 0) {
             alert("Brak punktów ulepszeń.");
             return prev;
        }
        return [...prev, impId];
    });
  };

  const handleToggleOptionalGroup = (type, groupKey) => {
      const targetKey = `${type}/${groupKey}`;
      const rivalType = type === GROUP_TYPES.BASE ? GROUP_TYPES.ADDITIONAL : GROUP_TYPES.BASE;
      const rivalKey = `${rivalType}/${groupKey}`;

      const willEnable = !optionalEnabled[targetKey];

      setOptionalEnabled(prev => {
          const next = { ...prev };
          next[targetKey] = willEnable;
          
          if (willEnable) {
              next[rivalKey] = false;
          }
          return next;
      });
      
      setImprovements(prev => {
          const m = { ...prev };
          if (!willEnable) {
               Object.keys(m).forEach(k => {
                  if (k.startsWith(`${type}/${groupKey}/`)) delete m[k];
              });
          }
          if (willEnable) {
               Object.keys(m).forEach(k => {
                  if (k.startsWith(`${rivalType}/${groupKey}/`)) delete m[k];
              });
          }
          return m;
       });
  };

  const handleToggleAdditional = () => {
      setAdditionalEnabled(prev => {
          const next = !prev;
          if (!next) {
              setImprovements(prevImp => {
                    const nextImp = { ...prevImp };
                    Object.keys(nextImp).forEach(key => {
                        if (key.startsWith("additional/")) delete nextImp[key];
                    });
                    return nextImp;
              });
              setOptionalEnabled(optPrev => ({ ...optPrev, "additional/optional": false }));
              setSelectedAdditionalCustom(null);
          }
          return next;
      });
  };

  const saveAndGoBack = () => {
    if (regimentRuleErrors && regimentRuleErrors.length > 0) {
        alert("Popraw błędy w konfiguracji pułku przed zapisaniem.");
        return;
    }

    const tempDivisionForCheck = JSON.parse(JSON.stringify(configuredDivision));
    const groupRef = tempDivisionForCheck[regimentGroup];
    
    groupRef[regimentIndex].config = currentLocalConfig;
    
    const keptSupportUnits = [];
    const removedNames = [];

    (tempDivisionForCheck.supportUnits || []).forEach(su => {
        let unitConfig = null;
        if (su.definitionIndex !== undefined && divisionDefinition.additional_units) {
            unitConfig = divisionDefinition.additional_units[su.definitionIndex];
        } else {
            unitConfig = divisionDefinition.additional_units?.find(u => 
                (typeof u === 'string' && u === su.id) || 
                (u.name === su.id)
            );
        }
        if (unitConfig) {
            const check = checkSupportUnitRequirements(unitConfig, tempDivisionForCheck, getRegimentDefinition);
            if (check.isAllowed) keptSupportUnits.push(su);
            else removedNames.push(getUnitName(su.id));
        } else {
            keptSupportUnits.push(su);
        }
    });

    if (removedNames.length > 0) {
        const confirmed = window.confirm(
            `Zapisanie zmian spowoduje usunięcie następujących jednostek wsparcia (niespełnione wymagania):\n\n- ${removedNames.join("\n- ")}\n\nCzy chcesz kontynuować?`
        );
        if (!confirmed) return;
    }

    setConfiguredDivision((prev) => {
         const next = JSON.parse(JSON.stringify(prev));
         next[regimentGroup][regimentIndex].config = currentLocalConfig;
         next.supportUnits = keptSupportUnits;
         return next;
    });
    
    onBack();
  };

  return {
    state: {
      baseSelections, additionalSelections, additionalEnabled, 
      optionalEnabled, optionalSelections, selectedAdditionalCustom,
      improvements, regimentImprovements, newRemainingPointsAfterLocalChanges,
      stats, totalCost, assignedSupportUnits, hasAdditionalBaseSelection,
      regimentRuleErrors 
    },
    definitions: {
        structure, base, additional, customCostDefinition, customCostSlotName,
        unitLevelImprovements, regimentLevelImprovements,
        commonImprovements
    },
    handlers: {
        handleSelectInPod, 
        handleCustomSelect, 
        handleImprovementToggle, 
        handleRegimentImprovementToggle,
        handleToggleOptionalGroup, 
        handleToggleAdditional,    
        saveAndGoBack, 
        onBack
    },
    helpers: { getUnitName, getFinalUnitCost, groupKeys }
  };
};