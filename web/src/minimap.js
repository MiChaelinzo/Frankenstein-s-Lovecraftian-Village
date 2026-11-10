// Minimap model: pure, no DOM. app.js paints the cells onto a small canvas.
export const KIND_COLORS = {
  church: '#d9c27a', altar: '#b04a6a', well: '#4a8fb0', house_a: '#8a7a68', house_b: '#6f8a68', dead_tree: '#4e5a3c',
};
export const KIND_LABELS = {
  church: 'Church', altar: 'Altar', well: 'Well', house_a: 'House (A)', house_b: 'House (B)', dead_tree: 'Dead tree',
};
export const OTHER_COLOR = '#667075';
export const kindColor = (id) => KIND_COLORS[id] || OTHER_COLOR;
export const kindLabel = (id) => KIND_LABELS[id] || String(id).replace(/_/g, ' ');

/** cells are in pixel units of a size x size box; selected marks the piece sharing the given position. */
export function minimapModel(layout, gridW, gridD, size, selected) {
  const sx = size / Math.max(1, gridW), sz = size / Math.max(1, gridD);
  const counts = new Map();
  const cells = (layout || []).map((p) => {
    counts.set(p.id, (counts.get(p.id) || 0) + 1);
    return {
      id: p.id, color: kindColor(p.id), x: p.x * sx, y: p.z * sz, w: Math.max(1, p.sizeX * sx), h: Math.max(1, p.sizeZ * sz),
      selected: !!selected && selected.id === p.id && selected.x === p.x && selected.z === p.z,
    };
  });
  const legend = [...counts].sort((a, b) => a[0] < b[0] ? -1 : 1).map(([id, count]) => ({ id, label: kindLabel(id), color: kindColor(id), count }));
  return { size, cells, legend };
}
