import React, { useEffect, useMemo, useState } from "react";

/**
 * RegimentEditor.jsx - updated to support new JSON structure:
 *
 * structure:
 *  base: {
 *    general: [ { unit1: { id: "x" } } ],
 *    base2: [ { unit1: { id: "a" }, unit2: { id: "b" } }, ... ],
 *    optional: [ { unit1: { id: "mehter" }, unit2: { id: "aga" } }, { unit1: { id: "art" } } ]
 *  },
 *  additional: { ... same shape ... }
 *
 * Rules (UNIVERSAL):
 * - Each element of a group array is a "podzestaw" (object with unitN keys).
 * - If podzestaw has exactly 1 unit -> it's mandatory (automatically included).
 * - If podzestaw has >1 units -> user must choose exactly one from that podzestaw.
 * - If the group key is "optional" -> there is a per-group toggle (enabled/disabled).
 *   When disabled -> none of that group's podzestawy are included.
 *   When enabled -> podzestawy behave as above (mandatory vs choice).
 *
 * State shapes:
 * - selectedBase[groupKey] = array of unitId|null per podzestaw index
 * - selectedAdditional[groupKey] = array ...
 * - selectedOptionalEnabled["base/optional"] = boolean (toggle)
 * - selectedOptionalSelections["base/optional"] = array per podzestaw index similar to above
 *
 * positionKey for improvements: `${type}/${groupKey}/${index}`
 */

export default function RegimentEditor({
  faction,
  regiment,
  onBack,
  configuredDivision,
  setConfiguredDivision,
  regimentGroup,
  regimentIndex,
  calculateImprovementPointsCost,
  calculateTotalSupplyBonus,
  remainingImprovementPoints,
  improvementPointsLimit,
  unitsMap,
}) {
  // structure coming from JSON (new format)
  const structure = regiment.structure || {};
  const base = structure.base || {};
  const additional = structure.additional || {};

  const currentConfig = configuredDivision[regimentGroup][regimentIndex].config || {};
  const divisionDefinition = regiment.divisionDefinition || {};
  const customCostDefinition = additional.unit_custom_cost;
  const customCostSlotName = customCostDefinition?.[0]?.depends_on;

  // --- State ---
  // For groups like base/base2/base3 etc we store arrays of selections per podzestaw index
  const [selectedBase, setSelectedBase] = useState(() => (currentConfig.baseSelections || {}));
  const [selectedAdditional, setSelectedAdditional] = useState(() => (currentConfig.additionalSelections || {}));

  // For optional groups we need toggle + selections; key is e.g. "base/optional" or "additional/optional"
  const [selectedOptionalEnabled, setSelectedOptionalEnabled] = useState(() => (currentConfig.optionalEnabled || {}));
  const [selectedOptionalSelections, setSelectedOptionalSelections] = useState(() => (currentConfig.optionalSelections || {}));

  const [selectedAdditionalCustom, setSelectedAdditionalCustom] = useState(currentConfig.additionalCustom || null);
  const [improvements, setImprovements] = useState(currentConfig.improvements || {});
  const [regimentImprovements, setRegimentImprovements] = useState(currentConfig.regimentImprovements || []);

  // unit improvements definitions
  const unitLevelImprovements = regiment.unit_improvements || [];
  const regimentLevelImprovements = regiment.regiment_improvements || [];

  // Utilities
  const getUnitName = (id) => unitsMap[id]?.name || id;
  const getUnitCost = (id) => unitsMap[id]?.cost || 0;
  const getUnitPUCost = (id) => unitsMap[id]?.pu_cost || 0;
  const getFinalUnitCost = (id, isCustom) => {
    if (!id) return 0;
    if (isCustom && customCostDefinition) {
      const found = customCostDefinition.find((d) => d.id === id);
      if (found && typeof found.cost === "number") return found.cost;
    }
    return getUnitCost(id);
  };

  // Helpers to iterate new structure safely
  const groupKeys = (obj) => (obj && typeof obj === "object" ? Object.keys(obj) : []);

  // Initialize defaults on mount or when regiment changes
  useEffect(() => {
    // base defaults
    const initGroup = (groupObj, priorSelections) => {
      const out = { ...priorSelections };
      groupKeys(groupObj).forEach((groupKey) => {
        const arr = groupObj[groupKey] || [];
        // ensure an array with same length as arr
        const arrSelections = Array.isArray(out[groupKey]) ? [...out[groupKey]] : [];
        for (let i = 0; i < arr.length; i++) {
          if (arrSelections[i] !== undefined) continue; // keep existing config
          const pod = arr[i] || {};
          const unitIds = Object.values(pod).map((v) => v?.id).filter(Boolean);
          if (unitIds.length === 0) arrSelections[i] = null;
          else if (unitIds.length === 1) arrSelections[i] = unitIds[0]; // mandatory
          else arrSelections[i] = unitIds[0]; // default pick first among choices
        }
        out[groupKey] = arrSelections;
      });
      return out;
    };

    setSelectedBase((prev) => initGroup(base, prev));
    setSelectedAdditional((prev) => initGroup(additional, prev));

    // optional default: for base.optional and additional.optional
    const initOptional = (groupObj, priorSelections, priorEnabled, prefix) => {
      const outSel = { ...priorSelections };
      const outEnabled = { ...priorEnabled };
      if (!groupObj) return { outSel, outEnabled };
      const arr = groupObj.optional || [];
      // key name for mapping: `${prefix}/optional`
      const mapKey = `${prefix}/optional`;
      const arrSelections = Array.isArray(outSel[mapKey]) ? [...outSel[mapKey]] : [];
      for (let i = 0; i < arr.length; i++) {
        if (arrSelections[i] !== undefined) continue;
        const pod = arr[i] || {};
        const unitIds = Object.values(pod).map((v) => v?.id).filter(Boolean);
        if (unitIds.length === 0) arrSelections[i] = null;
        else if (unitIds.length === 1) arrSelections[i] = unitIds[0]; // mandatory
        else arrSelections[i] = unitIds[0]; // default to first choice
      }
      outSel[mapKey] = arrSelections;
      if (outEnabled[mapKey] === undefined) outEnabled[mapKey] = !!currentConfig.optionalEnabled?.[mapKey] || false;
      return { outSel, outEnabled };
    };

    const baseOptionalInit = initOptional(base, selectedOptionalSelections, selectedOptionalEnabled, "base");
    const addOptionalInit = initOptional(additional, baseOptionalInit.outSel, baseOptionalInit.outEnabled, "additional");
    setSelectedOptionalSelections(addOptionalInit.outSel);
    setSelectedOptionalEnabled(addOptionalInit.outEnabled);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regiment.id]);

  // Utility to build list of selected units across everything to compute cost/stats
  const collectSelectedUnits = useMemo(() => {
    const units = [];

    const pushGroup = (type, groupObj, selections, optionalSelections, optionalEnabled) => {
      groupKeys(groupObj).forEach((groupKey) => {
        const arr = groupObj[groupKey] || [];
        const isOptionalGroup = groupKey === "optional";
        const mapKey = `${type}/${groupKey}`;
        const enabled = isOptionalGroup ? !!optionalEnabled[mapKey] : true;
        if (!enabled) return;
        const selArr = isOptionalGroup ? (optionalSelections[mapKey] || []) : (selections[groupKey] || []);
        for (let i = 0; i < arr.length; i++) {
          const pod = arr[i] || {};
          const unitIds = Object.values(pod).map((v) => v?.id).filter(Boolean);
          if (unitIds.length === 0) continue;
          const chosen = selArr && selArr[i] ? selArr[i] : (unitIds[0] || null);
          if (chosen && chosen !== "none") units.push({ key: `${type}/${groupKey}/${i}`, id: chosen });
        }
      });
    };

    pushGroup("base", base, selectedBase, selectedOptionalSelections, selectedOptionalEnabled);
    pushGroup("additional", additional, selectedAdditional, selectedOptionalSelections, selectedOptionalEnabled);

    // additional custom slot
    if (selectedAdditionalCustom) units.push({ key: `additional/${customCostSlotName}_custom`, id: selectedAdditionalCustom, isCustom: true });

    // support units (existing logic)
    const regimentPositionKey = `${regimentGroup}/${regimentIndex}`;
    const supportUnits = (configuredDivision.supportUnits || []).filter((su) => su.assignedTo?.positionKey === regimentPositionKey);
    supportUnits.forEach((su) => units.push({ key: `support/${su.id}-${su.assignedTo.positionKey}`, id: su.id }));

    return units;
  }, [base, additional, selectedBase, selectedAdditional, selectedOptionalSelections, selectedOptionalEnabled, selectedAdditionalCustom, configuredDivision, customCostSlotName, regimentGroup, regimentIndex]);

  // --- Improvement cost helpers using collectSelectedUnits for position keys ---
  const localImprovementCost = useMemo(() => {
    // build a small config for IMP calculation (it expects earlier shape)
    const tempRegimentConfig = {
      id: regiment.id,
      group: regimentGroup,
      index: regimentIndex,
      config: {
        base: selectedBase,
        additional: selectedAdditional,
        additionalCustom: selectedAdditionalCustom,
        optionalEnabled: selectedOptionalEnabled,
        optionalSelections: selectedOptionalSelections,
        improvements,
        regimentImprovements,
      },
    };
    const hybridConfig = { ...tempRegimentConfig, supportUnits: configuredDivision.supportUnits };
    return calculateImprovementPointsCost(hybridConfig);
  }, [selectedBase, selectedAdditional, selectedOptionalSelections, selectedOptionalEnabled, selectedAdditionalCustom, improvements, regimentImprovements, calculateImprovementPointsCost, configuredDivision, regiment, regimentGroup, regimentIndex]);

  const newRemainingPointsAfterLocalChanges = useMemo(() => {
    if (remainingImprovementPoints === undefined) return 0;
    const totalDivisionLimit = divisionDefinition.improvement_points || 0;
    const tempDivisionConfig = JSON.parse(JSON.stringify(configuredDivision));
    const oldVanguard = configuredDivision[regimentGroup][regimentIndex].config?.isVanguard;
    tempDivisionConfig[regimentGroup][regimentIndex].config = {
      base: selectedBase,
      additional: selectedAdditional,
      additionalCustom: selectedAdditionalCustom,
      optionalEnabled: selectedOptionalEnabled,
      optionalSelections: selectedOptionalSelections,
      improvements,
      regimentImprovements,
      isVanguard: oldVanguard,
    };
    const dynamicSupplyBonus = calculateTotalSupplyBonus ? calculateTotalSupplyBonus(tempDivisionConfig) : 0;
    const dynamicLimit = totalDivisionLimit + dynamicSupplyBonus;
    const totalUsedWithLocalChanges = calculateImprovementPointsCost(tempDivisionConfig);
    return dynamicLimit - totalUsedWithLocalChanges;
  }, [
    divisionDefinition,
    configuredDivision,
    selectedBase,
    selectedAdditional,
    selectedOptionalSelections,
    selectedOptionalEnabled,
    selectedAdditionalCustom,
    improvements,
    regimentImprovements,
    calculateTotalSupplyBonus,
    calculateImprovementPointsCost,
    remainingImprovementPoints,
    regimentGroup,
    regimentIndex,
  ]);

  // --- Handlers for selecting units in groups (unified) ---
  const handleSelectInGroup = (type, groupKey, index, newUnitId) => {
    // type: "base" | "additional" | "optional"
    const isOptionalGroup = groupKey === "optional";
    const mapKey = `${type}/${groupKey}`;

    // positionKey for improvements
    const positionKey = `${type}/${groupKey}/${index}`;

    if (type === "base") {
      setSelectedBase((prev) => {
        const next = { ...prev };
        const arr = Array.isArray(next[groupKey]) ? [...next[groupKey]] : [];
        arr[index] = newUnitId;
        next[groupKey] = arr;
        // when changing selection remove improvements for this positionKey
        setImprovements((p) => {
          const mm = { ...p };
          delete mm[positionKey];
          return mm;
        });
        return next;
      });
    } else if (type === "additional") {
      setSelectedAdditional((prev) => {
        const next = { ...prev };
        const arr = Array.isArray(next[groupKey]) ? [...next[groupKey]] : [];
        arr[index] = newUnitId;
        next[groupKey] = arr;
        setImprovements((p) => {
          const mm = { ...p };
          delete mm[positionKey];
          return mm;
        });
        return next;
      });
    } else if (type === "optional") {
      setSelectedOptionalSelections((prev) => {
        const next = { ...prev };
        const arr = Array.isArray(next[mapKey]) ? [...next[mapKey]] : [];
        arr[index] = newUnitId;
        next[mapKey] = arr;
        setImprovements((p) => {
          const mm = { ...p };
          delete mm[positionKey];
          return mm;
        });
        return next;
      });
    }
  };

  // Toggle optional group on/off
  const handleToggleOptionalGroup = (type, groupKey) => {
    const mapKey = `${type}/${groupKey}`;
    setSelectedOptionalEnabled((prev) => {
      const next = { ...prev, [mapKey]: !prev[mapKey] };
      // if disabling, remove related improvements for this group and clear selections
      if (!next[mapKey]) {
        setImprovements((p) => {
          const mm = { ...p };
          Object.keys(mm).forEach((k) => {
            if (k.startsWith(`${type}/${groupKey}/`)) delete mm[k];
          });
          return mm;
        });
        // clear selections (but keep defaults so re-enabling restores defaults)
        setSelectedOptionalSelections((prevSel) => {
          const ns = { ...prevSel };
          // keep structure keys but set items to null
          const arr = (type === "base" ? base[groupKey] : additional[groupKey]) || [];
          ns[mapKey] = arr.map(() => null);
          return ns;
        });
      } else {
        // enabling -> initialize selections if null to defaults
        setSelectedOptionalSelections((prevSel) => {
          const ns = { ...prevSel };
          const arr = (type === "base" ? base[groupKey] : additional[groupKey]) || [];
          const current = Array.isArray(ns[mapKey]) ? [...ns[mapKey]] : [];
          for (let i = 0; i < arr.length; i++) {
            if (!current[i]) {
              const pod = arr[i] || {};
              const unitIds = Object.values(pod).map((v) => v?.id).filter(Boolean);
              current[i] = unitIds.length === 1 ? unitIds[0] : (unitIds[0] || null);
            }
          }
          ns[mapKey] = current;
          return ns;
        });
      }
      return next;
    });
  };

  // Improvements toggle handler (positionKey must match our new format)
  const handleImprovementToggle = (positionKey, unitId, impId) => {
    const unitDef = unitsMap[unitId];
    if (unitDef?.rank === "group") return;

    const impDef = unitLevelImprovements.find((i) => i.id === impId);
    if (!impDef) return;

    // unit-level prohibitions (robust to typos)
    const unitLimitations =
      unitDef?.improvement_limitations ||
      unitDef?.improvements_limitations ||
      unitDef?.improvents_limitations ||
      null;

    if (unitLimitations && Array.isArray(unitLimitations) && unitLimitations.includes(impId)) {
      alert(`Jednostka "${getUnitName(unitId)}" nie może otrzymać ulepszenia "${impId}".`);
      return;
    }

    setImprovements((prev) => {
      const current = prev[positionKey] ? [...prev[positionKey]] : [];
      if (current.includes(impId)) {
        return { ...prev, [positionKey]: current.filter((id) => id !== impId) };
      } else {
        // max_amount logic
        if (impDef.max_amount === 1) {
          const isAlreadyUsed = Object.entries(prev).some(([k, arr]) => k !== positionKey && arr.includes(impId));
          if (isAlreadyUsed) {
            alert(`Ulepszenie "${impId}" może być użyte tylko raz w Pułku.`);
            return prev;
          }
        }
        // impDef.limitations check
        if (impDef.limitations && !impDef.limitations.includes(unitId)) {
          alert(`Jednostka "${getUnitName(unitId)}" nie może otrzymać ulepszenia "${impId}".`);
          return prev;
        }
        // cost check
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

        return { ...prev, [positionKey]: [...current, impId] };
      }
    });
  };

  // Regiment-level improvements (unchanged)
  const handleRegimentImprovementToggle = (impId) => {
    setRegimentImprovements((prev) => {
      const impDef = regimentLevelImprovements.find((i) => i.id === impId);
      if (!impDef) return prev;
      const impOccurrences = regimentLevelImprovements.filter((imp) => imp.id === impId).length;
      const currentCount = prev.filter((id) => id === impId).length;
      if (prev.includes(impId)) {
        const index = prev.lastIndexOf(impId);
        return [...prev.slice(0, index), ...prev.slice(index + 1)];
      } else {
        if (currentCount >= impOccurrences) {
          alert("Limit.");
          return prev;
        }
        const potentialIMPCost = typeof impDef.cost === "number" ? impDef.cost : 0;
        if (newRemainingPointsAfterLocalChanges - potentialIMPCost < 0) {
          alert("Brak punktów IMP.");
          return prev;
        }
        return [...prev, impId];
      }
    });
  };

  // Render helpers
  const TileButton = ({ active, onClick, children, style }) => (
    <button onClick={onClick} style={{ padding: 10, borderRadius: 6, border: active ? "2px solid #0077ff" : "1px solid #ccc", background: active ? "#e9f3ff" : "#fff", cursor: "pointer", ...style }}>
      {children}
    </button>
  );

  const renderPodzestaw = (type, groupKey, pod, selValue, index) => {
    // pod is object like { unit1: { id: 'x' }, unit2: { id: 'y' } }
    const unitEntries = Object.entries(pod || {}).map(([slot, def]) => ({ slot, id: def?.id })).filter(u => u.id);
    if (unitEntries.length === 0) return null;

    // Mandatory (1) or choice (>1)
    if (unitEntries.length === 1) {
      const id = unitEntries[0].id;
      return (
        <div style={{ minWidth: 200 }}>
          <div style={{ fontWeight: 700 }}>{getUnitName(id)}</div>
          <div style={{ fontSize: 12, color: "#666" }}>Koszt: {getFinalUnitCost(id, false)} PS</div>
          {/* improvement buttons for this position */}
          <div style={{ marginTop: 6 }}>{renderUnitButtonsHelper(`${type}/${groupKey}/${index}`, id)}</div>
        </div>
      );
    }

    // Choice: render buttons for each option
    return (
      <div style={{ minWidth: 200 }}>
        <div style={{ marginBottom: 6, fontWeight: 700 }}>Wybierz jedną</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {unitEntries.map((u) => {
            const active = selValue === u.id;
            return (
              <TileButton
                key={u.id}
                active={active}
                onClick={() => handleSelectInGroup(type, groupKey, index, u.id)}
              >
                <div style={{ fontWeight: 700 }}>{getUnitName(u.id)}</div>
                <div style={{ fontSize: 12, color: "#666" }}>Koszt: {getFinalUnitCost(u.id, false)} PS</div>
              </TileButton>
            );
          })}
        </div>
        <div style={{ marginTop: 6 }}>{renderUnitButtonsHelper(`${type}/${groupKey}/${index}`, selValue)}</div>
      </div>
    );
  };

  const renderGroup = (type, groupKey, groupArr, selections, optionalSelections, optionalEnabled) => {
    const isOptionalGroup = groupKey === "optional";
    const mapKey = `${type}/${groupKey}`;
    const enabled = isOptionalGroup ? !!optionalEnabled[mapKey] : true;

    return (
      <div key={`${type}/${groupKey}`} style={{ marginBottom: 14 }}>
        <div style={{ marginBottom: 6, fontWeight: 700 }}>
          {groupKey}
          {isOptionalGroup && (
            <label style={{ marginLeft: 12 }}>
              <input type="checkbox" checked={!!optionalEnabled[mapKey]} onChange={() => handleToggleOptionalGroup(type, groupKey)} />&nbsp;Włącz
            </label>
          )}
        </div>

        {!enabled && isOptionalGroup ? <div style={{ color: "#666" }}>Poziom opcjonalny wyłączony</div> : null}

        {enabled && (groupArr || []).length === 0 && <div style={{ color: "#666" }}>Brak pozycji</div>}

        {enabled && (groupArr || []).map((pod, idx) => {
          const selArr = isOptionalGroup ? (optionalSelections[mapKey] || []) : (selections[groupKey] || []);
          const selValue = selArr && selArr[idx] !== undefined ? selArr[idx] : null;
          return (
            <div key={`${groupKey}-${idx}`} style={{ display: "flex", gap: 12, marginBottom: 10, alignItems: "flex-start" }}>
              <div style={{ minWidth: 110, fontWeight: 600 }}>{`${groupKey} #${idx + 1}`}</div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                {renderPodzestaw(type, groupKey, pod, selValue, idx)}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderUnitButtonsHelper = (positionKey, unitId) => {
    const unitDef = unitsMap[unitId];
    if (!unitDef || unitDef.rank === "group" || unitLevelImprovements.length === 0) return null;

    return (
      <div style={{ marginTop: 6 }}>
        {unitLevelImprovements.map((imp) => {
          const isActive = (improvements[positionKey] || []).includes(imp.id);
          let disabled = false;

          // improvement's own limitations
          if (imp.limitations && !imp.limitations.includes(unitId)) disabled = true;

          // unit-level prohibitions
          const unitLimitations =
            unitDef?.improvement_limitations ||
            unitDef?.improvements_limitations ||
            unitDef?.improvents_limitations ||
            null;
          if (unitLimitations && Array.isArray(unitLimitations) && unitLimitations.includes(imp.id)) disabled = true;

          if (imp.max_amount === 1 && !isActive) {
            const isUsed = Object.entries(improvements).some(([k, arr]) => k !== positionKey && arr.includes(imp.id));
            if (isUsed) disabled = true;
          }

          const improvementBaseCost = unitDef.improvement_cost || 0;
          let cost = 0;
          if (imp.cost === -1) cost = Math.max(1, improvementBaseCost - 1);
          else if (typeof imp.cost === "number") cost = imp.cost;
          else if (imp.cost === "double") cost = improvementBaseCost * 2;
          else if (imp.cost === "triple") cost = improvementBaseCost * 3;
          else if (imp.cost === 1) cost = improvementBaseCost;

          if (!isActive && newRemainingPointsAfterLocalChanges - cost < 0) disabled = true;

          return (
            <button
              key={imp.id}
              onClick={() => handleImprovementToggle(positionKey, unitId, imp.id)}
              disabled={disabled}
              style={{
                fontSize: 10,
                padding: "4px 6px",
                borderRadius: 4,
                border: isActive ? "1px solid #1b7e32" : "1px solid #aaa",
                background: isActive ? "#e6ffe6" : "#f0f0f0",
                color: "#333",
                cursor: disabled ? "not-allowed" : "pointer",
                opacity: disabled ? 0.45 : 1,
                marginRight: 6,
                marginBottom: 6,
              }}
            >
              {isActive ? "✅ " : ""}
              {imp.id}
            </button>
          );
        })}
      </div>
    );
  };

  // --- COST calculation including all selected units ---
  const totalCost = useMemo(() => {
    let cost = regiment.base_cost || 0;

    regimentImprovements.forEach((impId) => {
      const impDef = regimentLevelImprovements.find((i) => i.id === impId);
      if (impDef && typeof impDef.army_point_cost === "number") cost += impDef.army_point_cost;
    });

    // collect selected units and add costs
    const entries = collectSelectedUnits;
    entries.forEach(({ id, isCustom }) => {
      cost += getFinalUnitCost(id, !!isCustom);
      // add unit improvements cost if present
      const posKey = entries ? null : null; // improvements handled below via improvements map
    });

    // add improvements cost per position
    Object.entries(improvements || {}).forEach(([pos, imps]) => {
      (imps || []).forEach((impId) => {
        const impDef = unitLevelImprovements.find((i) => i.id === impId);
        if (impDef && typeof impDef.army_point_cost === "number") cost += impDef.army_point_cost;
      });
    });

    // support units
    const regimentPositionKey = `${regimentGroup}/${regimentIndex}`;
    (configuredDivision.supportUnits || [])
      .filter((su) => su.assignedTo?.positionKey === regimentPositionKey)
      .forEach((su) => {
        cost += getUnitCost(su.id);
        const supportUnitKey = `support/${su.id}-${su.assignedTo.positionKey}`;
        (improvements[supportUnitKey] || []).forEach((impId) => {
          const impDef = unitLevelImprovements.find((i) => i.id === impId);
          if (impDef && typeof impDef.army_point_cost === "number") cost += impDef.army_point_cost;
        });
      });

    return cost;
  }, [regiment, regimentImprovements, improvements, collectSelectedUnits, configuredDivision, unitLevelImprovements, regimentGroup, regimentIndex]);

  // Stats calculation (recon, motivation, activations, orders, awareness) - include optional units if enabled
  const { totalRecon, totalMotivation, totalActivations, totalOrders, totalAwareness } = useMemo(() => {
    let recon = 0;
    let motivation = 0;
    let orders = 0;

    const entries = collectSelectedUnits;
    entries.forEach(({ id, key }) => {
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

      if (def.rank === "bronze" || def.rank === "silver") motivation += 1;
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
    if (isMainForceProp) motivation += 1;
    const activations = (regiment.activations || 0) + (isMainForceProp ? 1 : 0);

    return {
      totalRecon: recon,
      totalMotivation: motivation,
      totalActivations: activations,
      totalOrders: orders,
      totalAwareness: awareness,
    };
  }, [collectSelectedUnits, unitsMap, regiment]);

  // Save / Cancel with new config shape
  const saveAndGoBack = () => {
    setConfiguredDivision((prev) => {
      const newDivision = { ...prev };
      const newGroup = [...newDivision[regimentGroup]];
      const oldConfig = newGroup[regimentIndex].config || {};
      newGroup[regimentIndex] = {
        ...newGroup[regimentIndex],
        config: {
          ...oldConfig,
          baseSelections: selectedBase,
          additionalSelections: selectedAdditional,
          optionalEnabled: selectedOptionalEnabled,
          optionalSelections: selectedOptionalSelections,
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

  const cancelAndGoBack = () => {
    onBack();
  };

  // render groups
  return (
    <div style={{ padding: 16 }}>
      <div style={{ marginBottom: 12 }}>
        <button onClick={saveAndGoBack} style={{ marginRight: 8 }}>Zapisz i wróć</button>
        <button onClick={cancelAndGoBack}>Anuluj</button>
      </div>

      <h2 style={{ marginTop: 0 }}>{regiment.name}</h2>

      <div style={{ marginBottom: 12 }}>
        <div>Koszt bazowy Pułku: {regiment.base_cost || 0} Punktów Siły</div>
        <div>Punkty ulepszeń Dywizji: <span style={{ color: newRemainingPointsAfterLocalChanges < 0 ? "red" : "#1b7e32" }}>{newRemainingPointsAfterLocalChanges}</span> / {(divisionDefinition.improvement_points || 0) + (calculateTotalSupplyBonus ? calculateTotalSupplyBonus(configuredDivision) : 0)}</div>
      </div>

      <section>
        <h3>Podstawa Pułku</h3>
        {groupKeys(base).map((gk) => renderGroup("base", gk, base[gk], selectedBase, selectedOptionalSelections, selectedOptionalEnabled))}
      </section>

      <section>
        <h3>Poziom I (Dodatkowe)</h3>
        {groupKeys(additional).map((gk) => renderGroup("additional", gk, additional[gk], selectedAdditional, selectedOptionalSelections, selectedOptionalEnabled))}
        {/* custom cost slot */}
        {customCostDefinition && customCostSlotName && (
          <div style={{ marginTop: 12 }}>
            <div style={{ marginBottom: 6, fontWeight: 700 }}>Poziom II (specjalny)</div>
            {customCostDefinition.map((def) => {
              const uid = def.id;
              const active = selectedAdditionalCustom === uid;
              const finalCost = getFinalUnitCost(uid, true);
              const unitDef = unitsMap[uid];
              return (
                <div key={uid} style={{ marginBottom: 8 }}>
                  <TileButton active={active} onClick={() => setSelectedAdditionalCustom(active ? null : uid)}>
                    <div style={{ fontWeight: 700 }}>{getUnitName(uid)}</div>
                    <div style={{ fontSize: 12, color: "#666" }}>{finalCost} Punktów Siły</div>
                  </TileButton>
                  {active && <div style={{ marginTop: 6 }}>{renderUnitButtonsHelper(`additional/${customCostSlotName}_custom`, uid)}</div>}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section style={{ marginTop: 18 }}>
        <h3>Podsumowanie Pułku</h3>

        <div>Zwiad: {totalRecon}</div>
        <div>Motywacja: {totalMotivation}</div>
        <div>Aktywacje: {totalActivations}</div>
        <div>Rozkazy: {totalOrders}</div>
        <div>Czujność: {totalAwareness}</div>

        <div style={{ marginTop: 8 }}>
          <div><strong>Wybrane jednostki:</strong></div>
          {regiment.recon && <div>Regiment recon: {regiment.recon}</div>}
          {[
            ...collectSelectedUnits.map((u) => ({ key: u.key, id: u.id })),
          ].map((u, idx) => (
            <div key={idx}>
              * {getUnitName(u.id)} ({getFinalUnitCost(u.id, false)} PS) { (improvements[u.key] || []).length > 0 && `(+ ${improvements[u.key].join(", ")})` }
            </div>
          ))}

          {(configuredDivision.supportUnits || []).filter((su) => su.assignedTo?.positionKey === `${regimentGroup}/${regimentIndex}`).map((su, i) => (
            <div key={`su-${i}`}>
              * [WSPARCIE] {unitsMap[su.id]?.name} ({unitsMap[su.id]?.cost || 0} PS) { (improvements[`support/${su.id}-${su.assignedTo.positionKey}`] || []).length > 0 && `(+ ${improvements[`support/${su.id}-${su.assignedTo.positionKey}`].join(", ")})` }
            </div>
          ))}
        </div>

        <hr style={{ margin: "12px 0" }} />

        <div><strong>Całkowity Koszt:</strong> {totalCost} Punktów Siły</div>
      </section>
    </div>
  );
}
