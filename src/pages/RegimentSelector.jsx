import React, { useMemo, useState } from "react";
import { PDFDownloadLink } from '@react-pdf/renderer';
import { ArmyListDocument } from '../pdf/ArmyListDocument';
import { useRegimentSelectorLogic } from "./useRegimentSelectorLogic";
import styles from "./RegimentSelector.module.css";
import { 
    calculateRegimentStats, 
    calculateDivisionType,
    validateVanguardCost,
    validateAlliedCost,
    calculateRegimentImprovementPoints,
    collectRegimentUnits
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

    // --- Helpery obliczeniowe ---
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
    
    // Przekazujemy improvements do opisów zasad (np. dla nazw ulepszeń w limitach)
    const rulesDescriptions = getDivisionRulesDescriptions(divisionDefinition, unitsMap, getRegimentDefinition, improvements);
    
    const { vanguard: vanguardRegiments, base: baseRegiments, additional: additionalRegiments, supportUnits } = configuredDivision;
    const generalId = configuredDivision.general;
    const generalDef = generalId ? unitsMap[generalId] : null;

    const unassignedSupport = useMemo(() => {
        return supportUnits.filter(su => !su.assignedTo);
    }, [supportUnits]);

    const currentMainForceCost = useMemo(() => {
        if (!state.mainForceKey) return 0;
        const [group, idxStr] = state.mainForceKey.split('/');
        const index = parseInt(idxStr, 10);
        let reg = null;
        if (group === GROUP_TYPES.BASE) reg = configuredDivision.base[index];
        else if (group === GROUP_TYPES.ADDITIONAL) reg = configuredDivision.additional[index];
        
        if (reg) return calcStatsWrapper(reg.config, reg.id).cost;
        return 0;
    }, [state.mainForceKey, configuredDivision]);

    const isAllied = (regId) => {
        if (regId === IDS.NONE) return false;
        if (faction.regiments && faction.regiments[regId]) return false;
        const def = getRegimentDefinition(regId);
        if (def && def._sourceFaction === 'mercenaries') return false;
        return true;
    };

    const currentAlliesCount = useMemo(() => {
        const all = [...vanguardRegiments, ...baseRegiments, ...additionalRegiments];
        return all.filter(r => r.id !== IDS.NONE && isAllied(r.id)).length;
    }, [configuredDivision]);

    // Logika wyboru "Additional" (Stara vs Nowa)
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

    // --- Przygotowanie listy sformowanych pułków (do podsumowania) ---
    const activeRegimentsList = useMemo(() => {
        const all = [
            ...(vanguardRegiments || []).map(r => ({ ...r, group: GROUP_TYPES.VANGUARD })),
            ...baseRegiments.map(r => ({ ...r, group: GROUP_TYPES.BASE })),
            ...additionalRegiments.map(r => ({ ...r, group: GROUP_TYPES.ADDITIONAL }))
        ];
        
        return all.filter(r => r.id !== IDS.NONE).map(r => {
            const def = getRegimentDefinition(r.id);
            const stats = calcStatsWrapper(r.config, r.id);
            const isMain = state.mainForceKey === `${r.group}/${r.index}`;
            const regimentPosKey = `${r.group}/${r.index}`;
            const regimentUnitsList = [];

            // Helper: Dodaj jednostkę do płaskiej listy
            const addUnitToList = (unitId, key, isSupport) => {
                const unitDef = unitsMap[unitId];
                if (!unitDef) return;

                const imps = (r.config.improvements || {})[key] || [];
                const impNames = imps.map(impId => {
                    const impDef = improvements[impId];
                    const regImpDef = def.unit_improvements?.find(ui => ui.id === impId);
                    return impDef?.name || regImpDef?.name || impId;
                }).sort();

                const isCommander = unitDef.orders > 0 || (key && key.includes('general'));

                regimentUnitsList.push({
                    name: unitDef.name,
                    imps: impNames,
                    isCommander,
                    orders: unitDef.orders,
                    isSupport
                });
            };
            
            // 1. Jednostki etatowe
            const collectedUnits = collectRegimentUnits(r.config, def);
            collectedUnits.forEach(item => addUnitToList(item.unitId, item.key, false));

            // 2. Wsparcie przypisane
            const assignedSupport = supportUnits.filter(su => su.assignedTo?.positionKey === regimentPosKey);
            assignedSupport.forEach(su => {
                const key = `support/${su.id}-${regimentPosKey}`;
                addUnitToList(su.id, key, true);
            });

            // 3. Ulepszenia pułkowe
            const regImpNames = (r.config.regimentImprovements || []).map(impId => {
                const impDef = improvements[impId];
                const regImpDef = def.regiment_improvements?.find(ri => ri.id === impId);
                return impDef?.name || regImpDef?.name || impId;
            });

            return {
                id: r.id, name: def?.name || r.id, customName: r.customName, stats, isMain, isVanguard: r.group === GROUP_TYPES.VANGUARD, units: regimentUnitsList, regImps: regImpNames
            };
        });
    }, [configuredDivision, state.mainForceKey, improvements, supportUnits]);

    // --- RENDEROWANIE ---
    return (
        <div className={`${styles.container} ${getThemeClass()}`} onContextMenu={(e) => { e.preventDefault(); return false; }}>
            <div className={styles.header}>
                <button className={styles.backBtn} onClick={onBack}>← Powrót do Frakcji</button>
                
                <div style={{ fontSize: '18px', fontWeight: '700', color: '#1a1a1a' }}>
                    {divisionDefinition.name}
                </div>

                {hasCriticalErrors ? (
                    <div className={styles.disabledPdfBtn}>🚫 Popraw błędy, aby eksportować</div>
                ) : (
                    <PDFDownloadLink document={<ArmyListDocument divisionDefinition={divisionDefinition} configuredDivision={configuredDivision} faction={faction} calculateRegimentStats={calcStatsWrapper} mainForceKey={state.mainForceKey} totalDivisionCost={totalDivisionCost} remainingImprovementPoints={remainingImprovementPoints} unitsMap={unitsMap} getRegimentDefinition={getRegimentDefinition} playerName={state.playerName} divisionCustomName={state.divisionCustomName} />} fileName={`Rozpiska_${state.divisionCustomName || 'Armia'}.pdf`} className={styles.pdfBtn}>
                        {({ loading }) => loading ? 'Generowanie...' : 'Eksportuj do PDF 🖨️'}
                    </PDFDownloadLink>
                )}
            </div>

            <div className={styles.inputsRow}>
                <input className={styles.inputField} placeholder="Nazwa Gracza" value={state.playerName} onChange={e => state.setPlayerName(e.target.value)} />
                <input className={styles.inputField} placeholder="Nazwa Własna Dywizji" value={state.divisionCustomName} onChange={e => state.setDivisionCustomName(e.target.value)} style={{ flex: 2 }} />
            </div>

            {/* PODSUMOWANIE (Dashboard) */}
            <div className={styles.summaryCard}>
                <div className={styles.summaryHeader}>
                    <div>
                        <div className={styles.summaryTitle}>{divisionType} ({totalDivisionCost} PS)</div>
                        <div className={styles.summarySubtitle}>Koszt bazowy dywizji: {divisionBaseCost} PS</div>
                        <button className={styles.rulesToggleBtn} onClick={() => setShowRules(!showRules)}>{showRules ? "▼ Ukryj zasady specjalne" : "▶ Pokaż zasady specjalne"}</button>
                    </div>
                    <div className={`${styles.summaryPoints} ${remainingImprovementPoints < 0 ? styles.pointsError : styles.pointsOk}`}><div>Punkty Ulepszeń:</div><div style={{fontSize: 24}}>{remainingImprovementPoints} / {improvementPointsLimit}</div></div>
                </div>

                {showRules && rulesDescriptions.length > 0 && (<div className={styles.rulesContainer}>{rulesDescriptions.map(rule => (<div key={rule.id} className={styles.ruleLine}><strong>• {rule.title}: </strong> {rule.description}</div>))}</div>)}

                <div className={styles.summaryInfoRow}>
                    <div className={styles.summarySection}>
                         <div className={styles.summarySectionTitle}>Dowódca Dywizji</div>
                         {generalDef ? (<div className={styles.commanderRow}><span className={styles.commanderName}>{generalDef.name}</span><span className={styles.commanderStats}>{generalDef.orders} Rozkazy | {generalDef.activations} Akt.</span></div>) : (<div className={styles.noCommanderMsg}>Nie wybrano dowódcy</div>)}
                    </div>
                    {unassignedSupport.length > 0 && (
                        <div className={styles.summarySection}>
                            <div className={styles.summarySectionTitle}>Wsparcie Dywizyjne (Nieprzypisane)</div>
                            <div className={styles.unassignedList}>{unassignedSupport.map((su, idx) => (<div key={idx} className={styles.unassignedBadge}><span>• {unitsMap[su.id]?.name || su.id}</span><span style={{fontWeight:'bold'}}>({unitsMap[su.id]?.cost || 0} pkt)</span></div>))}</div>
                        </div>
                    )}
                </div>

                {/* Grid Sformowanych Pułków */}
                {activeRegimentsList.length > 0 && (
                    <div className={styles.summarySection}>
                        <div className={styles.summarySectionTitle}>Sformowane Pułki</div>
                        <div className={styles.regimentListSimple}>
                            {activeRegimentsList.map((reg, idx) => (
                                <div key={idx} className={styles.regListItem}>
                                    <div className={styles.regListHeaderRow}>
                                        <div className={styles.regInfoMain}>
                                            <div className={styles.regListName}>{reg.name}</div>
                                            {reg.customName && <div className={styles.regListCustomName}>"{reg.customName}"</div>}
                                            <div className={styles.regListTags}>{reg.isMain && <span className={`${styles.tagBadge} ${styles.tagMain}`}>Siły Główne</span>}{reg.isVanguard && <span className={`${styles.tagBadge} ${styles.tagVanguard}`}>Straż Przednia</span>}</div>
                                        </div>
                                        <div className={styles.regListStats}><div><strong>{reg.stats.cost} PS</strong></div><div>Mot: {reg.stats.motivation + (reg.isMain?1:0)}</div></div>
                                    </div>
                                    <div className={styles.regDetails}>
                                        {reg.units.map((u, uIdx) => (
                                            <div key={uIdx} className={styles.unitRow}>
                                                <div className={styles.unitNameCol}><span>• {u.name}</span>{u.isSupport && <span style={{fontSize: 9, color: '#0056b3', background: '#e3f2fd', padding: '0 4px', borderRadius: 3, border: '1px solid #90caf9'}}>WSPARCIE</span>}{u.isCommander && u.orders > 0 && (<span className={styles.commanderBadge}>DOW ({u.orders})</span>)}</div>{u.imps.length > 0 && (<div className={styles.impsList}>+ {u.imps.join(', ')}</div>)}
                                            </div>
                                        ))}
                                        {reg.regImps.length > 0 && (<div className={styles.regImpsRow}>Ulepszenia: {reg.regImps.join(', ')}</div>)}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {hasCriticalErrors && (<div className={styles.errorContainer}><h4 className={styles.errorHeader}>⚠️ Błędy w konstrukcji dywizji:</h4><ul className={styles.errorList}>{allValidationErrors.map((err, idx) => (<li key={idx} className={styles.errorItem}>{err}</li>))}</ul></div>)}

            {/* SEKCJA: WYBÓR DOWÓDCY */}
            {divisionDefinition.general && divisionDefinition.general.length > 0 && (
                <div className={styles.sectionRow}>
                    <div className={styles.sectionLabel}>
                        <span className={styles.sectionLabelText}>Głównodowodzący</span>
                    </div>
                    <div className={styles.sectionContent}>
                        <div className={styles.optionsGrid}>
                            {divisionDefinition.general.map(genId => (
                                <GeneralOptionTile 
                                    key={genId} unitId={genId} unitDef={unitsMap[genId]} 
                                    isActive={configuredDivision.general === genId} 
                                    onClick={() => handlers.handleGeneralChange(genId)} 
                                />
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* SEKCJA: WSPARCIE */}
            <div className={styles.sectionRow}>
                <div className={styles.sectionLabel}>
                    <span className={styles.sectionLabelText}>Wsparcie</span>
                </div>
                <div className={styles.sectionContent}>
                    <div className={styles.supportColumns}>
                        {/* Artyleria */}
                        <div>
                            <div className={styles.supportGroupTitle}>Artyleria Dywizyjna</div>
                            <div className={styles.supportGrid}>
                                {divisionArtilleryDefinitions.map((item, idx) => {
                                    const realIdx = idx;
                                    const requirementCheck = checkSupportUnitRequirements(item, configuredDivision, getRegimentDefinition);
                                    const isPurchased = state.purchasedSlotsMap[realIdx] !== undefined;
                                    const isLockedByRequirements = !isPurchased && !requirementCheck.isAllowed;
                                    
                                    const renderTile = (unitId) => (
                                        <SupportUnitTile 
                                            key={unitId} unitId={unitId} isPurchased={state.purchasedSlotsMap[realIdx] === unitId} 
                                            locked={isLockedByRequirements} disabledReason={requirementCheck.reason}
                                            onAssign={(posKey) => handlers.handleAssignSupportUnit(realIdx, posKey)}
                                            onRemove={() => handlers.handleRemoveSupportUnit(realIdx)}
                                            onClick={() => handlers.handleBuySupportUnit(unitId, realIdx, remainingImprovementPoints)}
                                            unitDef={unitsMap[unitId]}
                                            assignmentInfo={state.purchasedSlotsMap[realIdx] === unitId ? configuredDivision.supportUnits.find(su => su.definitionIndex === realIdx)?.assignedTo : null}
                                            regimentsList={state.regimentsList} unitsRulesMap={state.unitsRulesMap} supportUnits={supportUnits} calculateStats={calcStatsWrapper} getRegimentDefinition={getRegimentDefinition}
                                        />
                                    );

                                    if (typeof item === 'string' || (typeof item === 'object' && !item.type)) {
                                        const unitId = typeof item === 'string' ? item : (item.name || item.id);
                                        return renderTile(unitId);
                                    }
                                    if (typeof item === 'object' && item.type === 'group') {
                                        const purchasedId = state.purchasedSlotsMap[realIdx];
                                        return (
                                            <div key={realIdx} className={styles.supportGroupContainer}>
                                                <div className={styles.supportGroupName}>{item.name}</div>
                                                <div className={styles.supportGroupFlex}>
                                                    {item.options.map(opt => (
                                                        <SupportUnitTile key={opt} unitId={opt}
                                                            isPurchased={purchasedId === opt}
                                                            locked={isLockedByRequirements} 
                                                            disabledReason={isLockedByRequirements ? requirementCheck.reason : null}
                                                            onAssign={(posKey) => handlers.handleAssignSupportUnit(realIdx, posKey)}
                                                            onRemove={() => handlers.handleRemoveSupportUnit(realIdx)}
                                                            onClick={() => handlers.handleBuySupportUnit(opt, realIdx, remainingImprovementPoints)}
                                                            unitDef={unitsMap[opt]}
                                                            assignmentInfo={purchasedId === opt ? configuredDivision.supportUnits.find(su => su.definitionIndex === realIdx)?.assignedTo : null}
                                                            regimentsList={state.regimentsList} unitsRulesMap={state.unitsRulesMap} supportUnits={supportUnits} calculateStats={calcStatsWrapper} getRegimentDefinition={getRegimentDefinition}
                                                        />
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    }
                                    return null;
                                })}
                            </div>
                        </div>

                        {/* Dodatkowe */}
                        <div>
                            <div className={styles.supportGroupTitle}>Elementy Dodatkowe</div>
                            <div className={styles.supportGrid}>
                                {additionalUnitsDefinitions.map((item, idx) => {
                                    const realIdx = idx + divisionArtilleryDefinitions.length;
                                    const requirementCheck = checkSupportUnitRequirements(item, configuredDivision, getRegimentDefinition);
                                    const isPurchased = state.purchasedSlotsMap[realIdx] !== undefined;
                                    const isLockedByRequirements = !isPurchased && !requirementCheck.isAllowed;
                                    
                                    const renderTile = (unitId) => (
                                        <SupportUnitTile 
                                            key={unitId} unitId={unitId} isPurchased={state.purchasedSlotsMap[realIdx] === unitId} 
                                            locked={isLockedByRequirements} disabledReason={requirementCheck.reason}
                                            onAssign={(posKey) => handlers.handleAssignSupportUnit(realIdx, posKey)}
                                            onRemove={() => handlers.handleRemoveSupportUnit(realIdx)}
                                            onClick={() => handlers.handleBuySupportUnit(unitId, realIdx, remainingImprovementPoints)}
                                            unitDef={unitsMap[unitId]}
                                            assignmentInfo={state.purchasedSlotsMap[realIdx] === unitId ? configuredDivision.supportUnits.find(su => su.definitionIndex === realIdx)?.assignedTo : null}
                                            regimentsList={state.regimentsList} unitsRulesMap={state.unitsRulesMap} supportUnits={supportUnits} calculateStats={calcStatsWrapper} getRegimentDefinition={getRegimentDefinition}
                                        />
                                    );

                                    if (typeof item === 'string' || (typeof item === 'object' && !item.type)) {
                                        const unitId = typeof item === 'string' ? item : (item.name || item.id);
                                        return renderTile(unitId);
                                    }
                                    if (typeof item === 'object' && item.type === 'group') {
                                        const purchasedId = state.purchasedSlotsMap[realIdx];
                                        return (
                                            <div key={realIdx} className={styles.supportGroupContainer}>
                                                <div className={styles.supportGroupName}>{item.name}</div>
                                                <div className={styles.supportGroupFlex}>
                                                    {item.options.map(opt => (
                                                        <SupportUnitTile key={opt} unitId={opt}
                                                            isPurchased={purchasedId === opt}
                                                            locked={isLockedByRequirements} 
                                                            disabledReason={isLockedByRequirements ? requirementCheck.reason : null}
                                                            onAssign={(posKey) => handlers.handleAssignSupportUnit(realIdx, posKey)}
                                                            onRemove={() => handlers.handleRemoveSupportUnit(realIdx)}
                                                            onClick={() => handlers.handleBuySupportUnit(opt, realIdx, remainingImprovementPoints)}
                                                            unitDef={unitsMap[opt]}
                                                            assignmentInfo={purchasedId === opt ? configuredDivision.supportUnits.find(su => su.definitionIndex === realIdx)?.assignedTo : null}
                                                            regimentsList={state.regimentsList} unitsRulesMap={state.unitsRulesMap} supportUnits={supportUnits} calculateStats={calcStatsWrapper} getRegimentDefinition={getRegimentDefinition}
                                                        />
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    }
                                    return null;
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* SEKCJA: STRAŻ PRZEDNIA */}
            {vanguardRegiments && vanguardRegiments.length > 0 && (
                <div className={styles.sectionRow}>
                     <div className={styles.sectionLabel}>
                        <span className={styles.sectionLabelText}>Straż Przednia</span>
                    </div>
                    <div className={styles.sectionContent}>
                        <div className={styles.regimentsGrid}>
                            <RegimentBlock group={GROUP_TYPES.VANGUARD} regiments={configuredDivision.vanguard} definitionOptions={divisionDefinition.vanguard} mainForceKey={state.mainForceKey} getRegimentDefinition={getRegimentDefinition} calculateStats={calcStatsWrapper} onNameChange={handlers.handleRegimentNameChange} onRegimentChange={handlers.handleRegimentChange} onOpenEditor={props.onOpenRegimentEditor} onMainForceSelect={handlers.handleMainForceSelect} supportUnits={configuredDivision.supportUnits} unitsMap={unitsMap} configuredDivision={configuredDivision} divisionDefinition={divisionDefinition} currentMainForceCost={state.currentMainForceCost} isAllied={isAllied} currentAlliesCount={currentAlliesCount} calculateRegimentPU={calcPuWrapper} />
                        </div>
                    </div>
                </div>
            )}

            {/* SEKCJA: PODSTAWA DYWIZJI */}
            <div className={styles.sectionRow}>
                <div className={styles.sectionLabel}>
                    <span className={styles.sectionLabelText}>Podstawa Dywizji</span>
                </div>
                <div className={styles.sectionContent}>
                    <div className={styles.regimentsGrid}>
                        <RegimentBlock group={GROUP_TYPES.BASE} regiments={configuredDivision.base} definitionOptions={divisionDefinition.base} mainForceKey={state.mainForceKey} getRegimentDefinition={getRegimentDefinition} calculateStats={calcStatsWrapper} onNameChange={handlers.handleRegimentNameChange} onRegimentChange={handlers.handleRegimentChange} onOpenEditor={props.onOpenRegimentEditor} onMainForceSelect={handlers.handleMainForceSelect} supportUnits={configuredDivision.supportUnits} unitsMap={unitsMap} configuredDivision={configuredDivision} divisionDefinition={divisionDefinition} currentMainForceCost={state.currentMainForceCost} isAllied={isAllied} currentAlliesCount={currentAlliesCount} calculateRegimentPU={calcPuWrapper} />
                    </div>
                </div>
            </div>

            {/* SEKCJA: PUŁKI DODATKOWE */}
            <div className={styles.sectionRow}>
                <div className={styles.sectionLabel}>
                    <span className={styles.sectionLabelText}>Pułki Dodatkowe</span>
                </div>
                <div className={styles.sectionContent}>
                    {useNewAdditionalLogic ? (
                        <div>
                            <div style={{fontSize: 12, color: '#666', marginBottom: 12}}>
                                Wybierz maksymalnie <strong>{additionalMax}</strong> pułki z poniższej listy.
                                Obecnie wybrano: <strong>{configuredDivision.additional.length} / {additionalMax}</strong>
                            </div>
                            
                            <div className={styles.optionsGrid}>
                                {additionalPool.map((regId, idx) => {
                                    // FIX: Logika "Slotów" - sprawdzamy konkretny sourceIndex
                                    const isSelected = configuredDivision.additional.some(r => r.sourceIndex === idx);
                                    
                                    // Jeśli wybrany, znajdź jego instancję, żeby móc wejść w edycję
                                    const selectedInstance = configuredDivision.additional.find(r => r.sourceIndex === idx);

                                    const isLimitReached = configuredDivision.additional.length >= additionalMax;
                                    const isBlocked = !isSelected && isLimitReached;
                                    const isOptionAlly = isAllied(regId);
                                    const isAllyBlocked = isOptionAlly && currentAlliesCount >= 1 && !isSelected;

                                    return (
                                        <RegimentOptionTile 
                                            key={`${regId}-${idx}`} 
                                            optId={regId} 
                                            isActive={isSelected} 
                                            disabled={isBlocked || (isAllyBlocked)}
                                            isAllied={isOptionAlly}
                                            divisionDefinition={divisionDefinition}
                                            // FIX: Przekazujemy idx jako sourceIndex
                                            onClick={() => handlers.handleToggleAdditionalRegiment(regId, idx, additionalMax)} 
                                            getRegimentDefinition={getRegimentDefinition} 
                                        >
                                            {/* Przycisk edycji wewnątrz karty */}
                                            {isSelected && (
                                                <div 
                                                    style={{
                                                        marginTop: 5, fontSize: 10, background: '#333', color: '#fff', 
                                                        padding: '2px 6px', borderRadius: 4, cursor: 'pointer', zIndex: 10, textAlign: 'center'
                                                    }}
                                                    onClick={(e) => {
                                                        e.stopPropagation(); 
                                                        props.onOpenRegimentEditor(GROUP_TYPES.ADDITIONAL, selectedInstance.index);
                                                    }}
                                                >
                                                    EDYTUJ
                                                </div>
                                            )}
                                        </RegimentOptionTile>
                                    );
                                })}
                            </div>

                            <div className={styles.regimentsGrid}>
                                {configuredDivision.additional.map((regiment, index) => (
                                    <SelectedRegimentRow 
                                        key={regiment.sourceIndex || regiment.id + index} 
                                        group={GROUP_TYPES.ADDITIONAL} 
                                        index={index} 
                                        regiment={regiment} 
                                        mainForceKey={state.mainForceKey} 
                                        getRegimentDefinition={getRegimentDefinition} 
                                        calculateStats={calcStatsWrapper} 
                                        onNameChange={handlers.handleRegimentNameChange} 
                                        onOpenEditor={props.onOpenRegimentEditor} 
                                        onMainForceSelect={handlers.handleMainForceSelect} 
                                        supportUnits={configuredDivision.supportUnits} 
                                        unitsMap={unitsMap} 
                                        currentMainForceCost={state.currentMainForceCost} 
                                        isAllied={isAllied} 
                                        calculateRegimentPU={calcPuWrapper} 
                                    />
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className={styles.regimentsGrid}>
                            <RegimentBlock group={GROUP_TYPES.ADDITIONAL} regiments={additionalRegiments} definitionOptions={divisionDefinition.additional} mainForceKey={state.mainForceKey} getRegimentDefinition={getRegimentDefinition} calculateStats={calcStatsWrapper} onNameChange={handlers.handleRegimentNameChange} onRegimentChange={handlers.handleRegimentChange} onOpenEditor={props.onOpenRegimentEditor} onMainForceSelect={handlers.handleMainForceSelect} supportUnits={configuredDivision.supportUnits} unitsMap={unitsMap} configuredDivision={configuredDivision} divisionDefinition={divisionDefinition} currentMainForceCost={state.currentMainForceCost} isAllied={isAllied} currentAlliesCount={currentAlliesCount} calculateRegimentPU={calcPuWrapper} />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}