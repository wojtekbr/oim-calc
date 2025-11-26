import React from 'react';
import { Page, Text, View, Document, StyleSheet, Font } from '@react-pdf/renderer';

// Rejestracja czcionki z obsługą polskich znaków
Font.register({
    family: 'Roboto',
    src: 'https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-medium-webfont.ttf',
});

const styles = StyleSheet.create({
    page: { padding: 30, fontFamily: 'Roboto', fontSize: 11 },
    header: { marginBottom: 20, borderBottom: '2px solid #000', paddingBottom: 10 },
    title: { fontSize: 24, marginBottom: 5, textTransform: 'uppercase' },
    subtitle: { fontSize: 14, color: '#555' },
    sectionTitle: { fontSize: 16, marginBottom: 10, marginTop: 20, borderBottom: '1px solid #ccc', paddingBottom: 5, fontWeight: 'bold' },

    // Tabela Podsumowania
    table: { display: "table", width: "auto", borderStyle: "solid", borderRightWidth: 0, borderBottomWidth: 0 },
    tableRow: { margin: "auto", flexDirection: "row" },
    tableCol: { borderStyle: "solid", borderWidth: 1, borderLeftWidth: 0, borderTopWidth: 0 },
    tableCellHeader: { margin: 5, fontSize: 10, fontWeight: 'bold', backgroundColor: '#eee' },
    tableCell: { margin: 5, fontSize: 10 },

    // Style dla sił głównych
    mainForceRow: { backgroundColor: '#fff8e1' },

    // Szczegóły
    regimentBox: { marginBottom: 15, padding: 10, border: '1px solid #ddd', borderRadius: 4 },
    regimentHeader: { fontSize: 14, marginBottom: 5, flexDirection: 'row', justifyContent: 'space-between' },
    unitRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2, fontSize: 10 },
    unitName: { width: '60%' },
    unitStats: { width: '40%', textAlign: 'right', color: '#666' },

    // Support
    supportBox: { marginTop: 10, padding: 5, backgroundColor: '#f9f9f9' },

    bold: { fontWeight: 'bold' }
});

export const ArmyListDocument = ({
                                     divisionDefinition,
                                     configuredDivision,
                                     faction,
                                     calculateRegimentStats,
                                     mainForceKey,
                                     totalDivisionCost,
                                     remainingImprovementPoints,
                                     unitsMap
                                 }) => {

    // Przygotowanie danych pułków do tabeli
    const allRegiments = [
        ...configuredDivision.base.map(r => ({ ...r, type: 'Podstawowy', key: `base/${r.index}` })),
        ...configuredDivision.additional.map(r => ({ ...r, type: 'Dodatkowy', key: `additional/${r.index}` }))
    ].filter(r => r.id !== 'none');

    return (
        <Document>
            {/* STRONA 1: PODSUMOWANIE */}
            <Page size="A4" style={styles.page}>
                <View style={styles.header}>
                    <Text style={styles.title}>{divisionDefinition.name}</Text>
                    <Text style={styles.subtitle}>Frakcja: {faction.meta.name}</Text>
                </View>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 }}>
                    <View>
                        <Text>Suma Punktów Siły: {totalDivisionCost}</Text>
                        <Text>Pozostałe Punkty Ulepszeń: {remainingImprovementPoints}</Text>
                    </View>
                    <View>
                        <Text>Liczba pułków: {allRegiments.length}</Text>
                    </View>
                </View>

                <Text style={styles.sectionTitle}>Rozpiska Pułków</Text>

                <View style={styles.table}>
                    {/* Nagłówek Tabeli */}
                    <View style={styles.tableRow}>
                        <View style={{ ...styles.tableCol, width: '40%' }}><Text style={styles.tableCellHeader}>Nazwa Pułku</Text></View>
                        <View style={{ ...styles.tableCol, width: '15%' }}><Text style={styles.tableCellHeader}>Typ</Text></View>
                        <View style={{ ...styles.tableCol, width: '10%' }}><Text style={styles.tableCellHeader}>Koszt</Text></View>
                        <View style={{ ...styles.tableCol, width: '10%' }}><Text style={styles.tableCellHeader}>Zwiad</Text></View>
                        <View style={{ ...styles.tableCol, width: '10%' }}><Text style={styles.tableCellHeader}>Motyw.</Text></View>
                        <View style={{ ...styles.tableCol, width: '15%' }}><Text style={styles.tableCellHeader}>Aktywacje</Text></View>
                    </View>

                    {/* Wiersze Tabeli */}
                    {allRegiments.map((reg) => {
                        const stats = calculateRegimentStats(reg.config, reg.id, configuredDivision);
                        const isMain = reg.key === mainForceKey;

                        const finalActivations = stats.activations + (isMain ? 1 : 0);
                        const finalMotivation = stats.motivation + (isMain ? 1 : 0);

                        return (
                            <View key={reg.key} style={[styles.tableRow, isMain ? styles.mainForceRow : {}]}>
                                <View style={{ ...styles.tableCol, width: '40%' }}>
                                    <Text style={styles.tableCell}>
                                        {reg.name || stats.regimentDefName || reg.id}
                                        {isMain ? " (Siły Główne)" : ""}
                                    </Text>
                                </View>
                                <View style={{ ...styles.tableCol, width: '15%' }}><Text style={styles.tableCell}>{reg.type}</Text></View>
                                <View style={{ ...styles.tableCol, width: '10%' }}><Text style={styles.tableCell}>{stats.cost}</Text></View>
                                <View style={{ ...styles.tableCol, width: '10%' }}><Text style={styles.tableCell}>{stats.recon}</Text></View>
                                <View style={{ ...styles.tableCol, width: '10%' }}><Text style={styles.tableCell}>{finalMotivation}</Text></View>
                                <View style={{ ...styles.tableCol, width: '15%' }}>
                                    <Text style={styles.tableCell}>
                                        {finalActivations} {stats.orders > 0 ? `(Rozkazy: ${stats.orders})` : ''}
                                    </Text>
                                </View>
                            </View>
                        );
                    })}
                </View>

                {/* Podsumowanie Jednostek Wsparcia (nieprzypisanych do pułków) */}
                {configuredDivision.supportUnits.filter(su => !su.assignedTo).length > 0 && (
                    <View style={{ marginTop: 20 }}>
                        <Text style={styles.sectionTitle}>Wsparcie Dywizyjne (Nieprzypisane)</Text>
                        {configuredDivision.supportUnits.filter(su => !su.assignedTo).map((su, i) => (
                            <Text key={i} style={{ fontSize: 10, marginBottom: 2 }}>• {unitsMap[su.id]?.name || su.id} ({unitsMap[su.id]?.cost} pkt)</Text>
                        ))}
                    </View>
                )}
            </Page>

            {/* STRONA 2: SZCZEGÓŁY PUŁKÓW */}
            <Page size="A4" style={styles.page}>
                <Text style={styles.header}>Szczegółowy Skład Pułków</Text>

                {allRegiments.map((reg) => {
                    const stats = calculateRegimentStats(reg.config, reg.id, configuredDivision);
                    const isMain = reg.key === mainForceKey;

                    // Zbieramy jednostki do wyświetlenia
                    const unitList = [];

                    // Base & Additional slots
                    [...Object.values(reg.config.base || {}), ...Object.values(reg.config.additional || {}), reg.config.additionalCustom]
                        .filter(id => id && id !== 'none')
                        .forEach(id => unitList.push({ id, type: 'Regiment' }));

                    // Assigned Support Units
                    configuredDivision.supportUnits
                        .filter(su => su.assignedTo?.positionKey === reg.key)
                        .forEach(su => unitList.push({ id: su.id, type: 'Wsparcie' }));

                    return (
                        <View key={reg.key} style={styles.regimentBox}>
                            <View style={styles.regimentHeader}>
                                <Text style={{ fontWeight: 'bold' }}>
                                    {reg.name || reg.id} {isMain ? "[SIŁY GŁÓWNE]" : ""}
                                </Text>
                                <Text>Koszt: {stats.cost}</Text>
                            </View>

                            {/* Ulepszenia pułkowe */}
                            {reg.config.regimentImprovements && reg.config.regimentImprovements.length > 0 && (
                                <Text style={{ fontSize: 10, fontStyle: 'italic', marginBottom: 5, color: '#0077ff' }}>
                                    Ulepszenia pułku: {reg.config.regimentImprovements.join(', ')}
                                </Text>
                            )}

                            {/* Lista jednostek */}
                            {unitList.map((u, i) => {
                                const unitDef = unitsMap[u.id];
                                // Tu można by dodać logikę wyciągania ulepszeń jednostkowych z `reg.config.improvements`
                                // ale wymagałoby to odtworzenia logiki kluczy (positionKey).
                                // Na razie prosta lista nazw.
                                return (
                                    <View key={i} style={styles.unitRow}>
                                        <Text style={styles.unitName}>• {unitDef?.name || u.id} {u.type === 'Wsparcie' ? '(Wsparcie)' : ''}</Text>
                                        <Text style={styles.unitStats}>{unitDef?.cost} pkt {unitDef?.pu_cost ? `| ${unitDef.pu_cost} PU` : ''}</Text>
                                    </View>
                                );
                            })}
                        </View>
                    );
                })}
            </Page>
        </Document>
    );
};