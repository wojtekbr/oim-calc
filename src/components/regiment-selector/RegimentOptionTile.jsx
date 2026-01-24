import React from "react";
import styles from "../../pages/RegimentSelector.module.css";
import { getPlaceholderStyle, getInitials } from "../../utils/uiHelpers";

export const RegimentOptionTile = ({ optId, group, isActive, onClick, getRegimentDefinition, disabled, isAllied, divisionDefinition }) => {
    const def = getRegimentDefinition(optId);
    const name = def?.name || optId;
    const cost = def?.base_cost || 0;

    // 1. Koszt PU (ujemny wpływ na pulę)
    let puCost = def?.pu_cost || def?.improvement_points_cost || 0;

    // 2. Bonus PU (dodatni wpływ na pulę - additional_supply)
    const additionalSupply = def?.additional_supply || 0;

    // 3. Logika modyfikatorów kosztu PU z zasad dywizji
    if (divisionDefinition?.rules) {
        divisionDefinition.rules.forEach(rule => {
            if (rule.id === 'extra_regiment_cost' && rule.regiment_ids?.includes(optId)) {
                if (rule.pu_cost) puCost += rule.pu_cost;
            }

            if (rule.id === 'position_based_cost_modifier' && rule.regiment_ids?.includes(optId)) {
                if (rule.group === group) {
                    if (rule.pu_cost) puCost += rule.pu_cost;
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

                {/* --- ZMIENIONA SEKCJA KOSZTÓW I BONUSÓW --- */}
                <div className={styles.cardCost} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                    <div>
                        Koszt: {cost} PS {puCost > 0 ? `, ${puCost} PU` : ''}
                    </div>

                    {additionalSupply > 0 && (
                        <div style={{ color: '#2e7d32', fontWeight: 'bold', fontSize: '0.9em' }}>
                            Bonus: +{additionalSupply} PU
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};