import React from "react";
import styles from "../../pages/RegimentSelector.module.css";
import { GROUP_TYPES } from "../../constants";
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
    const finalMotivation = stats.motivation + (isMainForce ? 1 : 0);

    const isRegimentAllied = isAllied(regiment.id);

    // FIX: Dodano warunek group !== VANGUARD
    const isMainForceCandidate =
        group !== GROUP_TYPES.VANGUARD &&
        !isRegimentAllied &&
        stats.cost === currentMainForceCost &&
        !isMainForce;

    // Filtrujemy wsparcie dla tego pułku
    const mySupport = supportUnits.filter(su => su.assignedTo?.positionKey === positionKey);
    const puUsed = calculateRegimentPU(regiment.config, regiment.id, mySupport);

    const def = getRegimentDefinition(regiment.id);
    const defName = def ? def.name : regiment.id;

    // Zbieramy listę wszystkich jednostek do wyświetlenia (jednostki pułku + wsparcie)
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
                <div style={{flex: 1, minWidth: 0}}>
                    <div className={styles.regTopRow}>
                        <div className={styles.regTitle}>#{index+1} {defName}</div>
                        <input
                            className={styles.regNameInput}
                            placeholder="Nazwa własna..."
                            value={regiment.customName || ""}
                            onChange={(e) => onNameChange(group, index, e.target.value)}
                        />
                    </div>

                    {/* Lista jednostek (Przywrócona) */}
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

                <div className={styles.regRightColumn}>
                    <div className={styles.regCost}>{stats.cost} pkt</div>

                    <div className={styles.regStats}>
                        <div className={styles.regTypeLabel}>Typ: {stats.regimentType}</div>

                        <div>Znaczniki Aktywacji: <strong>{finalActivations}</strong></div>
                        <div>Motywacja: <strong>{finalMotivation}</strong></div>

                        {isMainForce && <div className={`${styles.statusLabel} ${styles.statusMainForce}`}>SIŁY GŁÓWNE</div>}
                        {isRegimentAllied && <div className={`${styles.statusLabel} ${styles.statusAlly}`}>PUŁK SOJUSZNICZY</div>}

                        {/* Przycisk tylko dla kandydatów spoza Straży Przedniej */}
                        {isMainForceCandidate && (
                            <button
                                onClick={() => onMainForceSelect(positionKey)}
                                className={styles.makeMainForceBtn}
                            >
                                ★ Ustaw jako Siły Główne
                            </button>
                        )}

                        {puUsed > 0 && <div className={styles.puUsedLabel}>Wykorzystane PU: <strong>{puUsed}</strong></div>}

                        <button className={styles.editBtn} onClick={() => onOpenEditor(group, index)}>Konfiguruj Pułk ›</button>
                    </div>
                </div>
            </div>

            {/* Usunięto stary pasek "Wsparcie: ..." na rzecz listy powyżej */}
        </div>
    );
};