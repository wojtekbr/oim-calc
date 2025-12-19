import React from "react";
import { useRegimentLogic } from "./useRegimentLogic";
import styles from "./RegimentEditor.module.css";
import { GROUP_TYPES } from "../constants"; // <--- NAPRAWIONY IMPORT
import {
    calculateEffectiveImprovementCount,
    checkIfImprovementIsMandatory,
    collectRegimentUnits,
    canUnitTakeImprovement
} from "../utils/armyMath";
import { getRegimentRulesDescriptions } from "../utils/regimentRules";
import { DIVISION_RULES_DEFINITIONS } from "../utils/rules/divisionRulesDefinitions";

// Importy komponentów zrefaktoryzowanych
import { SingleUnitOptionCard } from "../components/regiment-editor/UnitOptionCards";
import { ActiveOptionConfigurationPanel } from "../components/regiment-editor/ActiveOptionConfigurationPanel";
import { GroupSection } from "../components/regiment-editor/GroupSection";

export default function RegimentEditor(props) {
    const { state, definitions, handlers, helpers } = useRegimentLogic(props);
    const { unitsMap, regiment, configuredDivision, regimentGroup, regimentIndex, divisionDefinition, getRegimentDefinition } = props;
    const { base, additional, commonImprovements } = definitions;

    const currentRegimentConfig = configuredDivision?.[regimentGroup]?.[regimentIndex];
    const customName = currentRegimentConfig?.customName;

    const formatCost = (cost) => {
        if (cost === 'normal') return 'x1';
        if (cost === 'double') return 'x2';
        if (cost === 'triple') return 'x3';
        if (typeof cost === 'number') return `${cost} PU`;
        return cost;
    };

    // --- LOGIKA ZASAD SPECJALNYCH ---

    // 1. Zasady wpisane w pułk (np. "za_mna_bracia_kozacy" z regiments.json)
    const regimentRulesDescriptions = getRegimentRulesDescriptions(regiment);

    // 2. Zasady z poziomu Dywizji, które wpływają na TEN konkretny pułk
    const divisionRules = divisionDefinition?.rules || [];
    const applicableDivisionRules = divisionRules.filter(rule => {
        // Sprawdzamy, czy zasada celuje w ten pułk po ID
        if (rule.regiment_ids && rule.regiment_ids.includes(regiment.id)) return true;
        if (rule.regiment_id === regiment.id) return true;
        return false;
    }).map(rule => {
        const def = DIVISION_RULES_DEFINITIONS[rule.id];
        if (!def) return null;

        // Generujemy opis dynamicznie
        const description = def.getDescription ? def.getDescription(rule, {
            improvements: commonImprovements,
            unitsMap,
            getRegimentDefinition: getRegimentDefinition || ((id) => ({name: id}))
        }) : "";

        return {
            id: rule.id,
            title: def.title || rule.id,
            description
        };
    }).filter(Boolean);

    // 3. Łączymy listy
    const allRulesDescriptions = [...regimentRulesDescriptions, ...applicableDivisionRules];

    // --------------------------------

    const hasErrors = state.regimentRuleErrors && state.regimentRuleErrors.length > 0;

    const tempConfig = {
        baseSelections: state.baseSelections,
        additionalSelections: state.additionalSelections,
        additionalCustom: state.selectedAdditionalCustom,
        additionalEnabled: state.additionalEnabled,
        optionalEnabled: state.optionalEnabled,
        optionalSelections: state.optionalSelections,
        improvements: state.improvements,
        regimentImprovements: state.regimentImprovements
    };

    // --- PRZYGOTOWANIE DO FILTROWANIA TABELI ---
    const activeRegimentUnits = collectRegimentUnits(tempConfig, regiment);
    const activeSupportUnits = state.assignedSupportUnits.map(su => ({
        unitId: su.id,
        structureMandatory: []
    }));
    const allActiveUnits = [...activeRegimentUnits, ...activeSupportUnits];

    return (
        <div className={styles.container}>
            <div className={styles.topBar}>
                <div className={styles.topBarTitle}>
                    Edycja Pułku
                </div>
                <div className={styles.actionButtons}>
                    <button className={styles.btnSecondary} onClick={handlers.onBack}>Anuluj</button>
                    <button
                        className={styles.btnPrimary}
                        onClick={handlers.saveAndGoBack}
                        disabled={hasErrors}
                    >
                        Zapisz Zmiany
                    </button>
                </div>
            </div>

            <div className={styles.contentGrid}>
                {/* LEFT COLUMN */}
                <div className={styles.mainColumn}>

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
                                currentConfig={tempConfig}
                                divisionDefinition={divisionDefinition}
                            />
                        ))}
                    </div>

                    {state.assignedSupportUnits.length > 0 && (
                        <div className={`${styles.sectionCard} ${styles.supportCard}`}>
                            <div className={`${styles.sectionHeader} ${styles.supportHeader}`}>
                                <h3 className={`${styles.sectionTitle} ${styles.supportTitle}`}>
                                    Przypisane Wsparcie (Support)
                                </h3>
                            </div>
                            <div className={styles.groupContainer}>
                                {state.assignedSupportUnits.map((su) => {
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
                                            currentConfig={tempConfig}
                                            divisionDefinition={divisionDefinition}
                                        />
                                    );
                                })}
                            </div>
                        </div>
                    )}

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
                                        currentConfig={tempConfig}
                                        divisionDefinition={divisionDefinition}
                                    />
                                );
                            })}

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
                                                        customCosts={null}
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
                                                            currentConfig={tempConfig}
                                                            divisionDefinition={divisionDefinition}
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
                        <div className={styles.sidebarHeader}>
                            <div style={{fontSize: 11, color: '#666', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px'}}>
                                {divisionDefinition?.name || "Dywizja"}
                            </div>
                            <div className={styles.sidebarTitle}>
                                {regiment.name || "Nieznany Pułk"}
                            </div>
                            {customName && (
                                <div className={styles.sidebarSubtitle}>
                                    "{customName}"
                                </div>
                            )}
                        </div>

                        <div className={styles.pointsBox}>
                            <span className={styles.pointsLabel}>Koszt Całkowity</span>
                            <span className={styles.pointsBig}>{state.totalCost} PS</span>
                        </div>

                        <div className={styles.statRow} style={{borderBottom: 'none', marginBottom: 10}}>
                            <span className={styles.statLabel}>Typ Pułku:</span>
                            <span className={`${styles.statValue} ${styles.statValueType}`}>{state.stats.regimentType}</span>
                        </div>

                        {state.stats.isMainForce && (
                            <div style={{
                                marginTop: 0, marginBottom: 10, padding: '4px 8px',
                                background: '#fff3e0', color: '#e65100',
                                fontSize: 11, fontWeight: 'bold', textTransform: 'uppercase',
                                borderRadius: 4, textAlign: 'center', border: '1px solid #ffe0b2'
                            }}>
                                ★ Siły Główne
                            </div>
                        )}

                        <div className={styles.statsSeparator}></div>

                        <div className={styles.statRow}><span className={styles.statLabel}>Zwiad:</span><span className={styles.statValue}>{state.stats.totalRecon}</span></div>
                        <div className={styles.statRow}><span className={styles.statLabel}>Motywacja:</span><span className={styles.statValue}>{state.stats.totalMotivation}</span></div>
                        <div className={styles.statRow}><span className={styles.statLabel}>Znaczniki Aktywacji:</span><span className={styles.statValue}>{state.stats.totalActivations}</span></div>
                        <div className={styles.statRow}><span className={styles.statLabel}>Rozkazy:</span><span className={styles.statValue}>{state.stats.totalOrders}</span></div>
                        <div className={styles.statRow}><span className={styles.statLabel}>Czujność (Awareness):</span><span className={styles.statValue}>{state.stats.totalAwareness}</span></div>
                    </div>

                    {hasErrors && (
                        <div className={styles.errorBox}>
                            <strong>⚠️ Niespełnione zasady pułku:</strong>
                            <ul className={styles.errorList}>
                                {state.regimentRuleErrors.map((err, i) => (
                                    <li key={i}>{err}</li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* SPIS ZASAD - Łączy zasady pułku i dywizji */}
                    {allRulesDescriptions.length > 0 && (
                        <div className={styles.sectionCard}>
                            <h4 className={styles.groupLabel}>Zasady Specjalne</h4>
                            <div className={styles.regimentImprovementsList}>
                                {allRulesDescriptions.map(rule => (
                                    <div key={rule.id} className={styles.ruleEntry}>
                                        <div className={styles.ruleEntryTitle}>{rule.title}</div>
                                        {rule.description && <div className={styles.ruleEntryDesc}>{rule.description}</div>}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {definitions.regimentLevelImprovements.length > 0 && (
                        <div className={styles.sectionCard}>
                            <h4 className={styles.groupLabel}>Ulepszenia Pułku</h4>
                            <div className={styles.regimentImprovementsList}>
                                {definitions.regimentLevelImprovements.map(imp => {
                                    const isActive = state.regimentImprovements.includes(imp.id);

                                    const commonDef = definitions.commonImprovements?.[imp.id];
                                    const fullDef = { ...commonDef, ...imp }; // Łączymy definicje
                                    const displayName = fullDef.name || imp.id;

                                    // 1. Sprawdź wymagania (Requirements)
                                    if (fullDef.requirements) {
                                        const reqsMet = fullDef.requirements.every(reqId => state.regimentImprovements.includes(reqId));
                                        if (!reqsMet) return null; // Ukryj, jeśli nie spełnia wymagań
                                    }

                                    // 2. Koszty
                                    let armyCost = fullDef.army_cost_override ?? fullDef.army_cost ?? fullDef.army_point_cost ?? 0;
                                    let puCost = fullDef.cost_override ?? fullDef.cost ?? 0;

                                    const costParts = [];
                                    if (armyCost > 0) costParts.push(`${armyCost} PS`);
                                    if (puCost > 0) costParts.push(`${puCost} PU`);

                                    const costString = costParts.length > 0 ? `(${costParts.join(" + ")})` : "";

                                    // 3. Radio vs Checkbox
                                    const isRadio = !!fullDef.group;
                                    const inputType = isRadio ? "radio" : "checkbox";

                                    return (
                                        <label key={imp.id} className={`${styles.toggleLabel} ${styles.regimentImprovementLabel}`}>
                                            <input
                                                type={inputType}
                                                name={isRadio ? fullDef.group : undefined} // Grupowanie dla radia
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

                    {definitions.unitLevelImprovements.length > 0 && (
                        <div className={styles.sectionCard}>
                            <div className={styles.tableContainer}>
                                <div className={styles.tableHeader}>
                                    <h4 className={styles.groupLabel}>Dostępne Ulepszenia</h4>
                                    <div className={styles.pointsDisplay}>
                                        <span>Pozostałe punkty:</span>
                                        <span className={`${styles.impPoints} ${state.newRemainingPointsAfterLocalChanges < 0 ? styles.error : styles.ok}`}>
                                    {state.newRemainingPointsAfterLocalChanges}
                                </span>
                                    </div>
                                </div>

                                <table className={styles.impTable}>
                                    <thead>
                                    <tr className={styles.impTableHeadRow}>
                                        <th className={styles.tableTh}>Nazwa</th>
                                        <th className={styles.tableThCenter}>Koszt</th>
                                        <th className={styles.tableThRight}>Ilość</th>
                                    </tr>
                                    </thead>
                                    <tbody>
                                    {definitions.unitLevelImprovements.map(imp => {
                                        const commonDef = definitions.commonImprovements?.[imp.id];
                                        const name = imp.name || commonDef?.name || imp.id;

                                        if (checkIfImprovementIsMandatory(null, imp.id, divisionDefinition, regiment.id, unitsMap)) {
                                            return null;
                                        }

                                        const canBePurchasedBySomeone = allActiveUnits.some(u => {
                                            const uDef = unitsMap[u.unitId];
                                            if (!uDef) return false;

                                            if (!canUnitTakeImprovement(uDef, imp.id, regiment, divisionDefinition, unitsMap)) return false;

                                            if (checkIfImprovementIsMandatory(u.unitId, imp.id, divisionDefinition, regiment.id, unitsMap)) return false;
                                            if (uDef.mandatory_improvements?.includes(imp.id)) return false;
                                            if (u.structureMandatory?.includes(imp.id)) return false;

                                            return true;
                                        });

                                        if (!canBePurchasedBySomeone) return null;

                                        let rawCost = imp.cost_override !== undefined ? imp.cost_override : (imp.cost !== undefined ? imp.cost : commonDef?.cost);

                                        const effectiveCount = calculateEffectiveImprovementCount(tempConfig, regiment, imp.id, divisionDefinition, unitsMap);

                                        const limitLabel = imp.max_amount ? `${effectiveCount} / ${imp.max_amount}` : `${effectiveCount} / ∞`;
                                        const isLimitReached = imp.max_amount && effectiveCount >= imp.max_amount;
                                        const limitClass = isLimitReached ? styles.limitReached : styles.limitOk;

                                        return (
                                            <tr key={imp.id} className={styles.impTableRow}>
                                                <td className={styles.tableTd}>{name}</td>
                                                <td className={styles.tableTdCenter}>{formatCost(rawCost)}</td>
                                                <td className={`${styles.tableTdRight} ${limitClass}`}>
                                                    {limitLabel}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}