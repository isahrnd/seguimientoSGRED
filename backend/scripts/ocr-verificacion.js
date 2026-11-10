// Verificación del OCR local con un PDF ficticio solo-imagen. Uso: docker compose run --rm --no-deps -T -v ./backend/scripts:/t:ro api node /t/ocr-verificacion.js
const cp = require('child_process'), fs = require('fs');
const texto = 'RESOLUCION 4163 PRUEBA DEMOLICION EDIFICIO EJEMPLO';
const s = `BT /F1 28 Tf 40 700 Td (${texto}) Tj ET`;
const o = ['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',`<< /Length ${s.length} >>\nstream\n${s}\nendstream`,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
let out = '%PDF-1.4\n'; const off = []; o.forEach((x, i) => { off.push(out.length); out += `${i+1} 0 obj\n${x}\nendobj\n`; });
const xr = out.length; out += 'xref\n0 6\n0000000000 65535 f \n' + off.map(n => String(n).padStart(10,'0')+' 00000 n \n').join('') + `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xr}\n%%EOF`;
fs.writeFileSync('/tmp/t.pdf', out);
cp.spawnSync('pdftoppm', ['-r','150','-gray','-singlefile','/tmp/t.pdf','/tmp/t']);
const pgm = fs.readFileSync('/tmp/t.pgm'); const m = /^P5\s+(\d+)\s+(\d+)\s+255\s/.exec(pgm.slice(0,40).toString('latin1')); const W = +m[1], H = +m[2]; const data = pgm.slice(m[0].length);
const objs = ['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>',`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Contents 4 0 R /Resources << /XObject << /Im0 5 0 R >> >> >>`];
const cont = `q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`;
const parts = [Buffer.from('%PDF-1.4\n')]; const offs = []; let len = parts[0].length;
const add = (b) => { parts.push(b); len += b.length; };
objs.forEach((x,i)=>{ offs.push(len); add(Buffer.from(`${i+1} 0 obj\n${x}\nendobj\n`)); });
offs.push(len); add(Buffer.from(`4 0 obj\n<< /Length ${cont.length} >>\nstream\n${cont}\nendstream\nendobj\n`));
offs.push(len); add(Buffer.concat([Buffer.from(`5 0 obj\n<< /Type /XObject /Subtype /Image /Width ${W} /Height ${H} /ColorSpace /DeviceGray /BitsPerComponent 8 /Length ${data.length} >>\nstream\n`), data, Buffer.from('\nendstream\nendobj\n')]));
const xr2 = len; add(Buffer.from('xref\n0 6\n0000000000 65535 f \n' + offs.map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('') + `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xr2}\n%%EOF`));
const escaneado = Buffer.concat(parts); fs.writeFileSync('/tmp/escaneado.pdf', escaneado);
const pdf = require('/app/node_modules/pdf-parse/lib/pdf-parse.js');
(async () => {
  const nativo = (await pdf(escaneado)).text.trim();
  console.log('texto nativo del PDF escaneado: "' + nativo + '" (longitud ' + nativo.length + ')');
  const { OcrLocal } = require('/app/dist/src/contratacion/contratacion-ocr.js');
  const ocr = new OcrLocal(); console.log('OCR disponible:', ocr.disponible());
  const t0 = Date.now(); const r = ocr.paginas(escaneado, [1]); console.log('OCR página 1 (' + (Date.now()-t0) + ' ms):', JSON.stringify(r[0]));
})();
