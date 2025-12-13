import { useState, useEffect, useMemo } from "react";
import { IDS, GROUP_TYPES } from "../constants";
import { useArmyData } from "../context/ArmyDataContext";
import { 
    canUnitTakeImprovement, 
    calculateSingleImprovementIMPCost, 
    calculateRegimentStats,
    collectRegimentUnits,
    calculateMainForceKey,
    // Importujemy funkcję do liczenia efektywnych (płatnych) slotów
    calculateEffectiveImprovementCount
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

  // Priorytet dla propsa z App.jsx
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
      const tmpDivision = JSON.parse(JSON.stringify(configuredDivision));
      tmpDivision[regimentGroup][regimentIndex].config = currentLocalConfig;

      const rawStats = calculateRegimentStats(
          currentLocalConfig,
          regiment.id,
          tmpDivision,
          unitsMap,
          getRegimentDefinition,
          commonImprovements
      );

      const mainForceKey = calculateMainForceKey(
          tmpDivision,
          unitsMap,
          faction,
          getRegimentDefinition,
          commonImprovements
      );

      const currentKey = `${regimentGroup}/${regimentIndex}`;
      const isMainForce = mainForceKey === currentKey;

      return {
          totalRecon: rawStats.recon,
          totalMotivation: rawStats.motivation + (isMainForce ? 1 : 0),
          totalActivations: rawStats.activations + (isMainForce ? 1 : 0),
          totalOrders: rawStats.orders,
          totalAwareness: rawStats.awareness,
          regimentType: rawStats.regimentType,
          cost: rawStats.cost,
          isMainForce
      };
  }, [currentLocalConfig, regiment.id, configuredDivision, unitsMap, getRegimentDefinition, commonImprovements, faction, regimentGroup, regimentIndex]);

  const totalCost = stats.cost;

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
        const rivalKey = `${rivalType}/${groupKey}`;

        const willEnable = newValue !== null;

        setOptionalEnabled(prev => {
            const next = { ...prev };
            next[targetKey] = willEnable;

            if (willEnable) {
                next[rivalKey] = false;
            }
            return next;
        });

        setOptionalSelections(prev => {
            const next = { ...prev };
            let arr = next[mapKey] ? [...next[mapKey]] : [];
            if (arr.length <= index) {
                const groupSize = (type === GROUP_TYPES.BASE ? base : additional).optional?.length || 0;
                const newArr = Array(groupSize).fill(null);
                arr.forEach((v, i) => newArr[i] = v);
                arr = newArr;
            }
            arr[index] = newValue;
            next[mapKey] = arr;
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
        
        const currentUnitImps = improvements[positionKey] || [];
        const isAdding = !currentUnitImps.includes(impId);

        if (isAdding && regImpDef?.max_amount) {
            const nextImprovements = { ...improvements };
            const nextList = [...(nextImprovements[positionKey] || []), impId];
            nextImprovements[positionKey] = nextList;

            const nextConfig = {
                ...currentLocalConfig,
                improvements: nextImprovements
            };

            // FIX: Przekazujemy divisionDefinition, aby uwzględnić zasady globalne (darmowe ulepszenia)
            const nextEffectiveCount = calculateEffectiveImprovementCount(nextConfig, regiment, impId, divisionDefinition);

            if (nextEffectiveCount > regImpDef.max_amount) {
                alert(`Osiągnięto limit ulepszeń "${impId}" w tym pułku (${regImpDef.max_amount}).`);
                return;
            }
        }

        setImprovements((prev) => {
            const cur = Array.isArray(prev[positionKey]) ? [...prev[positionKey]] : [];
            if (cur.includes(impId)) {
                return { ...prev, [positionKey]: cur.filter(x => x !== impId) };
            } else {
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

    const activeUnits = collectRegimentUnits(currentLocalConfig, regiment);
    const usedImprovements = new Set();
    activeUnits.forEach(u => {
        (improvements[u.key] || []).forEach(impId => usedImprovements.add(impId));
    });

    for (const impId of usedImprovements) {
        const regImpDef = unitLevelImprovements.find(i => i.id === impId);
        if (regImpDef?.max_amount) {
            // FIX: Przekazujemy divisionDefinition do walidacji limitów (obsługa zasad globalnych)
            const effectiveCount = calculateEffectiveImprovementCount(currentLocalConfig, regiment, impId, divisionDefinition);
            
            if (effectiveCount > regImpDef.max_amount) {
                const commonDef = commonImprovements[impId];
                const name = regImpDef.name || commonDef?.name || impId;
                alert(`Błąd zapisu: Przekroczono limit ulepszenia "${name}".\nDozwolone: ${regImpDef.max_amount}, Obecnie: ${effectiveCount} (płatnych).\n\nProszę usunąć nadmiarowe ulepszenia.`);
                return; 
            }
        }
    }

    const tempDivisionForCheck = JSON.parse(JSON.stringify(configuredDivision));
    const groupRef = tempDivisionForCheck[regimentGroup];

    groupRef[regimentIndex].config = currentLocalConfig;

    const artDefs = divisionDefinition.division_artillery || [];
    const addDefs = divisionDefinition.additional_units || [];
    const allSupportDefinitions = [...artDefs, ...addDefs];

    const keptSupportUnits = [];
    const removedNames = [];

    (tempDivisionForCheck.supportUnits || []).forEach(su => {
        let unitConfig = null;

        if (su.definitionIndex !== undefined) {
            unitConfig = allSupportDefinitions[su.definitionIndex];
        } else {
            unitConfig = allSupportDefinitions.find(u =>
                (typeof u === 'string' && u === su.id) ||
                (u.name === su.id)
            );
        }

        if (unitConfig) {
            const check = checkSupportUnitRequirements(unitConfig, tempDivisionForCheck, getRegimentDefinition);
            if (check.isAllowed) {
                keptSupportUnits.push(su);
            } else {
                const reasonMsg = check.reason ? ` (${check.reason})` : "";
                removedNames.push(`${getUnitName(su.id)}${reasonMsg}`);
            }
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