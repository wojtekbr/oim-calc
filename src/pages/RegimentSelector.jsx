import React, { useMemo } from "react";
import { PDFDownloadLink } from '@react-pdf/renderer';
import { ArmyListDocument } from '../pdf/ArmyListDocument';
import { useRegimentSelectorLogic } from "./useRegimentSelectorLogic";
import styles from "./RegimentSelector.module.css";
import { calculateRegimentStats, calculateDivisionType } from "../utils/armyMath";
import { checkDivisionConstraints, getDivisionRulesDescriptions, checkSupportUnitRequirements } from "../utils/divisionRules";
import { IDS, GROUP_TYPES } from "../constants";
import { useArmyData } from "../context/ArmyDataContext";

// --- Sub-components ---

const SupportUnitTile = ({ unitId, isPurchased, locked, onClick, unitDef, disabledReason }) => {
    const puCost = unitDef?.improvement_points_cost || unitDef?.pu_cost || 0;
    const costPU = puCost ? ` | ${puCost} PU` : '';
    const tooltip = locked && disabledReason ? disabledReason : (unitDef?.name || unitId);
    return (
        <div
            className={`${styles.supportTile} ${isPurchased ? styles.active : ''} ${locked ? styles.locked : ''}`}
            onClick={locked ? undefined : onClick}
            title={tooltip}
        >
            <div style={{ fontWeight: 'bold', fontSize: 13, marginBottom: 4 }}>{unitDef?.name || unitId}</div>
            <div style={{ fontSize: 11, color: '#666' }}>{unitDef?.cost || 0} pkt {costPU}</div>
            {isPurchased && <div className={styles.checkIcon}>✔</div>}
            {locked && disabledReason && (
                <div style={{fontSize: 9, color: 'red', marginTop: 4, fontStyle: 'italic', lineHeight: '1.2'}}>
                    {disabledReason}
                </div>
            )}
        </div>
    );
};

const GeneralOptionTile = ({ unitId, isActive, onClick, unitDef }) => {
    const puCost = unitDef?.improvement_points_cost || unitDef?.pu_cost || 0;
    const costLabel = puCost > 0 
        ? `${unitDef?.cost || 0} PS + ${puCost} PU`
        : `${unitDef?.cost || 0} PS`;

    return (
        <div 
            className={`${styles.optionCard} ${isActive ? styles.active : ''}`}
            onClick={onClick}
            style={{minWidth: 200}}
        >
            <div className={styles.optionName}>
                {isActive && "✔ "}{unitDef?.name || unitId}
            </div>
            <div className={styles.optionCost}>
                Koszt: {costLabel}
            </div>
            <div className={styles.regStats} style={{marginTop: 6, fontSize: 11, textAlign:'left'}}>
                {unitDef?.orders !== undefined && <div>Rozkazy: <strong>{unitDef.orders}</strong></div>}
                {unitDef?.activations !== undefined && <div>Aktywacje: <strong>{unitDef.activations}</strong></div>}
            </div>
        </div>
    );
};

const SupportConfigRow = ({ supportUnit, index, unitsMap, unitsRulesMap, regimentsList, supportUnits, onAssign, onRemove, getRegimentDefinition, calculateStats }) => {
    const unitDef = unitsMap[supportUnit.id];
    const rules = unitsRulesMap[supportUnit.id] || {};
    const canBeAssigned = rules.can_be_assigned !== false;

    const getSupportUnitType = (u) => {
        if (!u) return 'infantry';
        if (u.is_artillery) return 'artillery';
        if (u.is_cavalry || u.is_dragoon || u.are_dragoons || u.are_proxy_dragoons) return 'cavalry';
        return 'infantry';
    };

    const supportType = getSupportUnitType(unitDef);
    const isDragoon = unitDef.is_dragoon || unitDef.are_dragoons || unitDef.are_proxy_dragoons;

    const availableRegiments = regimentsList.filter(r => {
        if (rules?.allowed_regiment_ids && rules.allowed_regiment_ids.length > 0) {
            if (!rules.allowed_regiment_ids.includes(r.id)) return false;
        }
        if (rules?.exclusion_tag) {
            const otherUnitInRegiment = supportUnits.find(otherSu =>
                otherSu.id !== supportUnit.id &&
                otherSu.assignedTo?.positionKey === r.positionKey
            );
            if (otherUnitInRegiment) {
                 const otherRules = unitsRulesMap[otherUnitInRegiment.id] || {};
                 if (otherRules.exclusion_tag === rules.exclusion_tag) return false;
                 if (otherUnitInRegiment.id === rules.exclusion_tag) return false;
                 if (otherRules.exclusion_tag === supportUnit.id) return false;
            }
        }

        if (isDragoon) return true;

        const stats = calculateStats(r.config, r.id);
        const regType = stats.regimentType; 

        if (supportType === 'artillery' || supportType === 'infantry') {
            if (regType !== 'Pieszy') return false;
        } else if (supportType === 'cavalry') {
            if (regType !== 'Konny') return false;
        }
        return true;
    });

    const isRequired = rules.assignment_required;
    const isUnassigned = !supportUnit.assignedTo;
    const isError = canBeAssigned && isRequired && isUnassigned;

    return (
        <div className={`${styles.configRow} ${isError ? styles.error : ''}`}>
            <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 'bold', color: isError ? '#d32f2f' : 'inherit' }}>
                    {unitDef?.name || supportUnit.id}
                    {isError && <span style={{marginLeft: 8, fontSize: 11}}>⚠️ WYMAGANE PRZYPISANIE!</span>}
                </div>
                <div style={{ fontSize: 12, color: '#666' }}>Koszt: {unitDef?.cost} pkt</div>
            </div>

            <div style={{ flex: 2 }}>
                {canBeAssigned ? (
                    <select
                        className={styles.selectInput}
                        value={supportUnit.assignedTo?.positionKey || ''}
                        onChange={(e) => onAssign(index, e.target.value)}
                        style={{ borderColor: isError ? 'red' : '#ccc' }}
                    >
                        <option value="">{isError ? "⚠️ Wybierz pułk..." : "— Nieprzypisana —"}</option>
                        {regimentsList.map(r => {
                             const isAvailable = availableRegiments.some(ar => ar.positionKey === r.positionKey);
                             const isCurrentlySelected = supportUnit.assignedTo?.positionKey === r.positionKey;
                             
                             if (!isAvailable && !isCurrentlySelected) return null;
                             
                             const regName = getRegimentDefinition(r.id)?.name || r.id;
                             const displayName = r.customName || regName;
                             
                             let prefix = '';
                             if (r.positionKey.startsWith(GROUP_TYPES.BASE)) prefix = 'Podst.';
                             else if (r.positionKey.startsWith(GROUP_TYPES.VANGUARD)) prefix = 'Straż';
                             else prefix = 'Poz. I';

                             const label = `${prefix}: ${displayName}`;
                             const disabledInfo = !isAvailable ? " (Niedozwolony typ)" : "";

                             return (
                                <option key={r.positionKey} value={r.positionKey} disabled={!isAvailable}>
                                    {label}{disabledInfo}
                                </option>
                             );
                        })}
                    </select>
                ) : (
                    <div style={{ fontSize: 12, fontStyle: 'italic', color: '#666', textAlign: 'center' }}>Wsparcie Dywizyjne</div>
                )}
            </div>
            <button className={styles.removeBtn} onClick={() => onRemove(index)}>Usuń</button>
        </div>
    );
};

const RegimentOptionTile = ({ optId, isActive, onClick, getRegimentDefinition, disabled, isAllied }) => {
    const def = getRegimentDefinition(optId);
    const name = def?.name || optId;
    const cost = def?.base_cost || 0;

    return (
        <div 
            className={`${styles.optionCard} ${isActive ? styles.active : ''} ${disabled ? styles.disabledTile : ''}`}
            onClick={disabled ? undefined : onClick}
        >
            <div className={styles.optionName}>
                {isActive && "✔ "}{name}
            </div>
            <div className={styles.optionCost}>
                Koszt bazowy: {cost} PS
            </div>
            {isAllied && (
                <div style={{ fontSize: 10, color: '#d35400', marginTop: 2, fontWeight: 'bold' }}>
                    (Pułk Sojuszniczy)
                </div>
            )}
        </div>
    );
};

const RegimentBlock = ({ 
    group, regiments, definitionOptions, 
    mainForceKey, getRegimentDefinition, calculateStats, 
    onNameChange, onRegimentChange, onOpenEditor, onMainForceSelect, 
    supportUnits, unitsMap, configuredDivision, divisionDefinition,
    currentMainForceCost,
    isAllied,
    currentAlliesCount
}) => {
    return regiments.map((regiment, index) => {
        const options = definitionOptions[index].options;
        const currentRegimentId = regiment.id;
        const isNone = currentRegimentId === IDS.NONE;
        const canEdit = !isNone && getRegimentDefinition(currentRegimentId)?.structure;
        const isBase = group === GROUP_TYPES.BASE || group === GROUP_TYPES.VANGUARD;
        const positionKey = `${group}/${index}`;

        let isDisabled = false;
        let disabledMessage = "";
        
        if (group === GROUP_TYPES.ADDITIONAL && index > 0) {
            const previousRegiment = regiments[index - 1];
            if (previousRegiment.id === IDS.NONE) {
                isDisabled = true;
                disabledMessage = "(Wymagany poprzedni pułk)";
            }
        }

        const stats = calculateStats(regiment.config, regiment.id);
        const isMainForce = mainForceKey === positionKey;
        const finalActivations = stats.activations + (isMainForce ? 1 : 0);
        const isVanguardGroup = group === GROUP_TYPES.VANGUARD;
        
        const isRegimentAllied = !isNone && isAllied(currentRegimentId);
        const isMainForceCandidate = !isVanguardGroup && !isNone && !isRegimentAllied && stats.cost === currentMainForceCost;

        const handleTileClick = (optId, isBlocked) => {
            if (isDisabled || isBlocked) return;
            const isMandatory = group === GROUP_TYPES.BASE || group === GROUP_TYPES.VANGUARD;
            let newId = optId;
            if (!isMandatory && currentRegimentId === optId) {
                newId = IDS.NONE;
            }
            onRegimentChange(group, index, newId);
        };

        let label = "";
        if (group === GROUP_TYPES.BASE) label = `Podstawa #${index + 1}`;
        else if (group === GROUP_TYPES.VANGUARD) label = `Straż Przednia #${index + 1}`;
        else label = `Poziom I #${index + 1}`;

        return (
            <div key={`${group}-${index}`} className={`${styles.regimentRow} ${isMainForce ? styles.mainForce : ''} ${isDisabled ? styles.disabled : ''}`}>
                <div className={styles.regHeader}>
                    <div style={{flex: 1}}>
                        <div className={styles.regTitle}>
                            {label}
                            {isMainForce && <span className={styles.mainForceBadge}>SIŁY GŁÓWNE</span>}
                            {isRegimentAllied && <span style={{background:'#d35400', color:'white', padding:'2px 6px', borderRadius:4, fontSize:11, marginLeft:6}}>SOJUSZNIK</span>}
                            {isMainForceCandidate && !isMainForce && (
                                <button 
                                    onClick={() => onMainForceSelect(positionKey)}
                                    style={{marginLeft: 10, fontSize: 10, padding: '2px 6px', cursor: 'pointer', background: '#fff', border: '1px solid #ff9800', color: '#ef6c00', borderRadius: 4}}
                                >
                                    ★ Ustaw jako SG
                                </button>
                            )}
                            {isDisabled && <span style={{fontSize: 12, fontWeight: 'normal', color: '#888', marginLeft: 10}}>{disabledMessage}</span>}
                        </div>

                        <div className={styles.optionsGrid}>
                            {options.filter(optId => optId !== IDS.NONE).map(optId => {
                                const isActive = currentRegimentId === optId;
                                const isRuleBlocked = !isActive && !checkDivisionConstraints(configuredDivision, divisionDefinition, optId);
                                
                                const isOptionAlly = isAllied(optId);
                                const isAllyBlocked = isOptionAlly && currentAlliesCount >= 1 && currentRegimentId !== optId;
                                
                                const isBlocked = isDisabled || isRuleBlocked || isAllyBlocked;

                                return (
                                    <RegimentOptionTile 
                                        key={optId} 
                                        optId={optId}
                                        isActive={isActive}
                                        disabled={isBlocked}
                                        isAllied={isOptionAlly}
                                        onClick={() => handleTileClick(optId, isBlocked)}
                                        getRegimentDefinition={getRegimentDefinition}
                                    />
                                );
                            })}
                        </div>
                        
                        {!isDisabled && !isNone && (
                             <div className={styles.regControls} style={{marginTop: 8}}>
                                <input 
                                    className={styles.regNameInput}
                                    placeholder="Nazwa własna pułku..."
                                    value={regiment.customName || ""}
                                    onChange={(e) => onNameChange(group, index, e.target.value)}
                                />
                                {canEdit && (
                                    <button className={styles.editBtn} onClick={() => onOpenEditor(group, index)}>
                                        Konfiguruj Pułk ›
                                    </button>
                                )}
                             </div>
                        )}
                    </div>

                    {!isDisabled && !isNone && (
                        <div style={{display:'flex', flexDirection: 'column', alignItems: 'flex-end', marginLeft: 20, minWidth: 150}}>
                            <div className={styles.regCost}>{stats.cost} pkt</div>
                            <div className={styles.regStats} style={{marginTop: 4}}>
                                <div style={{fontWeight: 'bold', marginBottom: 4, color: '#444'}}>Typ: {stats.regimentType}</div>
                                
                                <div>Aktywacje: <strong>{finalActivations}</strong></div>
                                <div>Motywacja: <strong>{stats.motivation + (isMainForce?1:0)}</strong></div>
                                
                                {isVanguardGroup && (
                                    <>
                                        <div style={{marginTop: 4, color: '#d35400'}}>Zwiad: <strong>{stats.recon}</strong></div>
                                        <div style={{color: '#d35400'}}>Czujność: <strong>{stats.awareness}</strong></div>
                                    </>
                                )}
                            </div>
                        </div>
                    )}
                </div>
                
                {!isDisabled && !isNone && (
                    <div className={styles.regSupportInfo}>
                        Wsparcie: {
                            supportUnits.filter(su => su.assignedTo?.positionKey === positionKey).length === 0 
                            ? "brak" 
                            : supportUnits.filter(su => su.assignedTo?.positionKey === positionKey)
                                .map(su => unitsMap[su.id]?.name).join(", ")
                        }
                    </div>
                )}
            </div>
        );
    });
};

export default function RegimentSelector(props) {
    const { 
        faction, divisionDefinition, configuredDivision, unitsMap, 
        remainingImprovementPoints, improvementPointsLimit, totalDivisionCost, divisionBaseCost,
        getRegimentDefinition, onBack, validationErrors 
    } = props;

    const { state, handlers } = useRegimentSelectorLogic(props);
    const { improvements } = useArmyData();
    const calcStatsWrapper = (config, id) => calculateRegimentStats(config, id, configuredDivision, unitsMap, getRegimentDefinition, improvements);
    
    const divisionType = calculateDivisionType(configuredDivision, unitsMap, getRegimentDefinition, improvements);

    const rulesDescriptions = getDivisionRulesDescriptions(divisionDefinition, unitsMap, getRegimentDefinition);

    const { vanguard: vanguardRegiments, base: baseRegiments, additional: additionalRegiments, supportUnits } = configuredDivision;

    const generalId = configuredDivision.general;
    const generalDef = generalId ? unitsMap[generalId] : null;

    const currentMainForceCost = useMemo(() => {
        if (!state.mainForceKey) return 0;
        const [group, idxStr] = state.mainForceKey.split('/');
        const index = parseInt(idxStr, 10);
        let reg = null;
        if (group === GROUP_TYPES.BASE) reg = configuredDivision.base[index];
        else if (group === GROUP_TYPES.ADDITIONAL) reg = configuredDivision.additional[index];
        
        if (reg) {
            return calcStatsWrapper(reg.config, reg.id).cost;
        }
        return 0;
    }, [state.mainForceKey, configuredDivision]);

    // Helper to check if regiment is ally
    const isAllied = (regId) => {
        if (regId === IDS.NONE) return false;
        return faction.regiments && !faction.regiments[regId];
    };

    const currentAlliesCount = useMemo(() => {
        const all = [...vanguardRegiments, ...baseRegiments, ...additionalRegiments];
        return all.filter(r => r.id !== IDS.NONE && isAllied(r.id)).length;
    }, [configuredDivision]);

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <button className={styles.backBtn} onClick={onBack}>← Powrót do Frakcji</button>
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
                        />
                    }
                    fileName={`Rozpiska_${state.divisionCustomName || 'Armia'}.pdf`}
                    className={styles.pdfBtn}
                >
                    {({ loading }) => loading ? 'Generowanie...' : 'Eksportuj do PDF 🖨️'}
                </PDFDownloadLink>
            </div>

            <div className={styles.inputsRow}>
                <input 
                    className={styles.inputField} 
                    placeholder="Nazwa Gracza" 
                    value={state.playerName} 
                    onChange={e => state.setPlayerName(e.target.value)} 
                />
                <input 
                    className={styles.inputField} 
                    placeholder="Nazwa Własna Dywizji" 
                    value={state.divisionCustomName} 
                    onChange={e => state.setDivisionCustomName(e.target.value)} 
                    style={{ flex: 2 }}
                />
            </div>

            <div className={styles.summaryCard}>
                <div>
                    <div className={styles.summaryTitle}>
                        Podsumowanie: {divisionType} ({totalDivisionCost} pkt)
                    </div>
                    <div className={styles.summarySubtitle}>Koszt bazowy dywizji: {divisionBaseCost} pkt</div>
                    
                    {generalDef && (
                        <div style={{marginTop: 8, fontSize: 13, color: '#333'}}>
                            <strong>Dowódca:</strong> {generalDef.name} 
                            <span style={{color: '#666', marginLeft: 6}}>
                                ({generalDef.orders} Rozkazy)
                            </span>
                        </div>
                    )}
                </div>
                <div className={`${styles.summaryPoints} ${remainingImprovementPoints < 0 ? styles.pointsError : styles.pointsOk}`}>
                    Punkty Ulepszeń: {remainingImprovementPoints} / {improvementPointsLimit}
                </div>
            </div>

            {validationErrors && validationErrors.length > 0 && (
                <div style={{ marginBottom: 20, padding: 15, backgroundColor: '#ffebee', border: '1px solid #ef5350', borderRadius: 8, color: '#c62828' }}>
                    <h4 style={{marginTop: 0, marginBottom: 8}}>⚠️ Błędy w konstrukcji dywizji:</h4>
                    <ul style={{margin: 0, paddingLeft: 20}}>
                        {validationErrors.map((err, idx) => (
                            <li key={idx}>{err}</li>
                        ))}
                    </ul>
                </div>
            )}

            {rulesDescriptions && rulesDescriptions.length > 0 && (
                <div className={styles.section} style={{background: '#f9f9f9'}}>
                    <h3 className={styles.sectionTitle} style={{color:'#666'}}>Zasady Specjalne Dywizji</h3>
                    <div style={{display:'flex', flexDirection:'column', gap: 10}}>
                        {rulesDescriptions.map(rule => (
                            <div key={rule.id} style={{fontSize: 14}}>
                                <strong>• {rule.title}: </strong> {rule.description}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {divisionDefinition.general && divisionDefinition.general.length > 0 && (
                <div className={styles.section}>
                    <h3 className={styles.sectionTitle}>Dowódca Dywizji</h3>
                    <div className={styles.optionsGrid}>
                        {divisionDefinition.general.map(genId => (
                            <GeneralOptionTile 
                                key={genId} 
                                unitId={genId} 
                                unitDef={unitsMap[genId]}
                                isActive={configuredDivision.general === genId}
                                onClick={() => handlers.handleGeneralChange(genId)}
                            />
                        ))}
                    </div>
                </div>
            )}

            <div className={styles.section}>
                <h3 className={styles.sectionTitle}>Dostępne Wsparcie</h3>
                <div className={styles.supportGrid}>
                    {props.additionalUnitsDefinitions.map((item, idx) => {
                         const requirementCheck = checkSupportUnitRequirements(item, configuredDivision, getRegimentDefinition);
                         const isPurchased = state.purchasedSlotsMap[idx] !== undefined;
                         const isLockedByRequirements = !isPurchased && !requirementCheck.isAllowed;

                         if (typeof item === 'string' || (typeof item === 'object' && !item.type)) {
                             const unitId = typeof item === 'string' ? item : item.name;
                             return (
                                 <SupportUnitTile 
                                    key={idx} 
                                    unitId={unitId} 
                                    isPurchased={state.purchasedSlotsMap[idx] === unitId} 
                                    locked={isLockedByRequirements}
                                    disabledReason={requirementCheck.reason}
                                    onClick={() => handlers.handleBuySupportUnit(unitId, idx, remainingImprovementPoints)}
                                    unitDef={unitsMap[unitId]}
                                 />
                             );
                         }

                         if (typeof item === 'object' && item.type === 'group') {
                             const purchasedId = state.purchasedSlotsMap[idx];
                             return (
                                 <div key={idx} style={{border:'1px dashed #ccc', padding:8, borderRadius:6, background:'#fafafa'}}>
                                     <div style={{fontSize:11, textAlign:'center', marginBottom:6, color:'#666'}}>{item.name}</div>
                                     <div style={{display:'flex', gap:6}}>
                                         {item.options.map(opt => (
                                             <SupportUnitTile key={opt} unitId={opt}
                                                isPurchased={purchasedId === opt}
                                                locked={(purchasedId && purchasedId !== opt) || isLockedByRequirements}
                                                disabledReason={isLockedByRequirements ? requirementCheck.reason : null}
                                                onClick={() => handlers.handleBuySupportUnit(opt, idx, remainingImprovementPoints)}
                                                unitDef={unitsMap[opt]}
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

            {supportUnits.length > 0 && (
                <div className={styles.section} style={{backgroundColor:'#eef6fc', borderColor:'#cce3f6'}}>
                    <h3 className={styles.sectionTitle} style={{color:'#0056b3', borderBottomColor:'#cce3f6'}}>Konfiguracja Wsparcia</h3>
                    {supportUnits.map((su, idx) => (
                        <SupportConfigRow 
                            key={idx} 
                            supportUnit={su} 
                            index={idx}
                            supportUnitIndex={idx}
                            unitsMap={unitsMap}
                            unitsRulesMap={state.unitsRulesMap}
                            regimentsList={state.regimentsList}
                            supportUnits={supportUnits}
                            getRegimentDefinition={getRegimentDefinition}
                            onAssign={handlers.handleAssignSupportUnit}
                            onRemove={handlers.handleRemoveSupportUnit}
                            calculateStats={calcStatsWrapper}
                        />
                    ))}
                </div>
            )}

            {vanguardRegiments && vanguardRegiments.length > 0 && (
                <div className={styles.section}>
                    <h3 className={styles.sectionTitle}>Straż Przednia</h3>
                    <RegimentBlock 
                        group={GROUP_TYPES.VANGUARD} 
                        regiments={vanguardRegiments} 
                        definitionOptions={divisionDefinition.vanguard}
                        mainForceKey={state.mainForceKey}
                        getRegimentDefinition={getRegimentDefinition}
                        calculateStats={calcStatsWrapper}
                        onNameChange={handlers.handleRegimentNameChange}
                        onRegimentChange={handlers.handleRegimentChange}
                        onOpenEditor={props.onOpenRegimentEditor}
                        onMainForceSelect={handlers.handleMainForceSelect}
                        supportUnits={supportUnits}
                        unitsMap={unitsMap}
                        configuredDivision={configuredDivision}
                        divisionDefinition={divisionDefinition}
                        currentMainForceCost={currentMainForceCost}
                        isAllied={isAllied}
                        currentAlliesCount={currentAlliesCount}
                    />
                </div>
            )}

            <div className={styles.section}>
                <h3 className={styles.sectionTitle}>Podstawa Dywizji</h3>
                <RegimentBlock 
                    group={GROUP_TYPES.BASE} 
                    regiments={baseRegiments} 
                    definitionOptions={divisionDefinition.base}
                    mainForceKey={state.mainForceKey}
                    getRegimentDefinition={getRegimentDefinition}
                    calculateStats={calcStatsWrapper}
                    onNameChange={handlers.handleRegimentNameChange}
                    onRegimentChange={handlers.handleRegimentChange}
                    onOpenEditor={props.onOpenRegimentEditor}
                    onMainForceSelect={handlers.handleMainForceSelect}
                    supportUnits={supportUnits}
                    unitsMap={unitsMap}
                    configuredDivision={configuredDivision}
                    divisionDefinition={divisionDefinition}
                    currentMainForceCost={currentMainForceCost}
                    isAllied={isAllied}
                    currentAlliesCount={currentAlliesCount}
                />
            </div>
            
            <div className={styles.section}>
                <h3 className={styles.sectionTitle}>Poziom I</h3>
                 <RegimentBlock 
                    group={GROUP_TYPES.ADDITIONAL} 
                    regiments={additionalRegiments} 
                    definitionOptions={divisionDefinition.additional}
                    mainForceKey={state.mainForceKey}
                    getRegimentDefinition={getRegimentDefinition}
                    calculateStats={calcStatsWrapper}
                    onNameChange={handlers.handleRegimentNameChange}
                    onRegimentChange={handlers.handleRegimentChange}
                    onOpenEditor={props.onOpenRegimentEditor}
                    onMainForceSelect={handlers.handleMainForceSelect}
                    supportUnits={supportUnits}
                    unitsMap={unitsMap}
                    configuredDivision={configuredDivision}
                    divisionDefinition={divisionDefinition}
                    currentMainForceCost={currentMainForceCost}
                    isAllied={isAllied}
                    currentAlliesCount={currentAlliesCount}
                />
            </div>
        </div>
    );
}