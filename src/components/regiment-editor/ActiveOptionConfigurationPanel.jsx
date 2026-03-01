import React from "react";
import styles from "../../pages/RegimentEditor.module.css";
import {
    canUnitTakeImprovement,
    checkIfImprovementWouldBeFree,
    checkIfImprovementIsMandatory,
    calculateSingleImprovementIMPCost
    // calculateEffectiveImprovementCount <--- Nie potrzebujemy już lokalnego importu
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

                const isGroupRank = unitDef?.rank === "group";
                if (isGroupRank) {
                    return (
                        <div key={uIdx} className={styles.activeConfigRow}>
                            <div className={styles.unitNameTitle}>
                                {unitDef?.name || uid} (Grupa - brak ulepszeń)
                            </div>
                        </div>
                    );
                }

                const currentImps = state.improvements[positionKey] || [];
                const possibleImps = unitLevelImprovements.filter(imp =>
                    canUnitTakeImprovement(unitDef, imp.id, regiment, divisionDefinition, unitsMap)
                );
                return (
                    <div key={uIdx} className={styles.activeConfigRow}>
                        <div className={styles.unitNameTitle}>
                            {unitDef?.name || uid}
                        </div>

                        {possibleImps.length > 0 && (
                            <div className={styles.impsContainer}>
                                {possibleImps.map(imp => {
                                    const isSelected = currentImps.includes(imp.id);

                                    // --- ZMIANA: Używamy helpera z useRegimentLogic, który liczy też support units ---
                                    const effectiveCount = helpers.getImprovementCount(imp.id);
                                    // ---------------------------------------------------------------------------------

                                    const isLimitReached = imp.max_amount && effectiveCount >= imp.max_amount;
                                    const isMandatory = checkIfImprovementIsMandatory(uid, imp.id, divisionDefinition, regiment.id, unitsMap);

                                    let cost = 0;
                                    let willBeFree = false;

                                    if (!isSelected) {
                                        willBeFree = checkIfImprovementWouldBeFree(currentConfig, regiment, positionKey, imp.id, divisionDefinition, unitsMap);
                                        if (!willBeFree) {
                                            cost = calculateSingleImprovementIMPCost(unitDef, imp.id, regiment, commonImprovements);
                                        }
                                    }

                                    const canAfford = willBeFree || (state.newRemainingPointsAfterLocalChanges - cost >= 0);

                                    // Disable logic:
                                    // 1. Mandatory -> disabled (can't remove)
                                    // 2. Limit reached -> disabled (can't add more), unless currently selected (can remove)
                                    // 3. Can't afford -> disabled (can't add)
                                    let isDisabled = false;
                                    let tooltip = "";

                                    if (isMandatory) {
                                        isDisabled = true;
                                        tooltip = "Ulepszenie obowiązkowe";
                                    } else if (!isSelected) {
                                        if (isLimitReached) {
                                            isDisabled = true;
                                            tooltip = `Osiągnięto limit: ${imp.max_amount}`;
                                        } else if (!canAfford) {
                                            isDisabled = true;
                                            tooltip = "Brak wystarczających punktów ulepszeń";
                                        }
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
                                })}
                            </div>
                        )}
                        {possibleImps.length === 0 && (
                            <div className={styles.emptyImprovements}>Brak dostępnych ulepszeń</div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};