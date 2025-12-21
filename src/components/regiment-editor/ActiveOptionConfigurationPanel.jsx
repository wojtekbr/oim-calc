import React from "react";
import styles from "../../pages/RegimentEditor.module.css";
import {
    canUnitTakeImprovement,
    checkIfImprovementWouldBeFree,
    checkIfImprovementIsMandatory,
    calculateSingleImprovementIMPCost,
    calculateEffectiveImprovementCount
} from "../../utils/armyMath";

export const ActiveOptionConfigurationPanel = ({
                                                   unitIds,
                                                   basePositionKey,
                                                   unitsMap,
                                                   state,
                                                   handlers,
                                                   regiment,
                                                   commonImprovements,
                                                   unitLevelImprovements,
                                                   helpers,
                                                   currentConfig,
                                                   divisionDefinition
                                               }) => {
    return (
        <div className={styles.activeConfigPanel}>
            <div className={styles.activeConfigTitle}>
                Konfiguracja Wybranych Jednostek:
            </div>
            {unitIds.map((uid, uIdx) => {
                const positionKey = `${basePositionKey}/${uIdx}`;
                const unitDef = unitsMap[uid];

                const isGroupRank = unitDef?.rank === 'group';

                const validImprovements = unitLevelImprovements.filter(imp => {
                    return canUnitTakeImprovement(unitDef, imp.id, regiment, divisionDefinition, unitsMap);
                });

                return (
                    <div key={uIdx} className={styles.activeUnitRow}>
                        <div className={styles.activeUnitHeader}>
                            <span>{uIdx + 1}. {unitDef?.name}</span>
                            <span className={styles.activeUnitCostLabel}>({helpers.getFinalUnitCost(uid, false)} PS)</span>
                        </div>

                        {!isGroupRank && (
                            <div className={styles.cleanImprovementsContainer}>
                                {validImprovements.length > 0 ? validImprovements.map(imp => {
                                    const isSelected = state.improvements[positionKey]?.includes(imp.id);

                                    // FIX: Przekazujemy positionKey zamiast uid
                                    const willBeFree = checkIfImprovementWouldBeFree(currentConfig, regiment, positionKey, imp.id, divisionDefinition, unitsMap);

                                    const isMandatory = checkIfImprovementIsMandatory(uid, imp.id, divisionDefinition, regiment.id, unitsMap);

                                    const cost = calculateSingleImprovementIMPCost(unitDef, imp.id, regiment, commonImprovements);
                                    const canAfford = isSelected || willBeFree || (state.newRemainingPointsAfterLocalChanges - cost >= 0);

                                    const effectiveCount = calculateEffectiveImprovementCount(currentConfig, regiment, imp.id, divisionDefinition, unitsMap);
                                    const isLimitReached = imp.max_amount && effectiveCount >= imp.max_amount;

                                    const isDisabled = (
                                        isMandatory ||
                                        (!isSelected && ((isLimitReached && !willBeFree) || (!willBeFree && !canAfford)))
                                    );

                                    let tooltip = willBeFree ? "0 PU (Darmowe)" : `${cost} PU`;
                                    if (isMandatory) tooltip = "0 PU (Obowiązkowe z zasad dywizji)";
                                    else if (!isSelected) {
                                        if (isLimitReached && !willBeFree) tooltip += " (Limit osiągnięty)";
                                        else if (!willBeFree && !canAfford) tooltip += " (Brak punktów)";
                                    }

                                    const commonDef = commonImprovements[imp.id];
                                    const displayName = imp.name || commonDef?.name || imp.id;

                                    return (
                                        <button
                                            key={imp.id}
                                            className={`${styles.impBadge} ${isSelected ? styles.active : ''}`}
                                            onClick={() => handlers.handleImprovementToggle(positionKey, uid, imp.id)}
                                            disabled={isDisabled}
                                            title={tooltip}
                                        >
                                            {displayName} {willBeFree ? "(0 PU)" : `(${cost} PU)`}
                                            {isMandatory && " 🔒"}
                                        </button>
                                    );
                                }) : (
                                    <span className={styles.emptyImprovements}>Brak dostępnych ulepszeń</span>
                                )}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};