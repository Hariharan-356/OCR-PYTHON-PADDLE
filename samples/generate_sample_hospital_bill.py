from pathlib import Path

out = Path(__file__).with_name('hospital_bill_sample.pdf')

# Minimal valid PDF content with hospital-bill data for OCR testing.
content_lines = [
    'BT',
    '/F1 16 Tf',
    '50 760 Td',
    '(ABC Hospital & Medical Center) Tj',
    '0 -24 Td',
    '/F1 11 Tf',
    '50 736 Td',
    '(Address of biller: 12 Green Park Road, Chennai, Tamil Nadu) Tj',
    '50 718 Td',
    '(Hospital registration number: TN/CHN/2011/04521) Tj',
    '50 700 Td',
    '(GST no.: 33AAAAA0000A1Z5) Tj',
    '50 682 Td',
    '(Bill no.: INV-2026-1048) Tj',
    '50 664 Td',
    '(Bill date: 14/10/2026) Tj',
    '50 646 Td',
    '(Name of patient: K. Aravind) Tj',
    '50 628 Td',
    '(UHID: 753214) Tj',
    '50 610 Td',
    '(Consultation: General Medicine) Tj',
    '50 592 Td',
    '(Gross amount: Rs. 5820.00) Tj',
    '50 574 Td',
    '(CGST: Rs. 262.00) Tj',
    '50 556 Td',
    '(SGST: Rs. 262.00) Tj',
    '50 528 Td',
    '(Net amount: Rs. 6344.00) Tj',
    'ET',
]
content = '\n'.join(content_lines) + '\n'
content_bytes = content.encode('latin-1', 'replace')

objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n',
    f'4 0 obj\n<< /Length {len(content_bytes)} >>\nstream\n{content}endstream\nendobj\n',
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
]

pdf = bytearray(b'%PDF-1.4\n')
offsets = [0]
for obj in objects:
    offsets.append(len(pdf))
    pdf.extend(obj.encode('latin-1'))

xref_start = len(pdf)
pdf.extend(f'xref\n0 {len(objects)+1}\n'.encode('latin-1'))
pdf.extend(b'0000000000 65535 f \n')
for off in offsets[1:]:
    pdf.extend(f'{off:010d} 00000 n \n'.encode('latin-1'))
pdf.extend(f'trailer\n<< /Size {len(objects)+1} /Root 1 0 R >>\nstartxref\n{xref_start}\n%%EOF\n'.encode('latin-1'))

out.write_bytes(pdf)
print(f'Created {out} ({out.stat().st_size} bytes)')
