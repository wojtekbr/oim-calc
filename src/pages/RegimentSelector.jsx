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
    calculateRegimentImprovementPoints
} from "../utils/armyMath";
import { checkDivisionConstraints, getDivisionRulesDescriptions, checkSupportUnitRequirements } from "../utils/divisionRules";
import { IDS, GROUP_TYPES } from "../constants";
import { useArmyData } from "../context/ArmyDataContext";

// --- Helpers do Placeholdera ---
const getPlaceholderColor = (str) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
    return '#' + "00000".substring(0, 6 - c.length) + c;
};

const getPlaceholderStyle = (id, name) => {
    const color = getPlaceholderColor(id || name);
    return {
        background: `linear-gradient(135deg, ${color}22 0%, ${color}66 100%)`,
        color: '#555'
    };
};

const getInitials = (name) => {
    return name 
        ? name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
        : "??";
};

// --- Sub-components (View Only) ---

const SupportUnitTile = ({ 
    unitId, 
    isPurchased, 
    locked, 
    onClick, 
    onRemove, 
    onAssign, 
    unitDef, 
    disabledReason, 
    assignmentInfo, 
    regimentsList, 
    unitsRulesMap, 
    supportUnits, 
    calculateStats,
    getRegimentDefinition 
}) => {
    const puCost = unitDef?.improvement_points_cost || unitDef?.pu_cost || 0;
    const costPU = puCost ? ` + ${puCost} PU` : '';
    const tooltip = locked && disabledReason ? disabledReason : (unitDef?.name || unitId);
    
    const initials = getInitials(unitDef?.name || unitId);
    const placeholderStyle = getPlaceholderStyle(unitId, unitDef?.name);

    // --- Logika dostępnych pułków ---
    const availableRegiments = useMemo(() => {
        if (!isPurchased || !regimentsList) return [];
        
        const rules = unitsRulesMap[unitId] || {};
        const canBeAssigned = rules.can_be_assigned !== false;
        if (!canBeAssigned) return [];

        const getSupportUnitType = (u) => {
            if (!u) return 'infantry';
            if (u.is_artillery) return 'artillery';
            if (u.is_cavalry || u.is_dragoon || u.are_dragoons || u.are_proxy_dragoons) return 'cavalry';
            return 'infantry';
        };

        const supportType = getSupportUnitType(unitDef);
        const isDragoon = unitDef.is_dragoon || unitDef.are_dragoons || unitDef.are_proxy_dragoons;

        return regimentsList.map(r => {
            let isAllowed = true;

            if (rules?.allowed_regiment_ids && rules.allowed_regiment_ids.length > 0) {
                if (!rules.allowed_regiment_ids.includes(r.id)) isAllowed = false;
            }
            if (rules?.exclusion_tag && isAllowed) {
                const otherUnitInRegiment = supportUnits.find(otherSu =>
                    otherSu.id !== unitId &&
                    otherSu.assignedTo?.positionKey === r.positionKey
                );
                if (otherUnitInRegiment) {
                     const otherRules = unitsRulesMap[otherUnitInRegiment.id] || {};
                     if (otherRules.exclusion_tag === rules.exclusion_tag) isAllowed = false;
                     if (otherUnitInRegiment.id === rules.exclusion_tag) isAllowed = false;
                     if (otherRules.exclusion_tag === unitId) isAllowed = false;
                }
            }

            if (isAllowed && !isDragoon) {
                const stats = calculateStats(r.config, r.id);
                const regType = stats.regimentType; 
                if (supportType === 'artillery' || supportType === 'infantry') {
                    if (regType !== 'Pieszy') isAllowed = false;
                } else if (supportType === 'cavalry') {
                    if (regType !== 'Konny') isAllowed = false;
                }
            }

            const regDef = getRegimentDefinition(r.id);
            const regName = r.customName || regDef?.name || r.id;
            
            let prefix = '';
            if (r.positionKey.startsWith(GROUP_TYPES.BASE)) prefix = 'Pułk';
            else if (r.positionKey.startsWith(GROUP_TYPES.VANGUARD)) prefix = 'Straż';
            else prefix = 'Poz. I';
            
            return {
                ...r,
                isAllowed,
                label: `${prefix}: ${regName}`
            };
        });
    }, [isPurchased, unitId, regimentsList, supportUnits, unitsRulesMap, unitDef, calculateStats, getRegimentDefinition]);

    const handleAssignChange = (e) => {
        e.stopPropagation(); 
        onAssign(e.target.value);
    };

    // Toggle Logic
    const handleTileClick = () => {
        if (locked) {
           return;
        } 
        
        if (isPurchased) {
            onRemove(); // Jeśli kupiony -> sprzedaj
        } else {
            onClick(); // Jeśli niekupiony -> kup (lub podmień)
        }
    };

    return (
        <div
            className={`${styles.card} ${isPurchased ? styles.active : ''} ${locked ? styles.locked : ''}`}
            onClick={handleTileClick}
            title={tooltip}
            style={{cursor: locked ? 'not-allowed' : 'pointer'}}
        >
            {isPurchased && <div className={styles.checkBadge}>✔</div>}
            
            <div className={styles.cardImagePlaceholder} style={placeholderStyle}>
                {initials}
            </div>

            <div className={styles.cardContent}>
                <div className={styles.cardTitle}>{unitDef?.name || unitId}</div>
                
                {locked && disabledReason && (
                    <div style={{fontSize: 10, color: '#d32f2f', marginBottom: 4, lineHeight: 1.2, fontStyle: 'italic'}}>
                        {disabledReason}
                    </div>
                )}

                <div className={styles.cardCost}>
                    {unitDef?.cost || 0} PS{costPU}
                </div>

                {isPurchased && availableRegiments.length > 0 && (
                    <select 
                        className={styles.assignmentSelect}
                        value={assignmentInfo?.positionKey || ""}
                        onChange={handleAssignChange}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <option value="">Przydziel</option>
                        {availableRegiments.map(r => (
                            <option key={r.positionKey} value={r.positionKey} disabled={!r.isAllowed}>
                                {r.label}
                            </option>
                        ))}
                    </select>
                )}
                
                {isPurchased && availableRegiments.length === 0 && (
                     <div style={{fontSize: 10, color: '#666', marginTop: 8, fontStyle:'italic', textAlign:'center'}}>
                         Tylko wsparcie dywizyjne
                     </div>
                )}
            </div>
        </div>
    );
};

const GeneralOptionTile = ({ unitId, isActive, onClick, unitDef }) => {
    const puCost = unitDef?.improvement_points_cost || unitDef?.pu_cost || 0;
    const costLabel = puCost > 0 
        ? `${unitDef?.cost || 0} PS + ${puCost} PU`
        : `${unitDef?.cost || 0} PS`;

    const initials = getInitials(unitDef?.name || unitId);
    const placeholderStyle = getPlaceholderStyle(unitId, unitDef?.name);

    return (
        <div 
            className={`${styles.card} ${isActive ? styles.active : ''}`}
            onClick={onClick}
        >
            {isActive && <div className={styles.checkBadge}>✔</div>}

            <div className={styles.cardImagePlaceholder} style={placeholderStyle}>
                {initials}
            </div>

            <div className={styles.cardContent}>
                <div className={styles.cardTitle}>{unitDef?.name || unitId}</div>
                
                <div className={styles.cardSubtitle}>
                    {unitDef?.orders !== undefined && <span>Rozkazy: <strong>{unitDef.orders}</strong></span>}
                    {unitDef?.activations !== undefined && <span style={{marginLeft: 8}}>Akt: <strong>{unitDef.activations}</strong></span>}
                </div>

                <div className={styles.cardCost}>
                    {costLabel}
                </div>
            </div>
        </div>
    );
};

const RegimentOptionTile = ({ optId, isActive, onClick, getRegimentDefinition, disabled, isAllied }) => {
    const def = getRegimentDefinition(optId);
    const name = def?.name || optId;
    const cost = def?.base_cost || 0;

    const initials = getInitials(name);
    const placeholderStyle = getPlaceholderStyle(optId, name);

    return (
        <div 
            className={`${styles.card} ${isActive ? styles.active : ''} ${disabled ? styles.disabledTile : ''}`}
            onClick={disabled ? undefined : onClick}
        >
            {isActive && <div className={styles.checkBadge}>✔</div>}

            <div className={styles.cardImagePlaceholder} style={placeholderStyle}>
                {initials}
            </div>

            <div className={styles.cardContent}>
                <div className={styles.cardTitle}>{name}</div>
                
                {isAllied && (
                    <div style={{ fontSize: 10, color: '#d35400', marginBottom: 4, fontWeight: 'bold', textTransform: 'uppercase' }}>
                        Sojusznik
                    </div>
                )}

                <div className={styles.cardCost}>
                    Bazowo: {cost} PS
                </div>
            </div>
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
    currentAlliesCount,
    calculateRegimentPU
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

        const mySupport = supportUnits.filter(su => su.assignedTo?.positionKey === positionKey);
        const puUsed = !isNone 
            ? calculateRegimentPU(regiment.config, regiment.id, mySupport) 
            : 0;

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
        if (group === GROUP_TYPES.VANGUARD) {
            label = `Pułk Straży Przedniej ${index + 1}`;
        } else {
            label = `Pułk ${index + 1}`;
        }

        return (
            <div key={`${group}-${index}`} className={`${styles.regimentRow} ${isDisabled ? styles.disabled : ''}`}>
                <div className={styles.regHeader}>
                    <div style={{flex: 1}}>
                        <div className={styles.regTopRow}>
                            <div className={styles.regTitle}>{label}</div>
                            {!isDisabled && !isNone && (
                                <input 
                                    className={styles.regNameInput}
                                    placeholder="Nazwa własna pułku..."
                                    value={regiment.customName || ""}
                                    onChange={(e) => onNameChange(group, index, e.target.value)}
                                />
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
                    </div>

                    {!isDisabled && !isNone && (
                        <div style={{display:'flex', flexDirection: 'column', alignItems: 'flex-end', marginLeft: 20, minWidth: 150}}>
                            <div className={styles.regCost}>{stats.cost} pkt</div>
                            <div className={styles.regStats} style={{marginTop: 4}}>
                                <div style={{marginBottom: 4, color: '#444'}}>Typ: {stats.regimentType}</div>
                                
                                <div>Znaczniki Aktywacji: <strong>{finalActivations}</strong></div>
                                <div>Motywacja: <strong>{stats.motivation + (isMainForce?1:0)}</strong></div>
                                
                                {isVanguardGroup && (
                                    <>
                                        <div style={{marginTop: 4, color: '#d35400'}}>Zwiad: <strong>{stats.recon}</strong></div>
                                        <div style={{color: '#d35400'}}>Czujność: <strong>{stats.awareness}</strong></div>
                                    </>
                                )}

                                {isMainForce && (
                                    <div className={`${styles.statusLabel} ${styles.statusMainForce}`}>
                                        SIŁY GŁÓWNE
                                    </div>
                                )}

                                {isRegimentAllied && (
                                    <div className={`${styles.statusLabel} ${styles.statusAlly}`}>
                                        PUŁK SOJUSZNICZY
                                    </div>
                                )}

                                {isMainForceCandidate && !isMainForce && (
                                    <button 
                                        onClick={() => onMainForceSelect(positionKey)}
                                        className={styles.makeMainForceBtn}
                                    >
                                        ★ Ustaw jako Siły Główne
                                    </button>
                                )}

                                {puUsed > 0 && (
                                    <div style={{marginTop: 6, color: '#2e7d32', borderTop: '1px dashed #ccc', paddingTop: 4, width: '100%', textAlign: 'right'}}>
                                        Wykorzystane PU: <strong>{puUsed}</strong>
                                    </div>
                                )}

                                {canEdit && (
                                    <button className={styles.editBtn} onClick={() => onOpenEditor(group, index)}>
                                        Konfiguruj Pułk ›
                                    </button>
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
        getRegimentDefinition, onBack, validationErrors: propsValidationErrors 
    } = props;

    const { state, handlers } = useRegimentSelectorLogic(props);
    const { improvements } = useArmyData();
    const [showRules, setShowRules] = useState(false);

    const calcStatsWrapper = (config, id) => calculateRegimentStats(config, id, configuredDivision, unitsMap, getRegimentDefinition, improvements);
    const calcPuWrapper = (config, id, regimentSupport) => calculateRegimentImprovementPoints(config, id, unitsMap, getRegimentDefinition, improvements, regimentSupport);

    const vanguardCheck = validateVanguardCost(configuredDivision, unitsMap, faction, getRegimentDefinition, improvements);
    const alliedCheck = validateAlliedCost(configuredDivision, unitsMap, faction, getRegimentDefinition, improvements);

    const allValidationErrors = [
        ...(propsValidationErrors || []),
        !vanguardCheck.isValid ? vanguardCheck.message : null,
        !alliedCheck.isValid ? alliedCheck.message : null,
        remainingImprovementPoints < 0 ? `Przekroczono limit Punktów Ulepszeń o ${Math.abs(remainingImprovementPoints)}.` : null
    ].filter(Boolean);

    const hasCriticalErrors = allValidationErrors.length > 0;

    const divisionType = calculateDivisionType(configuredDivision, unitsMap, getRegimentDefinition, improvements);
    const rulesDescriptions = getDivisionRulesDescriptions(divisionDefinition, unitsMap, getRegimentDefinition);
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
        
        if (reg) {
            return calcStatsWrapper(reg.config, reg.id).cost;
        }
        return 0;
    }, [state.mainForceKey, configuredDivision]);

    const isAllied = (regId) => {
        if (regId === IDS.NONE) return false;
        return faction.regiments && !faction.regiments[regId];
    };

    const currentAlliesCount = useMemo(() => {
        const all = [...vanguardRegiments, ...baseRegiments, ...additionalRegiments];
        return all.filter(r => r.id !== IDS.NONE && isAllied(r.id)).length;
    }, [configuredDivision]);

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
            
            return {
                id: r.id,
                name: def?.name || r.id,
                customName: r.customName,
                stats,
                isMain,
                isVanguard: r.group === GROUP_TYPES.VANGUARD
            };
        });
    }, [configuredDivision, state.mainForceKey]);

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <button className={styles.backBtn} onClick={onBack}>← Powrót do Frakcji</button>
                
                {hasCriticalErrors ? (
                    <div style={{padding: '10px 20px', background: '#e0e0e0', color: '#666', borderRadius: 5, fontWeight: 'bold', fontSize: 13, cursor: 'not-allowed'}}>
                        🚫 Popraw błędy, aby eksportować
                    </div>
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

            {/* SCALONE PODSUMOWANIE */}
            <div className={styles.summaryCard}>
                <div className={styles.summaryHeader}>
                    <div>
                        <div className={styles.summaryTitle}>
                            {divisionType} ({totalDivisionCost} PS)
                        </div>
                        <div className={styles.summarySubtitle}>Koszt bazowy dywizji: {divisionBaseCost} PS</div>
                        
                        <button className={styles.rulesToggleBtn} onClick={() => setShowRules(!showRules)}>
                            {showRules ? "▼ Ukryj zasady specjalne" : "▶ Pokaż zasady specjalne"}
                        </button>
                    </div>
                    
                    <div className={`${styles.summaryPoints} ${remainingImprovementPoints < 0 ? styles.pointsError : styles.pointsOk}`}>
                        <div>Punkty Ulepszeń:</div>
                        <div style={{fontSize: 24}}>{remainingImprovementPoints} / {improvementPointsLimit}</div>
                    </div>
                </div>

                {showRules && rulesDescriptions && rulesDescriptions.length > 0 && (
                    <div className={styles.rulesContainer}>
                        {rulesDescriptions.map(rule => (
                            <div key={rule.id} style={{fontSize: 13, marginBottom: 8, lineHeight: 1.4}}>
                                <strong>• {rule.title}: </strong> {rule.description}
                            </div>
                        ))}
                    </div>
                )}

                {generalDef && (
                    <div className={styles.summarySection}>
                        <div className={styles.summarySectionTitle}>Dowódca Dywizji</div>
                        <div className={styles.commanderRow}>
                            <span className={styles.commanderName}>{generalDef.name}</span>
                            <span className={styles.commanderStats}>
                                {generalDef.orders} Rozkazy | {generalDef.activations} Akt.
                            </span>
                        </div>
                    </div>
                )}

                {activeRegimentsList.length > 0 && (
                    <div className={styles.summarySection}>
                        <div className={styles.summarySectionTitle}>Sformowane Pułki</div>
                        <div className={styles.regimentListSimple}>
                            {activeRegimentsList.map((reg, idx) => (
                                <div key={idx} className={styles.regListItem}>
                                    <div className={styles.regInfoMain}>
                                        <div className={styles.regListName}>{reg.name}</div>
                                        {reg.customName && <div className={styles.regListCustomName}>"{reg.customName}"</div>}
                                        <div className={styles.regListTags}>
                                            {reg.isMain && <span className={`${styles.tagBadge} ${styles.tagMain}`}>Siły Główne</span>}
                                            {reg.isVanguard && <span className={`${styles.tagBadge} ${styles.tagVanguard}`}>Straż Przednia</span>}
                                        </div>
                                    </div>
                                    <div className={styles.regListStats}>
                                        <div><strong>{reg.stats.cost} PS</strong></div>
                                        <div>Motywacja: {reg.stats.motivation + (reg.isMain?1:0)}</div>
                                        <div>Akt: {reg.stats.activations + (reg.isMain?1:0)}</div>
                                        {reg.isVanguard && (
                                            <>
                                                <div style={{color: '#d35400'}}>Zwiad: {reg.stats.recon}</div>
                                                <div style={{color: '#d35400'}}>Czujność: {reg.stats.awareness}</div>
                                            </>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {unassignedSupport.length > 0 && (
                    <div className={styles.summarySection}>
                        <div className={styles.summarySectionTitle}>Wsparcie Dywizyjne (Nieprzypisane)</div>
                        <div className={styles.unassignedList}>
                            {unassignedSupport.map((su, idx) => (
                                <div key={idx} className={styles.unassignedBadge}>
                                    <span>• {unitsMap[su.id]?.name || su.id}</span>
                                    <span style={{fontWeight:'bold'}}>({unitsMap[su.id]?.cost || 0} pkt)</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {hasCriticalErrors && (
                <div style={{ marginBottom: 20, padding: 15, backgroundColor: '#ffebee', border: '1px solid #ef5350', borderRadius: 8, color: '#c62828' }}>
                    <h4 style={{marginTop: 0, marginBottom: 8}}>⚠️ Błędy w konstrukcji dywizji:</h4>
                    <ul style={{margin: 0, paddingLeft: 20}}>
                        {allValidationErrors.map((err, idx) => (
                            <li key={idx} style={{marginBottom: 4, whiteSpace: 'pre-line'}}>{err}</li>
                        ))}
                    </ul>
                </div>
            )}

            {divisionDefinition.general && divisionDefinition.general.length > 0 && (
                <div className={styles.section}>
                    <h3 className={styles.sectionTitle}>Wybór Dowódcy</h3>
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
                                    
                                    onAssign={(posKey) => handlers.handleAssignSupportUnit(idx, posKey)}
                                    onRemove={() => handlers.handleRemoveSupportUnit(idx)}
                                    onClick={() => handlers.handleBuySupportUnit(unitId, idx, remainingImprovementPoints)}
                                    unitDef={unitsMap[unitId]}
                                    assignmentInfo={state.purchasedSlotsMap[idx] === unitId ? configuredDivision.supportUnits.find(su => su.definitionIndex === idx)?.assignedTo : null}
                                    
                                    regimentsList={state.regimentsList}
                                    unitsRulesMap={state.unitsRulesMap}
                                    supportUnits={supportUnits}
                                    calculateStats={calcStatsWrapper}
                                    getRegimentDefinition={getRegimentDefinition}
                                 />
                             );
                         }

                         if (typeof item === 'object' && item.type === 'group') {
                             const purchasedId = state.purchasedSlotsMap[idx];
                             return (
                                 <div key={idx} style={{border:'1px dashed #ccc', padding:8, borderRadius:6, background:'#fafafa'}}>
                                     <div style={{fontSize:11, textAlign:'center', marginBottom:6, color:'#666'}}>{item.name}</div>
                                     <div style={{display:'flex', gap:6, flexWrap:'wrap', justifyContent:'center'}}>
                                         {item.options.map(opt => (
                                             <SupportUnitTile key={opt} unitId={opt}
                                                isPurchased={purchasedId === opt}
                                                
                                                locked={isLockedByRequirements}
                                                disabledReason={isLockedByRequirements ? requirementCheck.reason : null}
                                                
                                                onAssign={(posKey) => handlers.handleAssignSupportUnit(idx, posKey)}
                                                onRemove={() => handlers.handleRemoveSupportUnit(idx)}
                                                onClick={() => handlers.handleBuySupportUnit(opt, idx, remainingImprovementPoints)}
                                                unitDef={unitsMap[opt]}
                                                assignmentInfo={purchasedId === opt ? configuredDivision.supportUnits.find(su => su.definitionIndex === idx)?.assignedTo : null}
                                                
                                                regimentsList={state.regimentsList}
                                                unitsRulesMap={state.unitsRulesMap}
                                                supportUnits={supportUnits}
                                                calculateStats={calcStatsWrapper}
                                                getRegimentDefinition={getRegimentDefinition}
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

            {/* SEKCJE PUŁKÓW (Usunięto SupportConfigRow) */}
            
            {vanguardRegiments && vanguardRegiments.length > 0 && (
                <div className={styles.section}>
                    <h3 className={styles.sectionTitle}>Straż Przednia</h3>
                    <div className={styles.regimentsGrid}>
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
                            calculateRegimentPU={calcPuWrapper} 
                        />
                    </div>
                </div>
            )}

            <div className={styles.section}>
                <h3 className={styles.sectionTitle}>Podstawa Dywizji</h3>
                <div className={styles.regimentsGrid}>
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
                        calculateRegimentPU={calcPuWrapper}
                    />
                </div>
            </div>
            
            <div className={styles.section}>
                <h3 className={styles.sectionTitle}>Poziom I</h3>
                 <div className={styles.regimentsGrid}>
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
                        calculateRegimentPU={calcPuWrapper}
                    />
                 </div>
            </div>
        </div>
    );
}