import React from "react";
import { useRegimentLogic } from "./useRegimentLogic";
import styles from "./RegimentEditor.module.css";
import { GROUP_TYPES } from "../constants";
import { 
    canUnitTakeImprovement, 
    calculateSingleImprovementIMPCost 
} from "../utils/armyMath";

// --- Sub-components (View Only) ---

const SingleUnitOptionCard = ({ 
  unitId, 
  isActive, 
  onClick, 
  unitMap, 
  logicHelpers,
  isLocked,
  customCosts 
}) => {
  const unitDef = unitMap[unitId];
  if (!unitDef) return null;

  let displayCost = 0;
  if (customCosts?.costOverride !== undefined) {
      displayCost = customCosts.costOverride;
  } else {
      displayCost = logicHelpers.getFinalUnitCost(unitId, false);
      if (customCosts?.extraCost) {
          displayCost += customCosts.extraCost;
      }
  }

  const unitPuCost = unitDef.improvement_points_cost || unitDef.pu_cost || 0;
  
  const costLabel = unitPuCost > 0 
      ? `${displayCost} PS + ${unitPuCost} PU` 
      : `${displayCost} PS`;

  return (
    <div 
      className={`${styles.unitCard} ${isActive ? styles.active : ''} ${onClick && !isLocked ? styles.selectable : ''}`}
      onClick={isLocked ? undefined : onClick}
      style={isLocked ? { cursor: 'default' } : {}}
    >
      <div className={styles.unitName}>
        {isActive && "✔ "}{unitDef.name || unitId}
      </div>
      <div className={styles.unitCost}>{costLabel}</div>
    </div>
  );
};

const MultiUnitOptionCard = ({ 
    optionKey,
    optionNameOverride,
    unitIds, 
    isActive, 
    onClick, 
    unitsMap,
    logicHelpers,
    isLocked,
    customCosts 
}) => {
    let totalCost = 0;
    
    if (customCosts?.costOverride !== undefined) {
        totalCost = customCosts.costOverride;
    } else {
        unitIds.forEach(id => {
            totalCost += logicHelpers.getFinalUnitCost(id, false);
        });
        if (customCosts?.extraCost) {
            totalCost += customCosts.extraCost;
        }
    }

    const displayName = optionNameOverride || `Pakiet (${unitIds.length} jedn.)`;

    return (
        <div 
            className={`${styles.unitCard} ${isActive ? styles.active : ''} ${onClick && !isLocked ? styles.selectable : ''}`}
            onClick={isLocked ? undefined : onClick}
            style={{ 
                borderStyle: 'double', 
                borderWidth: 3,
                ...(isLocked ? { cursor: 'default' } : {})
            }}
        >
            <div className={styles.unitName} style={{ marginBottom: 8, borderBottom: '1px solid #eee', paddingBottom: 4 }}>
                {isActive && "✔ "}{displayName}
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {unitIds.map((uid, idx) => (
                    <div key={idx} style={{ fontSize: 11, display: 'flex', justifyContent: 'space-between', color: '#555' }}>
                        <span>• {unitsMap[uid]?.name || uid}</span>
                    </div>
                ))}
            </div>

            <div className={styles.unitCost} style={{ marginTop: 8, fontWeight: 'bold' }}>
                Razem: {totalCost} PS
            </div>
        </div>
    );
};

const ActiveOptionConfigurationPanel = ({
    unitIds,
    basePositionKey,
    unitsMap,
    state,
    handlers,
    regiment,
    commonImprovements,
    unitLevelImprovements,
    helpers
}) => {
    return (
        <div style={{ marginTop: 12, padding: 12, background: '#f8f9fa', borderRadius: 8, borderLeft: '4px solid #0077ff' }}>
            <div style={{fontSize: 11, fontWeight: '700', textTransform: 'uppercase', marginBottom: 8, color: '#666'}}>
                Konfiguracja Wybranych Jednostek:
            </div>
            {unitIds.map((uid, uIdx) => {
                const positionKey = `${basePositionKey}/${uIdx}`;
                const unitDef = unitsMap[uid];
                
                // Sprawdzamy czy to grupa (np. Kethuda, Aga)
                const isGroupRank = unitDef?.rank === 'group';

                const validImprovements = unitLevelImprovements.filter(imp => {
                    return canUnitTakeImprovement(unitDef, imp.id, regiment);
                });

                return (
                    <div key={uIdx} style={{ marginBottom: 8, paddingBottom: 8, borderBottom: uIdx < unitIds.length - 1 ? '1px dashed #ccc' : 'none' }}>
                        <div style={{fontWeight: 600, fontSize: 13, marginBottom: 4, display: 'flex', justifyContent: 'space-between'}}>
                            <span>{uIdx + 1}. {unitDef?.name}</span>
                            <span style={{fontWeight: 400, color: '#888', fontSize: 11}}>({helpers.getFinalUnitCost(uid, false)} PS)</span>
                        </div>

                        {/* Wyświetlamy kontener ulepszeń tylko jeśli jednostka NIE JEST grupą */}
                        {!isGroupRank && (
                            <div className={styles.improvementsContainer} style={{marginTop: 0, border: 'none', paddingTop: 0}}>
                                {validImprovements.length > 0 ? validImprovements.map(imp => {
                                    const isSelected = state.improvements[positionKey]?.includes(imp.id);
                                    const cost = calculateSingleImprovementIMPCost(unitDef, imp.id, regiment, commonImprovements);
                                    const canAfford = isSelected || (state.newRemainingPointsAfterLocalChanges - cost >= 0);

                                    const commonDef = commonImprovements[imp.id];
                                    const displayName = imp.name || commonDef?.name || imp.id;

                                    return (
                                        <button
                                            key={imp.id}
                                            className={`${styles.impBadge} ${isSelected ? styles.active : ''}`}
                                            onClick={() => handlers.handleImprovementToggle(positionKey, uid, imp.id)}
                                            disabled={!isSelected && !canAfford}
                                            title={`Koszt: ${cost} PU`}
                                        >
                                            {displayName} ({cost} PU)
                                        </button>
                                    );
                                }) : (
                                    <span style={{fontSize: 11, color: '#999', fontStyle: 'italic'}}>Brak dostępnych ulepszeń</span>
                                )}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

const GroupSection = ({ 
  type, 
  groupKey, 
  data, 
  selections, 
  handlers, 
  logicHelpers,
  state,
  unitsMap,
  unitLevelImprovements,
  isLocked,
  regiment,
  commonImprovements 
}) => {
  const isOptionalGroup = groupKey === GROUP_TYPES.OPTIONAL;
  const mapKey = `${type}/optional`;
  
  let isEnabled = true;
  if (type === GROUP_TYPES.ADDITIONAL && !state.additionalEnabled) isEnabled = false;
  if (isOptionalGroup) {
      if (!state.optionalEnabled[mapKey]) isEnabled = false;
  }
  if (isLocked) isEnabled = false;

  return (
    <div className={styles.groupContainer}>
      {isOptionalGroup && (
          <div className={`${styles.groupLabel} ${styles.groupLabelOptional}`} style={{display: 'flex', alignItems: 'center'}}>
             {!isLocked ? (
                 <>
                    <input 
                        type="checkbox" 
                        checked={!!state.optionalEnabled[mapKey]} 
                        onChange={() => handlers.handleToggleOptionalGroup(type, groupKey)}
                        style={{marginRight: 8, cursor: 'pointer'}}
                        disabled={type === GROUP_TYPES.ADDITIONAL && !state.additionalEnabled} 
                    />
                    <span 
                        onClick={() => !(type === GROUP_TYPES.ADDITIONAL && !state.additionalEnabled) && handlers.handleToggleOptionalGroup(type, groupKey)}
                        style={{cursor: 'pointer'}}
                    >
                        Jednostka dodatkowa (Opcjonalne)
                    </span>
                 </>
             ) : (
                 <span>Jednostka dodatkowa (Wymagany zakup jednostki podstawowej)</span>
             )}
          </div>
      )}

      <div className={(!isEnabled || isLocked) ? styles.disabledContent : ''}>
        {(data || []).map((pod, index) => {
            const optionsEntries = Object.entries(pod || {});
            if (optionsEntries.length === 0) return null;

            let selectedKey = null;
            if (isOptionalGroup) {
                selectedKey = state.optionalSelections[mapKey]?.[index];
            } else {
                selectedKey = selections[groupKey]?.[index];
            }
            
            if (!selectedKey && optionsEntries.length === 1 && type === GROUP_TYPES.BASE && !isOptionalGroup) {
                selectedKey = optionsEntries[0][0];
            }

            return (
                <div key={index} className={styles.podContainer}>
                    {optionsEntries.length > 1 && (
                        <div className={styles.podSelectionHint}>
                            Wybierz wariant ({optionsEntries.length} opcje):
                        </div>
                    )}
                    
                    <div className={styles.unitsRow}>
                        {optionsEntries.map(([optKey, optDef]) => {
                            const unitIds = optDef.units || (optDef.id ? [optDef.id] : []);
                            const isActive = selectedKey === optKey;
                            
                            const customCosts = {
                                costOverride: optDef.cost_override,
                                extraCost: optDef.extra_cost
                            };

                            if (unitIds.length > 1) {
                                return (
                                    <MultiUnitOptionCard
                                        key={optKey}
                                        optionKey={optKey}
                                        optionNameOverride={optDef.name_override}
                                        unitIds={unitIds}
                                        isActive={isActive}
                                        onClick={() => handlers.handleSelectInPod(type, groupKey, index, optKey)}
                                        unitsMap={unitsMap}
                                        logicHelpers={logicHelpers}
                                        isLocked={isLocked}
                                        customCosts={customCosts}
                                    />
                                );
                            } else {
                                return (
                                    <SingleUnitOptionCard 
                                        key={optKey}
                                        unitId={unitIds[0]}
                                        isActive={isActive}
                                        onClick={() => handlers.handleSelectInPod(type, groupKey, index, optKey)}
                                        unitMap={unitsMap}
                                        logicHelpers={logicHelpers}
                                        isLocked={isLocked}
                                        customCosts={customCosts}
                                    />
                                );
                            }
                        })}
                    </div>

                    {selectedKey && pod[selectedKey] && (
                        <ActiveOptionConfigurationPanel
                            unitIds={pod[selectedKey].units || (pod[selectedKey].id ? [pod[selectedKey].id] : [])}
                            basePositionKey={isOptionalGroup ? `${type}/optional/${index}` : `${type}/${groupKey}/${index}`}
                            unitsMap={unitsMap}
                            state={state}
                            handlers={handlers}
                            regiment={regiment}
                            commonImprovements={commonImprovements}
                            unitLevelImprovements={unitLevelImprovements}
                            helpers={logicHelpers}
                        />
                    )}
                </div>
            );
        })}
      </div>
    </div>
  );
};


// --- Main Component ---

export default function RegimentEditor(props) {
  const { state, definitions, handlers, helpers } = useRegimentLogic(props);
  const { unitsMap, regiment, regimentRules } = props;
  const { base, additional, commonImprovements } = definitions;
  
  const formatCost = (cost) => {
      if (cost === 'double') return 'x2';
      if (cost === 'triple') return 'x3';
      if (typeof cost === 'number') return `${cost} PU`;
      return cost;
  };

  const specialRules = regiment.special_rules || [];

  return (
    <div className={styles.container}>
      <div className={styles.topBar}>
        <div className={styles.topBarTitle}>
            Edycja Pułku: {regiment.name}
        </div>
        <div className={styles.actionButtons}>
            <button className={styles.btnSecondary} onClick={handlers.onBack}>Anuluj</button>
            <button className={styles.btnPrimary} onClick={handlers.saveAndGoBack}>Zapisz Zmiany</button>
        </div>
      </div>

      <div className={styles.contentGrid}>
        {/* LEFT COLUMN */}
        <div className={styles.mainColumn}>
            
            {/* BASE SECTION */}
            <div className={styles.sectionCard}>
                <div className={styles.sectionHeader}>
                    <h3 className={styles.sectionTitle}>Podstawa Pułku (Obowiązkowe)</h3>
                </div>
                {helpers.groupKeys(base).map(gk => (
                    <GroupSection 
                        key={`base-${gk}`}
                        type="base"
                        groupKey={gk}
                        data={base[gk]}
                        selections={state.baseSelections}
                        handlers={handlers}
                        logicHelpers={helpers}
                        state={state}
                        unitsMap={unitsMap}
                        unitLevelImprovements={definitions.unitLevelImprovements}
                        regiment={regiment}
                        commonImprovements={commonImprovements}
                    />
                ))}
            </div>

            {/* SUPPORT SECTION */}
            {state.assignedSupportUnits.length > 0 && (
                <div className={`${styles.sectionCard} ${styles.supportCard}`}>
                    <div className={`${styles.sectionHeader} ${styles.supportHeader}`}>
                        <h3 className={`${styles.sectionTitle} ${styles.supportTitle}`}>
                            Przypisane Wsparcie (Support)
                        </h3>
                    </div>
                    <div className={styles.groupContainer}>
                         {state.assignedSupportUnits.map((su) => {
                            const supportPositionKey = `support/${su.id}-${su.assignedTo.positionKey}`;
                            return (
                                <ActiveOptionConfigurationPanel
                                    key={su.id}
                                    unitIds={[su.id]}
                                    basePositionKey={`support/${su.id}-${su.assignedTo.positionKey}`}
                                    unitsMap={unitsMap}
                                    state={state}
                                    handlers={handlers}
                                    regiment={regiment}
                                    commonImprovements={commonImprovements}
                                    unitLevelImprovements={definitions.unitLevelImprovements}
                                    helpers={helpers}
                                />
                            ); 
                        })}
                    </div>
                </div>
            )}

            {/* ADDITIONAL SECTION (Poziom I) */}
            <div className={styles.sectionCard}>
                <div className={styles.sectionHeader}>
                    <h3 className={styles.sectionTitle} style={{display:'flex', alignItems:'center'}}>
                        <input 
                            type="checkbox" 
                            checked={state.additionalEnabled} 
                            onChange={handlers.handleToggleAdditional}
                            style={{width: 20, height: 20, marginRight: 10, cursor: 'pointer'}}
                        />
                        <span 
                            onClick={handlers.handleToggleAdditional} 
                            style={{cursor: 'pointer'}}
                        >
                            Poziom I (Dodatkowe)
                        </span>
                    </h3>
                </div>

                <div className={!state.additionalEnabled ? styles.disabledContent : ''}>
                    {helpers.groupKeys(additional).map(gk => {
                        const isOptionalLocked = gk === GROUP_TYPES.OPTIONAL && !state.hasAdditionalBaseSelection;
                        
                        return (
                            <GroupSection 
                                key={`add-${gk}`}
                                type="additional"
                                groupKey={gk}
                                data={additional[gk]}
                                selections={state.additionalSelections}
                                handlers={handlers}
                                logicHelpers={helpers}
                                state={state}
                                unitsMap={unitsMap}
                                unitLevelImprovements={definitions.unitLevelImprovements}
                                isLocked={isOptionalLocked}
                                regiment={regiment}
                                commonImprovements={commonImprovements}
                            />
                        );
                    })}
                    
                    {/* Custom Slot (Poziom II) */}
                    {definitions.customCostDefinition && definitions.customCostSlotName && (
                        <div 
                            className={`${styles.groupContainer} ${styles.customSlotSeparator} ${!state.additionalEnabled ? styles.disabledContent : ''}`} 
                        >
                            <div className={styles.groupLabel}>Poziom II (Special)</div>
                            <div className={styles.unitsRow}>
                                {definitions.customCostDefinition.map(def => {
                                    const uid = def.id;
                                    const isActive = state.selectedAdditionalCustom === uid;
                                    return (
                                        <div key={uid} style={{width: '100%'}}>
                                            <SingleUnitOptionCard
                                                unitId={uid}
                                                isActive={isActive}
                                                onClick={() => handlers.handleCustomSelect(uid)}
                                                unitMap={unitsMap}
                                                logicHelpers={helpers}
                                                isLocked={!state.additionalEnabled}
                                            />
                                            {isActive && (
                                                <ActiveOptionConfigurationPanel
                                                    unitIds={[uid]}
                                                    basePositionKey={`additional/${definitions.customCostSlotName}_custom`} 
                                                    unitsMap={unitsMap}
                                                    state={state}
                                                    handlers={handlers}
                                                    regiment={regiment}
                                                    commonImprovements={commonImprovements}
                                                    unitLevelImprovements={definitions.unitLevelImprovements}
                                                    helpers={helpers}
                                                />
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>

        {/* RIGHT COLUMN - SIDEBAR */}
        <div className={styles.sidebar}>
            <div className={styles.sectionCard}>
                
                {/* 1. Koszty */}
                <div className={styles.pointsBox}>
                    <span className={styles.pointsLabel}>Koszt Całkowity</span>
                    <span className={styles.pointsBig}>{state.totalCost} PS</span>
                </div>
                
                <div className={styles.statRow} style={{borderBottom: 'none', marginBottom: 10}}>
                    <span className={styles.statLabel}>Typ Pułku:</span>
                    <span className={styles.statValue} style={{textTransform: 'uppercase', color: '#0077ff'}}>
                        {state.stats.regimentType}
                    </span>
                </div>

                <div className={styles.statsSeparator}></div>

                {/* 2. Statystyki Bojowe */}
                <div className={styles.statRow}>
                    <span className={styles.statLabel}>Zwiad:</span>
                    <span className={styles.statValue}>{state.stats.totalRecon}</span>
                </div>
                <div className={styles.statRow}>
                    <span className={styles.statLabel}>Motywacja:</span>
                    <span className={styles.statValue}>{state.stats.totalMotivation}</span>
                </div>
                
                {/* ZMIANA: Z "Aktywacje" na "Znaczniki Aktywacji" */}
                <div className={styles.statRow}>
                    <span className={styles.statLabel}>Znaczniki Aktywacji:</span>
                    <span className={styles.statValue}>{state.stats.totalActivations}</span>
                </div>
                
                <div className={styles.statRow}>
                    <span className={styles.statLabel}>Rozkazy:</span>
                    <span className={styles.statValue}>{state.stats.totalOrders}</span>
                </div>
                <div className={styles.statRow}>
                    <span className={styles.statLabel}>Czujność (Awareness):</span>
                    <span className={styles.statValue}>{state.stats.totalAwareness}</span>
                </div>
            </div>

            {/* NOWE: Zasady Specjalne Pułku */}
            {specialRules.length > 0 && (
                <div className={styles.sectionCard}>
                    <h4 className={styles.groupLabel}>Zasady Specjalne</h4>
                    <div className={styles.regimentImprovementsList}>
                        {specialRules.map(ruleId => {
                            const rule = regimentRules[ruleId];
                            const name = rule?.name || ruleId;
                            const desc = rule?.description;

                            return (
                                <div key={ruleId} style={{marginBottom: 8}}>
                                    <div style={{fontWeight: 'bold', fontSize: 13}}>{name}</div>
                                    {desc && <div style={{fontSize: 11, color: '#555', marginTop: 2, lineHeight: 1.3}}>{desc}</div>}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Ulepszenia Pułku */}
            {definitions.regimentLevelImprovements.length > 0 && (
                <div className={styles.sectionCard}>
                    <h4 className={styles.groupLabel}>Ulepszenia Pułku</h4>
                    <div className={styles.regimentImprovementsList}>
                        {definitions.regimentLevelImprovements.map(imp => {
                            const isActive = state.regimentImprovements.includes(imp.id);
                            
                            const commonDef = definitions.commonImprovements?.[imp.id];
                            const displayName = imp.name || commonDef?.name || imp.id;

                            const armyCost = imp.army_point_cost ?? commonDef?.army_point_cost;
                            const puCost = imp.cost ?? commonDef?.cost;
                            
                            const costParts = [];
                            if (typeof armyCost === 'number') costParts.push(`${armyCost} PS`);
                            if (typeof puCost === 'number') costParts.push(`${puCost} PU`);
                            
                            const costString = costParts.length > 0 
                                ? `(${costParts.join(" + ")})` 
                                : "";

                            return (
                                <label key={imp.id} className={`${styles.toggleLabel} ${styles.regimentImprovementLabel}`}>
                                    <input 
                                        type="checkbox"
                                        checked={isActive}
                                        onChange={() => handlers.handleRegimentImprovementToggle(imp.id)}
                                    />
                                    {displayName} {costString}
                                </label>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Tabela Ulepszeń Jednostek */}
            {definitions.unitLevelImprovements.length > 0 && (
                <div className={styles.sectionCard}>
                    <div style={{marginBottom: 10}}>
                        <h4 className={styles.groupLabel} style={{marginBottom: 4}}>Dostępne Ulepszenia</h4>
                        <div style={{fontSize: 12, display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                            <span>Pozostałe punkty:</span>
                            <span className={`${styles.impPoints} ${state.newRemainingPointsAfterLocalChanges < 0 ? styles.error : styles.ok}`}>
                                {state.newRemainingPointsAfterLocalChanges}
                            </span>
                        </div>
                    </div>
                    
                    <table style={{width: '100%', borderCollapse: 'collapse', fontSize: 12}}>
                        <thead>
                            <tr style={{borderBottom: '2px solid #eee', color: '#666'}}>
                                <th style={{textAlign: 'left', paddingBottom: 4}}>Nazwa</th>
                                <th style={{textAlign: 'center', paddingBottom: 4}}>Koszt</th>
                                <th style={{textAlign: 'right', paddingBottom: 4}}>Ilość</th>
                            </tr>
                        </thead>
                        <tbody>
                            {definitions.unitLevelImprovements.map(imp => {
                                const commonDef = definitions.commonImprovements?.[imp.id];
                                const name = imp.name || commonDef?.name || imp.id;
                                
                                let rawCost = imp.cost_override !== undefined ? imp.cost_override : (imp.cost !== undefined ? imp.cost : commonDef?.cost);
                                
                                const currentCount = Object.values(state.improvements)
                                    .flat()
                                    .filter(id => id === imp.id).length;

                                const limitLabel = imp.max_amount ? `${currentCount} / ${imp.max_amount}` : `${currentCount} / ∞`;
                                const isLimitReached = imp.max_amount && currentCount >= imp.max_amount;

                                return (
                                    <tr key={imp.id} style={{borderBottom: '1px solid #f0f0f0'}}>
                                        <td style={{padding: '6px 0', color: '#333'}}>{name}</td>
                                        <td style={{padding: '6px 0', textAlign: 'center', color: '#666'}}>{formatCost(rawCost)}</td>
                                        <td style={{padding: '6px 0', textAlign: 'right', fontWeight: 'bold', color: isLimitReached ? '#d32f2f' : '#0056b3'}}>
                                            {limitLabel}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
      </div>
    </div>
  );
}