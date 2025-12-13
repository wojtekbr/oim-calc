import React, { useMemo } from "react";
import styles from "../../pages/RegimentSelector.module.css";
import { getPlaceholderStyle, getInitials } from "../../utils/uiHelpers";
import { GROUP_TYPES } from "../../constants";

export const SupportUnitTile = ({ 
    unitId, 
    isPurchased, 
    locked, 
    onClick, 
    onRemove, 
    onAssign, 
    unitDef, 
    disabledReason, 
    assignmentInfo, 
    regimentsList, 
    unitsRulesMap, 
    supportUnits, 
    calculateStats, 
    getRegimentDefinition 
}) => {
    const puCost = unitDef?.improvement_points_cost || unitDef?.pu_cost || 0;
    const costPU = puCost ? ` + ${puCost} PU` : '';
    const tooltip = locked && disabledReason ? disabledReason : (unitDef?.name || unitId);
    
    const initials = getInitials(unitDef?.name || unitId);
    const placeholderStyle = getPlaceholderStyle(unitId, unitDef?.name);

    const availableRegiments = useMemo(() => {
        if (!isPurchased || !regimentsList) return [];
        
        const rules = unitsRulesMap[unitId] || {};
        const canBeAssigned = rules.can_be_assigned !== false;
        if (!canBeAssigned) return [];

        const getSupportUnitType = (u) => {
            if (!u) return 'infantry';
            if (u.is_artillery) return 'artillery';
            if (u.is_cavalry || u.is_dragoon || u.are_dragoons || u.are_proxy_dragoons) return 'cavalry';
            return 'infantry';
        };

        const supportType = getSupportUnitType(unitDef);
        const isDragoon = unitDef.is_dragoon || unitDef.are_dragoons || unitDef.are_proxy_dragoons;

        return regimentsList.reduce((acc, r) => {
            let isAllowed = true;

            if (rules?.allowed_regiment_ids && rules.allowed_regiment_ids.length > 0) {
                if (!rules.allowed_regiment_ids.includes(r.id)) isAllowed = false;
            }
            if (rules?.exclusion_tag && isAllowed) {
                const otherUnitInRegiment = supportUnits.find(otherSu =>
                    otherSu.id !== unitId &&
                    otherSu.assignedTo?.positionKey === r.positionKey
                );
                if (otherUnitInRegiment) {
                     const otherRules = unitsRulesMap[otherUnitInRegiment.id] || {};
                     if (otherRules.exclusion_tag === rules.exclusion_tag) isAllowed = false;
                     if (otherUnitInRegiment.id === rules.exclusion_tag) isAllowed = false;
                     if (otherRules.exclusion_tag === unitId) isAllowed = false;
                }
            }

            if (isAllowed && !isDragoon) {
                const stats = calculateStats(r.config, r.id);
                const regType = stats.regimentType; 
                if (supportType === 'artillery' || supportType === 'infantry') {
                    if (regType !== 'Pieszy') isAllowed = false;
                } else if (supportType === 'cavalry') {
                    if (regType !== 'Konny') isAllowed = false;
                }
            }

            if (isAllowed) {
                const regDef = getRegimentDefinition(r.id);
                const regName = r.customName || regDef?.name || r.id;
                let prefix = '';
                if (r.positionKey.startsWith(GROUP_TYPES.BASE)) prefix = 'Pułk';
                else if (r.positionKey.startsWith(GROUP_TYPES.VANGUARD)) prefix = 'Straż';
                else prefix = 'Poz. I';
                acc.push({ ...r, label: `${prefix}: ${regName}` });
            }
            return acc;
        }, []);
    }, [isPurchased, unitId, regimentsList, supportUnits, unitsRulesMap, unitDef, calculateStats, getRegimentDefinition]);

    const handleAssignChange = (e) => {
        e.stopPropagation(); 
        onAssign(e.target.value);
    };

    const handleTileClick = () => {
        if (locked) return;
        if (isPurchased) {
            onRemove();
        } else {
            onClick();
        }
    };

    return (
        <div
            className={`${styles.card} ${isPurchased ? styles.active : ''} ${locked ? styles.locked : ''}`}
            onClick={handleTileClick}
            title={tooltip}
            style={{cursor: locked ? 'not-allowed' : 'pointer'}}
        >
            {isPurchased && <div className={styles.checkBadge}>✔</div>}
            
            <div className={styles.cardImagePlaceholder} style={placeholderStyle}>
                {initials}
            </div>

            <div className={styles.cardContent}>
                <div className={styles.cardTitle}>{unitDef?.name || unitId}</div>
                
                {locked && disabledReason && (
                    <div style={{fontSize: 10, color: '#d32f2f', marginBottom: 4, lineHeight: 1.2, fontStyle: 'italic'}}>
                        {disabledReason}
                    </div>
                )}

                <div className={styles.cardCost}>
                    {unitDef?.cost || 0} PS{costPU}
                </div>

                {isPurchased && (
                    <select 
                        className={styles.assignmentSelect}
                        value={assignmentInfo?.positionKey || ""}
                        onChange={handleAssignChange}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <option value="">— Nieprzydzielona —</option>
                        {availableRegiments.map(r => (
                            <option key={r.positionKey} value={r.positionKey}>
                                {r.label}
                            </option>
                        ))}
                    </select>
                )}
            </div>
        </div>
    );
};