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
    calculateDivisionType
} from "../utils/armyMath";
import { getDivisionRulesDescriptions, checkSupportUnitRequirements } from "../utils/divisionRules";
import { GROUP_TYPES } from "../constants";
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

    // --- FILTROWANIE TABORU ---
    const taborDefinitions = divisionArtilleryDefinitions.filter(item => {
        const nameToCheck = item.type === 'group' ? item.name : (typeof item === 'string' ? item : item.name);
        return nameToCheck && nameToCheck.toLowerCase().includes("tabor");
    });

    const standardArtilleryDefinitions = divisionArtilleryDefinitions.filter(item => !taborDefinitions.includes(item));

    // --- Helpery obliczeniowe ---
    const calcStatsWrapper = (config, id) => calculateRegimentStats(config, id, configuredDivision, unitsMap, getRegimentDefinition, improvements);
    const calcPuWrapper = (config, id, regimentSupport) => calculateRegimentImprovementPoints(config, id, unitsMap, getRegimentDefinition, improvements, regimentSupport, divisionDefinition);

    // --- Walidacje Główne ---
    const vanguardCheck = validateVanguardCost(configuredDivision, unitsMap, faction, getRegimentDefinition, improvements);
    const alliedCheck = validateAlliedCost(configuredDivision, unitsMap, faction, getRegimentDefinition, improvements);

    // --- NOWOŚĆ: Walidacja jednostek wsparcia (NAPRAWIONA LOGIKA POBIERANIA DEFINICJI) ---
    const supportErrorsSet = new Set();
    const allSupportDefs = [...divisionArtilleryDefinitions, ...additionalUnitsDefinitions];

    configuredDivision.supportUnits.forEach(su => {
        let unitConfig = null;
        let parentDef = null;

        // 1. Znajdź definicję nadrzędną (może to być Grupa lub Jednostka)
        if (su.definitionIndex !== undefined) {
            parentDef = allSupportDefs[su.definitionIndex];
        } else {
            // Fallback po ID
            parentDef = allSupportDefs.find(u => (u.id === su.id) || (u.name === su.id));
        }

        // 2. Jeśli to grupa, musimy znaleźć konkretną opcję wewnątrz niej
        if (parentDef && parentDef.type === 'group' && parentDef.options) {
            const subOption = parentDef.options.find(opt => 
                (typeof opt === 'string' ? opt : opt.id) === su.id
            );
            
            // Jeśli opcja jest obiektem, to ona zawiera wymagania (requirements)
            if (subOption && typeof subOption === 'object') {
                unitConfig = subOption;
            } else {
                // Jeśli string, to polegamy na unitsMap (ale dla Taboru to są obiekty)
                unitConfig = unitsMap[su.id];
            }
        } else {
            // To nie była grupa, więc parentDef jest naszą konfiguracją
            unitConfig = parentDef;
        }

        // 3. Fallback do globalnej mapy, jeśli nadal pusto
        if (!unitConfig && unitsMap[su.id]) {
            unitConfig = unitsMap[su.id];
        }

        if (unitConfig) {
            // WAŻNE: Tryb 'validate' wyłapuje przekroczenia limitów
            const check = checkSupportUnitRequirements(unitConfig, configuredDivision, getRegimentDefinition, unitsMap, 'validate');
            
            if (!check.isAllowed) {
                const unitName = unitConfig.name || unitsMap[su.id]?.name || su.id;
                supportErrorsSet.add(`Błąd wsparcia (${unitName}): ${check.reason}`);
            }
        }
    });

    // --- Zbieranie wszystkich błędów ---
    const allValidationErrors = [
        ...(propsValidationErrors || []),
        !vanguardCheck.isValid ? vanguardCheck.message : null,
        !alliedCheck.isValid ? alliedCheck.message : null,
        remainingImprovementPoints < 0 ? `Przekroczono limit Punktów Ulepszeń o ${Math.abs(remainingImprovementPoints)}.` : null,
        ...Array.from(supportErrorsSet) // Dodajemy błędy ze wsparcia
    ].filter(Boolean);

    const hasCriticalErrors = allValidationErrors.length > 0;

    // --- Dane do widoku ---
    const divisionType = calculateDivisionType(configuredDivision, unitsMap, getRegimentDefinition, improvements);
    const rulesDescriptions = getDivisionRulesDescriptions(divisionDefinition, unitsMap, getRegimentDefinition, improvements);
    
    const { vanguard: vanguardRegiments, base: baseRegiments, additional: additionalRegiments } = configuredDivision;
    const generalId = configuredDivision.general;
    const generalDef = generalId ? unitsMap[generalId] : null;

    const unassignedSupport = configuredDivision.supportUnits.filter(su => !su.assignedTo);

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
            // Sprawdzamy czy ten SLOT (idx) został kupiony jako TA opcja (unitId)
            const isPurchasedOption = state.purchasedSlotsMap[idx] === unitId;
            const isSlotOccupied = state.purchasedSlotsMap[idx] !== undefined;

            const specificUnitDef = state.unitsMap[unitId] || (typeof item === 'object' && item.options?.find(o => o.id === unitId));
            
            // Walidacja wymagań (czy mogę kupić?)
            let reqCheck = { isAllowed: true, reason: null };
            if (specificUnitDef) {
                reqCheck = checkSupportUnitRequirements(specificUnitDef, configuredDivision, getRegimentDefinition, state.unitsMap);
            }
            if (reqCheck.isAllowed) {
                const groupReqCheck = checkSupportUnitRequirements(item, configuredDivision, getRegimentDefinition, state.unitsMap);
                if (!groupReqCheck.isAllowed) reqCheck = groupReqCheck;
            }

            // Pobieramy instancje zakupione w ramach tego slotu
            // Jeśli to pakiet, będzie ich > 1. Jeśli zwykła, będzie 1.
            const purchasedInstances = configuredDivision.supportUnits.filter(su => su.definitionIndex === idx);

            // LOGIKA WYŚWIETLANIA:
            
            // 1. Jeśli to TA opcja została kupiona -> Wyświetl wszystkie powstałe z niej jednostki
            if (isPurchasedOption) {
                return (
                    <React.Fragment key={unitId}>
                        {purchasedInstances.map(instance => {
                            // Definicja konkretnej jednostki (np. "koz_artillery_s") a nie pakietu
                            const realUnitDef = state.unitsMap[instance.id]; 
                            
                            return (
                                <SupportUnitTile 
                                    key={instance.instanceId} // Używamy unikalnego ID instancji
                                    unitId={instance.id} 
                                    isPurchased={true} 
                                    locked={false}
                                    disabledReason={null}
                                    // Przekazujemy funkcje do konkretnej instancji
                                    onAssign={(posKey) => handlers.handleAssignSupportUnit(idx, posKey, instance.instanceId)}
                                    // Usunięcie którejkolwiek instancji usuwa cały pakiet (cały slot)
                                    onRemove={() => handlers.handleRemoveSupportUnit(idx)}
                                    onClick={undefined} // Kupionej się nie klika żeby kupić
                                    unitDef={realUnitDef} 
                                    assignmentInfo={instance.assignedTo}
                                    purchasedInstances={[instance]} // Przekazujemy tylko siebie do kontekstu selecta
                                    regimentsList={state.regimentsList} 
                                    unitsRulesMap={state.unitsRulesMap} 
                                    supportUnits={configuredDivision.supportUnits} 
                                    calculateStats={calcStatsWrapper} 
                                    getRegimentDefinition={getRegimentDefinition}
                                />
                            );
                        })}
                    </React.Fragment>
                );
            }

            // 2. Jeśli ten slot jest zajęty przez INNĄ opcję -> Wyświetl tę jako zablokowaną (wyszarzoną)
            // 3. Jeśli slot jest wolny -> Wyświetl tę opcję jako możliwą do kupienia
            const locked = isSlotOccupied || !reqCheck.isAllowed;

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
                <input className={styles.inputField} placeholder="Gracz" value={state.playerName} onChange={e => state.setPlayerName(e.target.value)} style={{ flex: 1 }} />
                <input className={styles.inputField} placeholder="Nazwa Własna Dywizji" value={state.divisionCustomName} onChange={e => state.setDivisionCustomName(e.target.value)} style={{ flex: 3 }} />
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
                activeRegimentsList={state.activeRegimentsList}
                unitsMap={unitsMap}
            />

            {/* TU WYŚWIETLAJĄ SIĘ BŁĘDY */}
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
                            <RegimentBlock group={GROUP_TYPES.VANGUARD} regiments={configuredDivision.vanguard} definitionOptions={divisionDefinition.vanguard} mainForceKey={state.mainForceKey} getRegimentDefinition={getRegimentDefinition} calculateStats={calcStatsWrapper} onNameChange={handlers.handleRegimentNameChange} onRegimentChange={handlers.handleRegimentChange} onOpenEditor={props.onOpenRegimentEditor} onMainForceSelect={handlers.handleMainForceSelect} supportUnits={configuredDivision.supportUnits} unitsMap={unitsMap} configuredDivision={configuredDivision} divisionDefinition={divisionDefinition} currentMainForceCost={state.currentMainForceCost} isAllied={state.isAllied} currentAlliesCount={state.currentAlliesCount} calculateRegimentPU={calcPuWrapper} />
                        </div>
                    </div>
                </div>
            )}

            <div className={styles.sectionRow}>
                <div className={styles.sectionLabel}><span className={styles.sectionLabelText}>Podstawa Dywizji</span></div>
                <div className={styles.sectionContent}>
                    <div className={styles.regimentsGrid}>
                        <RegimentBlock group={GROUP_TYPES.BASE} regiments={configuredDivision.base} definitionOptions={divisionDefinition.base} mainForceKey={state.mainForceKey} getRegimentDefinition={getRegimentDefinition} calculateStats={calcStatsWrapper} onNameChange={handlers.handleRegimentNameChange} onRegimentChange={handlers.handleRegimentChange} onOpenEditor={props.onOpenRegimentEditor} onMainForceSelect={handlers.handleMainForceSelect} supportUnits={configuredDivision.supportUnits} unitsMap={unitsMap} configuredDivision={configuredDivision} divisionDefinition={divisionDefinition} currentMainForceCost={state.currentMainForceCost} isAllied={state.isAllied} currentAlliesCount={state.currentAlliesCount} calculateRegimentPU={calcPuWrapper} />
                    </div>
                </div>
            </div>
            
            <div className={styles.sectionRow}>
                <div className={styles.sectionLabel}><span className={styles.sectionLabelText}>Pułki Dodatkowe</span></div>
                <div className={styles.sectionContent}>
                    {useNewAdditionalLogic ? (
                        <div>
                            <div style={{fontSize: 12, color: '#666', marginBottom: 12}}>
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
                                            {isSelected && (<div style={{ marginTop: 5, fontSize: 10, background: '#333', color: '#fff', padding: '2px 6px', borderRadius: 4, cursor: 'pointer', zIndex: 10, textAlign: 'center' }} onClick={(e) => { e.stopPropagation(); props.onOpenRegimentEditor(GROUP_TYPES.ADDITIONAL, selectedInstance.index); }}>EDYTUJ</div>)}
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

            {taborDefinitions.length > 0 && (
                <div className={styles.sectionRow}>
                    <div className={styles.sectionLabel} style={{background: '#efebe9', borderRightColor: '#d7ccc8'}}>
                        <span className={styles.sectionLabelText} style={{color: '#5d4037'}}>Tabor</span>
                    </div>
                    <div className={styles.sectionContent} style={{background: '#fff8f6'}}>
                        <div className={styles.supportGroupTitle} style={{color: '#5d4037', borderBottom: '1px solid #d7ccc8', paddingBottom: 5, marginBottom: 15}}>
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