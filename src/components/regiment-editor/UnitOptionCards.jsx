import React from "react";
import styles from "../../pages/RegimentEditor.module.css";

// --- Helpers do Placeholdera ---
const getPlaceholderColor = (str) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
    return '#' + "00000".substring(0, 6 - c.length) + c;
};

const getPlaceholderStyle = (id, name) => {
    const color = getPlaceholderColor(id || name);
    return {
        background: `linear-gradient(135deg, ${color}22 0%, ${color}66 100%)`,
        color: '#555'
    };
};

export const SingleUnitOptionCard = ({
                                         unitId, isActive, onClick, unitMap, logicHelpers, isLocked, customCosts
                                     }) => {
    const unitDef = unitMap[unitId];
    if (!unitDef) return null;

    let displayCost = 0;
    if (customCosts?.costOverride !== undefined) {
        displayCost = customCosts.costOverride;
    } else {
        displayCost = logicHelpers.getFinalUnitCost(unitId, false);
        if (customCosts?.extraCost) {
            displayCost += customCosts.extraCost;
        }
    }

    let unitPuCost = 0;
    if (customCosts?.puCostOverride !== undefined) {
        unitPuCost = customCosts.puCostOverride;
    } else {
        unitPuCost = unitDef.improvement_points_cost || unitDef.pu_cost || 0;
    }

    const costLabel = unitPuCost > 0
        ? `${displayCost} PS + ${unitPuCost} PU`
        : `${displayCost} PS`;

    const initials = unitDef.name
        ? unitDef.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
        : "??";

    const placeholderStyle = getPlaceholderStyle(unitId, unitDef.name);

    return (
        <div
            className={`${styles.unitCard} ${isActive ? styles.active : ''} ${onClick && !isLocked ? styles.selectable : ''}`}
            onClick={isLocked ? undefined : onClick}
            style={isLocked ? { cursor: 'default', opacity: 0.6, filter: 'grayscale(1)' } : {}}
            title={unitDef.name}
        >
            {isActive && <div className={styles.checkBadge}>✔</div>}

            <div className={styles.cardImagePlaceholder} style={placeholderStyle}>
                {initials}
            </div>

            <div className={styles.cardContent}>
                <div className={styles.unitName}>{unitDef.name || unitId}</div>
                {unitDef.orders > 0 && (
                    <div className={styles.unitOrders}>Rozkazy: {unitDef.orders}</div>
                )}
                <div className={styles.unitCost}>{costLabel}</div>
            </div>
        </div>
    );
};

export const MultiUnitOptionCard = ({
                                        optionKey, optionNameOverride, unitIds, isActive, onClick, unitsMap, logicHelpers, isLocked, customCosts
                                    }) => {
    let totalCost = 0;
    if (customCosts?.costOverride !== undefined) {
        totalCost = customCosts.costOverride;
    } else {
        unitIds.forEach(id => {
            totalCost += logicHelpers.getFinalUnitCost(id, false);
        });
        if (customCosts?.extraCost) {
            totalCost += customCosts.extraCost;
        }
    }

    let totalPuCost = 0;
    if (customCosts?.puCostOverride !== undefined) {
        totalPuCost = customCosts.puCostOverride;
    } else {
        unitIds.forEach(id => {
            const u = unitsMap[id];
            if (u) totalPuCost += (u.improvement_points_cost || u.pu_cost || 0);
        });
    }

    let totalOrders = 0;
    unitIds.forEach(id => {
        const u = unitsMap[id];
        if (u && u.orders) totalOrders += u.orders;
    });

    const displayName = optionNameOverride || `Pakiet (${unitIds.length} jedn.)`;
    const costLabel = totalPuCost > 0
        ? `${totalCost} PS + ${totalPuCost} PU`
        : `${totalCost} PS`;

    return (
        <div
            className={`${styles.unitCard} ${styles.multiCard} ${isActive ? styles.active : ''} ${onClick && !isLocked ? styles.selectable : ''}`}
            onClick={isLocked ? undefined : onClick}
            style={isLocked ? { cursor: 'default' } : {}}
        >
            {isActive && <div className={styles.checkBadge}>✔</div>}
            <div className={styles.cardImagePlaceholder} style={{background: '#e0e0e0', fontSize: '18px'}}>
                📚 {unitIds.length}x
            </div>
            <div className={styles.cardContent}>
                <div className={styles.multiCardTitle}>{displayName}</div>
                <div className={styles.multiCardList}>
                    {unitIds.slice(0, 3).map((uid, idx) => (
                        <div key={idx} className={styles.multiCardItem}>
                            <span>• {unitsMap[uid]?.name || uid}</span>
                        </div>
                    ))}
                    {unitIds.length > 3 && <div>...i {unitIds.length - 3} więcej</div>}
                </div>
                {totalOrders > 0 && <div className={styles.unitOrders}>Rozkazy: {totalOrders}</div>}
                <div className={styles.multiCardTotalCost}>Razem: {costLabel}</div>
            </div>
        </div>
    );
};