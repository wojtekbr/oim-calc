import React, { useMemo } from "react";
import styles from "../../pages/RegimentSelector.module.css";
import { IDS, GROUP_TYPES } from "../../constants";
import { collectRegimentUnits } from "../../utils/armyMath";

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
                                unitsMap,
                                configuredDivision,
                                getRegimentDefinition,
                                calculateStats,
                                mainForceKey,
                                getEffectiveUnitImprovements,
                                improvementsMap,
                                divisionDefinition
                            }) => {

    const richRegimentsList = useMemo(() => {
        if (!configuredDivision || !getRegimentDefinition || !calculateStats) return [];

        const list = [];

        const processGroup = (groupName, groupArray) => {
            if (!groupArray) return;
            groupArray.forEach((reg, index) => {
                if (reg.id && reg.id !== IDS.NONE) {
                    const def = getRegimentDefinition(reg.id);
                    const positionKey = `${groupName}/${index}`;

                    const stats = calculateStats(reg.config, reg.id);
                    const isMain = mainForceKey === positionKey;

                    const internalUnits = collectRegimentUnits(reg.config, def).map(u => ({
                        unitId: u.unitId,
                        key: u.key,
                        isSupport: false,
                        purchasedImps: reg.config.improvements?.[u.key] || []
                    }));

                    const attachedSupport = (configuredDivision.supportUnits || [])
                        .filter(su => su.assignedTo?.positionKey === positionKey)
                        .map(su => ({
                            unitId: su.id,
                            key: `support/${su.id}-${positionKey}/0`,
                            isSupport: true,
                            purchasedImps: reg.config.improvements?.[`support/${su.id}-${positionKey}/0`] || []
                        }));

                    const allUnits = [...internalUnits, ...attachedSupport];

                    const regImpsNames = (reg.config.regimentImprovements || []).map(id => improvementsMap?.[id]?.name || id);

                    list.push({
                        name: def.name || reg.id,
                        customName: reg.customName,
                        stats,
                        isMain,
                        isVanguard: groupName === GROUP_TYPES.VANGUARD,
                        units: allUnits,
                        regId: reg.id,
                        regImpsNames
                    });
                }
            });
        };

        processGroup(GROUP_TYPES.VANGUARD, configuredDivision.vanguard);
        processGroup(GROUP_TYPES.BASE, configuredDivision.base);
        processGroup(GROUP_TYPES.ADDITIONAL, configuredDivision.additional);

        return list;
    }, [configuredDivision, getRegimentDefinition, calculateStats, mainForceKey, improvementsMap]);

    return (
        <div className={styles.summaryCard}>
            <div className={styles.summaryHeader}>
                <div>
                    {/* ZMIANA: Nazwa Dywizji na górze, duża */}
                    <div className={styles.summaryTitle}>
                        {divisionDefinition?.name || "Dywizja"} <span style={{fontSize: '0.8em', fontWeight: 'normal', color: '#555'}}>({totalDivisionCost} PS)</span>
                    </div>

                    {/* ZMIANA: Typ i koszt bazowy poniżej, mniejsze */}
                    <div className={styles.summarySubtitle}>
                        Typ: <strong>{divisionType}</strong> • Koszt bazowy: {divisionBaseCost} PS
                    </div>

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
                            {unassignedSupport.map((su, idx) => {
                                const effectiveImps = getEffectiveUnitImprovements
                                    ? getEffectiveUnitImprovements(su.id, [], divisionDefinition, null, unitsMap)
                                    : [];

                                return (
                                    <div key={idx} className={styles.unassignedBadge}>
                                        <span>• {unitsMap[su.id]?.name || su.id}</span>
                                        <span style={{fontWeight:'bold'}}>({unitsMap[su.id]?.cost || 0} pkt)</span>
                                        {effectiveImps.length > 0 && (
                                            <div style={{marginLeft: 6, display: 'inline-flex', gap: 2}}>
                                                {effectiveImps.map(impId => (
                                                    <span key={impId} style={{fontSize: 9, background: '#e0f2f1', color: '#00695c', padding: '0 3px', borderRadius: 3}}>
                                                        {improvementsMap?.[impId]?.name || impId} 🔒
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            {richRegimentsList.length > 0 && (
                <div className={styles.summarySection}>
                    <div className={styles.summarySectionTitle}>Sformowane Pułki</div>
                    <div className={styles.regimentListSimple}>
                        {richRegimentsList.map((reg, idx) => (
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
                                    {reg.units.map((u, uIdx) => {
                                        const unitDef = unitsMap[u.unitId];
                                        const unitName = unitDef?.name || u.unitId;

                                        const effectiveImps = getEffectiveUnitImprovements
                                            ? getEffectiveUnitImprovements(u.unitId, u.purchasedImps, divisionDefinition, reg.regId, unitsMap)
                                            : u.purchasedImps;

                                        return (
                                            <div key={uIdx} className={styles.unitRow}>
                                                <div className={styles.unitNameCol}>
                                                    <span>• {unitName}</span>
                                                    {u.isSupport && <span className={styles.previewSupportTag}> (Wsparcie)</span>}
                                                    {unitDef?.orders > 0 && (<span className={styles.commanderBadge}>DOW ({unitDef.orders})</span>)}
                                                </div>
                                                {effectiveImps.length > 0 && (
                                                    <div className={styles.impsList}>
                                                        {effectiveImps.map((impId, i) => {
                                                            const name = improvementsMap?.[impId]?.name || impId;
                                                            const isPurchased = u.purchasedImps.includes(impId);
                                                            const suffix = !isPurchased ? " 🔒" : "";

                                                            return (
                                                                <span key={i}>
                                                                    {i > 0 && ", "}
                                                                    {name}{suffix}
                                                                </span>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}

                                    {reg.regImpsNames.length > 0 && (
                                        <div className={styles.regImpsRow}>Ulepszenia Pułku: {reg.regImpsNames.join(', ')}</div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};