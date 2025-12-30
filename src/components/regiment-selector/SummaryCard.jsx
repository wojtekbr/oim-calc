import React from 'react';
import styles from '../../pages/RegimentSelector.module.css';

export const SummaryCard = ({
                                divisionType,
                                totalDivisionCost,
                                divisionBaseCost,
                                remainingImprovementPoints,
                                improvementPointsLimit,
                                showRules,
                                setShowRules,
                                rulesDescriptions,
                                generalDef,
                                unassignedSupport,
                                unassignedArtillery = [],
                                unassignedAdditional = [],
                                activeRegimentsList,
                                unitsMap,
                                divisionDefinition,
                                // Potrzebne do obliczania ulepszeń
                                getEffectiveUnitImprovements,
                                improvementsMap
                            }) => {

    const hasUnassigned = unassignedSupport && unassignedSupport.length > 0;
    const hasArtillery = unassignedArtillery && unassignedArtillery.length > 0;
    const hasAdditional = unassignedAdditional && unassignedAdditional.length > 0;

    // Funkcja renderująca grupę wsparcia jako "Pułk"
    const renderSummaryGroup = (title, units, titleColor) => {
        const totalCost = units.reduce((acc, u) => acc + (unitsMap[u.id]?.cost || 0), 0);

        return (
            <div className={styles.regimentRow} style={{ height: '100%', boxSizing: 'border-box', marginBottom: 0, backgroundColor: '#fff' }}>
                <div className={styles.regHeader} style={{ paddingBottom: '5px', borderBottom: '1px solid #eee', marginBottom: '8px' }}>
                    <div className={styles.regTopRow} style={{ flex: 1 }}>
                        <div className={styles.regTitle} style={{ color: titleColor || '#222', fontSize: '13px' }}>{title}</div>
                    </div>
                    <div className={styles.regRightColumn} style={{ minWidth: 'auto' }}>
                        <div className={styles.regCost} style={{ fontSize: '14px' }}>{totalCost} PS</div>
                    </div>
                </div>

                <div className={styles.regDetails}>
                    {units.map((u, i) => {
                        const uDef = unitsMap[u.id];

                        // --- NOWOŚĆ: Obliczanie ulepszeń dla nieprzypisanych jednostek ---
                        let effectiveImps = [];
                        if (getEffectiveUnitImprovements) {
                            effectiveImps = getEffectiveUnitImprovements(
                                u.id,
                                u.improvements || [], // Ulepszenia zakupione (jeśli są)
                                divisionDefinition,
                                null, // regimentId = null, bo nieprzypisane (omija walidację struktury)
                                unitsMap
                            );
                        }

                        // Mapowanie na nazwy
                        const impNames = effectiveImps.map(impId => {
                            return improvementsMap?.[impId]?.name || impId;
                        }).join(", ");

                        return (
                            <div key={i} className={styles.unitRow} style={{ marginBottom: '2px' }}>
                                <div className={styles.unitNameCol}>
                                    • {uDef?.name || u.id}

                                    {/* Wyświetlanie ulepszeń */}
                                    {impNames && (
                                        <span className={styles.impsList}>{impNames}</span>
                                    )}
                                </div>
                                <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#555' }}>
                                    {uDef?.cost || 0} PS
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    return (
        <div className={styles.summaryCard}>
            {/* --- HEADER KARTY --- */}
            <div className={styles.summaryHeader}>
                <div>
                    <div className={styles.summaryTitle}>{divisionDefinition?.name} ({totalDivisionCost} PS)</div>
                    <div className={styles.summarySubtitle}>
                        Typ: <strong>{divisionType}</strong> • Koszt bazowy: {divisionBaseCost} PS
                    </div>
                    {rulesDescriptions.length > 0 && (
                        <button className={styles.rulesToggleBtn} onClick={() => setShowRules(!showRules)}>
                            {showRules ? '▼ Ukryj zasady specjalne' : '▶ Pokaż zasady specjalne'}
                        </button>
                    )}
                </div>
                <div className={styles.summaryPoints}>
                    <div>Punkty Ulepszeń:</div>
                    <div style={{ fontSize: '24px', fontWeight: 'bold' }} className={remainingImprovementPoints < 0 ? styles.pointsError : styles.pointsOk}>
                        {remainingImprovementPoints} / {improvementPointsLimit}
                    </div>
                </div>
            </div>

            {showRules && rulesDescriptions.length > 0 && (
                <div className={styles.rulesContainer}>
                    {rulesDescriptions.map(rule => (
                        <div key={rule.id} className={styles.ruleLine}>
                            <strong>{rule.title}: </strong> {rule.description}
                        </div>
                    ))}
                </div>
            )}

            <div style={{ marginTop: '20px' }}>

                {/* --- GÓRNY WIERSZ: DOWÓDCA + WSPARCIE (GRID) --- */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                    gap: '16px',
                    marginBottom: '24px',
                    alignItems: 'stretch'
                }}>

                    {/* 1. DOWÓDCA */}
                    <div>
                        <div className={styles.summarySectionTitle}>DOWÓDCA DYWIZJI</div>
                        <div className={styles.commanderRow} style={{ backgroundColor: '#fff', height: '100%', boxSizing: 'border-box' }}>
                            {generalDef ? (
                                <div style={{width: '100%'}}>
                                    <div className={styles.commanderName} style={{fontSize: '15px', marginBottom: '4px'}}>{generalDef.name}</div>
                                    <div className={styles.commanderStats}>
                                        {generalDef.orders} Rozkazy/Aktywacji
                                    </div>
                                </div>
                            ) : (
                                <div className={styles.noCommanderMsg}>Nie wybrano głównodowodzącego</div>
                            )}
                        </div>
                    </div>

                    {/* 2. ARTYLERIA DYWIZYJNA */}
                    {hasArtillery && (
                        <div>
                            <div className={styles.summarySectionTitle} style={{ color: '#546e7a' }}>WSPARCIE: ARTYLERIA</div>
                            {renderSummaryGroup("Artyleria Dywizyjna", unassignedArtillery, '#546e7a')}
                        </div>
                    )}

                    {/* 3. ELEMENTY DODATKOWE */}
                    {hasAdditional && (
                        <div>
                            <div className={styles.summarySectionTitle} style={{ color: '#5d4037' }}>WSPARCIE: DODATKOWE</div>
                            {renderSummaryGroup("Elementy Dodatkowe", unassignedAdditional, '#5d4037')}
                        </div>
                    )}
                </div>

                {/* --- DOLNY WIERSZ: SFORMOWANE PUŁKI --- */}
                <div>
                    <div className={styles.summarySectionTitle}>SFORMOWANE PUŁKI</div>
                    <div className={styles.regimentListSimple}>
                        {activeRegimentsList.map((reg, i) => (
                            <div key={i} className={styles.regListItem}>
                                <div className={styles.regListHeaderRow}>
                                    <div className={styles.regInfoMain}>
                                        <div className={styles.regListName}>
                                            {reg.customName || reg.name}
                                        </div>
                                        <div className={styles.regListTags}>
                                            {reg.isMain && <span className={`${styles.tagBadge} ${styles.tagMain}`}>SIŁY GŁÓWNE</span>}
                                            {reg.isVanguard && <span className={`${styles.tagBadge} ${styles.tagVanguard}`}>STRAŻ PRZEDNIA</span>}
                                        </div>
                                    </div>
                                    <div className={styles.regListStats}>
                                        {reg.stats.cost} PS<br/>
                                        Akt: {reg.stats.activations + (reg.isMain ? 1 : 0)}<br/>
                                        Mot: {reg.stats.motivation + (reg.isMain ? 1 : 0)}
                                    </div>
                                </div>
                                <div className={styles.regDetails}>
                                    {reg.isCommander && (
                                        <div className={styles.unitRow}>
                                            <div className={styles.unitNameCol}>
                                                • Dowódca <span className={styles.commanderBadge}>DOW ({reg.orders})</span>
                                            </div>
                                        </div>
                                    )}
                                    {reg.units.filter(u => !u.isCommander).map((u, ui) => (
                                        <div key={ui} className={styles.unitRow}>
                                            <div className={styles.unitNameCol}>
                                                • {u.name}
                                                {u.imps.length > 0 && (
                                                    <span className={styles.impsList}>{u.imps.join(", ")}</span>
                                                )}
                                                {u.isSupport && (
                                                    <span style={{color: '#d35400', fontSize: '9px', fontWeight: 'bold', marginLeft: '4px'}}>[Wsparcie]</span>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                    {reg.regImps && reg.regImps.length > 0 && (
                                        <div className={styles.regImpsRow}>
                                            Zasady: {reg.regImps.join(", ")}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

            </div>
        </div>
    );
};