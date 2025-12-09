import React from "react";
import styles from "../../pages/RegimentSelector.module.css";

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
                                activeRegimentsList,
                                unitsMap
                            }) => {
    return (
        <div className={styles.summaryCard}>
            <div className={styles.summaryHeader}>
                <div>
                    <div className={styles.summaryTitle}>{divisionType} ({totalDivisionCost} PS)</div>
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
                        <div key={rule.id} className={styles.ruleLine}>
                            <strong>• {rule.title}: </strong> {rule.description}
                        </div>
                    ))}
                </div>
            )}

            <div className={styles.summaryInfoRow}>
                <div className={styles.summarySection} style={{marginTop: 0, borderTop: 'none'}}>
                    <div className={styles.summarySectionTitle}>Dowódca Dywizji</div>
                    {generalDef ? (
                        <div className={styles.commanderRow}>
                            <span className={styles.commanderName}>{generalDef.name}</span>
                            <span className={styles.commanderStats}>{generalDef.orders} Rozkazy | {generalDef.activations} Akt.</span>
                        </div>
                    ) : (
                        <div className={styles.noCommanderMsg}>Nie wybrano dowódcy</div>
                    )}
                </div>
                {unassignedSupport.length > 0 && (
                    <div className={styles.summarySection} style={{marginTop: 0, borderTop: 'none'}}>
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
                                        <div className={styles.regListTags}>
                                            {reg.isMain && <span className={`${styles.tagBadge} ${styles.tagMain}`}>Siły Główne</span>}
                                            {reg.isVanguard && <span className={`${styles.tagBadge} ${styles.tagVanguard}`}>Straż Przednia</span>}
                                        </div>
                                    </div>
                                    <div className={styles.regListStats}>
                                        <div><strong>{reg.stats.cost} PS</strong></div>
                                        <div>Akt: {reg.stats.activations + (reg.isMain?1:0)}</div>
                                        <div>Mot: {reg.stats.motivation + (reg.isMain?1:0)}</div>
                                    </div>
                                </div>
                                <div className={styles.regDetails}>
                                    {reg.units.map((u, uIdx) => (
                                        <div key={uIdx} className={styles.unitRow}>
                                            <div className={styles.unitNameCol}>
                                                <span>• {u.name}</span>
                                                {u.isSupport && <span className={styles.previewSupportTag}>WSPARCIE</span>}
                                                {u.isCommander && u.orders > 0 && (<span className={styles.commanderBadge}>DOW ({u.orders})</span>)}
                                            </div>
                                            {u.imps.length > 0 && (<div className={styles.impsList}>+ {u.imps.join(', ')}</div>)}
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
    );
};