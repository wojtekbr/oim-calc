import React from "react";
import styles from "../../pages/RegimentSelector.module.css";
import { collectRegimentUnits } from "../../utils/armyMath";

export const SelectedRegimentRow = ({
                                        group, index, regiment, mainForceKey, getRegimentDefinition, calculateStats,
                                        onNameChange, onOpenEditor, onMainForceSelect, supportUnits, unitsMap,
                                        currentMainForceCost, isAllied, calculateRegimentPU
                                    }) => {
    const positionKey = `${group}/${index}`;
    const stats = calculateStats(regiment.config, regiment.id);

    // Sprawdzamy czy ten pułk jest AKTUALNIE siłami głównymi
    const isMainForce = mainForceKey === positionKey;

    // Bonusy za bycie siłami głównymi (+1)
    const finalActivations = stats.activations + (isMainForce ? 1 : 0);
    const finalMotivation = stats.motivation + (isMainForce ? 1 : 0); // Zakładamy, że stats.motivation to baza

    const isRegimentAllied = isAllied(regiment.id);

    // Warunek wyświetlenia przycisku:
    // 1. Nie jest sojusznikiem.
    // 2. Jego koszt jest równy kosztowi obecnych sił głównych (czyli jest kandydatem).
    // 3. Nie jest już wybrany jako siły główne.
    const isMainForceCandidate = !isRegimentAllied && stats.cost === currentMainForceCost && !isMainForce;

    const mySupport = supportUnits.filter(su => su.assignedTo?.positionKey === positionKey);
    const puUsed = calculateRegimentPU(regiment.config, regiment.id, mySupport);

    const def = getRegimentDefinition(regiment.id);
    const defName = def ? def.name : regiment.id;

    // Zbieramy listę wszystkich jednostek do wyświetlenia
    const internalUnits = collectRegimentUnits(regiment.config, def).map(u => ({
        id: u.unitId,
        isSupport: false
    }));

    const supportUnitsList = mySupport.map(su => ({
        id: su.id,
        isSupport: true
    }));

    const allUnits = [...internalUnits, ...supportUnitsList];

    return (
        <div className={styles.regimentRow}>
            <div className={styles.regHeader}>
                <div style={{flex: 1}}>
                    <div className={styles.regTopRow}>
                        <div className={styles.regTitle}>#{index+1} {defName}</div>
                        <input
                            className={styles.regNameInput}
                            placeholder="Nazwa własna..."
                            value={regiment.customName || ""}
                            onChange={(e) => onNameChange(group, index, e.target.value)}
                        />
                    </div>

                    <div className={styles.regimentUnitsPreview}>
                        {allUnits.map((u, i) => {
                            const unitName = unitsMap[u.id]?.name || u.id;
                            return (
                                <div key={i} className={styles.previewUnitItem}>
                                    • {unitName}
                                    {u.isSupport && <span className={styles.previewSupportTag}> (Wsparcie)</span>}
                                </div>
                            );
                        })}
                        {allUnits.length === 0 && <div className={styles.previewEmpty}>Brak jednostek (skonfiguruj pułk)</div>}
                    </div>
                </div>

                <div style={{display:'flex', flexDirection: 'column', alignItems: 'flex-end', marginLeft: 20, minWidth: 180}}>
                    <div className={styles.regCost}>{stats.cost} pkt</div>

                    <div className={styles.regStats} style={{marginTop: 8}}>
                        <div style={{marginBottom: 6, color: '#444', fontWeight: 600}}>Typ: {stats.regimentType}</div>

                        <div>Znaczniki Aktywacji: <strong>{finalActivations}</strong></div>
                        <div>Motywacja: <strong>{finalMotivation}</strong></div>

                        {isMainForce && <div className={`${styles.statusLabel} ${styles.statusMainForce}`}>SIŁY GŁÓWNE</div>}
                        {isRegimentAllied && <div className={`${styles.statusLabel} ${styles.statusAlly}`}>PUŁK SOJUSZNICZY</div>}

                        {/* PRZYCISK WYBORU SIŁ GŁÓWNYCH */}
                        {isMainForceCandidate && (
                            <button
                                onClick={() => onMainForceSelect(positionKey)}
                                className={styles.makeMainForceBtn}
                            >
                                ★ Ustaw jako Siły Główne
                            </button>
                        )}

                        {puUsed > 0 && <div style={{marginTop: 6, color: '#2e7d32', fontSize:11}}>Wykorzystane PU: <strong>{puUsed}</strong></div>}

                        <button className={styles.editBtn} onClick={() => onOpenEditor(group, index)}>Konfiguruj Pułk ›</button>
                    </div>
                </div>
            </div>
        </div>
    );
};