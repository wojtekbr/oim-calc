import React from "react";
import styles from "../../pages/RegimentSelector.module.css";
import { getPlaceholderStyle, getInitials } from "../../utils/uiHelpers";

export const RegimentOptionTile = ({ optId, isActive, onClick, getRegimentDefinition, disabled, isAllied, divisionDefinition }) => {
    const def = getRegimentDefinition(optId);
    const name = def?.name || optId;
    const cost = def?.base_cost || 0;

    // 1. Bazowy koszt PU z definicji pułku
    let puCost = def?.improvement_points_cost || 0;

    // 2. Dodatkowy koszt PU z zasad dywizji (np. "extra_regiment_cost")
    if (divisionDefinition?.rules) {
        divisionDefinition.rules.forEach(rule => {
            if (rule.id === 'extra_regiment_cost' && rule.regiment_ids?.includes(optId)) {
                if (rule.pu_cost) {
                    puCost += rule.pu_cost;
                }
            }
        });
    }

    const initials = getInitials(name);
    const placeholderStyle = getPlaceholderStyle(optId, name);

    return (
        <div
            className={`${styles.card} ${isActive ? styles.active : ''} ${disabled ? styles.disabledTile : ''}`}
            onClick={disabled ? undefined : onClick}
        >
            {isActive && <div className={styles.checkBadge}>✔</div>}

            <div className={styles.cardImagePlaceholder} style={placeholderStyle}>
                {initials}
            </div>

            <div className={styles.cardContent}>
                <div className={styles.cardTitle}>{name}</div>

                {isAllied && (
                    <div style={{ fontSize: 10, color: '#d35400', marginBottom: 4, fontWeight: 'bold', textTransform: 'uppercase' }}>
                        Sojusznik
                    </div>
                )}

                <div className={styles.cardCost}>
                    Bazowo: {cost} PS {puCost > 0 ? `+ ${puCost} PU` : ''}
                </div>
            </div>
        </div>
    );
};