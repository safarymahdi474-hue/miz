// Small self-contained PDF writer for high-resolution, Persian-shaped canvas
// pages. JPEG pixels are embedded once per page; no data leaves the browser.
export function jpegPagesToPdf(pages){
  if(!pages.length)throw new Error('No report pages');
  const encoder=new TextEncoder(),chunks=[],offsets=[0];let size=0;
  const put=value=>{const bytes=typeof value==='string'?encoder.encode(value):value;chunks.push(bytes);size+=bytes.length};
  const object=(id,content)=>{offsets[id]=size;put(`${id} 0 obj\n`);put(content);put('\nendobj\n')};
  put('%PDF-1.4\n%MizReport\n');object(1,'<< /Type /Catalog /Pages 2 0 R >>');
  object(2,`<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_,i)=>`${3+i*3} 0 R`).join(' ')}] >>`);
  pages.forEach((page,i)=>{
    const id=3+i*3,image=id+1,content=id+2;
    object(id,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Image ${image} 0 R >> >> /Contents ${content} 0 R >>`);
    offsets[image]=size;put(`${image} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.bytes.length} >>\nstream\n`);put(page.bytes);put('\nendstream\nendobj\n');
    const commands='q\n595.28 0 0 841.89 0 0 cm\n/Image Do\nQ';object(content,`<< /Length ${encoder.encode(commands).length} >>\nstream\n${commands}\nendstream`);
  });
  const xref=size;put(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`);
  for(const offset of offsets.slice(1))put(`${String(offset).padStart(10,'0')} 00000 n \n`);
  put(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const result=new Uint8Array(size);let position=0;for(const part of chunks){result.set(part,position);position+=part.length}return result;
}
