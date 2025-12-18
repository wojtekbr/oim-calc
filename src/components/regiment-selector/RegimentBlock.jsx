import React from "react";
import styles from "../../pages/RegimentSelector.module.css";
import { IDS, GROUP_TYPES } from "../../constants";
import { checkDivisionConstraints } from "../../utils/divisionRules";
import { RegimentOptionTile } from "./RegimentOptionTile";
import { SelectedRegimentRow } from "./SelectedRegimentRow";

export const RegimentBlock = ({
                                  group, regiments, definitionOptions, mainForceKey, getRegimentDefinition, calculateStats,
                                  onNameChange, onRegimentChange, onOpenEditor, onMainForceSelect, supportUnits, unitsMap,
                                  configuredDivision, divisionDefinition, currentMainForceCost, isAllied, currentAlliesCount, calculateRegimentPU,
                                  // --- NOWE PROPSY ---
                                  getEffectiveUnitImprovements,
                                  improvementsMap
                              }) => {
    return regiments.map((regiment, index) => {
        const options = definitionOptions[index].options;
        const currentRegimentId = regiment.id;

        const handleTileClick = (optId, isBlocked) => {
            if (isBlocked) return;
            let newId = optId;
            if (currentRegimentId === optId) { newId = IDS.NONE; }
            onRegimentChange(group, index, newId);
        };

        if (currentRegimentId !== IDS.NONE) {
            return (
                <div key={`${group}-${index}`} className={styles.regimentRow}>
                    <div style={{marginBottom: 10}}>
                        <div className={styles.optionsGrid}>
                            {options.filter(optId => optId !== IDS.NONE).map(optId => {
                                const isActive = currentRegimentId === optId;
                                const isRuleBlocked = !isActive && !checkDivisionConstraints(configuredDivision, divisionDefinition, optId);
                                const isOptionAlly = isAllied(optId);
                                const isAllyBlocked = isOptionAlly && currentAlliesCount >= 1 && currentRegimentId !== optId;
                                return (<RegimentOptionTile key={optId} optId={optId} isActive={isActive} disabled={isRuleBlocked || isAllyBlocked} isAllied={isOptionAlly} divisionDefinition={divisionDefinition} onClick={() => handleTileClick(optId, isRuleBlocked || isAllyBlocked)} getRegimentDefinition={getRegimentDefinition} />);
                            })}
                        </div>
                    </div>
                    <SelectedRegimentRow
                        group={group}
                        index={index}
                        regiment={regiment}
                        mainForceKey={mainForceKey}
                        getRegimentDefinition={getRegimentDefinition}
                        calculateStats={calculateStats}
                        onNameChange={onNameChange}
                        onOpenEditor={onOpenEditor}
                        onMainForceSelect={onMainForceSelect}
                        supportUnits={supportUnits}
                        unitsMap={unitsMap}
                        currentMainForceCost={currentMainForceCost}
                        isAllied={isAllied}
                        calculateRegimentPU={calculateRegimentPU}
                        // --- PRZEKAZYWANIE DALEJ ---
                        getEffectiveUnitImprovements={getEffectiveUnitImprovements}
                        improvementsMap={improvementsMap}
                        divisionDefinition={divisionDefinition}
                    />
                </div>
            );
        } else {
            return (
                <div key={`${group}-${index}`} className={styles.regimentRow}>
                    <div className={styles.regTitle}>{group === GROUP_TYPES.VANGUARD ? `Pułk Straży #${index+1}` : `Pułk #${index+1}`}</div>
                    <div className={styles.optionsGrid}>
                        {options.filter(optId => optId !== IDS.NONE).map(optId => {
                            const isRuleBlocked = !checkDivisionConstraints(configuredDivision, divisionDefinition, optId);
                            const isOptionAlly = isAllied(optId);
                            const isAllyBlocked = isOptionAlly && currentAlliesCount >= 1;
                            return (<RegimentOptionTile key={optId} optId={optId} isActive={false} disabled={isRuleBlocked || isAllyBlocked} isAllied={isOptionAlly} divisionDefinition={divisionDefinition} onClick={() => handleTileClick(optId, isRuleBlocked || isAllyBlocked)} getRegimentDefinition={getRegimentDefinition} />);
                        })}
                    </div>
                </div>
            );
        }
    });
};