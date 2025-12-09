export const getPlaceholderColor = (str) => {
    if (!str) return '#cccccc';
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
    return '#' + "00000".substring(0, 6 - c.length) + c;
};

export const getPlaceholderStyle = (id, name) => {
    const color = getPlaceholderColor(id || name);
    return {
        background: `linear-gradient(135deg, ${color}22 0%, ${color}66 100%)`,
        color: '#555'
    };
};

export const getInitials = (name) => {
    return name 
        ? name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
        : "??";
};