import { useState, useEffect, useMemo } from "react";
import { IDS, GROUP_TYPES, RANK_TYPES } from "../constants";
import { useArmyData } from "../context/ArmyDataContext";
import { canUnitTakeImprovement, calculateSingleImprovementIMPCost, validateVanguardCost, validateAlliedCost } from "../utils/armyMath"; // FIX: Import
import { calculateRuleBonuses, checkSupportUnitRequirements } from "../utils/divisionRules";

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
  // ... (Wszystko bez zmian, skopiuj z poprzedniego pliku do saveAndGoBack) ...
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
    const initForGroup = (groupObj, prevSelections = {}, isMandatory = false) => {
      const out = { ...prevSelections };
      groupKeys(groupObj).forEach((gk) => {
        const arr = groupObj[gk] || [];
        const sel = Array.isArray(out[gk]) ? [...out[gk]] : [];
        for (let i = 0; i < arr.length; i++) {
          if (sel[i] !== undefined) continue;
          const pod = arr[i] || {};
          const ids = Object.values(pod).map((v) => v?.id).filter(Boolean);
          if (isMandatory) {
              if (ids.length === 0) sel[i] = null;
              else if (ids.length === 1) sel[i] = ids[0];
              else sel[i] = ids[0];
          } else {
              sel[i] = null;
          }
        }
        out[gk] = sel;
      });
      return out;
    };
    setBaseSelections(initForGroup(base, currentConfig.baseSelections || {}, true));
    setAdditionalSelections(initForGroup(additional, currentConfig.additionalSelections || {}, false));
    const optSelInit = { ...(currentConfig.optionalSelections || {}) };
    const optEnabledInit = { ...(currentConfig.optionalEnabled || {}) };
    const initOptionalGroup = (groupType, groupObj) => {
        if (Array.isArray(groupObj.optional)) {
            const key = `${groupType}/optional`;
            if (!optSelInit[key]) optSelInit[key] = groupObj.optional.map(() => null);
            if (optEnabledInit[key] === undefined) optEnabledInit[key] = !!currentConfig.optionalEnabled?.[key] || false;
        }
    }
    initOptionalGroup(GROUP_TYPES.BASE, base);
    initOptionalGroup(GROUP_TYPES.ADDITIONAL, additional);
    setOptionalSelections(optSelInit);
    setOptionalEnabled(optEnabledInit);
    setAdditionalEnabled(!!currentConfig.additionalEnabled);
  }, [regiment.id]);

  const assignedSupportUnits = useMemo(() => {
    const regimentPositionKey = `${regimentGroup}/${regimentIndex}`;
    return (configuredDivision.supportUnits || [])
        .filter(su => su.assignedTo?.positionKey === regimentPositionKey);
  }, [configuredDivision.supportUnits, regimentGroup, regimentIndex]);

  const hasAdditionalBaseSelection = useMemo(() => {
      return Object.entries(additionalSelections).some(([key, arr]) => {
          if (key === GROUP_TYPES.OPTIONAL) return false;
          return Array.isArray(arr) && arr.some(id => id && id !== IDS.NONE);
      });
  }, [additionalSelections]);

  const collectSelectedUnits = useMemo(() => {
    const entries = [];
    const pushGroup = (type, groupObj, selections, optSelections, optEnabled) => {
      Object.keys(groupObj || {}).forEach((gk) => {
        if (gk === GROUP_TYPES.OPTIONAL) {
          const mapKey = `${type}/optional`;
          if (!optEnabled[mapKey]) return;
          const arr = groupObj.optional || [];
          const selArr = optSelections[mapKey] || [];
          for (let i = 0; i < arr.length; i++) {
            const chosen = selArr[i];
            if (chosen && chosen !== IDS.NONE) entries.push({ key: `${type}/optional/${i}`, id: chosen });
          }
          return;
        }
        const arr = groupObj[gk] || [];
        const selArr = selections[gk] || [];
        for (let i = 0; i < arr.length; i++) {
          const chosen = selArr[i];
          if (chosen && chosen !== IDS.NONE) entries.push({ key: `${type}/${gk}/${i}`, id: chosen });
        }
      });
    };
    pushGroup(GROUP_TYPES.BASE, base, baseSelections, optionalSelections, optionalEnabled);
    if (additionalEnabled) {
      pushGroup(GROUP_TYPES.ADDITIONAL, additional, additionalSelections, optionalSelections, optionalEnabled);
    }
    if (selectedAdditionalCustom) {
        entries.push({ key: `additional/${customCostSlotName}_custom`, id: selectedAdditionalCustom, isCustom: true });
    }
    const regimentPositionKey = `${regimentGroup}/${regimentIndex}`;
    (configuredDivision.supportUnits || []).filter((su) => su.assignedTo?.positionKey === regimentPositionKey).forEach((su) => {
      entries.push({ key: `support/${su.id}-${su.assignedTo.positionKey}`, id: su.id });
    });
    return entries;
  }, [base, additional, baseSelections, additionalSelections, optionalSelections, optionalEnabled, additionalEnabled, selectedAdditionalCustom, configuredDivision, customCostSlotName, regimentGroup, regimentIndex]);

  const newRemainingPointsAfterLocalChanges = useMemo(() => {
    if (remainingImprovementPoints === undefined) return 0;
    const totalDivisionLimit = divisionDefinition.improvement_points || 0;
    
    const tmp = JSON.parse(JSON.stringify(configuredDivision));
    const oldV = configuredDivision[regimentGroup]?.[regimentIndex]?.config?.isVanguard;
    
    tmp[regimentGroup][regimentIndex].config = {
      baseSelections,
      additionalSelections,
      additionalCustom: selectedAdditionalCustom,
      additionalEnabled,
      optionalEnabled,
      optionalSelections,
      improvements,
      regimentImprovements,
      isVanguard: oldV,
    };

    const ruleBonuses = calculateRuleBonuses(tmp, divisionDefinition, unitsMap, getRegimentDefinition);
    const dynamicSupplyBonus = calculateTotalSupplyBonus(tmp, unitsMap, getRegimentDefinition);
    const dynamicLimit = totalDivisionLimit + dynamicSupplyBonus + ruleBonuses.improvementPoints;
    const totalUsedWithLocalChanges = calculateImprovementPointsCost(tmp, unitsMap, getRegimentDefinition, commonImprovements);
    return dynamicLimit - totalUsedWithLocalChanges;
  }, [baseSelections, additionalSelections, selectedAdditionalCustom, additionalEnabled, optionalEnabled, optionalSelections, improvements, regimentImprovements, configuredDivision, calculateTotalSupplyBonus, calculateImprovementPointsCost, divisionDefinition, remainingImprovementPoints, regimentGroup, regimentIndex, unitsMap, getRegimentDefinition, faction, commonImprovements]);

  const totalCost = useMemo(() => {
    let cost = regiment.base_cost || 0;
    regimentImprovements.forEach((impId) => {
      const impDef = regimentLevelImprovements.find((i) => i.id === impId);
      const common = commonImprovements[impId];
      if (impDef?.army_point_cost !== undefined) cost += impDef.army_point_cost;
      else if (common?.army_point_cost !== undefined) cost += common.army_point_cost;
    });
    collectSelectedUnits.forEach((u) => {
        cost += getFinalUnitCost(u.id, !!u.isCustom);
    });
    return cost;
  }, [regiment, regimentImprovements, improvements, collectSelectedUnits, getFinalUnitCost, regimentLevelImprovements, commonImprovements]);

  const stats = useMemo(() => {
    let recon = 0, motivation = 0, orders = 0;
    let mountedCount = 0;
    let footCount = 0;
    collectSelectedUnits.forEach(({ id, key }) => {
      const def = unitsMap[id];
      if (!def) return;
      if (def.rank !== RANK_TYPES.GROUP) {
          const isMounted = def.is_cavalry || def.are_dragoons || def.are_proxy_dragoons;
          if (isMounted) mountedCount++;
          else footCount++;
      }
      if (def.is_cavalry) recon++;
      if (def.is_light_cavalry) recon++;
      if (def.has_lances) recon--;
      if (def.is_pike_and_shot) recon--;
      if (def.are_looters_insubordinate) recon--;
      if (def.are_proxy_dragoons) recon++;
      if (def.are_scouts) recon++;
      if (def.are_dragoons) recon++;
      if (def.is_artillery) recon -= 2;
      if (def.are_wagons) recon -= 2;
      if (def.is_harassing) recon++;
      if (def.is_disperse) recon++;
      if (def.rank === "bronze" || def.rank === "silver") motivation++;
      else if (def.rank === "gold") motivation += 2;
      if (def.orders) {
        let val = def.orders;
        if (key.startsWith("base/general")) val += regiment.commander_orders_bonus || 0;
        orders += val;
      }
    });
    recon += regiment.recon || 0;
    const awareness = regiment.awareness || 0;
    const isMainForceProp = regiment.isMainForce;
    if (isMainForceProp) motivation++;
    const activations = (regiment.activations || 0) + (isMainForceProp ? 1 : 0);
    let regimentType = "-";
    const totalCombatUnits = mountedCount + footCount;
    if (totalCombatUnits > 0) {
        if (footCount === 0) regimentType = "Konny";
        else if (footCount < totalCombatUnits / 2) regimentType = "Mieszany";
        else regimentType = "Pieszy";
    }
    return { totalRecon: recon, totalMotivation: motivation, totalActivations: activations, totalOrders: orders, totalAwareness: awareness, regimentType };
  }, [collectSelectedUnits, unitsMap, regiment]);

  // ... (handleSelectInPod, handleCustomSelect, handleImprovementToggle, handleRegimentImprovementToggle, handleToggleAdditional - COPY FROM PREVIOUS) ...
  const hasAnySelection = (selectionsObj) => {
      return Object.values(selectionsObj).some(arr => arr && arr.some(id => id && id !== IDS.NONE));
  };
  const handleSelectInPod = (type, groupKey, index, unitId) => {
    let currentSelection = null;
    const isOptionalGroup = groupKey === GROUP_TYPES.OPTIONAL;
    if (isOptionalGroup) {
        currentSelection = optionalSelections[`${type}/optional`]?.[index];
    } else if (type === GROUP_TYPES.BASE) {
        currentSelection = baseSelections[groupKey]?.[index];
    } else if (type === GROUP_TYPES.ADDITIONAL) {
        currentSelection = additionalSelections[groupKey]?.[index];
    }
    const isDeselecting = currentSelection === unitId;
    const newValue = isDeselecting ? null : unitId;
    const posKey = isOptionalGroup ? `${type}/optional/${index}` : `${type}/${groupKey}/${index}`;
    if (isDeselecting) setImprovements((p) => { const m = { ...p }; delete m[posKey]; return m; });
    if (isOptionalGroup) {
        const mapKey = `${type}/optional`;
        const groupDef = type === GROUP_TYPES.BASE ? base : additional;
        const optionalPods = groupDef.optional || [];
        setOptionalSelections(prev => {
            const next = { ...prev };
            let arr = [...(next[mapKey] || [])];
            if (arr.length < optionalPods.length) {
                 const padded = Array(optionalPods.length).fill(null);
                 arr.forEach((v, i) => padded[i] = v);
                 arr = padded;
            }
            if (isDeselecting) arr = arr.map(() => null);
            else {
                arr[index] = newValue;
                arr = arr.map((currentVal, i) => {
                    if (i === index) return newValue;
                    if (currentVal && currentVal !== IDS.NONE) return currentVal;
                    const pod = optionalPods[i] || {};
                    const options = Object.values(pod).map(v => v?.id).filter(Boolean);
                    return options.length > 0 ? options[0] : null;
                });
            }
            next[mapKey] = arr;
            const hasActive = arr.some(x => x && x !== IDS.NONE);
            setOptionalEnabled(prevOpt => ({ ...prevOpt, [mapKey]: hasActive }));
            if (hasActive) {
                const otherKey = type === GROUP_TYPES.BASE ? "additional/optional" : "base/optional";
                if (optionalEnabled[otherKey]) {
                    setOptionalEnabled(po => ({ ...po, [otherKey]: false }));
                    setOptionalSelections(ps => {
                         const ns = { ...ps };
                         ns[otherKey] = (ns[otherKey] || []).map(() => null);
                         return ns;
                    });
                }
            }
            return next;
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
        const mandatoryGroups = Object.keys(additional).filter(k => k !== GROUP_TYPES.OPTIONAL);
        setAdditionalSelections(prev => {
            const next = { ...prev };
            if (isDeselecting) {
                mandatoryGroups.forEach(gKey => {
                    const groupDef = additional[gKey] || [];
                    next[gKey] = Array(groupDef.length).fill(null);
                    setImprovements(prevImp => {
                        const nextImp = { ...prevImp };
                        Object.keys(nextImp).forEach(key => {
                            if (key.startsWith(`additional/${gKey}/`)) delete nextImp[key];
                        });
                        return nextImp;
                    });
                });
            } else {
                mandatoryGroups.forEach(gKey => {
                    const groupDef = additional[gKey] || [];
                    let arr = next[gKey] ? [...next[gKey]] : Array(groupDef.length).fill(null);
                    if (gKey === groupKey) arr[index] = newValue;
                    arr = arr.map((currentVal, i) => {
                        if (currentVal && currentVal !== IDS.NONE) return currentVal;
                        const pod = groupDef[i] || {};
                        const options = Object.values(pod).map(v => v?.id).filter(Boolean);
                        return options.length > 0 ? options[0] : null;
                    });
                    next[gKey] = arr;
                });
            }
            const hasAnySelectionInMandatory = mandatoryGroups.some(gKey => {
                const arr = next[gKey];
                return Array.isArray(arr) && arr.some(id => id && id !== IDS.NONE);
            });
            if (!hasAnySelectionInMandatory && !selectedAdditionalCustom) {
                setAdditionalEnabled(false);
                setOptionalSelections(prevOpt => {
                    const nextOpt = { ...prevOpt };
                    if (nextOpt["additional/optional"]) nextOpt["additional/optional"] = nextOpt["additional/optional"].map(() => null);
                    return nextOpt;
                });
                setOptionalEnabled(prevOpt => ({ ...prevOpt, "additional/optional": false }));
                setImprovements(prevImp => {
                    const nextImp = { ...prevImp };
                    Object.keys(nextImp).forEach(key => {
                        if (key.startsWith("additional/optional/")) delete nextImp[key];
                    });
                    Object.keys(nextImp).forEach(key => {
                        if (key.startsWith(`additional/${groupKey}/`)) delete nextImp[key];
                    });
                    return nextImp;
                });
            } else {
                setAdditionalEnabled(true);
            }
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
         const hasAnyAdditional = hasAnySelection(additionalSelections);
         if (!hasAnyAdditional) {
             setAdditionalEnabled(false);
             setOptionalSelections(prevOpt => {
                const nextOpt = { ...prevOpt };
                if (nextOpt["additional/optional"]) nextOpt["additional/optional"] = nextOpt["additional/optional"].map(() => null);
                return nextOpt;
            });
            setOptionalEnabled(prevOpt => ({ ...prevOpt, "additional/optional": false }));
            setImprovements(prevImp => {
                const nextImp = { ...prevImp };
                Object.keys(nextImp).forEach(key => {
                    if (key.startsWith("additional/optional/")) delete nextImp[key];
                });
                return nextImp;
            });
         }
    }
  };

  const handleImprovementToggle = (positionKey, unitId, impId) => {
    const unitDef = unitsMap[unitId];
    if (unitDef?.rank === "group") return;
    const canTake = canUnitTakeImprovement(unitDef, impId, regiment);
    if (!canTake) {
        alert(`Jednostka "${getUnitName(unitId)}" nie może otrzymać ulepszenia "${impId}".`);
        return;
    }
    const regImpDef = unitLevelImprovements.find(i => i.id === impId);
    if (regImpDef?.max_amount === 1) {
        const usedElsewhere = Object.entries(improvements).some(([k, arr]) => k !== positionKey && arr.includes(impId));
        if (usedElsewhere) {
            const current = improvements[positionKey] || [];
            if (!current.includes(impId)) {
                alert(`Ulepszenie "${impId}" może być użyte tylko raz w pułku.`);
                return;
            }
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
        return [...prev, impId];
    });
  };

  const handleToggleAdditional = () => {
    setAdditionalEnabled((prev) => {
      const next = !prev;
      if (!next) {
        setAdditionalSelections((prevSel) => {
          const ns = { ...prevSel };
          Object.keys(ns).forEach(k => { ns[k] = (ns[k] || []).map(() => null); });
          return ns;
        });
        setOptionalEnabled((optPrev) => ({ ...optPrev, "additional/optional": false }));
        setOptionalSelections((prevSel) => {
             const ns = { ...prevSel };
             ns["additional/optional"] = (ns["additional/optional"] || []).map(() => null);
             return ns;
        });
        setSelectedAdditionalCustom(null);
        setImprovements((p) => {
          const m = { ...p };
          Object.keys(m).forEach((k) => { if (k.startsWith("additional/")) delete m[k]; });
          return m;
        });
      }
      return next;
    });
  };

  const saveAndGoBack = () => {
    
    const tempDivisionForCheck = JSON.parse(JSON.stringify(configuredDivision));
    const groupRef = tempDivisionForCheck[regimentGroup];
    const oldConfig = groupRef[regimentIndex].config;

    groupRef[regimentIndex].config = {
          baseSelections,
          additionalSelections,
          additionalCustom: selectedAdditionalCustom,
          additionalEnabled,
          optionalEnabled,
          optionalSelections,
          improvements,
          regimentImprovements,
          isVanguard: oldConfig.isVanguard
    };
    
    const vanguardCheck = validateVanguardCost(tempDivisionForCheck, unitsMap, faction, getRegimentDefinition, commonImprovements);
    if (!vanguardCheck.isValid) {
        alert(vanguardCheck.message);
        return;
    }

    // FIX: Walidacja Allied Cost
    const alliedCheck = validateAlliedCost(tempDivisionForCheck, unitsMap, faction, getRegimentDefinition, commonImprovements);
    if (!alliedCheck.isValid) {
        alert(alliedCheck.message);
        return;
    }

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
         next[regimentGroup][regimentIndex].config = tempDivisionForCheck[regimentGroup][regimentIndex].config;
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
      stats, totalCost, assignedSupportUnits, hasAdditionalBaseSelection
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
        saveAndGoBack, 
        onBack,
        handleToggleAdditional
    },
    helpers: { getUnitName, getFinalUnitCost, groupKeys }
  };
};