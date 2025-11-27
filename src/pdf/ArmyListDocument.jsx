import React from 'react';
import { Page, Text, View, Document, StyleSheet, Font } from '@react-pdf/renderer';

Font.register({
    family: 'Roboto',
    src: 'https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-medium-webfont.ttf',
});

const styles = StyleSheet.create({
    page: { padding: 30, fontFamily: 'Roboto', fontSize: 10, backgroundColor: '#ffffff' },

    header: { marginBottom: 15, paddingBottom: 10, borderBottomWidth: 2, borderBottomColor: '#444', borderBottomStyle: 'solid' },
    title: { fontSize: 22, fontWeight: 'bold', color: '#222' },
    subtitle: { fontSize: 12, color: '#666', marginTop: 3 },

    // Sekcja Podsumowania (góra strony)
    summaryBox: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20, backgroundColor: '#f4f4f4', padding: 10, borderRadius: 4 },
    summaryColumn: { flexDirection: 'column' },
    summaryLabel: { fontSize: 9, color: '#555' },
    summaryValue: { fontSize: 11, fontWeight: 'bold' },

    // Główny blok Pułku
    regimentBlock: {
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#aaa',
        borderStyle: 'solid',
        backgroundColor: '#fff'
    },
    mainForceBlock: {
        borderWidth: 2,
        borderColor: '#d35400',
        borderStyle: 'solid',
        backgroundColor: '#fff8e1'
    },

    // Nagłówek Pułku
    regimentHeader: {
        padding: 8,
        backgroundColor: '#e0e0e0',
        borderBottomWidth: 1,
        borderBottomColor: '#aaa',
        borderBottomStyle: 'solid',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center'
    },
    regimentName: { fontSize: 12, fontWeight: 'bold' },
    regimentActivations: { fontSize: 10, fontWeight: 'normal' },
    regimentCustomName: { fontSize: 11, fontStyle: 'italic', color: '#333', marginTop: 2 },

    // Statystyki (2 kolumny)
    statsContainer: { flexDirection: 'row', padding: 8, borderBottomWidth: 1, borderBottomColor: '#eee', borderBottomStyle: 'solid' },
    statsCol: { width: '50%' },
    statText: { fontSize: 10, marginBottom: 2 },

    // Lista Jednostek
    unitsContainer: { padding: 8 },
    unitRow: { flexDirection: 'row', marginBottom: 3 },
    unitName: { fontSize: 10, width: '60%' },
    unitDetails: { fontSize: 9, color: '#555', width: '40%', textAlign: 'right' }
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
                                     divisionCustomName
                                 }) => {

    const allRegiments = [
        ...configuredDivision.base.map(r => ({ ...r, key: `base/${r.index}` })),
        ...configuredDivision.additional.map(r => ({ ...r, key: `additional/${r.index}` }))
    ].filter(r => r.id !== 'none');

    // Znajdź nazwę Sił Głównych do podsumowania
    let mainForceName = "Brak";
    const mainForceReg = allRegiments.find(r => r.key === mainForceKey);
    if (mainForceReg) {
        const defName = getRegimentDefinition(mainForceReg.id)?.name;
        mainForceName = mainForceReg.customName
            ? `${mainForceReg.customName} (${defName})`
            : defName;
    }

    return (
        <Document>
            <Page size="A4" style={styles.page}>

                {/* NAGŁÓWEK DOKUMENTU */}
                <View style={styles.header}>
                    <Text style={styles.title}>{divisionCustomName || divisionDefinition.name}</Text>
                    <Text style={styles.subtitle}>
                        Frakcja: {faction.meta.name} | Gracz: {playerName || "Nieznany"}
                    </Text>
                </View>

                {/* PODSUMOWANIE PUNKTÓW */}
                <View style={styles.summaryBox}>
                    <View style={styles.summaryColumn}>
                        <Text style={styles.summaryLabel}>Punkty Siły (PS)</Text>
                        <Text style={styles.summaryValue}>{totalDivisionCost}</Text>
                    </View>
                    <View style={styles.summaryColumn}>
                        <Text style={styles.summaryLabel}>Punkty Ulepszeń (PU)</Text>
                        <Text style={styles.summaryValue}>{remainingImprovementPoints}</Text>
                    </View>
                    <View style={styles.summaryColumn}>
                        <Text style={styles.summaryLabel}>Liczba Pułków</Text>
                        <Text style={styles.summaryValue}>{allRegiments.length}</Text>
                    </View>
                    <View style={{...styles.summaryColumn, maxWidth: 200}}>
                        <Text style={styles.summaryLabel}>Siły Główne</Text>
                        <Text style={{...styles.summaryValue, fontSize: 9}}>{mainForceName}</Text>
                    </View>
                </View>

                {/* LISTA PUŁKÓW (KARTY) */}
                {allRegiments.map((reg) => {
                    const stats = calculateRegimentStats(reg.config, reg.id, configuredDivision);
                    const isMain = reg.key === mainForceKey;
                    const defName = getRegimentDefinition(reg.id)?.name;

                    const finalActivations = stats.activations + (isMain ? 1 : 0);
                    const finalMotivation = stats.motivation + (isMain ? 1 : 0);

                    const isVanguard = stats.isVanguard; // Pobieramy flagę

                    // Przygotowanie listy jednostek
                    const unitList = [];
                    const processUnit = (positionKey, unitId, isSupport) => {
                        if (!unitId || unitId === 'none') return;
                        const unitDef = unitsMap[unitId];
                        if (!unitDef) return;

                        // Ulepszenia
                        let imps = [];
                        if (isSupport) {
                            const supportKey = `support/${unitId}-${reg.key}`;
                            imps = reg.config.improvements[supportKey] || [];
                        } else {
                            imps = reg.config.improvements[positionKey] || [];
                        }

                        unitList.push({
                            name: unitDef.name,
                            isSupport,
                            imps: imps
                        });
                    };

                    Object.entries(reg.config.base || {}).forEach(([k, uid]) => processUnit(`base/${k}`, uid, false));
                    Object.entries(reg.config.additional || {}).forEach(([k, uid]) => processUnit(`additional/${k}`, uid, false));
                    if (reg.config.additionalCustom) processUnit('custom', reg.config.additionalCustom, false);
                    configuredDivision.supportUnits
                        .filter(su => su.assignedTo?.positionKey === reg.key)
                        .forEach(su => processUnit('support', su.id, true));


                    return (
                        <View key={reg.key} style={[styles.regimentBlock, isMain ? styles.mainForceBlock : {}]}>

                            {/* Nagłówek Pułku */}
                            <View style={styles.regimentHeader}>
                                <View style={{flexDirection: 'column'}}>
                                    <Text style={styles.regimentName}>
                                        {defName} <Text style={styles.regimentActivations}>({finalActivations} zn. aktywacji)</Text>
                                        {/* VISUAL TAG DLA STRAŻY PRZEDNIEJ */}
                                        {isVanguard ? <Text style={{ color: '#d35400', fontSize: 10 }}> [STRAŻ PRZEDNIA]</Text> : null}
                                    </Text>
                                    {reg.customName ? <Text style={styles.regimentCustomName}>{reg.customName}</Text> : null}
                                </View>
                                <Text style={{fontSize: 10}}>Rozkazy: {stats.orders}</Text>
                            </View>

                            {/* Statystyki (2 kolumny) */}
                            <View style={styles.statsContainer}>
                                <View style={styles.statsCol}>
                                    <Text style={styles.statText}>Punkty Siły: {stats.cost}</Text>
                                    <Text style={styles.statText}>Motywacja: {finalMotivation}</Text>
                                </View>
                                <View style={styles.statsCol}>
                                    <Text style={styles.statText}>Zwiad: {stats.recon}</Text>
                                    {/* DODANO RYZYKO */}
                                    <Text style={styles.statText}>Ryzyko: {stats.awareness}</Text>
                                </View>
                            </View>

                            {/* Lista Jednostek */}
                            <View style={styles.unitsContainer}>
                                {reg.config.regimentImprovements && reg.config.regimentImprovements.length > 0 && (
                                    <Text style={{fontSize: 9, color: '#00008b', marginBottom: 4}}>
                                        Ulepszenia pułku: {reg.config.regimentImprovements.join(', ')}
                                    </Text>
                                )}

                                {unitList.map((u, i) => (
                                    <View key={i} style={styles.unitRow}>
                                        <Text style={styles.unitName}>{u.isSupport ? "(Wsparcie) " : ""}{u.name}</Text>
                                        <Text style={styles.unitDetails}>
                                            {u.imps.length > 0 ? `+ ${u.imps.join(', ')}` : ""}
                                        </Text>
                                    </View>
                                ))}
                            </View>
                        </View>
                    );
                })}

                {/* Wsparcie Dywizyjne (nieprzypisane) */}
                {configuredDivision.supportUnits.filter(su => !su.assignedTo).length > 0 && (
                    <View style={{ marginTop: 15, padding: 8, borderStyle: 'dashed', borderWidth: 1, borderColor: '#666' }}>
                        <Text style={{ fontWeight: 'bold', marginBottom: 5 }}>Wsparcie Dywizyjne (Nieprzypisane)</Text>
                        {configuredDivision.supportUnits.filter(su => !su.assignedTo).map((su, i) => (
                            <Text key={i} style={{ fontSize: 10 }}>• {unitsMap[su.id]?.name} ({unitsMap[su.id]?.cost} pkt)</Text>
                        ))}
                    </View>
                )}

            </Page>
        </Document>
    );
};