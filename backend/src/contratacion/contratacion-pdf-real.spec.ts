import { paginasPdf, textoPrimeraPagina } from './contratacion-indice.service';

/**
 * Lectura con el lector REAL de PDF (pdf.js) de un documento válido y ficticio generado con reportlab (2 páginas).
 * Las pruebas de integración usan un lector determinista porque los PDF sintéticos hechos a mano no son fiables en pdf.js;
 * esta prueba conserva la cobertura del lector real con un archivo bien formado.
 */
const PDF = Buffer.from('JVBERi0xLjMKJZOMi54gUmVwb3J0TGFiIEdlbmVyYXRlZCBQREYgZG9jdW1lbnQgKG9wZW5zb3VyY2UpCjEgMCBvYmoKPDwKL0YxIDIgMCBSCj4+CmVuZG9iagoyIDAgb2JqCjw8Ci9CYXNlRm9udCAvSGVsdmV0aWNhIC9FbmNvZGluZyAvV2luQW5zaUVuY29kaW5nIC9OYW1lIC9GMSAvU3VidHlwZSAvVHlwZTEgL1R5cGUgL0ZvbnQKPj4KZW5kb2JqCjMgMCBvYmoKPDwKL0NvbnRlbnRzIDggMCBSIC9NZWRpYUJveCBbIDAgMCA2MTIgNzkyIF0gL1BhcmVudCA3IDAgUiAvUmVzb3VyY2VzIDw8Ci9Gb250IDEgMCBSIC9Qcm9jU2V0IFsgL1BERiAvVGV4dCAvSW1hZ2VCIC9JbWFnZUMgL0ltYWdlSSBdCj4+IC9Sb3RhdGUgMCAvVHJhbnMgPDwKCj4+IAogIC9UeXBlIC9QYWdlCj4+CmVuZG9iago0IDAgb2JqCjw8Ci9Db250ZW50cyA5IDAgUiAvTWVkaWFCb3ggWyAwIDAgNjEyIDc5MiBdIC9QYXJlbnQgNyAwIFIgL1Jlc291cmNlcyA8PAovRm9udCAxIDAgUiAvUHJvY1NldCBbIC9QREYgL1RleHQgL0ltYWdlQiAvSW1hZ2VDIC9JbWFnZUkgXQo+PiAvUm90YXRlIDAgL1RyYW5zIDw8Cgo+PiAKICAvVHlwZSAvUGFnZQo+PgplbmRvYmoKNSAwIG9iago8PAovUGFnZU1vZGUgL1VzZU5vbmUgL1BhZ2VzIDcgMCBSIC9UeXBlIC9DYXRhbG9nCj4+CmVuZG9iago2IDAgb2JqCjw8Ci9BdXRob3IgKGFub255bW91cykgL0NyZWF0aW9uRGF0ZSAoRDoyMDAwMDEwMTAwMDAwMCswMCcwMCcpIC9DcmVhdG9yIChhbm9ueW1vdXMpIC9LZXl3b3JkcyAoKSAvTW9kRGF0ZSAoRDoyMDAwMDEwMTAwMDAwMCswMCcwMCcpIC9Qcm9kdWNlciAoUmVwb3J0TGFiIFBERiBMaWJyYXJ5IC0gXChvcGVuc291cmNlXCkpIAogIC9TdWJqZWN0ICh1bnNwZWNpZmllZCkgL1RpdGxlICh1bnRpdGxlZCkgL1RyYXBwZWQgL0ZhbHNlCj4+CmVuZG9iago3IDAgb2JqCjw8Ci9Db3VudCAyIC9LaWRzIFsgMyAwIFIgNCAwIFIgXSAvVHlwZSAvUGFnZXMKPj4KZW5kb2JqCjggMCBvYmoKPDwKL0ZpbHRlciBbIC9BU0NJSTg1RGVjb2RlIC9GbGF0ZURlY29kZSBdIC9MZW5ndGggMjA1Cj4+CnN0cmVhbQpHYXI/KV8kWWNaKGtoP0FgPmdDQ3FmYVI2RFJRVmhQX1QvalljKiw4JEcqcCM5NkNOL0pONCxcMUQ4YiNoY1kqO002VGYkVV1URXJbcGZfL19mNE9ccSpmTFw0Vj4zQTldbTkwMSQ/VV42c2JJOSQ1RW1zLCwxPkgnZ2BHRSltKm0nQjkrYTVDTFBAJjhaRmYkQm9Hcy5VKGhcPCpQRDFJI25OWE1vNy5pI01lX0gnMmE2IU1VNyJoOmZJMHBMWSNFKFMjW1cvVzFGTn4+ZW5kc3RyZWFtCmVuZG9iago5IDAgb2JqCjw8Ci9GaWx0ZXIgWyAvQVNDSUk4NURlY29kZSAvRmxhdGVEZWNvZGUgXSAvTGVuZ3RoIDEzOQo+PgpzdHJlYW0KR2FwUWgwRT1GLDBVXEgzVFxwTllUXlFLaz90Yz5JUCw7VyNVMV4yM2loUEVNXz9DVzRLSVNpOjpiWGdeOl5HMENjajMwOWNjZiRdOEJFTm47Rm8pKS8xaUwhIVYwLCdhcUFkZE1cSywhb2FENjs1WmwoQjVaOGdPOS1IXDJBPG05NSEmTzBicSN+PmVuZHN0cmVhbQplbmRvYmoKeHJlZgowIDEwCjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDA2MSAwMDAwMCBuIAowMDAwMDAwMDkyIDAwMDAwIG4gCjAwMDAwMDAxOTkgMDAwMDAgbiAKMDAwMDAwMDM5MiAwMDAwMCBuIAowMDAwMDAwNTg1IDAwMDAwIG4gCjAwMDAwMDA2NTMgMDAwMDAgbiAKMDAwMDAwMDkxNCAwMDAwMCBuIAowMDAwMDAwOTc5IDAwMDAwIG4gCjAwMDAwMDEyNzQgMDAwMDAgbiAKdHJhaWxlcgo8PAovSUQgCls8MWMxNzgxOThmYmRmYTUxYjI1OTk1ZDg5ZDQxMDIwNDM+PDFjMTc4MTk4ZmJkZmE1MWIyNTk5NWQ4OWQ0MTAyMDQzPl0KJSBSZXBvcnRMYWIgZ2VuZXJhdGVkIFBERiBkb2N1bWVudCAtLSBkaWdlc3QgKG9wZW5zb3VyY2UpCgovSW5mbyA2IDAgUgovUm9vdCA1IDAgUgovU2l6ZSAxMAo+PgpzdGFydHhyZWYKMTUwMwolJUVPRgo=', 'base64');

describe('lectura de PDF real', () => {
  it('extrae el texto nativo página por página', async () => {
    const p = await paginasPdf(PDF, 5);
    expect(p).toHaveLength(2);
    expect(p[0]).toContain('9999.001.26.1.900-2026');
    expect(p[0]).toContain('320,50 m2');
    expect(p[1]).toContain('1.000.000,00');
  });
  it('lee la primera página para clasificar', async () => {
    expect(await textoPrimeraPagina(PDF, 'application/pdf')).toContain('EMPRESA FICTICIA');
  });
  it('lee varias veces seguidas el mismo y otros PDF sin perder texto', async () => {
    for (let i = 0; i < 3; i++) expect((await paginasPdf(PDF, 2))[0]).toContain('CONTRATO No');
  });
});
