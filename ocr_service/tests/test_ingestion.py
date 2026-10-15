from pathlib import Path

from ocr_service.app.main import classify_document, extract_claim_fields, validate_file


def test_validate_file_accepts_pdf(tmp_path: Path) -> None:
    sample = tmp_path / 'sample.pdf'
    sample.write_bytes(b'%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF')
    assert validate_file(sample, 'sample.pdf', sample.stat().st_size)['ok'] is True


def test_zip_with_multiple_pdfs_extracts_each_pdf_text(tmp_path: Path) -> None:
    archive_path = tmp_path / 'claims_bundle.zip'
    pdf_one = tmp_path / 'hospital_bill.pdf'
    pdf_two = tmp_path / 'preauth.pdf'
    pdf_one.write_bytes(b'%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF')
    pdf_two.write_bytes(b'%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF')

    with __import__('zipfile').ZipFile(archive_path, 'w') as archive:
        archive.write(pdf_one, arcname='hospital_bill.pdf')
        archive.write(pdf_two, arcname='nested/preauth.pdf')

    extracted = __import__('ocr_service.app.main', fromlist=['expand_zip_contents']).expand_zip_contents(archive_path)
    names = {item.name for item in extracted}
    assert 'hospital_bill.pdf' in names
    assert 'preauth.pdf' in names


def test_classify_document_uses_known_strings() -> None:
    text = 'Patient name: Rahul Kumar\nPolicy number: GHP-2026-0044817\nDate of admission: 16-09-2026'
    assert classify_document('FormC_PreAuth_RajeshKumar.pdf', text) == 'Pre-Auth Form (Form C)'


def test_hospital_bill_fields_are_extracted() -> None:
    text = '''
    Apollo Hospitals, Chennai
    Address of biller: Chennai
    Hospital registration number: KL/TVM/2002/00412
    GST no.: 32AABCK9901E1Z1
    Bill no.: HB/2026/649566
    Bill date: 13-10-2026
    Name of patient: Karan Mehta
    Date of admission: 10-10-2026
    Date of discharge: 13-10-2026
    Name of treating doctor: Dr. L. Pillai
    Gross amount: ₹1,37,030
    Discount: ₹3,000
    GST amount: ₹0
    Total amount paid: ₹1,34,030
    Stamp availability: Yes
    Revenue stamp: Yes
    Hospital logo: Detected
    '''

    result = extract_claim_fields('Hospital Bill', text)
    labels = {field['label']: field['value'] for field in result['fields']}

    assert labels['Name of biller'] == 'Apollo Hospitals, Chennai'
    assert labels['Address of biller'] == 'Chennai'
    assert labels['Hospital registration number'] == 'KL/TVM/2002/00412'
    assert labels['GST no.'] == '32AABCK9901E1Z1'
    assert labels['Bill no.'] == 'HB/2026/649566'
    assert labels['Bill date'] == '13-10-2026'
    assert labels['Name of patient'] == 'Karan Mehta'
    assert labels['Date of admission'] == '10-10-2026'
    assert labels['Date of discharge'] == '13-10-2026'
    assert labels['Name of treating doctor'] == 'Dr. L. Pillai'
    assert labels['Gross amount'] == '₹1,37,030'
    assert labels['Discount'] == '₹3,000'
    assert labels['GST amount'] == '₹0'
    assert labels['Total amount paid'] == '₹1,34,030'
    assert labels['Stamp availability'] == 'Yes'
    assert labels['Revenue stamp'] == 'Yes'
    assert labels['Hospital logo'] == 'Detected'


def test_classify_document_recognizes_hospital_bill_fields() -> None:
    text = '''
    Apollo Hospitals, Chennai
    Address of biller: Chennai
    Hospital registration number: KL/TVM/2002/00412
    GST no.: 32AABCK9901E1Z1
    Bill no.: HB/2026/649566
    Bill date: 13-10-2026
    Name of patient: Karan Mehta
    Date of admission: 10-10-2026
    Date of discharge: 13-10-2026
    Name of treating doctor: Dr. L. Pillai
    Gross amount: ₹1,37,030
    Discount: ₹3,000
    GST amount: ₹0
    Total amount paid: ₹1,34,030
    '''
    assert classify_document('hospital_bill_sample.pdf', text) == 'Hospital Bill'


def test_hospital_bill_fact_uses_biller_name_when_present() -> None:
    text = '''
    Apollo Hospitals, Chennai
    Address of biller: Chennai
    Hospital registration number: KL/TVM/2002/00412
    Name of patient: Karan Mehta
    Total amount paid: ₹1,34,030
    '''
    result = extract_claim_fields('Hospital Bill', text)
    assert result['facts']['hospital'] == 'Apollo Hospitals, Chennai'
    assert result['facts']['city'] == 'Chennai'


def test_hospital_header_reg_no_and_address_are_extracted_from_sample_bill() -> None:
    text = '''
    Sunrise Multispeciality Hospital
    45, Avinashi Road, Peelamedu, Coimbatore, Tamil Nadu - 641004
    Hospital Reg. No.: TN/CBE/HOS/2014/08721 | GST No.: 29ABCA00000XYZQ
    Bill No.: HB/2026/600112
    Bill Date: 2026-10-16
    Name of Patient: Hariharan
    Treating Doctor: Dr. Rajesh Kumar, MS (Ortho)
    Date of Admission: 14/10/2026
    Date of Discharge: 16/10/2026
    Gross Amount: 52,000.00
    Discount: 2,000.00
    GST Amount: 2,500.00
    Total Amount Paid: 52,500.00
    '''
    result = extract_claim_fields('Hospital Bill', text)
    labels = {field['label']: field['value'] for field in result['fields']}
    assert labels['Name of biller'] == 'Sunrise Multispeciality Hospital'
    assert labels['Address of biller'] == '45, Avinashi Road, Peelamedu, Coimbatore, Tamil Nadu - 641004'
    assert labels['Hospital registration number'] == 'TN/CBE/HOS/2014/08721'
    assert labels['GST no.'] == '29ABCA00000XYZQ'
