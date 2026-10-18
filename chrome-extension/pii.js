// 個資偵測:台灣身分證 / 居留證統一證號(含新舊式),以檢查碼驗證降低誤判
(() => {
  // 依序對應 10..35(A=10, B=11 … I=34, O=35)
  const LETTERS = 'ABCDEFGHJKLMNPQRSTUVXYWZIO';
  const ID_RE = /(?<![A-Za-z0-9])[A-Za-z][ -]?[1289A-Da-d](?:[ -]?\d){8}(?!\d)/g;

  // 全形英數轉半形(一對一,不改變字串長度與索引)
  const toHalfWidth = (s) => s.replace(/[\uFF01-\uFF5E]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));

  function isValidTwId(raw) {
    const id = raw.replace(/[ -]/g, '').toUpperCase();
    if (!/^[A-Z][1289A-D]\d{8}$/.test(id)) return false;
    const code = LETTERS.indexOf(id[0]) + 10;
    const second = /\d/.test(id[1]) ? Number(id[1]) : (LETTERS.indexOf(id[1]) + 10) % 10;
    let sum = Math.floor(code / 10) + (code % 10) * 9 + second * 8;
    for (let i = 2; i < 9; i++) sum += Number(id[i]) * (9 - i);
    sum += Number(id[9]);
    return sum % 10 === 0;
  }

  function findTwIds(text) {
    if (typeof text !== 'string' || !text) return [];
    const out = [];
    for (const m of toHalfWidth(text).matchAll(ID_RE)) {
      if (isValidTwId(m[0])) out.push({ start: m.index, end: m.index + m[0].length });
    }
    return out;
  }

  // 保留首尾字元,中間英數改為 *,長度不變
  function maskTwIds(text) {
    const hits = findTwIds(text);
    if (!hits.length) return text;
    let out = '';
    let last = 0;
    for (const { start, end } of hits) {
      const seg = text.slice(start, end);
      out += text.slice(last, start) + seg[0] + seg.slice(1, -1).replace(/[^ \-]/g, '*') + seg[seg.length - 1];
      last = end;
    }
    return out + text.slice(last);
  }

  globalThis.PVPII = { isValidTwId, findTwIds, maskTwIds };
})();
