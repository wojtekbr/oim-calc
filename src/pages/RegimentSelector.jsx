import React, { useState } from "react";
import { PDFDownloadLink } from '@react-pdf/renderer';
import { ArmyListDocument } from '../pdf/ArmyListDocument';
import { useRegimentSelectorLogic } from "./useRegimentSelectorLogic";
import styles from "./RegimentSelector.module.css";
import {
    calculateRegimentStats,
    calculateRegimentImprovementPoints,
    validateVanguardCost,
    validateAlliedCost,
    calculateDivisionType,
    getEffectiveUnitImprovements
} from "../utils/armyMath";
import { getDivisionRulesDescriptions, checkSupportUnitRequirements } from "../utils/divisionRules";
import { GROUP_TYPES, IDS } from "../constants";
import { useArmyData } from "../context/ArmyDataContext";

// --- IMPORTY KOMPONENTÓW ---
import { SupportUnitTile } from "../components/regiment-selector/SupportUnitTile";
import { GeneralOptionTile } from "../components/regiment-selector/GeneralOptionTile";
import { RegimentOptionTile } from "../components/regiment-selector/RegimentOptionTile";
import { SelectedRegimentRow } from "../components/regiment-selector/SelectedRegimentRow";
import { RegimentBlock } from "../components/regiment-selector/RegimentBlock";
import { SummaryCard } from "../components/regiment-selector/SummaryCard";

export default function RegimentSelector(props) {
    const {
        faction, divisionDefinition, configuredDivision, unitsMap,
        remainingImprovementPoints, improvementPointsLimit, totalDivisionCost, divisionBaseCost,
        getRegimentDefinition, onBack, validationErrors: propsValidationErrors,
        divisionArtilleryDefinitions = [], additionalUnitsDefinitions = []
    } = props;

    const { state, handlers } = useRegimentSelectorLogic(props);
    const { improvements } = useArmyData();
    const [showRules, setShowRules] = useState(false);

    // --- 1. Filtrowanie TABORU (dla sekcji zakupów na dole - bez zmian) ---
    const taborDefinitions = divisionArtilleryDefinitions.filter(item => {
        const nameToCheck = item.type === 'group' ? item.name : (typeof item === 'string' ? item : item.name);
        return nameToCheck && nameToCheck.toLowerCase().includes("tabor");
    });
    const standardArtilleryDefinitions = divisionArtilleryDefinitions.filter(item => !taborDefinitions.includes(item));

    // --- 2. Podział KUPIONYCH jednostek (dla SummaryCard) ---
    const artDefsCount = divisionArtilleryDefinitions.length;
    const unassignedSupport = configuredDivision.supportUnits.filter(su => !su.assignedTo);

    const unassignedArtillery = unassignedSupport.filter(su => (su.definitionIndex ?? -1) < artDefsCount);
    const unassignedAdditional = unassignedSupport.filter(su => (su.definitionIndex ?? -1) >= artDefsCount);

    // --- Helpery ---
    const calcStatsWrapper = (config, id) => calculateRegimentStats(config, id, configuredDivision, unitsMap, getRegimentDefinition, improvements, faction);
    const calcPuWrapper = (config, id, regimentSupport) => calculateRegimentImprovementPoints(config, id, unitsMap, getRegimentDefinition, improvements, regimentSupport, divisionDefinition);

    // --- Walidacje ---
    const vanguardCheck = validateVanguardCost(configuredDivision, unitsMap, faction, getRegimentDefinition, improvements);
    const alliedCheck = validateAlliedCost(configuredDivision, unitsMap, faction, getRegimentDefinition, improvements);

    const emptySlotsErrors = [];
    if (configuredDivision.vanguard) {
        configuredDivision.vanguard.forEach((reg, idx) => {
            if (reg.id === IDS.NONE) emptySlotsErrors.push(`Straż Przednia: Wybór pułku w slocie #${idx + 1} jest wymagany.`);
        });
    }
    if (configuredDivision.base) {
        configuredDivision.base.forEach((reg, idx) => {
            if (reg.id === IDS.NONE) emptySlotsErrors.push(`Podstawa Dywizji: Wybór pułku w slocie #${idx + 1} jest wymagany.`);
        });
    }

    const supportErrorsSet = new Set();
    const allSupportDefs = [...divisionArtilleryDefinitions, ...additionalUnitsDefinitions];

    configuredDivision.supportUnits.forEach(su => {
        let unitConfig = null;
        let parentDef = null;

        if (su.definitionIndex !== undefined) {
            parentDef = allSupportDefs[su.definitionIndex];
        } else {
            parentDef = allSupportDefs.find(u => (u.id === su.id) || (u.name === su.id));
        }

        if (parentDef && parentDef.type === 'group' && parentDef.options) {
            const subOption = parentDef.options.find(opt => (typeof opt === 'string' ? opt : opt.id) === su.id);
            if (subOption && typeof subOption === 'object') {
                unitConfig = subOption;
            } else {
                unitConfig = unitsMap[su.id];
            }
        } else {
            unitConfig = parentDef;
        }

        if (!unitConfig && unitsMap[su.id]) {
            unitConfig = unitsMap[su.id];
        }

        if (unitConfig) {
            const check = checkSupportUnitRequirements(unitConfig, configuredDivision, getRegimentDefinition, unitsMap, 'validate', divisionDefinition);
            if (!check.isAllowed) {
                const unitName = unitConfig.name || unitsMap[su.id]?.name || su.id;
                supportErrorsSet.add(`Błąd wsparcia (${unitName}): ${check.reason}`);
            }
        }
    });

    const allValidationErrors = [
        ...(propsValidationErrors || []),
        !vanguardCheck.isValid ? vanguardCheck.message : null,
        !alliedCheck.isValid ? alliedCheck.message : null,
        remainingImprovementPoints < 0 ? `Przekroczono limit Punktów Ulepszeń o ${Math.abs(remainingImprovementPoints)}.` : null,
        ...emptySlotsErrors,
        ...Array.from(supportErrorsSet)
    ].filter(Boolean);

    const hasCriticalErrors = allValidationErrors.length > 0;

    // --- Dane do widoku ---
    const divisionType = calculateDivisionType(configuredDivision, unitsMap, getRegimentDefinition, improvements);
    const rulesDescriptions = getDivisionRulesDescriptions(divisionDefinition, unitsMap, getRegimentDefinition, improvements);

    const { vanguard: vanguardRegiments, base: baseRegiments, additional: additionalRegiments } = configuredDivision;
    const generalId = configuredDivision.general;
    const generalDef = generalId ? unitsMap[generalId] : null;

    const useNewAdditionalLogic = !!divisionDefinition.additional_regiments;
    const additionalPool = divisionDefinition.additional_regiments?.regiments_list || [];
    const additionalMax = divisionDefinition.additional_regiments?.max_amount || 0;

    const getThemeClass = () => {
        const key = faction?.meta?.key;
        switch (key) {
            case 'commonwealth-crown': return styles.themePoland;
            case 'ottomans': return styles.themeOttomans;
            case 'hre': return styles.themeHre;
            default: return styles.themeDefault;
        }
    };

    const renderSupportItem = (item, idx) => {
        const renderTile = (unitId) => {
            const isPurchasedOption = state.purchasedSlotsMap[idx] === unitId;
            const isSlotOccupied = state.purchasedSlotsMap[idx] !== undefined;
            const specificUnitDef = state.unitsMap[unitId] || (typeof item === 'object' && item.options?.find(o => o.id === unitId));

            let reqCheck = { isAllowed: true, reason: null };
            if (specificUnitDef) {
                reqCheck = checkSupportUnitRequirements(specificUnitDef, configuredDivision, getRegimentDefinition, state.unitsMap, 'purchase', divisionDefinition);
            }
            if (reqCheck.isAllowed) {
                const groupReqCheck = checkSupportUnitRequirements(item, configuredDivision, getRegimentDefinition, state.unitsMap, 'purchase', divisionDefinition);
                if (!groupReqCheck.isAllowed) reqCheck = groupReqCheck;
            }

            const purchasedInstances = configuredDivision.supportUnits.filter(su => su.definitionIndex === idx);

            if (isPurchasedOption) {
                return (
                    <React.Fragment key={unitId}>
                        {purchasedInstances.map(instance => {
                            const realUnitDef = state.unitsMap[instance.id];

                            // FIX: Tutaj przekazujemy zapisane ulepszenia z instancji!
                            const instanceEffectiveImps = getEffectiveUnitImprovements(
                                instance.id,
                                instance.improvements || [], // <--- POPRAWKA: Przekazujemy zapisane ulepszenia
                                divisionDefinition,
                                null,
                                state.unitsMap
                            );

                            return (
                                <SupportUnitTile
                                    key={instance.instanceId}
                                    unitId={instance.id}
                                    isPurchased={true}
                                    locked={false}
                                    disabledReason={null}
                                    onAssign={(posKey) => handlers.handleAssignSupportUnit(idx, posKey, instance.instanceId)}
                                    onRemove={() => handlers.handleRemoveSupportUnit(idx)}
                                    onClick={undefined}
                                    unitDef={realUnitDef}
                                    assignmentInfo={instance.assignedTo}
                                    purchasedInstances={[instance]}
                                    regimentsList={state.regimentsList}
                                    unitsRulesMap={state.unitsRulesMap}
                                    supportUnits={configuredDivision.supportUnits}
                                    calculateStats={calcStatsWrapper}
                                    getRegimentDefinition={getRegimentDefinition}
                                    effectiveImprovements={instanceEffectiveImps}
                                    improvementsMap={improvements}
                                />
                            );
                        })}
                    </React.Fragment>
                );
            }

            const locked = isSlotOccupied || !reqCheck.isAllowed;
            const previewEffectiveImps = getEffectiveUnitImprovements(unitId, [], divisionDefinition, null, state.unitsMap);

            return (
                <SupportUnitTile
                    key={unitId}
                    unitId={unitId}
                    isPurchased={false}
                    locked={locked}
                    disabledReason={reqCheck.reason}
                    onAssign={() => {}}
                    onRemove={() => {}}
                    onClick={() => handlers.handleBuySupportUnit(unitId, idx, remainingImprovementPoints)}
                    unitDef={specificUnitDef}
                    assignmentInfo={null}
                    purchasedInstances={[]}
                    regimentsList={state.regimentsList}
                    unitsRulesMap={state.unitsRulesMap}
                    supportUnits={configuredDivision.supportUnits}
                    calculateStats={calcStatsWrapper}
                    getRegimentDefinition={getRegimentDefinition}
                    effectiveImprovements={previewEffectiveImps}
                    improvementsMap={improvements}
                />
            );
        };

        if (typeof item === 'string' || (typeof item === 'object' && !item.type)) {
            const unitId = typeof item === 'string' ? item : (item.name || item.id);
            return renderTile(unitId);
        }
        if (typeof item === 'object' && item.type === 'group') {
            return (
                <div key={idx} className={styles.supportGroupContainer}>
                    <div className={styles.supportGroupName}>{item.name}</div>
                    <div className={styles.supportGroupFlex}>
                        {item.options.map(opt => {
                            const optId = typeof opt === 'object' ? opt.id : opt;
                            return renderTile(optId);
                        })}
                    </div>
                </div>
            );
        }
        return null;
    };

    return (
        <div className={`${styles.container} ${getThemeClass()}`} onContextMenu={(e) => { e.preventDefault(); return false; }}>
            <div className={styles.header}>
                <button className={styles.backBtn} onClick={onBack}>← Powrót do Frakcji</button>
                <div className={styles.headerTitle}>{divisionDefinition.name}</div>
                {hasCriticalErrors ? (
                    <div className={styles.disabledPdfBtn}>🚫 Popraw błędy, aby eksportować</div>
                ) : (
                    <PDFDownloadLink
                        document={
                            <ArmyListDocument
                                divisionDefinition={divisionDefinition}
                                configuredDivision={configuredDivision}
                                faction={faction}
                                calculateRegimentStats={calcStatsWrapper}
                                mainForceKey={state.mainForceKey}
                                totalDivisionCost={totalDivisionCost}
                                remainingImprovementPoints={remainingImprovementPoints}
                                unitsMap={unitsMap}
                                getRegimentDefinition={getRegimentDefinition}
                                playerName={state.playerName}
                                divisionCustomName={state.divisionCustomName}
                                improvements={improvements}
                                divisionType={divisionType}
                            />
                        }
                        fileName={`Rozpiska_${state.divisionCustomName || 'Armia'}.pdf`}
                        className={styles.pdfBtn}
                    >
                        {({ loading }) => loading ? 'Generowanie...' : 'Eksportuj do PDF 🖨️'}
                    </PDFDownloadLink>
                )}
            </div>

            <div className={styles.inputsRow}>
                <input className={`${styles.inputField} ${styles.inputPlayer}`} placeholder="Gracz" value={state.playerName} onChange={e => state.setPlayerName(e.target.value)} />
                <input className={`${styles.inputField} ${styles.inputDivisionName}`} placeholder="Nazwa Własna Dywizji" value={state.divisionCustomName} onChange={e => state.setDivisionCustomName(e.target.value)} />
            </div>

            <SummaryCard
                divisionType={divisionType}
                totalDivisionCost={totalDivisionCost}
                divisionBaseCost={divisionBaseCost}
                remainingImprovementPoints={remainingImprovementPoints}
                improvementPointsLimit={improvementPointsLimit}
                showRules={showRules}
                setShowRules={setShowRules}
                rulesDescriptions={rulesDescriptions}
                generalDef={generalDef}
                unassignedSupport={unassignedSupport}
                unassignedArtillery={unassignedArtillery}
                unassignedAdditional={unassignedAdditional}
                activeRegimentsList={state.activeRegimentsList}
                unitsMap={unitsMap}
                configuredDivision={configuredDivision}
                getRegimentDefinition={getRegimentDefinition}
                calculateStats={calcStatsWrapper}
                mainForceKey={state.mainForceKey}
                getEffectiveUnitImprovements={getEffectiveUnitImprovements}
                improvementsMap={improvements}
                divisionDefinition={divisionDefinition}
            />

            {hasCriticalErrors && (<div className={styles.errorContainer}><h4 className={styles.errorHeader}>⚠️ Błędy w konstrukcji dywizji:</h4><ul className={styles.errorList}>{allValidationErrors.map((err, idx) => (<li key={idx} className={styles.errorItem}>{err}</li>))}</ul></div>)}

            <div className={styles.twoColumnRow}>
                <div className={styles.columnWrapper}>
                    {divisionDefinition.general && divisionDefinition.general.length > 0 && (
                        <div className={styles.sectionRow}>
                            <div className={styles.sectionLabel}><span className={styles.sectionLabelText}>Głównodowodzący</span></div>
                            <div className={styles.sectionContent}>
                                <div className={styles.optionsGrid}>
                                    {divisionDefinition.general.map(genId => (
                                        <GeneralOptionTile key={genId} unitId={genId} unitDef={unitsMap[genId]} isActive={configuredDivision.general === genId} onClick={() => handlers.handleGeneralChange(genId)} />
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
                <div className={styles.columnWrapper}>
                    <div className={styles.sectionRow}>
                        <div className={styles.sectionLabel}><span className={styles.sectionLabelText}>Wsparcie</span></div>
                        <div className={styles.sectionContent}>
                            <div className={styles.supportColumns}>
                                <div>
                                    <div className={styles.supportGroupTitle}>Artyleria Dywizyjna</div>
                                    <div className={styles.supportGrid}>
                                        {standardArtilleryDefinitions.map((item, idx) => {
                                            const originalIdx = divisionArtilleryDefinitions.indexOf(item);
                                            return renderSupportItem(item, originalIdx);
                                        })}
                                    </div>
                                </div>
                                <div>
                                    <div className={styles.supportGroupTitle}>Elementy Dodatkowe</div>
                                    <div className={styles.supportGrid}>
                                        {additionalUnitsDefinitions.map((item, idx) => {
                                            const originalIdx = idx + divisionArtilleryDefinitions.length;
                                            return renderSupportItem(item, originalIdx);
                                        })}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {vanguardRegiments && vanguardRegiments.length > 0 && (
                <div className={styles.sectionRow}>
                    <div className={styles.sectionLabel}><span className={styles.sectionLabelText}>Straż Przednia</span></div>
                    <div className={styles.sectionContent}>
                        <div className={styles.regimentsGrid}>
                            <RegimentBlock group={GROUP_TYPES.VANGUARD} regiments={configuredDivision.vanguard} definitionOptions={divisionDefinition.vanguard} mainForceKey={state.mainForceKey} getRegimentDefinition={getRegimentDefinition} calculateStats={calcStatsWrapper} onNameChange={handlers.handleRegimentNameChange} onRegimentChange={handlers.handleRegimentChange} onOpenEditor={props.onOpenRegimentEditor} onMainForceSelect={handlers.handleMainForceSelect} supportUnits={configuredDivision.supportUnits} unitsMap={unitsMap} configuredDivision={configuredDivision} divisionDefinition={divisionDefinition} currentMainForceCost={state.currentMainForceCost} isAllied={state.isAllied} currentAlliesCount={state.currentAlliesCount} calculateRegimentPU={calcPuWrapper} getEffectiveUnitImprovements={getEffectiveUnitImprovements} improvementsMap={improvements} />
                        </div>
                    </div>
                </div>
            )}

            <div className={styles.sectionRow}>
                <div className={styles.sectionLabel}><span className={styles.sectionLabelText}>Podstawa Dywizji</span></div>
                <div className={styles.sectionContent}>
                    <div className={styles.regimentsGrid}>
                        <RegimentBlock group={GROUP_TYPES.BASE} regiments={configuredDivision.base} definitionOptions={divisionDefinition.base} mainForceKey={state.mainForceKey} getRegimentDefinition={getRegimentDefinition} calculateStats={calcStatsWrapper} onNameChange={handlers.handleRegimentNameChange} onRegimentChange={handlers.handleRegimentChange} onOpenEditor={props.onOpenRegimentEditor} onMainForceSelect={handlers.handleMainForceSelect} supportUnits={configuredDivision.supportUnits} unitsMap={unitsMap} configuredDivision={configuredDivision} divisionDefinition={divisionDefinition} currentMainForceCost={state.currentMainForceCost} isAllied={state.isAllied} currentAlliesCount={state.currentAlliesCount} calculateRegimentPU={calcPuWrapper} getEffectiveUnitImprovements={getEffectiveUnitImprovements} improvementsMap={improvements} />
                    </div>
                </div>
            </div>

            <div className={styles.sectionRow}>
                <div className={styles.sectionLabel}><span className={styles.sectionLabelText}>Pułki Dodatkowe</span></div>
                <div className={styles.sectionContent}>
                    {useNewAdditionalLogic ? (
                        <div>
                            <div className={styles.additionalCountInfo}>
                                Wybrano: <strong>{configuredDivision.additional.length} / {additionalMax}</strong>
                            </div>
                            <div className={styles.optionsGrid}>
                                {additionalPool.map((regId, idx) => {
                                    const isSelected = configuredDivision.additional.some(r => r.sourceIndex === idx);
                                    const selectedInstance = configuredDivision.additional.find(r => r.sourceIndex === idx);
                                    const isLimitReached = configuredDivision.additional.length >= additionalMax;
                                    const isBlocked = !isSelected && isLimitReached;
                                    const isOptionAlly = state.isAllied(regId);
                                    const isAllyBlocked = isOptionAlly && state.currentAlliesCount >= 1 && !isSelected;

                                    return (
                                        <RegimentOptionTile key={`${regId}-${idx}`} optId={regId} isActive={isSelected} disabled={isBlocked || (isAllyBlocked)} isAllied={isOptionAlly} divisionDefinition={divisionDefinition} onClick={() => handlers.handleToggleAdditionalRegiment(regId, idx, additionalMax)} getRegimentDefinition={getRegimentDefinition}>
                                            {isSelected && (<div className={styles.editRegimentOverlayBtn} onClick={(e) => { e.stopPropagation(); props.onOpenRegimentEditor(GROUP_TYPES.ADDITIONAL, selectedInstance.index); }}>EDYTUJ</div>)}
                                        </RegimentOptionTile>
                                    );
                                })}
                            </div>
                            <div className={styles.regimentsGrid}>
                                {configuredDivision.additional.map((regiment, index) => (
                                    <SelectedRegimentRow key={regiment.sourceIndex || regiment.id + index} group={GROUP_TYPES.ADDITIONAL} index={index} regiment={regiment} mainForceKey={state.mainForceKey} getRegimentDefinition={getRegimentDefinition} calculateStats={calcStatsWrapper} onNameChange={handlers.handleRegimentNameChange} onOpenEditor={props.onOpenRegimentEditor} onMainForceSelect={handlers.handleMainForceSelect} supportUnits={configuredDivision.supportUnits} unitsMap={unitsMap} currentMainForceCost={state.currentMainForceCost} isAllied={state.isAllied} calculateRegimentPU={calcPuWrapper} getEffectiveUnitImprovements={getEffectiveUnitImprovements} improvementsMap={improvements} divisionDefinition={divisionDefinition} />
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className={styles.regimentsGrid}>
                            <RegimentBlock group={GROUP_TYPES.ADDITIONAL} regiments={additionalRegiments} definitionOptions={divisionDefinition.additional} mainForceKey={state.mainForceKey} getRegimentDefinition={getRegimentDefinition} calculateStats={calcStatsWrapper} onNameChange={handlers.handleRegimentNameChange} onRegimentChange={handlers.handleRegimentChange} onOpenEditor={props.onOpenRegimentEditor} onMainForceSelect={handlers.handleMainForceSelect} supportUnits={configuredDivision.supportUnits} unitsMap={unitsMap} configuredDivision={configuredDivision} divisionDefinition={divisionDefinition} currentMainForceCost={state.currentMainForceCost} isAllied={state.isAllied} currentAlliesCount={state.currentAlliesCount} calculateRegimentPU={calcPuWrapper} getEffectiveUnitImprovements={getEffectiveUnitImprovements} improvementsMap={improvements} />
                        </div>
                    )}
                </div>
            </div>

            {taborDefinitions.length > 0 && (
                <div className={styles.sectionRow}>
                    <div className={`${styles.sectionLabel} ${styles.taborSectionLabel}`}>
                        <span className={`${styles.sectionLabelText} ${styles.taborSectionLabelText}`}>Tabor</span>
                    </div>
                    <div className={`${styles.sectionContent} ${styles.taborSectionContent}`}>
                        <div className={`${styles.supportGroupTitle} ${styles.taborGroupTitle}`}>
                            Jednostki Taborowe (Wozy / Umocnienia)
                        </div>
                        <div className={styles.supportGrid}>
                            {taborDefinitions.map((item, idx) => {
                                const originalIdx = divisionArtilleryDefinitions.indexOf(item);
                                return renderSupportItem(item, originalIdx);
                            })}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}