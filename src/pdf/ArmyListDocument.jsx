import React from 'react';
import { Page, Text, View, Document, StyleSheet, Font } from '@react-pdf/renderer';
import { collectRegimentUnits } from '../utils/armyMath';

Font.register({
    family: 'Roboto',
    fonts: [
        { src: 'https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-regular-webfont.ttf' },
        { src: 'https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-bold-webfont.ttf', fontWeight: 'bold' },
        { src: 'https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-italic-webfont.ttf', fontStyle: 'italic' }
    ]
});

const styles = StyleSheet.create({
    page: { padding: 30, fontFamily: 'Roboto', fontSize: 10, backgroundColor: '#ffffff' },

    header: { marginBottom: 15, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#000', borderBottomStyle: 'solid' },
    title: { fontSize: 22, fontWeight: 'bold', color: '#000' },
    // Styl dla nazwy własnej (podtytuł)
    customTitle: { fontSize: 14, fontStyle: 'italic', color: '#333', marginTop: 2, marginBottom: 2 },
    subtitle: { fontSize: 12, color: '#444', marginTop: 3 },

    // Sekcja Podsumowania
    summaryBox: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20, borderBottomWidth: 1, borderBottomColor: '#ccc', paddingBottom: 10 },
    summaryColumn: { flexDirection: 'column' },
    summaryLabel: { fontSize: 9, color: '#666', textTransform: 'uppercase' },
    summaryValue: { fontSize: 12, fontWeight: 'bold', color: '#000' },

    // Bloki
    regimentBlock: {
        marginBottom: 15,
        borderWidth: 1,
        borderColor: '#000',
        borderStyle: 'solid',
        backgroundColor: '#fff'
    },
    mainForceBlock: {
        borderWidth: 2,
        borderColor: '#000',
    },

    // Nagłówek Pułku
    regimentHeader: {
        padding: 8,
        backgroundColor: '#f0f0f0', // Jasnoszary
        borderBottomWidth: 1,
        borderBottomColor: '#000',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center'
    },
    regimentTitleRow: { flexDirection: 'column' },
    regimentName: { fontSize: 12, fontWeight: 'bold', color: '#000', textTransform: 'uppercase' },
    regimentTypeLabel: { fontSize: 9, fontWeight: 'bold', marginTop: 2, color: '#555' },
    regimentCustomName: { fontSize: 10, fontStyle: 'italic', color: '#333', marginTop: 1 },

    // Statystyki
    statsContainer: { flexDirection: 'row', padding: 6, borderBottomWidth: 1, borderBottomColor: '#ccc' },
    statsCol: { width: '33%', flexDirection: 'column' },
    statRow: { fontSize: 9, marginBottom: 2 },

    // Sekcja Jednostek (Tabela)
    unitsContainer: { padding: 8 },
    unitRow: {
        flexDirection: 'row',
        marginBottom: 4,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
        paddingBottom: 2
    },
    unitNameCol: { width: '70%' },
    unitNameText: { fontSize: 10, fontWeight: 'bold' },
    unitImpsText: { fontSize: 9, color: '#444', fontStyle: 'italic', marginTop: 1 },

    unitStatsCol: { width: '30%', alignItems: 'flex-end' },
    unitCostText: { fontSize: 9, fontWeight: 'bold' },

    // Ulepszenia pułkowe
    regimentImpsBox: { padding: 6, borderTopWidth: 1, borderTopColor: '#ccc', backgroundColor: '#fafafa' },
    regimentImpsText: { fontSize: 9, fontStyle: 'italic' },
});

export const ArmyListDocument = ({
                                     divisionDefinition,
                                     configuredDivision,
                                     faction,
                                     calculateRegimentStats,
                                     mainForceKey,
                                     totalDivisionCost,
                                     remainingImprovementPoints,
                                     unitsMap,
                                     getRegimentDefinition,
                                     playerName,
                                     divisionCustomName,
                                     improvements,
                                     divisionType
                                 }) => {

    // --- 1. SORTOWANIE PUŁKÓW I STATYSTYKI STRAŻY ---
    const rawRegiments = [
        ...(configuredDivision.vanguard || []).map(r => ({ ...r, group: 'vanguard', key: `vanguard/${r.index}` })),
        ...(configuredDivision.base || []).map(r => ({ ...r, group: 'base', key: `base/${r.index}` })),
        ...(configuredDivision.additional || []).map(r => ({ ...r, group: 'additional', key: `additional/${r.index}` }))
    ].filter(r => r.id !== 'none');

    const vanguardRegs = [];
    const mainForceRegs = [];
    const otherRegs = [];

    // Sumowanie statystyk straży
    let totalVanguardRecon = 0;
    let totalVanguardAwareness = 0;

    rawRegiments.forEach(reg => {
        if (reg.group === 'vanguard') {
            const stats = calculateRegimentStats(reg.config, reg.id);
            totalVanguardRecon += (stats.recon || 0);
            totalVanguardAwareness += (stats.awareness || 0);
            vanguardRegs.push(reg);
        } else if (reg.key === mainForceKey) {
            mainForceRegs.push(reg);
        } else {
            otherRegs.push(reg);
        }
    });

    const sortedRegiments = [...vanguardRegs, ...mainForceRegs, ...otherRegs];

    // --- 2. PODZIAŁ WSPARCIA ---
    const artDefsCount = divisionDefinition?.division_artillery?.length || 0;
    const unassignedSupport = configuredDivision.supportUnits.filter(su => !su.assignedTo);

    // Grupowanie
    const unassignedArtillery = unassignedSupport.filter(su => (su.definitionIndex ?? -1) < artDefsCount);
    const unassignedAdditional = unassignedSupport.filter(su => (su.definitionIndex ?? -1) >= artDefsCount);

    // Koszty grup
    const calcSupportGroupCost = (units) => units.reduce((acc, su) => acc + (unitsMap[su.id]?.cost || 0), 0);
    const artilleryTotalCost = calcSupportGroupCost(unassignedArtillery);
    const additionalTotalCost = calcSupportGroupCost(unassignedAdditional);

    // Helpery
    const isAllied = (regId) => {
        if (!regId || regId === 'none') return false;
        return faction.regiments && !faction.regiments[regId];
    };

    const getImpName = (impId, regDef) => {
        const commonName = improvements?.[impId]?.name;
        const unitLevelName = regDef?.unit_improvements?.find(i => i.id === impId)?.name;
        const regLevelName = regDef?.regiment_improvements?.find(i => i.id === impId)?.name;
        return commonName || unitLevelName || regLevelName || impId;
    };

    return (
        <Document>
            <Page size="A4" style={styles.page}>

                {/* NAGŁÓWEK */}
                <View style={styles.header}>
                    <Text style={styles.title}>{divisionDefinition.name}</Text>
                    {divisionCustomName && (
                        <Text style={styles.customTitle}>"{divisionCustomName}"</Text>
                    )}
                    <Text style={styles.subtitle}>
                        Frakcja: {faction.meta.name} | Gracz: {playerName || "...................."}
                    </Text>
                </View>

                {/* PODSUMOWANIE */}
                <View style={styles.summaryBox}>
                    <View style={styles.summaryColumn}>
                        <Text style={styles.summaryLabel}>Punkty Siły</Text>
                        <Text style={styles.summaryValue}>{totalDivisionCost}</Text>
                    </View>

                    <View style={styles.summaryColumn}>
                        <Text style={styles.summaryLabel}>Zwiad</Text>
                        <Text style={styles.summaryValue}>{totalVanguardRecon}</Text>
                    </View>

                    <View style={styles.summaryColumn}>
                        <Text style={styles.summaryLabel}>Czujność</Text>
                        <Text style={styles.summaryValue}>{totalVanguardAwareness}</Text>
                    </View>

                    <View style={styles.summaryColumn}>
                        <Text style={styles.summaryLabel}>Liczba Pułków</Text>
                        <Text style={styles.summaryValue}>{sortedRegiments.length}</Text>
                    </View>

                    <View style={{...styles.summaryColumn, maxWidth: 200}}>
                        <Text style={styles.summaryLabel}>Typ Dywizji</Text>
                        <Text style={styles.summaryValue}>{divisionType || "Mieszana"}</Text>
                    </View>
                </View>

                {/* --- SEKCJA PUŁKÓW --- */}
                {sortedRegiments.map((reg) => {
                    const regDef = getRegimentDefinition(reg.id);
                    const stats = calculateRegimentStats(reg.config, reg.id);

                    const isMain = reg.key === mainForceKey;
                    const isRegimentAllied = isAllied(reg.id);

                    let typeLabel = "";
                    if (reg.group === 'vanguard') typeLabel = "STRAŻ PRZEDNIA";
                    else if (isMain) typeLabel = "SIŁY GŁÓWNE";
                    else if (reg.group === 'base') typeLabel = "PODSTAWA";
                    else typeLabel = "PUŁK DODATKOWY";

                    if (isRegimentAllied) typeLabel += " (SOJUSZNIK)";

                    const coreUnits = collectRegimentUnits(reg.config, regDef);
                    const attachedSupport = configuredDivision.supportUnits
                        .filter(su => su.assignedTo?.positionKey === reg.key)
                        .map(su => ({
                            unitId: su.id,
                            key: `support/${su.id}-${reg.key}/0`,
                            isSupport: true
                        }));
                    const allUnits = [...coreUnits, ...attachedSupport];

                    return (
                        <View key={reg.key} style={[styles.regimentBlock, isMain ? styles.mainForceBlock : {}]} wrap={false}>

                            <View style={styles.regimentHeader}>
                                <View style={styles.regimentTitleRow}>
                                    <Text style={styles.regimentName}>{regDef?.name || reg.id}</Text>
                                    {reg.customName ? <Text style={styles.regimentCustomName}>"{reg.customName}"</Text> : null}
                                    <Text style={styles.regimentTypeLabel}>{typeLabel}</Text>
                                </View>
                                <View>
                                    <Text style={{fontSize: 10, fontWeight: 'bold'}}>{stats.cost} PS</Text>
                                </View>
                            </View>

                            <View style={styles.statsContainer}>
                                <View style={styles.statsCol}>
                                    <Text style={styles.statRow}>Typ: {stats.regimentType}</Text>
                                    <Text style={styles.statRow}>Zn. Aktywacji: {stats.activations + (isMain ? 1 : 0)}</Text>
                                </View>
                                <View style={styles.statsCol}>
                                    <Text style={styles.statRow}>Motywacja: {stats.motivation + (isMain ? 1 : 0)}</Text>
                                    <Text style={styles.statRow}>Rozkazy: {stats.orders}</Text>
                                </View>
                                <View style={styles.statsCol}>
                                    <Text style={styles.statRow}>Zwiad: {stats.recon}</Text>
                                    <Text style={styles.statRow}>Czujność: {stats.awareness}</Text>
                                </View>
                            </View>

                            {reg.config.regimentImprovements && reg.config.regimentImprovements.length > 0 && (
                                <View style={styles.regimentImpsBox}>
                                    <Text style={styles.regimentImpsText}>
                                        Ulepszenia pułku: {reg.config.regimentImprovements.map(id => getImpName(id, regDef)).join(', ')}
                                    </Text>
                                </View>
                            )}

                            <View style={styles.unitsContainer}>
                                {allUnits.map((u, idx) => {
                                    const uDef = unitsMap[u.unitId];
                                    if (!uDef) return null;

                                    let impIds = [];
                                    if (u.isSupport) {
                                        const exactKey = u.key;
                                        const broadKey = u.key.slice(0, -2);
                                        impIds = reg.config.improvements?.[exactKey] || reg.config.improvements?.[broadKey] || [];
                                    } else {
                                        impIds = reg.config.improvements?.[u.key] || [];
                                    }

                                    const impNames = impIds.map(id => getImpName(id, regDef)).join(', ');

                                    return (
                                        <View key={idx} style={styles.unitRow}>
                                            <View style={styles.unitNameCol}>
                                                <Text style={styles.unitNameText}>
                                                    {u.isSupport ? "[Wsparcie] " : "• "}
                                                    {uDef.name}
                                                </Text>
                                                {impNames ? <Text style={styles.unitImpsText}>+ {impNames}</Text> : null}
                                            </View>
                                            <View style={styles.unitStatsCol}>
                                                <Text style={styles.unitCostText}>{uDef.cost} PS</Text>
                                            </View>
                                        </View>
                                    );
                                })}
                            </View>
                        </View>
                    );
                })}

                {/* --- SEKCJE WSPARCIA NIEPRZYDZIELONEGO (Artyleria) --- */}
                {unassignedArtillery.length > 0 && (
                    <View style={styles.regimentBlock} wrap={false}>
                        <View style={styles.regimentHeader}>
                            <View style={styles.regimentTitleRow}>
                                <Text style={styles.regimentName}>ARTYLERIA DYWIZYJNA</Text>
                                {/* Usunięto etykietę WSPARCIE */}
                            </View>
                            <View>
                                <Text style={{fontSize: 10, fontWeight: 'bold'}}>{artilleryTotalCost} PS</Text>
                            </View>
                        </View>
                        <View style={styles.unitsContainer}>
                            {unassignedArtillery.map((su, i) => {
                                const uDef = unitsMap[su.id];
                                return (
                                    <View key={i} style={styles.unitRow}>
                                        <View style={styles.unitNameCol}>
                                            <Text style={styles.unitNameText}>• {uDef?.name || su.id}</Text>
                                        </View>
                                        <View style={styles.unitStatsCol}>
                                            <Text style={styles.unitCostText}>{uDef?.cost || 0} PS</Text>
                                        </View>
                                    </View>
                                );
                            })}
                        </View>
                    </View>
                )}

                {/* --- SEKCJE WSPARCIA NIEPRZYDZIELONEGO (Dodatkowe) --- */}
                {unassignedAdditional.length > 0 && (
                    <View style={styles.regimentBlock} wrap={false}>
                        <View style={styles.regimentHeader}>
                            <View style={styles.regimentTitleRow}>
                                <Text style={styles.regimentName}>ELEMENTY DODATKOWE</Text>
                                {/* Usunięto etykietę WSPARCIE */}
                            </View>
                            <View>
                                <Text style={{fontSize: 10, fontWeight: 'bold'}}>{additionalTotalCost} PS</Text>
                            </View>
                        </View>
                        <View style={styles.unitsContainer}>
                            {unassignedAdditional.map((su, i) => {
                                const uDef = unitsMap[su.id];
                                return (
                                    <View key={i} style={styles.unitRow}>
                                        <View style={styles.unitNameCol}>
                                            <Text style={styles.unitNameText}>• {uDef?.name || su.id}</Text>
                                        </View>
                                        <View style={styles.unitStatsCol}>
                                            <Text style={styles.unitCostText}>{uDef?.cost || 0} PS</Text>
                                        </View>
                                    </View>
                                );
                            })}
                        </View>
                    </View>
                )}

            </Page>
        </Document>
    );
};