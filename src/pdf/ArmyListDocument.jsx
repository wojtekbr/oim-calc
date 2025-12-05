import React from 'react';
import { Page, Text, View, Document, StyleSheet, Font } from '@react-pdf/renderer';

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
        borderColor: '#e65100',
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

    // 1. Zbieramy WSZYSTKIE pułki (Vanguard + Base + Additional)
    const allRegiments = [
        ...(configuredDivision.vanguard || []).map(r => ({ ...r, key: `vanguard/${r.index}`, typeLabel: "Straż Przednia" })),
        ...configuredDivision.base.map(r => ({ ...r, key: `base/${r.index}`, typeLabel: "Podstawa" })),
        ...configuredDivision.additional.map(r => ({ ...r, key: `additional/${r.index}`, typeLabel: "Poziom I" }))
    ].filter(r => r.id !== 'none');

    // 2. Znajdź nazwę Sił Głównych do podsumowania
    let mainForceName = "Brak";
    const mainForceReg = allRegiments.find(r => r.key === mainForceKey);
    if (mainForceReg) {
        const defName = getRegimentDefinition(mainForceReg.id)?.name;
        mainForceName = mainForceReg.customName
            ? `${mainForceReg.customName} (${defName})`
            : defName;
    }

    // Helper do sprawdzania sojusznika
    const isAllied = (regId) => {
        if (!regId || regId === 'none') return false;
        return faction.regiments && !faction.regiments[regId];
    };

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
                    const stats = calculateRegimentStats(reg.config, reg.id); // Używamy wrappera, który ma zamknięty scope
                    const isMain = reg.key === mainForceKey;
                    const defName = getRegimentDefinition(reg.id)?.name;
                    const isRegimentAllied = isAllied(reg.id);

                    const finalActivations = stats.activations + (isMain ? 1 : 0);
                    const finalMotivation = stats.motivation + (isMain ? 1 : 0);

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

                        // Mapowanie ID ulepszeń na nazwy (opcjonalne, na razie ID)
                        // W idealnym świecie przekazalibyśmy improvementsMap do PDF, ale ID są czytelne zazwyczaj
                        
                        unitList.push({
                            name: unitDef.name,
                            isSupport,
                            imps: imps
                        });
                    };

                    Object.entries(reg.config.baseSelections || {}).forEach(([k, arr]) => {
                        arr.forEach((uid, idx) => processUnit(`base/${k}/${idx}`, uid, false));
                    });
                    
                    // Optional Base
                    Object.entries(reg.config.optionalSelections || {}).forEach(([k, arr]) => {
                        if(k.startsWith('base/')) {
                             const idx = parseInt(k.split('/').pop());
                             if(reg.config.optionalEnabled?.[k]) {
                                 const uid = arr[idx]; // Wait, structure is weird in storage vs here
                                 // Simplify: collectRegimentUnits logic is complex to replicate here perfectly
                                 // BETTER: Rely on stats.unitNames from armyMath if available, or just render basic structure
                             }
                        }
                    });
                    
                    // UWAGA: Aby PDF był idealny, musielibyśmy przenieść logikę collectRegimentUnits tutaj lub zwrócić listę jednostek z calculateRegimentStats.
                    // Na razie użyjmy unitNames zwróconych przez calculateRegimentStats (dodałem to pole wcześniej w armyMath!)
                    
                    const displayUnits = stats.unitNames || [];

                    return (
                        <View key={reg.key} style={[styles.regimentBlock, isMain ? styles.mainForceBlock : {}]}>

                            {/* Nagłówek Pułku */}
                            <View style={styles.regimentHeader}>
                                <View style={{flexDirection: 'column'}}>
                                    <Text style={styles.regimentName}>
                                        {defName} <Text style={styles.regimentActivations}>({finalActivations} zn. aktywacji)</Text>
                                        {reg.typeLabel === "Straż Przednia" ? <Text style={{ color: '#d35400', fontSize: 10 }}> [STRAŻ PRZEDNIA]</Text> : null}
                                        {isRegimentAllied ? <Text style={{ color: '#d35400', fontSize: 10 }}> [SOJUSZNIK]</Text> : null}
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
                                    <Text style={styles.statText}>Czujność: {stats.awareness}</Text>
                                </View>
                            </View>

                            {/* Lista Jednostek (Uproszczona z unitNames) */}
                            <View style={styles.unitsContainer}>
                                {reg.config.regimentImprovements && reg.config.regimentImprovements.length > 0 && (
                                    <Text style={{fontSize: 9, color: '#00008b', marginBottom: 4}}>
                                        Ulepszenia pułku: {reg.config.regimentImprovements.join(', ')}
                                    </Text>
                                )}

                                {displayUnits.map((uName, i) => (
                                    <View key={i} style={styles.unitRow}>
                                        <Text style={styles.unitName}>• {uName}</Text>
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