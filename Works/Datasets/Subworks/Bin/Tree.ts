// Datasets Tree
// designed and built by onyxlabs.

export interface TreeNode {
  label: string;
  description?: string;
  children?: TreeNode[];
}

export function renderTree(title: string, nodes: TreeNode[]): string[] {
  const lines: string[] = [title];

  function walk(children: TreeNode[], prefix: string) {
    children.forEach((node, i) => {
      const isLast = i === children.length - 1;
      const branch = isLast ? "└─ " : "├─ ";
      const desc = node.description ? `  ${node.description}` : "";
      lines.push(`${prefix}${branch}${node.label}${desc}`);
      if (node.children) {
        walk(node.children, prefix + (isLast ? "   " : "│  "));
      }
    });
  }

  walk(nodes, "");
  return lines;
}
