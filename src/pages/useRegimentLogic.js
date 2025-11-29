import { useState, useEffect, useMemo } from "react";
import { IDS, GROUP_TYPES } from "../constants";

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
}) => {
  const divisionDefinition = propDivisionDefinition || regiment.divisionDefinition || {};
  
  const structure = regiment.structure || {};
  const base = structure.base || {};
  const additional = structure.additional || {};
  const currentConfig = configuredDivision?.[regimentGroup]?.[regimentIndex]?.config || {};
  
  const customCostDefinition = additional?.unit_custom_cost;
  const customCostSlotName = customCostDefinition?.[0]?.depends_on;

  const unitLevelImprovements = regiment.unit_improvements || [];
  const regimentLevelImprovements = regiment.regiment_improvements || [];

  // --- State ---
  const [baseSelections, setBaseSelections] = useState(() => (currentConfig.baseSelections || {}));
  const [additionalSelections, setAdditionalSelections] = useState(() => (currentConfig.additionalSelections || {}));
  const [additionalEnabled, setAdditionalEnabled] = useState(() => !!currentConfig.additionalEnabled || false);
  const [optionalEnabled, setOptionalEnabled] = useState(() => (currentConfig.optionalEnabled || {}));
  const [optionalSelections, setOptionalSelections] = useState(() => (currentConfig.optionalSelections || {}));
  const [selectedAdditionalCustom, setSelectedAdditionalCustom] = useState(currentConfig.additionalCustom || null);
  const [improvements, setImprovements] = useState(currentConfig.improvements || {});
  const [regimentImprovements, setRegimentImprovements] = useState(currentConfig.regimentImprovements || []);

  // --- Helpers ---
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

  // --- Initialization ---
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
            if (!optSelInit[key]) {
                optSelInit[key] = groupObj.optional.map(() => null);
            }
            if (optEnabledInit[key] === undefined) {
                optEnabledInit[key] = !!currentConfig.optionalEnabled?.[key] || false;
            }
        }
    }

    initOptionalGroup(GROUP_TYPES.BASE, base);
    initOptionalGroup(GROUP_TYPES.ADDITIONAL, additional);

    setOptionalSelections(optSelInit);
    setOptionalEnabled(optEnabledInit);
    setAdditionalEnabled(!!currentConfig.additionalEnabled);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regiment.id]);

  // --- Support Units Logic ---
  const assignedSupportUnits = useMemo(() => {
    const regimentPositionKey = `${regimentGroup}/${regimentIndex}`;
    return (configuredDivision.supportUnits || [])
        .filter(su => su.assignedTo?.positionKey === regimentPositionKey);
  }, [configuredDivision.supportUnits, regimentGroup, regimentIndex]);

  // --- Calculations ---
  
  // LOGIKA BLOKADY: Sprawdź, czy kupiono cokolwiek w Poziomie I (poza optionalem)
  const hasAdditionalBaseSelection = useMemo(() => {
      // Przeszukujemy additionalSelections (tam są grupy 'general', 'additional1' itp., bez 'optional')
      // Ignorujemy klucz 'optional' jeśli tam trafił, oraz sprawdzamy czy wartość nie jest pusta/none
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
      base: baseSelections,
      additional: additionalSelections,
      additionalCustom: selectedAdditionalCustom,
      additionalEnabled,
      optionalEnabled,
      optionalSelections,
      improvements,
      regimentImprovements,
      isVanguard: oldV,
    };

    const dynamicSupplyBonus = calculateTotalSupplyBonus ? calculateTotalSupplyBonus(tmp) : 0;
    const dynamicLimit = totalDivisionLimit + dynamicSupplyBonus;
    const totalUsedWithLocalChanges = calculateImprovementPointsCost(tmp);
    return dynamicLimit - totalUsedWithLocalChanges;
  }, [
    baseSelections, additionalSelections, selectedAdditionalCustom, additionalEnabled, 
    optionalEnabled, optionalSelections, improvements, regimentImprovements, 
    configuredDivision, calculateTotalSupplyBonus, calculateImprovementPointsCost, 
    divisionDefinition, remainingImprovementPoints, regimentGroup, regimentIndex
  ]);

  const totalCost = useMemo(() => {
    let cost = regiment.base_cost || 0;
    regimentImprovements.forEach((impId) => {
      const impDef = regimentLevelImprovements.find((i) => i.id === impId);
      if (impDef && typeof impDef.army_point_cost === "number") cost += impDef.army_point_cost;
    });
    collectSelectedUnits.forEach((u) => {
        cost += getFinalUnitCost(u.id, !!u.isCustom);
    });
    Object.entries(improvements || {}).forEach(([pos, imps]) => {
      (imps || []).forEach((impId) => {
        const impDef = unitLevelImprovements.find((i) => i.id === impId);
        if (impDef && typeof impDef.army_point_cost === "number") cost += impDef.army_point_cost;
      });
    });
    return cost;
  }, [regiment, regimentImprovements, improvements, collectSelectedUnits, unitLevelImprovements, getFinalUnitCost, regimentLevelImprovements]);

  const stats = useMemo(() => {
    let recon = 0, motivation = 0, orders = 0;
    collectSelectedUnits.forEach(({ id, key }) => {
      const def = unitsMap[id];
      if (!def) return;
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
    return { totalRecon: recon, totalMotivation: motivation, totalActivations: activations, totalOrders: orders, totalAwareness: awareness };
  }, [collectSelectedUnits, unitsMap, regiment]);

  // --- ACTIONS ---

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
    if (isDeselecting) {
        setImprovements((p) => { const m = { ...p }; delete m[posKey]; return m; });
    }

    if (isOptionalGroup) {
        const mapKey = `${type}/optional`;
        setOptionalSelections(prev => {
            const next = { ...prev };
            const arr = [...(next[mapKey] || [])];
            arr[index] = newValue;
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
        setAdditionalSelections(prev => {
            const next = { ...prev };
            const arr = [...(next[groupKey] || [])];
            arr[index] = newValue;
            next[groupKey] = arr;
            
            const hasOthers = Object.keys(next).some(k => k !== groupKey && next[k].some(x => x && x !== IDS.NONE));
            const hasCurrent = arr.some(x => x && x !== IDS.NONE);
            
            if (!hasOthers && !hasCurrent && !selectedAdditionalCustom) {
                setAdditionalEnabled(false);
                setOptionalSelections(prevOpt => {
                    const nextOpt = { ...prevOpt };
                    if (nextOpt["additional/optional"]) {
                        nextOpt["additional/optional"] = nextOpt["additional/optional"].map(() => null);
                    }
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
            } else if (newValue && newValue !== IDS.NONE) {
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
    
    if (next && !additionalEnabled) {
        setAdditionalEnabled(true);
    }
    
    if (isDeselecting) {
         setImprovements((p) => { const m = { ...p }; delete m[`additional/${customCostSlotName}_custom`]; return m; });
         
         const hasAnyAdditional = Object.values(additionalSelections).some(arr => arr && arr.some(id => id && id !== IDS.NONE));
         
         if (!hasAnyAdditional) {
             setAdditionalEnabled(false);
             setOptionalSelections(prevOpt => {
                const nextOpt = { ...prevOpt };
                if (nextOpt["additional/optional"]) {
                    nextOpt["additional/optional"] = nextOpt["additional/optional"].map(() => null);
                }
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
    const impDef = unitLevelImprovements.find(i => i.id === impId);
    if (!impDef) return;

    const unitLimitations = unitDef?.improvement_limitations || unitDef?.improvements_limitations || null;
    if (unitLimitations && Array.isArray(unitLimitations) && unitLimitations.includes(impId)) {
        alert(`Jednostka "${getUnitName(unitId)}" nie może otrzymać ulepszenia "${impId}".`);
        return;
    }

    setImprovements((prev) => {
      const cur = Array.isArray(prev[positionKey]) ? [...prev[positionKey]] : [];
      if (cur.includes(impId)) {
        return { ...prev, [positionKey]: cur.filter(x => x !== impId) };
      } else {
        if (impDef.max_amount === 1) {
          const usedElsewhere = Object.entries(prev).some(([k, arr]) => k !== positionKey && arr.includes(impId));
          if (usedElsewhere) {
            alert(`Ulepszenie "${impId}" może być użyte tylko raz w pułku.`);
            return prev;
          }
        }
        if (impDef.limitations && !impDef.limitations.includes(unitId)) {
           alert(`Jednostka "${getUnitName(unitId)}" nie może otrzymać ulepszenia "${impId}".`);
           return prev;
        }

        const improvementBaseCost = unitDef.improvement_cost || 0;
        let potentialIMPCost = 0;
        if (impDef.cost === -1) potentialIMPCost = Math.max(1, improvementBaseCost - 1);
        else if (typeof impDef.cost === "number") potentialIMPCost = impDef.cost;
        else if (impDef.cost === "double") potentialIMPCost = improvementBaseCost * 2;
        else if (impDef.cost === "triple") potentialIMPCost = improvementBaseCost * 3;
        else if (impDef.cost === 1) potentialIMPCost = improvementBaseCost;

        if (newRemainingPointsAfterLocalChanges - potentialIMPCost < 0) {
          alert("Brak punktów ulepszeń.");
          return prev;
        }

        return { ...prev, [positionKey]: [...cur, impId] };
      }
    });
  };

  const handleRegimentImprovementToggle = (impId) => {
    setRegimentImprovements((prev) => {
        const impDef = regimentLevelImprovements.find(i => i.id === impId);
        if (!impDef) return prev;
        if (prev.includes(impId)) {
             const idx = prev.lastIndexOf(impId);
             return [...prev.slice(0, idx), ...prev.slice(idx + 1)];
        }
        const cost = typeof impDef.cost === "number" ? impDef.cost : 0;
        if (newRemainingPointsAfterLocalChanges - cost < 0) {
             alert("Brak punktów IMP.");
             return prev;
        }
        return [...prev, impId];
    });
  };

  const saveAndGoBack = () => {
    setConfiguredDivision((prev) => {
      const newDivision = { ...prev };
      const newGroup = [...newDivision[regimentGroup]];
      const oldConfig = newGroup[regimentIndex].config || {};
      newGroup[regimentIndex] = {
        ...newGroup[regimentIndex],
        config: {
          ...oldConfig,
          baseSelections,
          additionalSelections,
          additionalEnabled,
          optionalEnabled,
          optionalSelections,
          additionalCustom: selectedAdditionalCustom,
          improvements,
          regimentImprovements,
        },
      };
      newDivision[regimentGroup] = newGroup;
      return newDivision;
    });
    onBack();
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

  return {
    state: {
      baseSelections, additionalSelections, additionalEnabled, 
      optionalEnabled, optionalSelections, selectedAdditionalCustom,
      improvements, regimentImprovements, newRemainingPointsAfterLocalChanges,
      stats, totalCost, assignedSupportUnits, hasAdditionalBaseSelection // <--- Expose flag
    },
    definitions: {
        structure, base, additional, customCostDefinition, customCostSlotName,
        unitLevelImprovements, regimentLevelImprovements
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