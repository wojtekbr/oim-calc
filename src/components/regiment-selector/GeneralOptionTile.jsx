import React from "react";
import styles from "../../pages/RegimentSelector.module.css";
import { getPlaceholderStyle, getInitials } from "../../utils/uiHelpers";

export const GeneralOptionTile = ({ unitId, isActive, onClick, unitDef }) => {
    const puCost = unitDef?.improvement_points_cost || unitDef?.pu_cost || 0;
    const costLabel = puCost > 0 
        ? `${unitDef?.cost || 0} PS + ${puCost} PU`
        : `${unitDef?.cost || 0} PS`;

    const initials = getInitials(unitDef?.name || unitId);
    const placeholderStyle = getPlaceholderStyle(unitId, unitDef?.name);

    return (
        <div 
            className={`${styles.card} ${isActive ? styles.active : ''}`}
            onClick={onClick}
        >
            {isActive && <div className={styles.checkBadge}>✔</div>}

            <div className={styles.cardImagePlaceholder} style={placeholderStyle}>
                {initials}
            </div>

            <div className={styles.cardContent}>
                <div className={styles.cardTitle}>{unitDef?.name || unitId}</div>
                
                <div className={styles.cardSubtitle}>
                    {unitDef?.orders !== undefined && <span>Rozkazy: <strong>{unitDef.orders}</strong></span>}
                    {unitDef?.activations !== undefined && <span style={{marginLeft: 8}}>Akt: <strong>{unitDef.activations}</strong></span>}
                </div>

                <div className={styles.cardCost}>
                    {costLabel}
                </div>
            </div>
        </div>
    );
};