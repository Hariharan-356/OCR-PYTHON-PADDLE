# ClaimsDigi

ClaimsDigi is a document-driven claims intake and review platform for insurance operations. The system allows users to upload claim documents, extract structured field values through OCR, and review or correct the results before approval. The platform is designed to handle hospital bills, pre-authorization forms, pharmacy invoices, and related clinical documents used in claims processing.

## Project purpose

This application is built to support:

- claim intake from uploaded documents
- OCR-based extraction of patient, hospital, policy, billing, and appointment details
- review and correction of extracted values before approval
- queue management and workflow tracking for claims processing
- document metadata review and auditability

## Technology stack

### Frontend
- Next.js 16
- React 19
- TypeScript
- CSS and component-driven UI layout
- Client-side state management via custom context/store pattern

### Backend
- NestJS 12
- Express integration via Nest platform adapter
- TypeScript
- Multer for file upload handling
- SQLite via better-sqlite3 for local claim persistence

### OCR and document processing
- Tesseract.js for OCR text extraction
- pdfjs-dist for PDF parsing and rendering
- canvas for PDF/image preprocessing and page rendering
- Node.js runtime

### Supporting libraries
- tsx for TypeScript execution
- Lucide React for icons
- RxJS
- Reflect metadata for NestJS runtime support

## What kind of OCR is used?

This project uses a local, in-process OCR pipeline implemented inside the NestJS backend, rather than a separate Python service. The flow is:

1. User uploads a PDF or image file.
2. The backend stores it in the local uploads directory.
3. The OCR service reads the file from disk.
4. For PDF files, the application renders pages into canvas and then runs OCR on the rendered images.
5. Tesseract.js extracts the text from the document.
6. The extracted text is normalized and mapped into structured claim fields such as patient name, doctor, hospital, dates, and totals.
7. The frontend reads the same structured result model and presents it in the review screen.

This is a practical document OCR pipeline suited for hospital bills and insurance forms, with field normalization and manual review support.

## Key capabilities

- PDF and image upload ingestion
- OCR extraction for hospital bills and claim-related documents
- structured claim field mapping
- alias-aware extraction for hospital and billing labels
- review and correction workflow for low-confidence fields
- document and claim status tracking
- local persistent storage for claim records and metadata

## Supported inputs

- PDF files
- PNG images
- JPG / JPEG images
- TIFF / TIF images

## Architecture overview

### Frontend layer
- Next.js dashboard shows claims, intake, queue, review, reports, and admin views.
- The interface reads and updates claim data through the backend API.
- Users can open a claim, inspect extracted fields, and validate or correct values.

### Backend layer
- NestJS controllers expose endpoints for claims, uploads, OCR jobs, documents, and rule data.
- Multer handles upload storage.
- ClaimsService and DatabaseService manage persistence.
- OcrService orchestrates OCR execution and result mapping into claim objects.

### Data model
- Claims contain patient, hospital, policy, policy values, docs, facts, line items, audit trail, and status.
- Documents contain metadata, OCR results, and field-level values.
- Each field can carry confidence, original OCR value, review history, and verification status.

## Project structure

- app/ – Next.js application shell and root layout
- components/ – UI screens and reusable interface components
- lib/ – shared data, state, rules, and claim logic
- server/ – NestJS API, database service, OCR service, and controllers
- uploads/ – local uploaded file storage
- reference/ – sample/reference scripts
- next.config.ts – Next.js configuration
- package.json – project scripts and dependencies

## Local setup

### 1. Install dependencies

```bash
npm install
```

### 2. Start the backend

```bash
npm run server
```

### 3. Start the frontend

```bash
npm run dev
```

### 4. Open the app

Open:

- http://localhost:3000

The backend API runs on:

- http://localhost:3001/api

## Common commands

```bash
npm run dev
npm run server
npm run build
npm run test
```

## OCR and review flow

1. A user uploads one or more documents.
2. Files are saved locally and a pending claim is created.
3. OCR runs against the file content.
4. The extracted text is mapped into fields.
5. Low-confidence or missing values are flagged for review.
6. The reviewer verifies or corrects values in the Review & correct section.
7. The claim can then proceed to later stages of the workflow.

## Notes on quality and behavior

- OCR is tuned for scanned hospital bills and insurance document forms.
- The parsing logic handles multiple label aliases and common variations in OCR output.
- Some low-quality or severely distorted scans may require manual review and correction.
- A review warning is shown when extraction confidence is weak or a field is not recovered.

## Summary

ClaimsDigi is a document-processing and claims review application built with Next.js and NestJS. It combines a modern frontend, a NestJS API, and an in-process OCR pipeline using Tesseract.js plus PDF/image processing libraries to extract structured values from insurance claim documents and support human review before approval.
