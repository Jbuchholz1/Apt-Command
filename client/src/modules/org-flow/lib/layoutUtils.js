const BRAND_COLORS = {
  gold: '#D3BF30',
  navy: '#04144F',
};

const NODE_WIDTH = 280;
const NODE_HEIGHT = 320;
const HORIZONTAL_SPACING = 120;
const VERTICAL_SPACING = 180;

export const getLayoutedElements = (nodes, edges) => {
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const childrenMap = new Map();
  const parentMap = new Map();
  const nodeDepths = new Map();

  edges.forEach(edge => {
    const children = childrenMap.get(edge.source) || [];
    children.push(edge.target);
    childrenMap.set(edge.source, children);
    parentMap.set(edge.target, edge.source);
  });

  const rootNodes = nodes.filter(n => !parentMap.has(n.id));

  const calculateDepth = (nodeId, depth = 0) => {
    nodeDepths.set(nodeId, depth);
    const children = childrenMap.get(nodeId) || [];
    children.forEach(childId => calculateDepth(childId, depth + 1));
    return depth;
  };

  rootNodes.forEach(root => calculateDepth(root.id, 0));

  const calculateSubtreeWidth = (nodeId) => {
    const children = childrenMap.get(nodeId) || [];
    if (children.length === 0) return NODE_WIDTH;
    const childrenWidths = children.map(childId => calculateSubtreeWidth(childId));
    const totalChildrenWidth = childrenWidths.reduce((sum, w) => sum + w, 0) +
                               (children.length - 1) * HORIZONTAL_SPACING;
    return Math.max(NODE_WIDTH, totalChildrenWidth);
  };

  const positionSubtree = (nodeId, x, y, positions) => {
    const children = childrenMap.get(nodeId) || [];
    const subtreeWidth = calculateSubtreeWidth(nodeId);
    positions.set(nodeId, { x: x + subtreeWidth / 2 - NODE_WIDTH / 2, y });
    if (children.length === 0) return;
    let currentX = x;
    children.forEach(childId => {
      const childSubtreeWidth = calculateSubtreeWidth(childId);
      positionSubtree(childId, currentX, y + NODE_HEIGHT + VERTICAL_SPACING, positions);
      currentX += childSubtreeWidth + HORIZONTAL_SPACING;
    });
  };

  const positions = new Map();
  let currentX = 0;
  rootNodes.forEach(root => {
    const subtreeWidth = calculateSubtreeWidth(root.id);
    positionSubtree(root.id, currentX, 0, positions);
    currentX += subtreeWidth + HORIZONTAL_SPACING * 2;
  });

  const layoutedNodes = nodes.map(node => {
    const pos = positions.get(node.id) || { x: 0, y: 0 };
    return { ...node, position: pos };
  });

  const styledEdges = edges.map((edge) => {
    const sourceDepth = nodeDepths.get(edge.source) || 0;
    const color = sourceDepth % 2 === 0 ? BRAND_COLORS.gold : BRAND_COLORS.navy;
    return {
      ...edge,
      type: 'smoothstep',
      animated: false,
      style: { stroke: color, strokeWidth: 2 },
    };
  });

  return { nodes: layoutedNodes, edges: styledEdges };
};
