module.exports = async (buf, opts) => {
  const s = Buffer.from(buf).toString('latin1');
  const m = /\(([^)]*)\) Tj/.exec(s);
  const texto = m ? m[1] : '';
  if (opts && opts.pagerender) await opts.pagerender({ getTextContent: async () => ({ items: [{ str: texto }] }) });
  return { text: '\n\n' + texto, numpages: 1 };
};
