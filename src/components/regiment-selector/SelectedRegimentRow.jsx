import React from "react";
import styles from "../../pages/RegimentSelector.module.css";

export const SelectedRegimentRow = ({ 
    group, index, regiment, mainForceKey, getRegimentDefinition, calculateStats, 
    onNameChange, onOpenEditor, onMainForceSelect, supportUnits, unitsMap, 
    currentMainForceCost, isAllied, calculateRegimentPU 
}) => {
    const positionKey = `${group}/${index}`;
    const stats = calculateStats(regiment.config, regiment.id);
    const isMainForce = mainForceKey === positionKey;
    const finalActivations = stats.activations + (isMainForce ? 1 : 0);
    const isRegimentAllied = isAllied(regiment.id);
    const isMainForceCandidate = !isRegimentAllied && stats.cost === currentMainForceCost;
    const mySupport = supportUnits.filter(su => su.assignedTo?.positionKey === positionKey);
    const puUsed = calculateRegimentPU(regiment.config, regiment.id, mySupport);
    
    const def = getRegimentDefinition(regiment.id);
    const defName = def ? def.name : regiment.id;

    return (
        <div className={styles.regimentRow}>
            <div className={styles.regHeader}>
                <div style={{flex: 1}}>
                    <div className={styles.regTopRow}>
                        <div className={styles.regTitle}>#{index+1} {defName}</div>
                        <input className={styles.regNameInput} placeholder="Nazwa własna..." value={regiment.customName || ""} onChange={(e) => onNameChange(group, index, e.target.value)} />
                    </div>
                </div>
                <div style={{display:'flex', flexDirection: 'column', alignItems: 'flex-end', marginLeft: 20, minWidth: 150}}>
                    <div className={styles.regCost}>{stats.cost} pkt</div>
                    <div className={styles.regStats} style={{marginTop: 4}}>
                        <div style={{marginBottom: 4, color: '#444'}}>Typ: {stats.regimentType}</div>
                        <div>Akt: <strong>{finalActivations}</strong></div>
                        <div>Mot: <strong>{stats.motivation + (isMainForce?1:0)}</strong></div>
                        
                        {isMainForce && <div className={`${styles.statusLabel} ${styles.statusMainForce}`}>SIŁY GŁÓWNE</div>}
                        {isRegimentAllied && <div className={`${styles.statusLabel} ${styles.statusAlly}`}>PUŁK SOJUSZNICZY</div>}
                        
                        {isMainForceCandidate && !isMainForce && (
                            <button onClick={() => onMainForceSelect(positionKey)} className={styles.makeMainForceBtn}>★ Ustaw jako Siły Główne</button>
                        )}
                        
                        {puUsed > 0 && <div style={{marginTop: 6, color: '#2e7d32', fontSize:10}}>Wykorzystane PU: <strong>{puUsed}</strong></div>}
                        
                        <button className={styles.editBtn} onClick={() => onOpenEditor(group, index)}>Konfiguruj Pułk ›</button>
                    </div>
                </div>
            </div>
            <div className={styles.regSupportInfo}>Wsparcie: {mySupport.length === 0 ? "brak" : mySupport.map(su => unitsMap[su.id]?.name).join(", ")}</div>
        </div>
    );
};