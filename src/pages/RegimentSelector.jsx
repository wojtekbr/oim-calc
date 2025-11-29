import React, { useMemo } from "react";
import { PDFDownloadLink } from '@react-pdf/renderer';
import { ArmyListDocument } from '../pdf/ArmyListDocument';
import { useRegimentSelectorLogic } from "./useRegimentSelectorLogic";
import styles from "./RegimentSelector.module.css";
import { calculateRegimentStats } from "../utils/armyMath";
import { IDS } from "../constants";

// --- Sub-components ---

const SupportUnitTile = ({ unitId, isPurchased, locked, onClick, unitDef }) => {
    const costPU = unitDef?.pu_cost ? ` | ${unitDef.pu_cost} PU` : '';
    return (
        <div
            className={`${styles.supportTile} ${isPurchased ? styles.active : ''} ${locked ? styles.locked : ''}`}
            onClick={locked ? undefined : onClick}
        >
            <div style={{ fontWeight: 'bold', fontSize: 13, marginBottom: 4 }}>{unitDef?.name || unitId}</div>
            <div style={{ fontSize: 11, color: '#666' }}>{unitDef?.cost || 0} pkt {costPU}</div>
            {isPurchased && <div className={styles.checkIcon}>✔</div>}
        </div>
    );
};

const SupportConfigRow = ({ supportUnit, index, unitsMap, unitsRulesMap, regimentsList, supportUnits, onAssign, onRemove, getRegimentDefinition }) => {
    const unitDef = unitsMap[supportUnit.id];
    const rules = unitsRulesMap[supportUnit.id] || {};
    const canBeAssigned = rules.can_be_assigned !== false;

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
                        onChange={(e) => onAssign(supportUnit.id, e.target.value)}
                        style={{ borderColor: isError ? 'red' : '#ccc' }}
                    >
                        <option value="">{isError ? "⚠️ Wybierz pułk..." : "— Nieprzypisana —"}</option>
                        {regimentsList.map(r => {
                             const isAvailable = availableRegiments.some(ar => ar.positionKey === r.positionKey);
                             const isCurrentlySelected = supportUnit.assignedTo?.positionKey === r.positionKey;
                             if (!isAvailable && !isCurrentlySelected) return null;
                             
                             const regName = getRegimentDefinition(r.id)?.name || r.id;
                             const displayName = r.customName || regName;
                             // ZMIANA: Skróty w dropdownie są OK, bo jest mało miejsca, ale usuwamy nawiasy kwadratowe dla czystości
                             const prefix = r.positionKey.startsWith('base') ? 'Podst.' : 'Poz. I';
                             return <option key={r.positionKey} value={r.positionKey}>{prefix}: {displayName}</option>;
                        })}
                    </select>
                ) : (
                    <div style={{ fontSize: 12, fontStyle: 'italic', color: '#666', textAlign: 'center' }}>Wsparcie Dywizyjne</div>
                )}
            </div>
            <button className={styles.removeBtn} onClick={() => onRemove(supportUnit.id)}>Usuń</button>
        </div>
    );
};

// --- KAFELEK WYBORU PUŁKU ---
const RegimentOptionTile = ({ optId, isActive, onClick, getRegimentDefinition, disabled }) => {
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
        </div>
    );
};

const RegimentBlock = ({ 
    group, regiments, definitionOptions, 
    mainForceKey, getRegimentDefinition, calculateStats, 
    onNameChange, onRegimentChange, onVanguardToggle, onOpenEditor, 
    supportUnits, unitsMap 
}) => {
    return regiments.map((regiment, index) => {
        const options = definitionOptions[index].options;
        const currentRegimentId = regiment.id;
        const isNone = currentRegimentId === IDS.NONE;
        const canEdit = !isNone && getRegimentDefinition(currentRegimentId)?.structure;
        const isBase = group === "base";
        const positionKey = `${group}/${index}`;

        let isDisabled = false;
        let disabledMessage = "";
        
        if (!isBase && index > 0) {
            const previousRegiment = regiments[index - 1];
            if (previousRegiment.id === IDS.NONE) {
                isDisabled = true;
                disabledMessage = "(Wymagany poprzedni pułk)";
            }
        }

        const stats = calculateStats(regiment.config, regiment.id);
        const isMainForce = mainForceKey === positionKey;
        const finalActivations = stats.activations + (isMainForce ? 1 : 0);
        const isVanguard = !!regiment.config.isVanguard;

        const handleTileClick = (optId) => {
            if (isDisabled) return;
            const newId = (currentRegimentId === optId) ? IDS.NONE : optId;
            onRegimentChange(group, index, newId);
        };

        return (
            <div key={`${group}-${index}`} className={`${styles.regimentRow} ${isMainForce ? styles.mainForce : ''} ${isDisabled ? styles.disabled : ''}`}>
                <div className={styles.regHeader}>
                    <div style={{flex: 1}}>
                        <div className={styles.regTitle}>
                            {/* ZMIANA: Nazewnictwo "User Friendly" */}
                            {isBase ? `Podstawa #${index + 1}` : `Poziom I #${index + 1}`}
                            
                            {isMainForce && <span className={styles.mainForceBadge}>SIŁY GŁÓWNE</span>}
                            {!isNone && !isDisabled && (
                                <label className={`${styles.vanguardLabel} ${isVanguard ? styles.active : ''}`}>
                                    <input type="checkbox" checked={isVanguard} onChange={() => onVanguardToggle(group, index)} style={{display:'none'}}/>
                                    {isVanguard ? "🚩 Straż Przednia" : "🏳️ Oznacz jako Straż Przednia"}
                                </label>
                            )}
                            {isDisabled && <span style={{fontSize: 12, fontWeight: 'normal', color: '#888', marginLeft: 10}}>{disabledMessage}</span>}
                        </div>

                        <div className={styles.optionsGrid}>
                            {options.filter(optId => optId !== IDS.NONE).map(optId => (
                                <RegimentOptionTile 
                                    key={optId} 
                                    optId={optId}
                                    isActive={currentRegimentId === optId}
                                    disabled={isDisabled}
                                    onClick={() => handleTileClick(optId)}
                                    getRegimentDefinition={getRegimentDefinition}
                                />
                            ))}
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
                                <div>Aktywacje: <strong>{finalActivations}</strong></div>
                                <div>Zwiad: <strong>{stats.recon}</strong></div>
                                <div>Motywacja: <strong>{stats.motivation + (isMainForce?1:0)}</strong></div>
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
        getRegimentDefinition, onBack 
    } = props;

    const { state, handlers } = useRegimentSelectorLogic(props);
    const calcStatsWrapper = (config, id) => calculateRegimentStats(config, id, configuredDivision, faction, getRegimentDefinition);
    const { base: baseRegiments, additional: additionalRegiments, supportUnits } = configuredDivision;

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
                    <div className={styles.summaryTitle}>Podsumowanie: {totalDivisionCost} pkt</div>
                    <div className={styles.summarySubtitle}>Koszt bazowy dywizji: {divisionBaseCost} pkt</div>
                </div>
                <div className={`${styles.summaryPoints} ${remainingImprovementPoints < 0 ? styles.pointsError : styles.pointsOk}`}>
                    Punkty Ulepszeń: {remainingImprovementPoints} / {improvementPointsLimit}
                </div>
            </div>

            {/* SHOP SECTION */}
            <div className={styles.section}>
                {/* ZMIANA: Usunięto numerację i bełkot */}
                <h3 className={styles.sectionTitle}>Dostępne Wsparcie</h3>
                <div className={styles.supportGrid}>
                    {props.additionalUnitsDefinitions.map((item, idx) => {
                         if (typeof item === 'string') {
                             return <SupportUnitTile key={item} unitId={item} 
                                isPurchased={!!state.purchasedUnitsDataMap[item]} 
                                onClick={() => handlers.handleBuySupportUnit(item, remainingImprovementPoints)}
                                unitDef={unitsMap[item]}
                             />;
                         }
                         if (typeof item === 'object' && item.name && !item.type) {
                             return <SupportUnitTile key={item.name} unitId={item.name} 
                                isPurchased={!!state.purchasedUnitsDataMap[item.name]}
                                onClick={() => handlers.handleBuySupportUnit(item.name, remainingImprovementPoints)}
                                unitDef={unitsMap[item.name]}
                             />;
                         }
                         if (typeof item === 'object' && item.type === 'group') {
                             const purchasedOption = item.options.find(opt => state.purchasedUnitsDataMap[opt]);
                             return (
                                 <div key={idx} style={{border:'1px dashed #ccc', padding:8, borderRadius:6, background:'#fafafa'}}>
                                     <div style={{fontSize:11, textAlign:'center', marginBottom:6, color:'#666'}}>{item.name}</div>
                                     <div style={{display:'flex', gap:6}}>
                                         {item.options.map(opt => (
                                             <SupportUnitTile key={opt} unitId={opt}
                                                isPurchased={!!state.purchasedUnitsDataMap[opt]}
                                                locked={purchasedOption && purchasedOption !== opt}
                                                onClick={() => handlers.handleBuySupportUnit(opt, remainingImprovementPoints)}
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

            {/* CONFIG SECTION */}
            {supportUnits.length > 0 && (
                <div className={styles.section} style={{backgroundColor:'#eef6fc', borderColor:'#cce3f6'}}>
                    {/* ZMIANA: Usunięto numerację */}
                    <h3 className={styles.sectionTitle} style={{color:'#0056b3', borderBottomColor:'#cce3f6'}}>Konfiguracja Wsparcia</h3>
                    {supportUnits.map((su, idx) => (
                        <SupportConfigRow 
                            key={idx} 
                            supportUnit={su} 
                            index={idx}
                            unitsMap={unitsMap}
                            unitsRulesMap={state.unitsRulesMap}
                            regimentsList={state.regimentsList}
                            supportUnits={supportUnits}
                            getRegimentDefinition={getRegimentDefinition}
                            onAssign={handlers.handleAssignSupportUnit}
                            onRemove={(uid) => handlers.handleBuySupportUnit(uid)}
                        />
                    ))}
                </div>
            )}

            {/* REGIMENTS */}
            <div className={styles.section}>
                {/* ZMIANA: Zamiast "Pułki Podstawowe" -> "Podstawa Dywizji" */}
                <h3 className={styles.sectionTitle}>Podstawa Dywizji</h3>
                <RegimentBlock 
                    group="base" regiments={baseRegiments} 
                    definitionOptions={divisionDefinition.base}
                    mainForceKey={state.mainForceKey}
                    getRegimentDefinition={getRegimentDefinition}
                    calculateStats={calcStatsWrapper}
                    onNameChange={handlers.handleRegimentNameChange}
                    onRegimentChange={handlers.handleRegimentChange}
                    onVanguardToggle={handlers.handleVanguardToggle}
                    onOpenEditor={props.onOpenRegimentEditor}
                    supportUnits={supportUnits}
                    unitsMap={unitsMap}
                />
            </div>
            
            <div className={styles.section}>
                {/* ZMIANA: Zamiast "Pułki Dodatkowe" -> "Poziom I" */}
                <h3 className={styles.sectionTitle}>Poziom I</h3>
                 <RegimentBlock 
                    group="additional" regiments={additionalRegiments} 
                    definitionOptions={divisionDefinition.additional}
                    mainForceKey={state.mainForceKey}
                    getRegimentDefinition={getRegimentDefinition}
                    calculateStats={calcStatsWrapper}
                    onNameChange={handlers.handleRegimentNameChange}
                    onRegimentChange={handlers.handleRegimentChange}
                    onVanguardToggle={handlers.handleVanguardToggle}
                    onOpenEditor={props.onOpenRegimentEditor}
                    supportUnits={supportUnits}
                    unitsMap={unitsMap}
                />
            </div>
        </div>
    );
}