import React, { useState } from "react";
import { PDFDownloadLink } from '@react-pdf/renderer';
import { ArmyListDocument } from '../pdf/ArmyListDocument';
import { useRegimentSelectorLogic } from "./useRegimentSelectorLogic";
import styles from "./RegimentSelector.module.css";
import {
    calculateRegimentStats,
    calculateDivisionType,
    validateVanguardCost,
    validateAlliedCost,
    calculateRegimentImprovementPoints
} from "../utils/armyMath";
import { checkDivisionConstraints, getDivisionRulesDescriptions, checkSupportUnitRequirements } from "../utils/divisionRules";
import { IDS, GROUP_TYPES } from "../constants";
import { useArmyData } from "../context/ArmyDataContext";
import { getInitials, getPlaceholderStyle } from "../utils/uiHelpers";

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

    // --- Helpery obliczeniowe (Wrappery) ---
    const calcStatsWrapper = (config, id) => calculateRegimentStats(config, id, configuredDivision, unitsMap, getRegimentDefinition, improvements);
    const calcPuWrapper = (config, id, regimentSupport) => calculateRegimentImprovementPoints(config, id, unitsMap, getRegimentDefinition, improvements, regimentSupport);

    // --- Walidacje ---
    const vanguardCheck = validateVanguardCost(configuredDivision, unitsMap, faction, getRegimentDefinition, improvements);
    const alliedCheck = validateAlliedCost(configuredDivision, unitsMap, faction, getRegimentDefinition, improvements);

    const allValidationErrors = [
        ...(propsValidationErrors || []),
        !vanguardCheck.isValid ? vanguardCheck.message : null,
        !alliedCheck.isValid ? alliedCheck.message : null,
        remainingImprovementPoints < 0 ? `Przekroczono limit Punktów Ulepszeń o ${Math.abs(remainingImprovementPoints)}.` : null
    ].filter(Boolean);

    const hasCriticalErrors = allValidationErrors.length > 0;

    // --- Dane do widoku ---
    const divisionType = calculateDivisionType(configuredDivision, unitsMap, getRegimentDefinition, improvements);
    const rulesDescriptions = getDivisionRulesDescriptions(divisionDefinition, unitsMap, getRegimentDefinition, improvements);

    const { vanguard: vanguardRegiments, base: baseRegiments, additional: additionalRegiments } = configuredDivision;
    const generalId = configuredDivision.general;
    const generalDef = generalId ? unitsMap[generalId] : null;

    // Unassigned support - pobieramy z props, ale filtrujemy lokalnie lub w hooku. Hook ma to w 'state.activeRegimentsList' ale to lista pułków.
    // Prościej:
    const unassignedSupport = configuredDivision.supportUnits.filter(su => !su.assignedTo);

    const useNewAdditionalLogic = !!divisionDefinition.additional_regiments;
    const additionalPool = divisionDefinition.additional_regiments?.regiments_list || [];
    const additionalMax = divisionDefinition.additional_regiments?.max_amount || 0;

    // --- Obsługa Motywów (Tła) ---
    const getThemeClass = () => {
        const key = faction?.meta?.key;
        switch (key) {
            case 'commonwealth-crown': return styles.themePoland;
            case 'ottomans': return styles.themeOttomans;
            case 'hre': return styles.themeHre;
            default: return styles.themeDefault;
        }
    };

    return (
        <div className={`${styles.container} ${getThemeClass()}`} onContextMenu={(e) => { e.preventDefault(); return false; }}>
            <div className={styles.header}>
                <button className={styles.backBtn} onClick={onBack}>← Powrót do Frakcji</button>
                <div style={{ fontSize: '18px', fontWeight: '700', color: '#1a1a1a' }}>{divisionDefinition.name}</div>
                {hasCriticalErrors ? (
                    <div className={styles.disabledPdfBtn}>🚫 Popraw błędy, aby eksportować</div>
                ) : (
                    <PDFDownloadLink document={<ArmyListDocument divisionDefinition={divisionDefinition} configuredDivision={configuredDivision} faction={faction} calculateRegimentStats={calcStatsWrapper} mainForceKey={state.mainForceKey} totalDivisionCost={totalDivisionCost} remainingImprovementPoints={remainingImprovementPoints} unitsMap={unitsMap} getRegimentDefinition={getRegimentDefinition} playerName={state.playerName} divisionCustomName={state.divisionCustomName} />} fileName={`Rozpiska_${state.divisionCustomName || 'Armia'}.pdf`} className={styles.pdfBtn}>
                        {({ loading }) => loading ? 'Generowanie...' : 'Eksportuj do PDF 🖨️'}
                    </PDFDownloadLink>
                )}
            </div>

            <div className={styles.inputsRow}>
                <input className={styles.inputField} placeholder="Nazwa Gracza" value={state.playerName} onChange={e => state.setPlayerName(e.target.value)} style={{ flex: 1 }} />
                <input className={styles.inputField} placeholder="Nazwa Własna Dywizji" value={state.divisionCustomName} onChange={e => state.setDivisionCustomName(e.target.value)} style={{ flex: 3 }} />
            </div>

            {/* PODSUMOWANIE (Wydzielony Komponent) */}
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
                activeRegimentsList={state.activeRegimentsList}
                unitsMap={unitsMap}
            />

            {hasCriticalErrors && (<div className={styles.errorContainer}><h4 className={styles.errorHeader}>⚠️ Błędy w konstrukcji dywizji:</h4><ul className={styles.errorList}>{allValidationErrors.map((err, idx) => (<li key={idx} className={styles.errorItem}>{err}</li>))}</ul></div>)}

            {/* --- KONTENER NA DWA RZĘDY SEKCJI (DOWÓDCA + WSPARCIE) --- */}
            <div className={styles.twoColumnRow}>
                {/* DOWÓDCA */}
                <div className={styles.columnWrapper}>
                    {divisionDefinition.general && divisionDefinition.general.length > 0 && (
                        <div className={styles.sectionRow} style={{ height: '100%', marginBottom: 0 }}>
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
                {/* WSPARCIE */}
                <div className={styles.columnWrapper}>
                    <div className={styles.sectionRow} style={{ height: '100%', marginBottom: 0 }}>
                        <div className={styles.sectionLabel}><span className={styles.sectionLabelText}>Wsparcie</span></div>
                        <div className={styles.sectionContent}>
                            <div className={styles.supportColumns}>
                                <div>
                                    <div className={styles.supportGroupTitle}>Artyleria Dywizyjna</div>
                                    <div className={styles.supportGrid}>
                                        {divisionArtilleryDefinitions.map((item, idx) => {
                                            const realIdx = idx;
                                            const renderTile = (unitId) => {
                                                const isPurchased = state.purchasedSlotsMap[realIdx] === unitId;
                                                const reqCheck = checkSupportUnitRequirements(item, configuredDivision, getRegimentDefinition);
                                                const locked = !isPurchased && !reqCheck.isAllowed;
                                                return (<SupportUnitTile key={unitId} unitId={unitId} isPurchased={isPurchased} locked={locked} disabledReason={reqCheck.reason} onAssign={(posKey) => handlers.handleAssignSupportUnit(realIdx, posKey)} onRemove={() => handlers.handleRemoveSupportUnit(realIdx)} onClick={() => handlers.handleBuySupportUnit(unitId, realIdx, remainingImprovementPoints)} unitDef={unitsMap[unitId]} assignmentInfo={state.purchasedSlotsMap[realIdx] === unitId ? configuredDivision.supportUnits.find(su => su.definitionIndex === realIdx)?.assignedTo : null} regimentsList={state.regimentsList} unitsRulesMap={state.unitsRulesMap} supportUnits={configuredDivision.supportUnits} calculateStats={calcStatsWrapper} getRegimentDefinition={getRegimentDefinition} />);
                                            };
                                            if (typeof item === 'string' || (typeof item === 'object' && !item.type)) return renderTile(typeof item === 'string' ? item : (item.name || item.id));
                                            if (typeof item === 'object' && item.type === 'group') return (<div key={realIdx} className={styles.supportGroupContainer}><div className={styles.supportGroupName}>{item.name}</div><div className={styles.supportGroupFlex}>{item.options.map(opt => renderTile(opt))}</div></div>);
                                            return null;
                                        })}
                                    </div>
                                </div>
                                <div>
                                    <div className={styles.supportGroupTitle}>Elementy Dodatkowe</div>
                                    <div className={styles.supportGrid}>
                                        {additionalUnitsDefinitions.map((item, idx) => {
                                            const realIdx = idx + divisionArtilleryDefinitions.length;
                                            const renderTile = (unitId) => {
                                                const isPurchased = state.purchasedSlotsMap[realIdx] === unitId;
                                                const reqCheck = checkSupportUnitRequirements(item, configuredDivision, getRegimentDefinition);
                                                const locked = !isPurchased && !reqCheck.isAllowed;
                                                return (<SupportUnitTile key={unitId} unitId={unitId} isPurchased={isPurchased} locked={locked} disabledReason={reqCheck.reason} onAssign={(posKey) => handlers.handleAssignSupportUnit(realIdx, posKey)} onRemove={() => handlers.handleRemoveSupportUnit(realIdx)} onClick={() => handlers.handleBuySupportUnit(unitId, realIdx, remainingImprovementPoints)} unitDef={unitsMap[unitId]} assignmentInfo={state.purchasedSlotsMap[realIdx] === unitId ? configuredDivision.supportUnits.find(su => su.definitionIndex === realIdx)?.assignedTo : null} regimentsList={state.regimentsList} unitsRulesMap={state.unitsRulesMap} supportUnits={configuredDivision.supportUnits} calculateStats={calcStatsWrapper} getRegimentDefinition={getRegimentDefinition} />);
                                            };
                                            if (typeof item === 'string' || (typeof item === 'object' && !item.type)) return renderTile(typeof item === 'string' ? item : (item.name || item.id));
                                            if (typeof item === 'object' && item.type === 'group') return (<div key={realIdx} className={styles.supportGroupContainer}><div className={styles.supportGroupName}>{item.name}</div><div className={styles.supportGroupFlex}>{item.options.map(opt => renderTile(opt))}</div></div>);
                                            return null;
                                        })}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* SEKCJA: STRAŻ PRZEDNIA */}
            {vanguardRegiments && vanguardRegiments.length > 0 && (
                <div className={styles.sectionRow}>
                    <div className={styles.sectionLabel}><span className={styles.sectionLabelText}>Straż Przednia</span></div>
                    <div className={styles.sectionContent}>
                        <div className={styles.regimentsGrid}>
                            <RegimentBlock group={GROUP_TYPES.VANGUARD} regiments={configuredDivision.vanguard} definitionOptions={divisionDefinition.vanguard} mainForceKey={state.mainForceKey} getRegimentDefinition={getRegimentDefinition} calculateStats={calcStatsWrapper} onNameChange={handlers.handleRegimentNameChange} onRegimentChange={handlers.handleRegimentChange} onOpenEditor={props.onOpenRegimentEditor} onMainForceSelect={handlers.handleMainForceSelect} supportUnits={configuredDivision.supportUnits} unitsMap={unitsMap} configuredDivision={configuredDivision} divisionDefinition={divisionDefinition} currentMainForceCost={state.currentMainForceCost} isAllied={state.isAllied} currentAlliesCount={state.currentAlliesCount} calculateRegimentPU={calcPuWrapper} />
                        </div>
                    </div>
                </div>
            )}

            {/* SEKCJA: PODSTAWA DYWIZJI */}
            <div className={styles.sectionRow}>
                <div className={styles.sectionLabel}><span className={styles.sectionLabelText}>Podstawa Dywizji</span></div>
                <div className={styles.sectionContent}>
                    <div className={styles.regimentsGrid}>
                        <RegimentBlock group={GROUP_TYPES.BASE} regiments={configuredDivision.base} definitionOptions={divisionDefinition.base} mainForceKey={state.mainForceKey} getRegimentDefinition={getRegimentDefinition} calculateStats={calcStatsWrapper} onNameChange={handlers.handleRegimentNameChange} onRegimentChange={handlers.handleRegimentChange} onOpenEditor={props.onOpenRegimentEditor} onMainForceSelect={handlers.handleMainForceSelect} supportUnits={configuredDivision.supportUnits} unitsMap={unitsMap} configuredDivision={configuredDivision} divisionDefinition={divisionDefinition} currentMainForceCost={state.currentMainForceCost} isAllied={state.isAllied} currentAlliesCount={state.currentAlliesCount} calculateRegimentPU={calcPuWrapper} />
                    </div>
                </div>
            </div>

            {/* SEKCJA: PUŁKI DODATKOWE */}
            <div className={styles.sectionRow}>
                <div className={styles.sectionLabel}><span className={styles.sectionLabelText}>Pułki Dodatkowe</span></div>
                <div className={styles.sectionContent}>
                    {useNewAdditionalLogic ? (
                        <div>
                            <div style={{fontSize: 12, color: '#666', marginBottom: 12}}>
                                Wybierz maksymalnie <strong>{additionalMax}</strong> pułki z poniższej listy.
                                Obecnie wybrano: <strong>{configuredDivision.additional.length} / {additionalMax}</strong>
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
                                            {isSelected && (
                                                <div style={{ marginTop: 5, fontSize: 10, background: '#333', color: '#fff', padding: '2px 6px', borderRadius: 4, cursor: 'pointer', zIndex: 10, textAlign: 'center' }} onClick={(e) => { e.stopPropagation(); props.onOpenRegimentEditor(GROUP_TYPES.ADDITIONAL, selectedInstance.index); }}>
                                                    EDYTUJ
                                                </div>
                                            )}
                                        </RegimentOptionTile>
                                    );
                                })}
                            </div>
                            <div className={styles.regimentsGrid}>
                                {configuredDivision.additional.map((regiment, index) => (
                                    <SelectedRegimentRow key={regiment.sourceIndex || regiment.id + index} group={GROUP_TYPES.ADDITIONAL} index={index} regiment={regiment} mainForceKey={state.mainForceKey} getRegimentDefinition={getRegimentDefinition} calculateStats={calcStatsWrapper} onNameChange={handlers.handleRegimentNameChange} onOpenEditor={props.onOpenRegimentEditor} onMainForceSelect={handlers.handleMainForceSelect} supportUnits={configuredDivision.supportUnits} unitsMap={unitsMap} currentMainForceCost={state.currentMainForceCost} isAllied={state.isAllied} calculateRegimentPU={calcPuWrapper} />
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className={styles.regimentsGrid}>
                            <RegimentBlock group={GROUP_TYPES.ADDITIONAL} regiments={additionalRegiments} definitionOptions={divisionDefinition.additional} mainForceKey={state.mainForceKey} getRegimentDefinition={getRegimentDefinition} calculateStats={calcStatsWrapper} onNameChange={handlers.handleRegimentNameChange} onRegimentChange={handlers.handleRegimentChange} onOpenEditor={props.onOpenRegimentEditor} onMainForceSelect={handlers.handleMainForceSelect} supportUnits={configuredDivision.supportUnits} unitsMap={unitsMap} configuredDivision={configuredDivision} divisionDefinition={divisionDefinition} currentMainForceCost={state.currentMainForceCost} isAllied={state.isAllied} currentAlliesCount={state.currentAlliesCount} calculateRegimentPU={calcPuWrapper} />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}