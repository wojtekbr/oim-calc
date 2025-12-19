import React from "react";
import styles from "../../pages/RegimentEditor.module.css";
import { GROUP_TYPES } from "../../constants";
import { SingleUnitOptionCard, MultiUnitOptionCard } from "./UnitOptionCards";
import { ActiveOptionConfigurationPanel } from "./ActiveOptionConfigurationPanel";

export const GroupSection = ({
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
                                 commonImprovements,
                                 currentConfig,
                                 divisionDefinition
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
                <div className={styles.groupLabelOptional}>
                    {!isLocked ? (
                        <>
                            <input
                                type="checkbox"
                                className={styles.checkboxInput}
                                checked={!!state.optionalEnabled[mapKey]}
                                onChange={() => handlers.handleToggleOptionalGroup(type, groupKey)}
                                disabled={type === GROUP_TYPES.ADDITIONAL && !state.additionalEnabled}
                            />
                            <span
                                className={styles.clickableSpan}
                                onClick={() => !(type === GROUP_TYPES.ADDITIONAL && !state.additionalEnabled) && handlers.handleToggleOptionalGroup(type, groupKey)}
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
                                        extraCost: optDef.extra_cost,
                                        puCostOverride: optDef.pu_cost_override !== undefined
                                            ? optDef.pu_cost_override
                                            : optDef.improvement_points_cost_override
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
                                    currentConfig={currentConfig}
                                    divisionDefinition={divisionDefinition}
                                />
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};