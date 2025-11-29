import React from "react";
import { useRegimentLogic } from "./useRegimentLogic";
import styles from "./RegimentEditor.module.css";
import { GROUP_TYPES } from "../constants";
import { 
    canUnitTakeImprovement, 
    calculateSingleImprovementIMPCost 
} from "../utils/armyMath";

// --- Sub-components (View Only) ---

const UnitCard = ({ 
  unitId, 
  isActive, 
  onClick, 
  unitMap, 
  improvements, 
  onImprovementToggle, 
  getFinalUnitCost,
  unitLevelImprovements,
  positionKey,
  remainingPoints,
  regiment,
  commonImprovements
}) => {
  const unitDef = unitMap[unitId];
  if (!unitDef) return null;

  const baseCost = getFinalUnitCost(unitId, false);
  
  const unitPuCost = unitDef.improvement_points_cost || unitDef.pu_cost || 0;
  
  const costLabel = unitPuCost > 0 
      ? `${baseCost} PS + ${unitPuCost} PU` 
      : `${baseCost} PS`;

  const validImprovements = unitLevelImprovements.filter(imp => {
      return canUnitTakeImprovement(unitDef, imp.id, regiment);
  });

  return (
    <div 
      className={`${styles.unitCard} ${isActive ? styles.active : ''} ${onClick ? styles.selectable : ''}`}
      onClick={onClick}
    >
      <div className={styles.unitName}>
        {isActive && "✔ "}{unitDef.name || unitId}
      </div>
      <div className={styles.unitCost}>{costLabel}</div>

      {validImprovements.length > 0 && isActive && (
        <div className={styles.improvementsContainer} onClick={(e) => e.stopPropagation()}>
          {validImprovements.map(imp => {
             const isSelected = improvements?.includes(imp.id);
             const cost = calculateSingleImprovementIMPCost(unitDef, imp.id, regiment, commonImprovements);
             const canAfford = isSelected || (remainingPoints - cost >= 0);

             return (
               <button
                 key={imp.id}
                 className={`${styles.impBadge} ${isSelected ? styles.active : ''}`}
                 onClick={() => onImprovementToggle(positionKey, unitId, imp.id)}
                 disabled={!isSelected && !canAfford}
                 title={`Koszt: ${cost} PU`}
               >
                 {imp.id}
               </button>
             );
          })}
        </div>
      )}
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
  const { handleSelectInPod, handleImprovementToggle } = handlers;
  const { getFinalUnitCost } = logicHelpers;
  
  const isOptionalGroup = groupKey === GROUP_TYPES.OPTIONAL;
  
  let isEnabled = true;
  if (type === GROUP_TYPES.ADDITIONAL && !state.additionalEnabled) isEnabled = false;
  if (isOptionalGroup) {
      const mapKey = `${type}/optional`;
      if (!state.optionalEnabled[mapKey]) isEnabled = false;
  }
  
  if (isLocked) isEnabled = false;

  return (
    <div className={styles.groupContainer}>
      {isOptionalGroup && (
          <div className={`${styles.groupLabel} ${styles.groupLabelOptional}`}>
             {isLocked ? "Jednostka dodatkowa (Wymagany zakup jednostki podstawowej)" : "Jednostka dodatkowa (Opcjonalne)"}
          </div>
      )}

      <div className={!isEnabled ? styles.disabledContent : ''}>
        {(data || []).map((pod, index) => {
            const options = Object.values(pod || {}).map(v => v?.id).filter(Boolean);
            if (options.length === 0) return null;

            let selectedId = null;
            if (isOptionalGroup) {
                selectedId = state.optionalSelections[`${type}/optional`]?.[index];
            } else {
                selectedId = selections[groupKey]?.[index];
            }
            
            if (!selectedId && options.length === 1 && type === GROUP_TYPES.BASE && !isOptionalGroup) {
                selectedId = options[0];
            }

            const positionKey = isOptionalGroup 
                ? `${type}/optional/${index}` 
                : `${type}/${groupKey}/${index}`;

            return (
                <div key={index} className={styles.podContainer}>
                    {options.length > 1 && (
                        <div className={styles.podSelectionHint}>
                            Wybierz 1 z {options.length}:
                        </div>
                    )}
                    <div className={styles.unitsRow}>
                        {options.map(unitId => {
                            const isActive = selectedId === unitId;
                            return (
                                <UnitCard 
                                    key={unitId}
                                    unitId={unitId}
                                    isActive={isActive}
                                    onClick={isLocked ? undefined : () => handleSelectInPod(type, groupKey, index, unitId)}
                                    unitMap={unitsMap}
                                    improvements={state.improvements[positionKey]}
                                    onImprovementToggle={handleImprovementToggle}
                                    getFinalUnitCost={getFinalUnitCost}
                                    unitLevelImprovements={unitLevelImprovements}
                                    positionKey={positionKey}
                                    remainingPoints={state.newRemainingPointsAfterLocalChanges}
                                    regiment={regiment}
                                    commonImprovements={commonImprovements}
                                />
                            );
                        })}
                    </div>
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
  const { unitsMap, regiment } = props;
  const { base, additional, commonImprovements } = definitions;
  
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
                         <div className={styles.unitsRow}>
                            {state.assignedSupportUnits.map((su) => {
                                const supportPositionKey = `support/${su.id}-${su.assignedTo.positionKey}`;
                                return (
                                    <UnitCard 
                                        key={su.id}
                                        unitId={su.id}
                                        isActive={true}
                                        unitMap={unitsMap}
                                        improvements={state.improvements[supportPositionKey]}
                                        onImprovementToggle={handlers.handleImprovementToggle}
                                        getFinalUnitCost={(uid) => helpers.getFinalUnitCost(uid, false)}
                                        unitLevelImprovements={definitions.unitLevelImprovements}
                                        positionKey={supportPositionKey}
                                        remainingPoints={state.newRemainingPointsAfterLocalChanges}
                                        regiment={regiment} 
                                        commonImprovements={commonImprovements}
                                    />
                                );
                            })}
                         </div>
                    </div>
                </div>
            )}

            {/* ADDITIONAL SECTION (Poziom I) */}
            <div className={styles.sectionCard}>
                <div className={styles.sectionHeader}>
                    <h3 className={styles.sectionTitle}>Poziom I</h3>
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
                    
                    {/* Custom Slot */}
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
                                        <UnitCard
                                            key={uid}
                                            unitId={uid}
                                            isActive={isActive}
                                            onClick={() => handlers.handleCustomSelect(uid)}
                                            unitMap={unitsMap}
                                            improvements={state.improvements[`additional/${definitions.customCostSlotName}_custom`]}
                                            onImprovementToggle={handlers.handleImprovementToggle}
                                            getFinalUnitCost={(id) => helpers.getFinalUnitCost(id, true)}
                                            unitLevelImprovements={definitions.unitLevelImprovements}
                                            positionKey={`additional/${definitions.customCostSlotName}_custom`}
                                            remainingPoints={state.newRemainingPointsAfterLocalChanges}
                                            regiment={regiment}
                                            commonImprovements={commonImprovements}
                                        />
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
                
                {/* 1. Koszty i Punkty */}
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

                <div className={styles.statRow}>
                    <span className={styles.statLabel}>Pozostałe Punkty Ulepszeń Dywizji:</span>
                    <span className={`${styles.impPoints} ${state.newRemainingPointsAfterLocalChanges < 0 ? styles.error : styles.ok}`}>
                        {state.newRemainingPointsAfterLocalChanges}
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
                <div className={styles.statRow}>
                    <span className={styles.statLabel}>Aktywacje:</span>
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

            {/* OSOBNA KARTA: Ulepszenia Pułku */}
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
        </div>
      </div>
    </div>
  );
}