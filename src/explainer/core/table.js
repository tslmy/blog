// Fills a <table> from rows of cells. The first row is the header; a cell is text, a DOM node, or { node | text, span }.
// Numbers sit in right-aligned columns: every column but the first. With rowHeaders the first column of the body is <th>.
import { el } from './dom.js';

export const fillTable = (table, rows, { rowHeaders = true } = {}) => {
  table.replaceChildren(...rows.map((cells, i) => {
    const tr = el('tr');
    cells.forEach((cell, j) => {
      const c = typeof cell === 'object' && !(cell instanceof Node) ? cell : { node: cell };
      const td = el(i === 0 || (j === 0 && rowHeaders) ? 'th' : 'td', j ? 'num' : null);
      if (c.span) td.colSpan = c.span;
      td.append(c.node ?? c.text ?? '');
      tr.append(td);
    });
    return tr;
  }));
};
