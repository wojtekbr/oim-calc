import React from "react";
import styles from "../../pages/RegimentSelector.module.css";
import { getPlaceholderStyle, getInitials } from "../../utils/uiHelpers";

export const RegimentOptionTile = ({ optId, isActive, onClick, getRegimentDefinition, disabled, isAllied, divisionDefinition }) => {
    const def = getRegimentDefinition(optId);
    const name = def?.name || optId;
    const cost = def?.base_cost || 0;
    
    // Obliczamy dynamiczny koszt PU (baza z pułku)
    const puCost = def?.improvement_points_cost || 0;

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