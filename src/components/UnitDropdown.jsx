import React from "react";

/*
 Props:
  - label: string
  - options: array of unit IDs (["ott_x", ...])
  - unitsMap: { id: { name, cost, ... } }
  - value: currently selected id or null
  - onChange: (id|null) => void
  - allowNone: boolean (if true, adds "None" option)
*/
export default function UnitDropdown({ label, options = [], unitsMap = {}, value, onChange, allowNone = false }) {
    return (
        <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", marginBottom: 6, fontWeight: 600 }}>{label}</label>
            <select
                value={value ?? ""}
                onChange={(e) => {
                    const v = e.target.value;
                    onChange(v === "" ? null : v);
                }}
                style={{ padding: "8px 10px", minWidth: 260 }}
            >
                {allowNone && <option value="">None</option>}
                {!allowNone && <option value="">-- wybierz --</option>}
                {options.map((id) => {
                    const u = unitsMap[id];
                    const labelText = u ? `${u.name} ${u.cost ? `(${u.cost})` : ""}` : id;
                    return (
                        <option key={id} value={id}>
                            {labelText}
                        </option>
                    );
                })}
            </select>
        </div>
    );
}
